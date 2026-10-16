-- Dialed In: the two calls the app makes in phase 2, plus claiming a Sheet-era name. Load after schema.sql.
--
--   select pull_events();       -- everything the signed-in person may see, as the Sheet-style events the app reads
--   select push_event('{...}'); -- one save from the app, applied as the signed-in person
--   select claim_name('code');  -- links your sign-in to your Sheet-era name
--
-- They run as the caller (security invoker), so the row rules in schema.sql decide every read and write. A save
-- only ever changes the caller's own part of a record: your fields on your own coffee or session, and your like,
-- your comments, your want-to-try flag on anyone's. Helpers live in the `internal` schema, which Supabase doesn't
-- expose to the app.

create schema if not exists internal;

-- how the app knows people: the Sheet-era name, else the profile's name (unique, ignoring capitals)
create or replace function internal.name_of(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(legacy_name, display_name) from profiles where id = pid;
$$;
create or replace function internal.color_of(pid uuid) returns text
language sql stable security definer set search_path = public as $$ select color from profiles where id = pid; $$;

create or replace function internal.try_ts(t text) returns timestamptz language plpgsql stable as $$
begin if t is null or btrim(t) = '' then return null; end if; return t::timestamptz; exception when others then return null; end $$;
create or replace function internal.try_date(t text) returns date language plpgsql immutable as $$
begin if t is null or t !~ '^\d{4}-\d{2}-\d{2}' then return null; end if; return left(t, 10)::date; exception when others then return null; end $$;
create or replace function internal.try_num(t text) returns numeric language plpgsql immutable as $$
begin if t is null or btrim(t) = '' then return null; end if; return replace(btrim(t), ',', '.')::numeric; exception when others then return null; end $$;
-- who a session, note, photo or comment is for, when the app says (otherwise null: keep what it was, or the default)
create or replace function internal.aud(t text) returns audience language sql immutable as $$
  select case when t in ('everyone', 'friends', 'only_me') then t::audience end;
$$;
create or replace function internal.item_aud(t text) returns item_audience language sql immutable as $$
  select case when t in ('everyone', 'friends') then t::item_audience end;
$$;

-- the app's star rating: 0-5 in half steps; old 0-10 ratings are halved
create or replace function internal.rating(t text) returns numeric language plpgsql immutable as $$
declare n numeric := internal.try_num(t);
begin
  if n is null then return null; end if;
  if n <= 0 then return 0; end if;
  if n > 5 then n := n / 2; end if;
  return trim_scale(least(5, round(n * 2) / 2));
end $$;
create or replace function internal.has_name(list jsonb, nm text) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(list) = 'array' then list else '[]'::jsonb end) x where lower(btrim(x)) = lower(btrim(nm)));
$$;
create or replace function internal.is_group_admin(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = g and m.user_id = u and m.role in ('owner', 'admin'));
$$;

-- v14.5: who reviews reports. backend_state 'admins' is a comma list of profile ids (Maceo's to start).
create or replace function internal.is_admin(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid is not null and exists (select 1 from backend_state where key = 'admins' and pid::text = any(string_to_array(value, ',')));
$$;
insert into backend_state (key, value) select 'admins', p.id::text from profiles p where p.legacy_name = 'Maceo' on conflict (key) do nothing;

-- v14.5: what a report hides. Whoever reported something stops seeing it right away; once three different people
-- have reported it, it's hidden from everyone but its owner until it's reviewed (review_reports / resolve_report).
create index if not exists reports_target on reports (target_id);
create index if not exists reports_reporter on reports (reporter_id);
create or replace function internal.unseen(kind text, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reports r where r.target_id = target and r.target_type = kind
                 and ((r.reporter_id = me() and r.status <> 'dismissed') or r.status = 'hidden'));
$$;
-- for data_version: changes when you report something or something is hidden or brought back
create or replace function internal.report_mark() returns text
language sql stable security definer set search_path = public as $$
  select (select count(*) from reports where reporter_id = me()) || ':' ||
         (select count(*) filter (where status = 'hidden') || ':' || count(*) filter (where status = 'dismissed') || ':' || count(*) filter (where status = 'removed') from reports);
$$;

-- v14.6: the content filter (App Store guideline 1.2). A list of offensive words, loaded into the database by the setup
-- workflow from an open list (never kept in this repo), is one pattern in backend_state 'word_pattern'. Names with one
-- are refused; in comments and notes shared with Everyone they show as •••. Accounts in their first three days can't
-- post links (they show as [link removed]). Until the list is loaded, only the link rule applies.
create table if not exists blocked_words (word text primary key);
alter table blocked_words enable row level security;   -- no rules: nobody reads it from the app
revoke all on blocked_words from authenticated, anon;
create or replace function internal.word_pattern() returns text
language sql stable security definer set search_path = public as $$ select nullif(value, '') from backend_state where key = 'word_pattern'; $$;
-- (re)build the pattern from the table: longest first, special characters escaped, spaces as any whitespace
create or replace function internal.load_word_pattern() returns int
language plpgsql security definer set search_path = public as $$
declare pat text; n int;
begin
  select string_agg(regexp_replace(regexp_replace(lower(btrim(word)), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g'), '|' order by char_length(word) desc), count(*)
    into pat, n from blocked_words where char_length(btrim(word)) >= 2;
  insert into backend_state (key, value) values ('word_pattern', coalesce(pat, '')) on conflict (key) do update set value = excluded.value, updated_at = now();
  return coalesce(n, 0);
end $$;
-- v14.6: speed limits, so one account can't flood strangers (comments, new sessions and coffees, reports, new
-- communities). Generous for people logging and talking; a script hits them. Counted when something new is made, by
-- the server's clock (an app can't backdate its way around them); a save over the limit is refused with a plain message.
create table if not exists internal.rate_log (profile_id uuid not null, kind text not null, at timestamptz not null default now());
alter table internal.rate_log enable row level security;
revoke all on internal.rate_log from public, anon, authenticated;
create index if not exists rate_log_recent on internal.rate_log (profile_id, kind, at);
create or replace function internal.rate_hit(pid uuid, what text) returns void
language plpgsql security definer set search_path = public as $$
declare lim int[] := case what when 'comment' then array[20, 5, 300]       -- 20 in 5 minutes, 300 a day
                               when 'session' then array[100, 10, 500]
                               when 'coffee' then array[50, 10, 300]
                               when 'report' then array[20, 60, 50]
                               when 'group' then array[5, 60, 20] else array[100, 10, 1000] end;
begin
  if pid is null then return; end if;
  -- carrying over saves made before (supabase/replay_late.js, from the database itself, never through the app's web
  -- address) isn't someone going fast
  if coalesce(current_setting('dialed.replay', true), '') = 'on' and session_user <> 'authenticator' then return; end if;
  if (select count(*) from internal.rate_log where profile_id = pid and kind = what and at > now() - make_interval(mins => lim[2])) >= lim[1]
     or (select count(*) from internal.rate_log where profile_id = pid and kind = what and at > now() - interval '1 day') >= lim[3] then
    raise exception 'You''re going a bit fast. Wait a few minutes and try again.' using errcode = '22023';
  end if;
  insert into internal.rate_log (profile_id, kind) values (pid, what);
  if random() < 0.02 then delete from internal.rate_log where at < now() - interval '2 days'; end if;
end $$;
create or replace function internal.is_new_account(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce((select joined_at > now() - interval '3 days' from profiles where id = pid), false); $$;
create or replace function internal.clean_text(t text, strip_links boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare pat text := internal.word_pattern(); out text := t;
begin
  if out is null then return null; end if;
  if strip_links then out := regexp_replace(out, '(https?://|www\.)\S+', '[link removed]', 'gi'); end if;
  if pat is not null then out := regexp_replace(out, '\m(' || pat || ')\M', '•••', 'gi'); end if;
  return out;
end $$;
create or replace function internal.name_ok(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pat text := internal.word_pattern();
begin return pat is null or coalesce(t, '') !~* ('\m(' || pat || ')\M'); end $$;

-- group owners and admins can flip members' "counts in group goal"; members can flip their own
drop policy if exists members_edit on group_members;
create policy members_edit on group_members for update to authenticated
  using (user_id = me() or internal.is_group_admin(group_id, me()))
  with check (user_id = me() or internal.is_group_admin(group_id, me()));

-- ---------------------------------------------------------------- claiming a Sheet-era name
create or replace function claim_name(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c claim_codes; uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if exists (select 1 from profiles where auth_id = uid) then raise exception 'This account already has a profile.' using errcode = '23505'; end if;
  select * into c from claim_codes where claim_codes.code = lower(btrim(claim_name.code)) for update;
  if not found then raise exception 'That code doesn''t match.' using errcode = 'P0002'; end if;
  if c.claimed_by is not null then raise exception 'That name has already been claimed.' using errcode = '23505'; end if;
  update profiles set auth_id = uid where legacy_name = c.legacy_name and auth_id is null returning * into p;
  if not found then raise exception 'That name has already been claimed.' using errcode = '23505'; end if;
  update claim_codes set claimed_by = p.id, claimed_at = now() where claim_codes.code = c.code;
  return jsonb_build_object('id', p.id, 'name', coalesce(p.legacy_name, p.display_name), 'handle', p.handle);
end $$;

-- a new person (not from the Sheet era) makes their profile. The name is how the app knows them, so it's unique
-- (ignoring capitals) and can't be a Sheet-era name; the handle is made from it.
create or replace function create_profile(name text, color text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := regexp_replace(btrim(coalesce(create_profile.name, '')), '\s+', ' ', 'g'); h text; i int := 1; p profiles;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if exists (select 1 from profiles where auth_id = uid) then raise exception 'This account already has a profile.' using errcode = '23505'; end if;
  if char_length(n) < 2 or char_length(n) > 24 or n ~ '[[:cntrl:]<>]' or n like '\_\_%' or n ~* '^(unknown|undefined|null|everyone|system)$' then
    raise exception 'Use 2 to 24 characters for your name.' using errcode = '22023';
  end if;
  if not internal.name_ok(n) then raise exception 'Pick another name.' using errcode = '22023'; end if;   -- v14.6: the content filter
  if exists (select 1 from profiles where lower(display_name) = lower(n) or lower(legacy_name) = lower(n)) then raise exception 'That name is taken.' using errcode = '23505'; end if;
  h := left(lower(regexp_replace(n, '[^a-zA-Z0-9_]', '', 'g')), 20);
  if char_length(h) < 2 then h := 'brewer'; end if;
  while exists (select 1 from profiles where handle = h || case when i = 1 then '' else i::text end) loop i := i + 1; end loop;
  begin
    insert into profiles (auth_id, handle, display_name, color, joined_at)
    values (uid, h || case when i = 1 then '' else i::text end, n, case when create_profile.color ~ '^#[0-9a-fA-F]{6}$' then create_profile.color end, now()) returning * into p;
  exception when unique_violation then   -- someone took it a moment ago
    raise exception 'That name is taken.' using errcode = '23505';
  end;
  return jsonb_build_object('id', p.id, 'name', p.display_name, 'handle', p.handle, 'joined', p.joined_at);
end $$;

-- the signed-in person's profile, or null when they haven't claimed a name or made one yet
create or replace function my_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'name', coalesce(p.legacy_name, p.display_name), 'handle', p.handle, 'private', p.is_private,
           'joined', p.joined_at, 'admin', internal.is_admin(p.id)) from profiles p where p.auth_id = auth.uid();
$$;

-- v14.4: a private profile approves its followers (and only they, plus friends and your groups, see what you share
-- with Everyone). Going public again lets in everyone who asked.
create or replace function set_private(make_private boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  update profiles set is_private = coalesce(make_private, false) where id = me_id;
  if not coalesce(make_private, false) then update follows set status = 'accepted' where followee = me_id and status = 'pending'; end if;
  return my_profile();
end $$;

-- the parts of other people's gear their profile shows: favorite coffees and roaster choices (their merges and "not the
-- same" apply to everyone's roaster pages; favorite roasters and roaster details show there too). Recipes and last
-- setups stay private, so this reads profile_gear past its owner-only rule and returns only these columns.
create or replace function internal.public_gear(viewer uuid) returns table (profile_id uuid, fab_four jsonb, roasters jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.profile_id, coalesce(g.favorites->'fabFour', '[]'::jsonb), coalesce(g.roaster_prefs, '{}'::jsonb), g.updated_at
  from profile_gear g where g.profile_id <> viewer and not private.blocked_either(viewer, g.profile_id);
$$;

-- ---------------------------------------------------------------- reading: pull_events()
create or replace function internal.comments_json(cof uuid, ses uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(substr(c.legacy_ref, strpos(c.legacy_ref, '#') + 1), c.id::text),
      'user', internal.name_of(c.author_id),
      'text', c.body,
      'timestamp', c.created_at,
      'parentId', coalesce((select coalesce(substr(p.legacy_ref, strpos(p.legacy_ref, '#') + 1), p.id::text) from comments p where p.id = c.parent_id), ''),
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at) from comment_likes l where l.comment_id = c.id), '[]'::jsonb),
      'audience', c.audience
    ) order by c.created_at, c.legacy_ref), '[]'::jsonb)
  from comments c
  where c.deleted_at is null and ((cof is not null and c.coffee_id = cof) or (ses is not null and c.session_id = ses))
    and (c.author_id = me() or not internal.unseen('comment', c.id));   -- v14.5: reported
$$;

-- one coffee / one session in the app's event format (pull_events and community_feed share them). They run as the
-- caller, so the row rules decide which notes, photos, likes and comments come along.
create or replace function internal.coffee_json(k coffees) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
      'type', 'bean', 'id', coalesce(k.legacy_id, k.id::text),
      'user', internal.name_of(k.owner_id), 'owner', internal.name_of(k.owner_id),
      'actor', internal.name_of(k.owner_id), 'actorColor', internal.color_of(k.owner_id),
      'roaster', coalesce(k.roaster_text, r.name, ''), 'name', k.name, 'origin', coalesce(k.origin, ''), 'process', coalesce(k.process, ''),
      'variety', coalesce(k.variety, ''), 'roast', coalesce(k.roast, ''), 'roastDate', coalesce(k.roast_date::text, ''),
      'date', k.created_at, 'eventAt', k.updated_at,
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at) from coffee_likes l where l.coffee_id = k.id), '[]'::jsonb),
      'comments', internal.comments_json(k.id, null),
      'wantToTry', coalesce((select jsonb_agg(internal.name_of(w.owner_id) order by w.added_at) from want_to_try w where w.coffee_id = k.id), '[]'::jsonb)
    ))
  from (select 1) one left join roasters r on r.id = k.roaster_id;
$$;

create or replace function internal.session_json(s sessions) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(s.extras, '{}'::jsonb) || coalesce(s.taste, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'type', 'brew', 'id', coalesce(s.legacy_id, s.id::text),
      'beanId', coalesce(k.legacy_id, s.extras->>'beanId', ''),
      'user', internal.name_of(s.owner_id), 'owner', internal.name_of(s.owner_id),
      'actor', internal.name_of(s.owner_id), 'actorColor', internal.color_of(s.owner_id),
      'method', coalesce(s.method, ''), 'grind', coalesce(s.grind, ''),
      'dose', s.dose, 'yield', s.yield, 'time', s.time_s, 'rating', s.rating,
      'tasted', to_jsonb(coalesce(s.tasted, '{}'::text[])), 'flavorNotes', s.flavor_notes,
      'notes', coalesce(n.body, ''),
      'photo', case when p.path is null then null
                    when p.path like 'drive:%' then jsonb_build_object('fileId', substr(p.path, 7), 'url', 'https://drive.google.com/uc?export=view&id=' || substr(p.path, 7))
                    when p.path like 'sb:%' then jsonb_build_object('path', p.path)   -- in Supabase storage: the app asks for a short-lived link
                    else jsonb_build_object('url', p.path) end,
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at) from likes l where l.session_id = s.id), '[]'::jsonb),
      'comments', internal.comments_json(null, s.id),
      'equipment', coalesce(s.equipment->'ids', '[]'::jsonb), 'equipmentSnapshot', coalesce(s.equipment->'snapshot', '[]'::jsonb),
      'isMaster', coalesce((s.master->>'isMaster')::boolean, false), 'masterProfile', s.master->'profile',
      'date', s.brewed_at, 'eventAt', s.updated_at, 'audience', s.audience, 'noteAudience', n.audience, 'photoAudience', p.audience,
      'helpWanted', case when s.help_wanted then true end,   -- v14.5: "Help me dial this in"
      'newHere', case when (select o.joined_at from profiles o where o.id = s.owner_id) > now() - interval '14 days' then true end   -- joined in the last two weeks
    ))
  from (select 1) one left join coffees k on k.id = s.coffee_id
       left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id;
$$;

create or replace function pull_events() returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); out jsonb; circle uuid[];
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;

  -- v14.4: your circle (you, your friends, your private groups and the people you follow). The sync carries only their
  -- coffees and sessions, so it stays small however many people use the app; everyone else's public sessions come a
  -- page at a time through community_feed.
  circle := array[me_id] || (select private.my_close_ids()) || (select private.my_following_ids());

  -- coffees: your circle's, and any coffee your circle brewed
  select coalesce(jsonb_agg(internal.coffee_json(k)), '[]'::jsonb) into out
  from coffees k
  where k.deleted_at is null
    and (k.owner_id = any(circle) or exists (select 1 from sessions s where s.coffee_id = k.id and s.deleted_at is null and s.owner_id = any(circle)));

  -- sessions (notes and photos only when their own toggle lets you see them; the row rules handle that)
  out := out || coalesce((select jsonb_agg(internal.session_json(s)) from sessions s where s.deleted_at is null and s.owner_id = any(circle)
                          and (s.owner_id = me_id or not internal.unseen('session', s.id))), '[]'::jsonb);

  -- your gear in full
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'gear', 'id', 'gear-' || internal.name_of(me_id),
      'user', internal.name_of(me_id), 'owner', internal.name_of(me_id), 'actor', internal.name_of(me_id),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'type', e.type) order by e.sort_order, e.created_at)
                         from equipment e where e.owner_id = me_id), '[]'::jsonb),
      'lastByMethod', coalesce(g.last_by_method, '{}'::jsonb), 'recipes', coalesce(g.recipes, '[]'::jsonb), 'fabFour', coalesce(g.favorites->'fabFour', '[]'::jsonb),
      'goals', coalesce(g.favorites->'goals', '[]'::jsonb),
      'roasters', coalesce(g.roaster_prefs, '{}'::jsonb), 'date', coalesce(g.updated_at, now()), 'eventAt', coalesce(g.updated_at, now())))
    from (select 1) one left join profile_gear g on g.profile_id = me_id
    where g.profile_id is not null or exists (select 1 from equipment e where e.owner_id = me_id)), '[]'::jsonb);
  -- other people's: what their profile shows (equipment they haven't hidden, favorite coffees, roaster choices); never
  -- their recipes or last setups
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'gear', 'id', 'gear-' || internal.name_of(o.pid),
      'user', internal.name_of(o.pid), 'owner', internal.name_of(o.pid), 'actor', internal.name_of(o.pid),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'type', e.type) order by e.sort_order, e.created_at)
                         from equipment e where e.owner_id = o.pid), '[]'::jsonb),
      'lastByMethod', '{}'::jsonb, 'recipes', '[]'::jsonb, 'fabFour', coalesce(pg.fab_four, '[]'::jsonb), 'roasters', coalesce(pg.roasters, '{}'::jsonb),
      'date', coalesce(pg.updated_at, (select max(e.created_at) from equipment e where e.owner_id = o.pid)),
      'eventAt', coalesce(pg.updated_at, (select max(e.created_at) from equipment e where e.owner_id = o.pid))))
    from (select e.owner_id as pid from equipment e where e.owner_id <> me_id union select x.profile_id from internal.public_gear(me_id) x) o
    left join internal.public_gear(me_id) pg on pg.profile_id = o.pid
    where o.pid = any(circle)), '[]'::jsonb);

  -- the app's people list: you and everyone in your private groups (its group goal, awards and Settings use it)
  out := out || jsonb_build_array(jsonb_build_object('type', 'gear', 'id', 'gear-__people__', 'user', '__people__', 'owner', '__people__', 'actor', '__people__',
      'people', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', internal.name_of(p.id), 'color', p.color, 'addedAt', p.created_at, 'joinedAt', p.joined_at)) order by p.created_at, p.id)
                          from profiles p
                          where p.id = me_id or p.id in (select m2.user_id from group_members m1 join group_members m2 on m2.group_id = m1.group_id
                                                         join groups g on g.id = m1.group_id where m1.user_id = me_id and not g.is_open)), '[]'::jsonb),
      'removed', '[]'::jsonb, 'items', '[]'::jsonb, 'date', '2026-01-01T00:00:00Z', 'eventAt', '2026-01-01T00:00:00Z'));

  -- custom tasting notes
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'flavor', 'id', f.id::text, 'name', f.name, 'user', internal.name_of(f.created_by),
      'date', f.created_at, 'eventAt', f.created_at)) from flavors f), '[]'::jsonb);

  -- the shared record the app keeps for the group goal: who doesn't count toward it
  out := out || jsonb_build_array(jsonb_build_object('type', 'gear', 'id', 'gear-__group__', 'user', '__group__', 'owner', '__group__',
      'items', '[]'::jsonb, 'lastByMethod', '{}'::jsonb, 'date', '2026-01-01T00:00:00Z', 'eventAt', '2026-01-01T00:00:00Z',
      'goalExclude', coalesce((select jsonb_agg(distinct internal.name_of(m.user_id)) from group_members m join groups g on g.id = m.group_id
                               where not m.counts_in_goal and not g.is_open), '[]'::jsonb)));
  return out;
end $$;

-- v14.4: the community feed. Everyone's sessions shared with Everyone that you're allowed to see (the row rules leave
-- out private profiles you don't follow, and anyone blocked either way), newest first, a page at a time:
-- community_feed(before => the "next" of the last page). Each page carries the sessions and their coffees in the
-- app's event format, likes and comments included.
create index if not exists sessions_owner on sessions (owner_id);
create index if not exists sessions_coffee on sessions (coffee_id);
create index if not exists coffees_owner on coffees (owner_id);
create index if not exists comments_session on comments (session_id);
create index if not exists comments_coffee on comments (coffee_id);
create index if not exists follows_followee on follows (followee);
create index if not exists group_members_user on group_members (user_id);
create index if not exists equipment_owner on equipment (owner_id);
create index if not exists sessions_public_recent on sessions (brewed_at desc) where deleted_at is null and audience = 'everyone';
create index if not exists sessions_help_recent on sessions (brewed_at desc) where deleted_at is null and audience = 'everyone' and help_wanted;
-- v14.5: filters. feed_filter => 'help' (help requests) or 'new' (people who joined in the last two weeks); feed_method => one
-- method; feed_group => an open group's members (or a group you're in).
drop function if exists community_feed(timestamptz, int);
drop function if exists community_feed(timestamptz, int, text, text);
create or replace function community_feed(before timestamptz default null, max_items int default 30, feed_filter text default null, feed_method text default null, feed_group uuid default null) returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); lim int := least(greatest(coalesce(max_items, 30), 1), 60); ids uuid[]; oldest timestamptz;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  select array_agg(t.id order by t.brewed_at desc), min(t.brewed_at) into ids, oldest
  from (select s.id, s.brewed_at from sessions s
        where s.deleted_at is null and (community_feed.before is null or s.brewed_at < community_feed.before)
          -- what members share with Everyone; in a private community, also what they keep to Friends & groups (members
          -- see each other's; the row rules decide)
          and (s.audience = 'everyone' or (feed_group is not null and s.audience = 'friends' and not coalesce((select g.is_open from groups g where g.id = feed_group), true)))
          and (feed_filter is distinct from 'help' or s.help_wanted)
          and (feed_filter is distinct from 'new' or (select o.joined_at from profiles o where o.id = s.owner_id) > now() - interval '14 days')
          and (coalesce(btrim(feed_method), '') = '' or lower(s.method) = lower(btrim(feed_method)))
          and (feed_group is null or (s.owner_id in (select m.user_id from group_members m where m.group_id = feed_group)
                                      and exists (select 1 from groups g where g.id = feed_group and (g.is_open or private.is_group_member(g.id, me_id)))))
          and (s.owner_id = me_id or not internal.unseen('session', s.id))
        order by s.brewed_at desc limit lim) t;
  if ids is null then return jsonb_build_object('events', '[]'::jsonb, 'next', null); end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(internal.coffee_json(k)) from coffees k
                        where k.deleted_at is null and k.id in (select s.coffee_id from sessions s where s.id = any(ids))), '[]'::jsonb)
           || coalesce((select jsonb_agg(internal.session_json(s) order by s.brewed_at desc) from sessions s where s.id = any(ids)), '[]'::jsonb),
    'next', case when array_length(ids, 1) = lim then oldest end);
end $$;

-- ---------------------------------------------------------------- v14.5: Discover
-- Everyone's sessions shared with Everyone, ranked to show the most interesting brews of the moment, not to keep
-- anyone scrolling. Written out in plain words in supabase/README.md ("How Discover ranks"); in short:
--   recency    0.5 ^ (age in hours / 36): a session loses half its weight every day and a half
--   effort     a photo, tasting notes, the taste sliders or flavor notes, a rating
--   response   likes and comments from other people, on a log scale and capped (popularity can't run away)
--   welcome    sessions asking for help that nobody has answered yet, and people in their first two weeks
--   variety    origins and methods that are rarer this week get a lift
--   you        a slight lean toward the methods and roasters you brew; people you already follow count a bit
--              less here (you see them in Following)
--   spread     each extra session from the same person, or on the same coffee, counts less, so no one fills it
-- It looks back two months and then ends ("You're all caught up"). Pages are ranked once, as of the first page
-- (as_of), so paging never repeats or skips. Never your own sessions, anything you reported, or anything hidden.
create or replace function internal.engagement(sid uuid, owner uuid) returns int[]
language sql stable security definer set search_path = public as $$
  select array[(select count(*)::int from likes l where l.session_id = sid and l.user_id <> owner),
               (select count(*)::int from comments c where c.session_id = sid and c.author_id <> owner and c.deleted_at is null)];
$$;

create or replace function discover_feed(as_of timestamptz default null, page int default 0, max_items int default 20, feed_filter text default null, feed_method text default null) returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); t0 timestamptz := coalesce(as_of, now()); lim int := least(greatest(coalesce(max_items, 20), 1), 40);
        pg int := greatest(coalesce(page, 0), 0); ids uuid[]; total int; following uuid[]; my_methods text[]; my_roasters text[];
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  following := (select private.my_following_ids());
  select coalesce(array_agg(distinct s.method), '{}'), coalesce(array_agg(distinct lower(btrim(k.roaster_text))) filter (where k.roaster_text is not null), '{}')
    into my_methods, my_roasters
    from sessions s left join coffees k on k.id = s.coffee_id where s.owner_id = me_id and s.deleted_at is null;
  with cand as (
    select s.id, s.owner_id, s.method, s.coffee_id, s.help_wanted, s.rating, s.extras, s.tasted, s.flavor_notes,
           extract(epoch from (t0 - s.brewed_at)) / 3600.0 as age_h,
           coalesce(nullif(lower(btrim(k.roaster_text)), ''), '?') || '|' || coalesce(nullif(lower(btrim(k.name)), ''), s.coffee_id::text, s.id::text) as ckey,
           nullif(lower(btrim(split_part(coalesce(k.origin, ''), ',', 1))), '') as origin,
           lower(btrim(k.roaster_text)) as roaster,
           (select o.joined_at from profiles o where o.id = s.owner_id) > t0 - interval '14 days' as newcomer,
           exists (select 1 from session_photos p where p.session_id = s.id) as photo,
           exists (select 1 from session_notes n where n.session_id = s.id and char_length(btrim(n.body)) >= 12) as notes,
           internal.engagement(s.id, s.owner_id) as eng
    from sessions s left join coffees k on k.id = s.coffee_id
    where s.deleted_at is null and s.audience = 'everyone' and s.owner_id <> me_id
      and s.brewed_at <= t0 and s.brewed_at > t0 - interval '60 days'
      and (feed_filter is distinct from 'help' or s.help_wanted)
      and (feed_filter is distinct from 'new' or (select o.joined_at from profiles o where o.id = s.owner_id) > t0 - interval '14 days')
      and (coalesce(btrim(feed_method), '') = '' or lower(s.method) = lower(btrim(feed_method)))
      and not internal.unseen('session', s.id)
  ), counted as (
    select c.*, count(*) over (partition by c.origin) as origin_n, count(*) over (partition by lower(coalesce(c.method, ''))) as method_n
    from cand c
  ), scored as (
    select c.*,
      power(0.5, greatest(c.age_h, 0) / 36.0)
      * (1.0
         + case when c.photo then 0.35 else 0 end
         + case when c.notes then 0.25 else 0 end
         + case when coalesce(array_length(c.tasted, 1), 0) > 0 or (jsonb_typeof(c.flavor_notes) = 'object' and c.flavor_notes <> '{}'::jsonb)
                     or coalesce(btrim(c.extras->>'flavors'), '') <> '' then 0.15 else 0 end
         + case when coalesce(c.rating, 0) > 0 then 0.10 else 0 end
         + 0.30 * ln(1 + least(c.eng[1], 20))
         + 0.45 * ln(1 + least(c.eng[2], 12))
         + case when c.help_wanted and coalesce(btrim(c.extras->>'helpfulAnswer'), '') = '' then 0.40 else 0 end
         + case when c.newcomer then 0.35 else 0 end)
      * (1.0 + case when c.origin is null then 0 else 0.35 / sqrt(c.origin_n) end + 0.20 / sqrt(greatest(c.method_n, 1)))
      * (1.0 + case when c.method = any(my_methods) then 0.15 else 0 end + case when c.roaster = any(my_roasters) then 0.10 else 0 end)
      * case when c.owner_id = any(following) then 0.7 else 1.0 end as raw
    from counted c
  ), spread as (
    select s2.id, s2.raw
      * power(0.55, (row_number() over (partition by s2.owner_id order by s2.raw desc, s2.id)) - 1)
      * power(0.7, (row_number() over (partition by s2.ckey order by s2.raw desc, s2.id)) - 1) as score
    from scored s2
  )
  select array_agg(x.id order by x.score desc, x.id), (select count(*) from spread)
    into ids, total
    from (select id, score from spread order by score desc, id offset pg * lim limit lim) x;
  return jsonb_build_object(
    'events', case when ids is null then '[]'::jsonb else
                coalesce((select jsonb_agg(internal.coffee_json(k)) from coffees k
                          where k.deleted_at is null and k.id in (select s.coffee_id from sessions s where s.id = any(ids))), '[]'::jsonb)
             || coalesce((select jsonb_agg(internal.session_json(s)) from sessions s where s.id = any(ids)), '[]'::jsonb) end,
    'order', coalesce((select jsonb_agg(coalesce(s.legacy_id, s.id::text) order by array_position(ids, s.id)) from sessions s where s.id = any(ids)), '[]'::jsonb),   -- the ranking
    'next', case when (pg + 1) * lim < total then pg + 1 end,
    'asOf', t0, 'total', total);
end $$;

-- ---------------------------------------------------------------- v14.6: everyone on a coffee
-- The coffee page's Everyone tab: sessions shared with Everyone on the same coffee (same roaster and name, ignoring
-- case, spaces and punctuation) by anyone but you, that you're allowed to see (the row rules leave out private profiles
-- you don't follow and anyone blocked; anything you reported or that's hidden stays out), newest first, a page at a
-- time. The first page also carries a summary: how many people and sessions, the average rating, how each method is
-- usually brewed (the middle ratio, time and dose; never grind settings, they don't carry across grinders) and the
-- flavor notes people pick most (the wheel notes on each session).
create or replace function internal.coffee_key(t text) returns text
language sql immutable as $$ select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g') $$;
create index if not exists coffees_match on coffees (internal.coffee_key(name), internal.coffee_key(roaster_text)) where deleted_at is null;

create or replace function coffee_community(coffee_roaster text, coffee_name text, before timestamptz default null, max_items int default 10) returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); lim int := least(greatest(coalesce(max_items, 10), 1), 40);
        rk text := internal.coffee_key(coffee_roaster); nk text := internal.coffee_key(coffee_name);
        ids uuid[]; oldest timestamptz; summary jsonb;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if nk = '' then return jsonb_build_object('events', '[]'::jsonb, 'next', null, 'summary', null); end if;
  with pool as (
    select s.id, s.owner_id, s.method, s.rating, s.dose, s.yield, s.time_s, s.extras->>'flavors' as flv, s.flavor_notes as fnotes, s.brewed_at
    from coffees k join sessions s on s.coffee_id = k.id
    where k.deleted_at is null and internal.coffee_key(k.name) = nk and internal.coffee_key(k.roaster_text) = rk
      and s.deleted_at is null and s.audience = 'everyone' and s.owner_id <> me_id
      and not internal.unseen('session', s.id)
  ), page as (
    select id, brewed_at from pool where coffee_community.before is null or brewed_at < coffee_community.before
    order by brewed_at desc, id limit lim
  )
  select (select array_agg(id order by brewed_at desc, id) from page), (select min(brewed_at) from page),
         case when coffee_community.before is null and exists (select 1 from pool) then jsonb_build_object(
      'people', (select count(distinct owner_id) from pool),
      'sessions', (select count(*) from pool),
      'rating', (select round(avg(rating), 1) from pool where rating > 0),
      'methods', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('method', m.method, 'n', m.n, 'ratio', round(m.ratio::numeric, 1), 'time', round(m.t::numeric), 'dose', round(m.dose::numeric, 1))) order by m.n desc, m.method)
                           from (select method, count(*) as n,
                                        percentile_cont(0.5) within group (order by yield / dose) filter (where dose > 0 and yield > 0) as ratio,
                                        percentile_cont(0.5) within group (order by time_s) filter (where time_s > 0) as t,
                                        percentile_cont(0.5) within group (order by dose) filter (where dose > 0) as dose
                                 from pool where coalesce(btrim(method), '') <> '' group by method) m), '[]'::jsonb),
      'notes', coalesce((select jsonb_agg(x.note order by x.c desc, x.note) from (
                           select lower(btrim(f.n)) as note, count(distinct p.id) as c from pool p,
                                  lateral (select unnest(string_to_array(coalesce(p.flv, ''), ',')) union
                                           select jsonb_object_keys(case when jsonb_typeof(p.fnotes) = 'object' then p.fnotes else '{}'::jsonb end)) f(n)
                           where btrim(f.n) <> '' group by 1 order by 2 desc, 1 limit 5) x), '[]'::jsonb)) end
    into ids, oldest, summary;
  return jsonb_build_object(
    'events', case when ids is null then '[]'::jsonb else
                coalesce((select jsonb_agg(internal.coffee_json(k)) from coffees k
                          where k.deleted_at is null and k.id in (select s.coffee_id from sessions s where s.id = any(ids))), '[]'::jsonb)
             || coalesce((select jsonb_agg(internal.session_json(s) order by s.brewed_at desc, s.id) from sessions s where s.id = any(ids)), '[]'::jsonb) end,
    'next', case when coalesce(array_length(ids, 1), 0) = lim then oldest end,
    'summary', summary);
end $$;

-- ---------------------------------------------------------------- has anything changed? data_version()
-- v14.4: a fingerprint of your circle (you, your friends, your groups, the people you follow): what the sync would
-- send you. The app asks for it (a few bytes) every sync and only pulls everything again when it changed. It's your
-- own, so somebody brewing on the other side of the world doesn't make everyone's phone download again (the
-- earlier version was one counter for everyone, bumped by every save, which also made every save wait on one row).
do $$ declare t text; begin
  foreach t in array array['profiles', 'follows', 'blocks', 'groups', 'group_members', 'roasters', 'coffees', 'sessions', 'session_notes', 'session_photos',
                           'likes', 'comments', 'comment_likes', 'coffee_likes', 'equipment', 'want_to_try', 'profile_gear', 'flavors'] loop
    execute format('drop trigger if exists bump_version on %I', t);
  end loop;
end $$;
drop function if exists internal.bump_version();
drop function if exists data_version();
create or replace function data_version() returns text
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); circle uuid[];
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  circle := array[me_id] || (select private.my_close_ids()) || (select private.my_following_ids());
  return md5(concat_ws('|',
    (select string_agg(x::text, ',' order by x) from unnest(circle) x),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') || ':' || coalesce(max(deleted_at)::text, '') from sessions where owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') || ':' || coalesce(max(deleted_at)::text, '') from coffees where owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(n.updated_at)::text, '') || ':' || coalesce(md5(string_agg(n.audience::text, ',' order by n.session_id)), '') from session_notes n join sessions s on s.id = n.session_id where s.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(md5(string_agg(p.path || p.audience::text, ',' order by p.session_id)), '') from session_photos p join sessions s on s.id = p.session_id where s.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(l.created_at)::text, '') from likes l join sessions s on s.id = l.session_id where s.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(greatest(c.created_at, c.edited_at, c.deleted_at))::text, '') || ':' || coalesce(md5(string_agg(c.audience::text || coalesce(c.parent_id::text, ''), ',' order by c.id)), '')
       from comments c left join sessions s on s.id = c.session_id left join coffees k on k.id = c.coffee_id where s.owner_id = any(circle) or k.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(cl.created_at)::text, '') from comment_likes cl join comments c on c.id = cl.comment_id left join sessions s on s.id = c.session_id left join coffees k on k.id = c.coffee_id where s.owner_id = any(circle) or k.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(l.created_at)::text, '') from coffee_likes l join coffees k on k.id = l.coffee_id where k.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(w.added_at)::text, '') from want_to_try w join coffees k on k.id = w.coffee_id where k.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(md5(string_agg(e.id::text || e.name || coalesce(e.type, '') || e.hidden::text || coalesce(e.sort_order::text, ''), ',' order by e.id)), '') from equipment e where e.owner_id = any(circle)),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from profile_gear where profile_id = any(circle)),
    (select md5(string_agg(p.id::text || coalesce(p.color, '') || p.is_private::text || coalesce(p.display_name, '') || coalesce(p.city, ''), ',' order by p.id)) from profiles p where p.id = any(circle)),
    (select md5(string_agg(m.group_id::text || m.user_id::text || m.role || m.counts_in_goal::text, ',' order by m.group_id, m.user_id))
       from group_members m where m.group_id in (select group_id from group_members where user_id = me_id)),
    (select count(*) || ':' || coalesce(max(created_at)::text, '') from flavors),
    internal.report_mark()));
end $$;

-- ---------------------------------------------------------------- writing: push_event(ev)
-- your like on a coffee or session
create or replace function internal.sync_like(kind text, target uuid, likes jsonb, me_id uuid, me_nm text) returns void
language plpgsql set search_path = public as $$
begin
  if internal.has_name(likes, me_nm) then
    if kind = 'session' then insert into likes (session_id, user_id) values (target, me_id) on conflict do nothing;
    else insert into coffee_likes (coffee_id, user_id) values (target, me_id) on conflict do nothing; end if;
  else
    if kind = 'session' then delete from likes where session_id = target and user_id = me_id;
    else delete from coffee_likes where coffee_id = target and user_id = me_id; end if;
  end if;
end $$;

-- the app sends replies' parent and comment likes alongside the comments too ("commentMeta"); fold them back in
create or replace function internal.with_comment_meta(list jsonb, meta jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(list) is distinct from 'array' then '[]'::jsonb
              when jsonb_typeof(meta) is distinct from 'object' then list
              else coalesce((select jsonb_agg(case when jsonb_typeof(c) = 'object' and coalesce(meta ? (c->>'id'), false) then
                     c || jsonb_build_object('parentId', coalesce(nullif(c->>'parentId', ''), meta->(c->>'id')->>'p', ''),
                                             'likes', case when jsonb_typeof(c->'likes') = 'array' then c->'likes'
                                                           when jsonb_typeof(meta->(c->>'id')->'l') = 'array' then meta->(c->>'id')->'l' else '[]'::jsonb end)
                     else c end order by n) from jsonb_array_elements(list) with ordinality as x(c, n)), '[]'::jsonb) end;
$$;

-- your comments (and your likes on any comment) on a coffee or session
create or replace function internal.sync_comments(kind text, target uuid, rec text, list jsonb, me_id uuid, me_nm text) returns void
language plpgsql set search_path = public as $$
declare c jsonb; ref text; cid uuid; mine text[] := '{}';
begin
  if jsonb_typeof(list) <> 'array' then list := '[]'::jsonb; end if;
  for c in select * from jsonb_array_elements(list) loop
    ref := rec || '#' || (c->>'id');
    if lower(btrim(coalesce(c->>'user', ''))) = lower(me_nm) then
      mine := mine || ref;
      if not exists (select 1 from comments where legacy_ref = ref) then perform internal.rate_hit(me_id, 'comment'); end if;   -- v14.6
      insert into comments (legacy_ref, session_id, coffee_id, author_id, parent_id, body, audience, created_at)
      values (ref, case when kind = 'session' then target end, case when kind = 'coffee' then target end, me_id,
              (select id from comments where legacy_ref = rec || '#' || nullif(c->>'parentId', '')),
              internal.clean_text(coalesce(nullif(left(c->>'text', 2000), ''), '…'), internal.is_new_account(me_id)),   -- v14.6: the content filter
              coalesce(internal.item_aud(c->>'audience'), 'friends'), coalesce(internal.try_ts(c->>'timestamp'), now()))
      on conflict (legacy_ref) do update set body = excluded.body, parent_id = coalesce(comments.parent_id, excluded.parent_id),
        audience = coalesce(internal.item_aud(c->>'audience'), comments.audience),
        edited_at = case when comments.body is distinct from excluded.body then now() else comments.edited_at end
      where comments.author_id = me_id;
    end if;
  end loop;
  -- your comments that the app no longer has were removed
  if kind = 'session' then delete from comments where session_id = target and author_id = me_id and not (legacy_ref = any(mine));
  else delete from comments where coffee_id = target and author_id = me_id and not (legacy_ref = any(mine)); end if;
  -- your likes on comments
  for c in select * from jsonb_array_elements(list) loop
    select id into cid from comments where legacy_ref = rec || '#' || (c->>'id');
    if cid is null then continue; end if;
    if internal.has_name(c->'likes', me_nm) then insert into comment_likes (comment_id, user_id) values (cid, me_id) on conflict do nothing;
    else delete from comment_likes where comment_id = cid and user_id = me_id; end if;
  end loop;
end $$;

create or replace function internal.roaster_for(nm text, me_id uuid) returns uuid
language plpgsql set search_path = public as $$
declare rid uuid;
begin
  if nm is null or btrim(nm) = '' then return null; end if;
  select id into rid from roasters where lower(name) = lower(btrim(nm)) order by merged_into nulls first limit 1;
  if rid is null then insert into roasters (name, created_by) values (btrim(nm), me_id) returning id into rid; end if;
  return rid;
end $$;

create or replace function internal.push_bean(ev jsonb, me_id uuid, me_nm text) returns void
language plpgsql set search_path = public as $$
declare k coffees;
begin
  select * into k from coffees where legacy_id = ev->>'id';
  if not found then
    if lower(btrim(coalesce(ev->>'owner', ev->>'user', me_nm))) <> lower(me_nm) then return; end if;   -- someone else's coffee you can't see
    perform internal.rate_hit(me_id, 'coffee');   -- v14.6
    insert into coffees (legacy_id, owner_id, roaster_id, roaster_text, name, origin, process, variety, roast, roast_date, created_at)
    values (ev->>'id', me_id, internal.roaster_for(ev->>'roaster', me_id), nullif(btrim(ev->>'roaster'), ''), coalesce(nullif(btrim(ev->>'name'), ''), 'Coffee'),
            nullif(btrim(ev->>'origin'), ''), nullif(btrim(ev->>'process'), ''), nullif(btrim(ev->>'variety'), ''), nullif(btrim(ev->>'roast'), ''),
            internal.try_date(ev->>'roastDate'), coalesce(internal.try_ts(ev->>'date'), now()))
    returning * into k;
  elsif k.deleted_at is not null then return;                                                         -- deleted stays deleted
  elsif k.owner_id = me_id then                                                    -- only the owner edits a coffee, as in the app today
    update coffees set roaster_id = internal.roaster_for(ev->>'roaster', me_id), roaster_text = nullif(btrim(ev->>'roaster'), ''), name = coalesce(nullif(btrim(ev->>'name'), ''), name),
      origin = nullif(btrim(ev->>'origin'), ''), process = nullif(btrim(ev->>'process'), ''), variety = nullif(btrim(ev->>'variety'), ''),
      roast = nullif(btrim(ev->>'roast'), ''), roast_date = internal.try_date(ev->>'roastDate'), updated_at = now()
    where id = k.id;
  end if;
  perform internal.sync_like('coffee', k.id, ev->'likes', me_id, me_nm);
  perform internal.sync_comments('coffee', k.id, ev->>'id', internal.with_comment_meta(ev->'comments', ev->'commentMeta'), me_id, me_nm);
  if internal.has_name(ev->'wantToTry', me_nm) then insert into want_to_try (owner_id, coffee_id) values (me_id, k.id) on conflict do nothing;
  else delete from want_to_try where owner_id = me_id and coffee_id = k.id; end if;
end $$;

create or replace function internal.session_fields(ev jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'taste', jsonb_strip_nulls(jsonb_build_object(
       'acidity', case when coalesce(ev->>'acidity', '') <> '' then ev->'acidity' end, 'sweetness', case when coalesce(ev->>'sweetness', '') <> '' then ev->'sweetness' end,
       'body', case when coalesce(ev->>'body', '') <> '' then ev->'body' end, 'finish', case when coalesce(ev->>'finish', '') <> '' then ev->'finish' end,
       'bitterness', case when coalesce(ev->>'bitterness', '') <> '' then ev->'bitterness' end, 'balance', case when coalesce(ev->>'balance', '') <> '' then ev->'balance' end,
       'complexity', case when coalesce(ev->>'complexity', '') <> '' then ev->'complexity' end)),
    'extras', ev - array['type', 'id', 'beanId', 'method', 'grind', 'dose', 'yield', 'time', 'acidity', 'sweetness', 'body', 'finish', 'balance', 'bitterness',
       'complexity', 'isMaster', 'masterProfile', 'notes', 'note', 'observations', 'observation', 'tastingNotes', 'user', 'owner', 'date', 'actor', 'actorColor',
       'rating', 'likes', 'comments', 'photo', 'equipment', 'equipmentSnapshot', 'eventAt', 'commentMeta', 'tasted', 'flavorNotes', 'audience', 'noteAudience', 'photoAudience', 'helpWanted', 'newHere', 'baseAt'],
    'equipment', jsonb_build_object('ids', coalesce(ev->'equipment', '[]'::jsonb), 'snapshot', coalesce(ev->'equipmentSnapshot', '[]'::jsonb)),
    'master', case when coalesce(ev->>'isMaster', 'false') = 'true' or jsonb_typeof(ev->'masterProfile') = 'object'
                   then jsonb_build_object('isMaster', coalesce(ev->>'isMaster', 'false') = 'true', 'profile', case when jsonb_typeof(ev->'masterProfile') = 'object' then ev->'masterProfile' end) end,
    'notes', coalesce(nullif(btrim(ev->>'notes'), ''), nullif(btrim(ev->>'note'), ''), nullif(btrim(ev->>'observations'), ''), nullif(btrim(ev->>'observation'), ''), nullif(btrim(ev->>'tastingNotes'), ''), ''),
    'photo', case when jsonb_typeof(ev->'photo') = 'object' and (ev->'photo'->>'path') like 'sb:%' then ev->'photo'->>'path'
                  when jsonb_typeof(ev->'photo') = 'object' and coalesce(ev->'photo'->>'fileId', '') <> '' then 'drive:' || (ev->'photo'->>'fileId')
                  when jsonb_typeof(ev->'photo') = 'object' and (ev->'photo'->>'url') ~ '^https?://' then ev->'photo'->>'url'
                  when jsonb_typeof(ev->'photo') = 'string' and (ev->>'photo') ~ '^https?://' then ev->>'photo' end);
$$;

create or replace function internal.push_brew(ev jsonb, me_id uuid, me_nm text) returns void
language plpgsql set search_path = public as $$
declare s sessions; f jsonb := internal.session_fields(ev); cof uuid; ex jsonb;
begin
  select id into cof from coffees where legacy_id = ev->>'beanId';
  ex := f->'extras';
  if cof is null and coalesce(ev->>'beanId', '') <> '' then ex := ex || jsonb_build_object('beanId', ev->>'beanId'); end if;   -- keep the link to a coffee that's gone
  select * into s from sessions where legacy_id = ev->>'id';
  if not found then
    if lower(btrim(coalesce(ev->>'owner', ev->>'user', me_nm))) <> lower(me_nm) then return; end if;
    perform internal.rate_hit(me_id, 'session');   -- v14.6
    insert into sessions (legacy_id, owner_id, coffee_id, audience, help_wanted, method, grind, dose, yield, time_s, rating, taste, tasted, flavor_notes, extras, equipment, master, brewed_at)
    values (ev->>'id', me_id, cof, coalesce(internal.aud(ev->>'audience'), 'friends'), lower(coalesce(ev->>'helpWanted', '')) = 'true', nullif(btrim(ev->>'method'), ''), nullif(btrim(ev->>'grind'), ''),
            internal.try_num(ev->>'dose'), internal.try_num(ev->>'yield'), internal.try_num(ev->>'time'), internal.rating(ev->>'rating'),
            f->'taste', array(select jsonb_array_elements_text(case when jsonb_typeof(ev->'tasted') = 'array' then ev->'tasted' else '[]'::jsonb end)),
            case when jsonb_typeof(ev->'flavorNotes') = 'object' then ev->'flavorNotes' end, ex, f->'equipment', f->'master',
            coalesce(internal.try_ts(ev->>'date'), now()))
    returning * into s;
  elsif s.deleted_at is not null then return;
  elsif s.owner_id = me_id then
    update sessions set coffee_id = cof, audience = coalesce(internal.aud(ev->>'audience'), audience), method = nullif(btrim(ev->>'method'), ''), grind = nullif(btrim(ev->>'grind'), ''),
      help_wanted = case when ev ? 'helpWanted' then lower(coalesce(ev->>'helpWanted', '')) = 'true' else help_wanted end,   -- an older app that doesn't know it keeps it
      dose = internal.try_num(ev->>'dose'), yield = internal.try_num(ev->>'yield'), time_s = internal.try_num(ev->>'time'), rating = internal.rating(ev->>'rating'),
      taste = f->'taste', tasted = array(select jsonb_array_elements_text(case when jsonb_typeof(ev->'tasted') = 'array' then ev->'tasted' else '[]'::jsonb end)),
      flavor_notes = case when jsonb_typeof(ev->'flavorNotes') = 'object' then ev->'flavorNotes' end, extras = ex, equipment = f->'equipment', master = f->'master',
      brewed_at = coalesce(internal.try_ts(ev->>'date'), brewed_at), updated_at = now()
    where id = s.id;
  end if;
  -- a photo in storage must be in your own folder (otherwise anyone could show someone else's private photo)
  if f->>'photo' like 'sb:%' and f->>'photo' not like 'sb:' || auth.uid()::text || '/%' then f := f - 'photo' || jsonb_build_object('photo', null, 'keep', true); end if;
  if s.owner_id = me_id then
    if f->>'notes' <> '' then insert into session_notes (session_id, body, audience) values (s.id, f->>'notes', coalesce(internal.item_aud(ev->>'noteAudience'), 'friends'))
      on conflict (session_id) do update set body = excluded.body, audience = coalesce(internal.item_aud(ev->>'noteAudience'), session_notes.audience), updated_at = now();
    else delete from session_notes where session_id = s.id; end if;
    -- v14.6: notes shared with Everyone pass the content filter
    update session_notes set body = internal.clean_text(body, internal.is_new_account(me_id))
     where session_id = s.id and audience = 'everyone' and body is distinct from internal.clean_text(body, internal.is_new_account(me_id));
    if f->>'photo' is not null then insert into session_photos (session_id, path, audience) values (s.id, f->>'photo', coalesce(internal.item_aud(ev->>'photoAudience'), 'friends'))
      on conflict (session_id) do update set path = excluded.path, audience = coalesce(internal.item_aud(ev->>'photoAudience'), session_photos.audience);
    elsif f->>'keep' is null and (jsonb_typeof(ev->'photo') is null or jsonb_typeof(ev->'photo') = 'null') then delete from session_photos where session_id = s.id; end if;
  end if;
  perform internal.sync_like('session', s.id, ev->'likes', me_id, me_nm);
  perform internal.sync_comments('session', s.id, ev->>'id', internal.with_comment_meta(ev->'comments', ev->'commentMeta'), me_id, me_nm);
end $$;

create or replace function internal.push_gear(ev jsonb, me_id uuid, me_nm text) returns void
language plpgsql set search_path = public as $$
declare it jsonb; i int := 0; keep text[] := '{}';
begin
  if ev->>'owner' = '__group__' then
    -- you switch yourself; group owners and admins switch anyone (the row rules enforce it)
    update group_members m set counts_in_goal = not internal.has_name(ev->'goalExclude', internal.name_of(m.user_id))
    where m.group_id in (select g.id from groups g where not g.is_open)
      and (m.user_id = me_id or internal.is_group_admin(m.group_id, me_id))
      and m.counts_in_goal is distinct from not internal.has_name(ev->'goalExclude', internal.name_of(m.user_id));
    return;
  end if;
  if ev->>'owner' = '__people__' then return; end if;                                    -- people are accounts now
  if lower(btrim(coalesce(ev->>'owner', ev->>'user', ''))) <> lower(me_nm) then return; end if;   -- only your own gear
  for it in select * from jsonb_array_elements(case when jsonb_typeof(ev->'items') = 'array' then ev->'items' else '[]'::jsonb end) loop
    if coalesce(btrim(it->>'name'), '') = '' then continue; end if;
    i := i + 1;
    keep := keep || coalesce(it->>'id', it->>'name');
    update equipment set name = btrim(it->>'name'), type = coalesce(nullif(btrim(it->>'type'), ''), 'Other'), sort_order = i
    where owner_id = me_id and legacy_id = coalesce(it->>'id', it->>'name');
    if not found then
      insert into equipment (legacy_id, owner_id, type, name, sort_order) values (coalesce(it->>'id', it->>'name'), me_id, coalesce(nullif(btrim(it->>'type'), ''), 'Other'), btrim(it->>'name'), i);
    end if;
  end loop;
  delete from equipment where owner_id = me_id and not (coalesce(legacy_id, id::text) = any(keep));
  insert into profile_gear (profile_id, recipes, last_by_method, roaster_prefs, favorites, updated_at)
  values (me_id, coalesce(case when jsonb_typeof(ev->'recipes') = 'array' then ev->'recipes' end, '[]'::jsonb),
          coalesce(case when jsonb_typeof(ev->'lastByMethod') = 'object' then ev->'lastByMethod' end, '{}'::jsonb),
          coalesce(case when jsonb_typeof(ev->'roasters') = 'object' then ev->'roasters' end, '{}'::jsonb),
          jsonb_build_object('fabFour', coalesce(case when jsonb_typeof(ev->'fabFour') = 'array' then ev->'fabFour' end, '[]'::jsonb),
                             'goals', case when ev ? 'goals' then coalesce((select jsonb_agg(x.g) from (select g from jsonb_array_elements(case when jsonb_typeof(ev->'goals') = 'array' then ev->'goals' else '[]'::jsonb end) g
                                                                            where jsonb_typeof(g) = 'object' and char_length(g::text) < 500 limit 3) x), '[]'::jsonb)
                                           else coalesce((select pg.favorites->'goals' from profile_gear pg where pg.profile_id = me_id), '[]'::jsonb) end), now())   -- v14.6: your own goals (only you see them); a phone on an older version, which doesn't send them, leaves them be
  on conflict (profile_id) do update set recipes = excluded.recipes, last_by_method = excluded.last_by_method,
    roaster_prefs = excluded.roaster_prefs, favorites = excluded.favorites, updated_at = now();
end $$;

create or replace function internal.push_delete(ev jsonb, me_id uuid) returns void
language plpgsql set search_path = public as $$
declare cid uuid;
begin
  if ev->>'targetType' = 'bean' then
    update coffees set deleted_at = now(), updated_at = now() where legacy_id = ev->>'id' and owner_id = me_id and deleted_at is null returning id into cid;
    if cid is not null then update sessions set deleted_at = now(), updated_at = now() where coffee_id = cid and owner_id = me_id and deleted_at is null; end if;
  else
    update sessions set deleted_at = now(), updated_at = now() where legacy_id = ev->>'id' and owner_id = me_id and deleted_at is null;
  end if;
end $$;

create or replace function push_event(ev jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare me_id uuid := me(); me_nm text; t text := ev->>'type';
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if jsonb_typeof(ev) <> 'object' or coalesce(ev->>'id', '') = '' then raise exception 'A save needs a type and an id.' using errcode = '22023'; end if;
  me_nm := internal.name_of(me_id);
  -- your color travels on your own saves (a like on someone else's session carries their color, so only when you're the actor)
  if lower(btrim(coalesce(ev->>'actor', ''))) = lower(me_nm) and ev->>'actorColor' ~ '^#[0-9a-fA-F]{6}$' then
    update profiles set color = lower(ev->>'actorColor') where id = me_id and color is distinct from lower(ev->>'actorColor');
  end if;
  if t = 'bean' then perform internal.push_bean(ev, me_id, me_nm);
  elsif t = 'brew' then perform internal.push_brew(ev, me_id, me_nm);
  elsif t = 'gear' then perform internal.push_gear(ev, me_id, me_nm);
  elsif t = 'delete' then perform internal.push_delete(ev, me_id);
  elsif t = 'flavor' then
    if coalesce(btrim(ev->>'name'), '') <> '' then insert into flavors (name, created_by) values (btrim(ev->>'name'), me_id) on conflict (name) do nothing; end if;
  end if;
  return jsonb_build_object('ok', true, 'type', t, 'id', ev->>'id');
end $$;

-- ---------------------------------------------------------------- following (phase 3: the database side; no screens yet)
-- People are found and named the way the app knows them. Following an open profile is immediate; a private profile
-- gets a request to approve. Friends are two people who follow each other (the row rules' "Friends & groups").
create or replace function internal.profile_by_name(nm text, viewer uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where lower(coalesce(p.legacy_name, p.display_name)) = lower(btrim(coalesce(nm, ''))) and p.id <> viewer and not private.blocked_either(viewer, p.id)
  limit 1;
$$;

create or replace function follow(name text) returns text   -- 'following' or 'requested'
language plpgsql set search_path = public as $$
declare me_id uuid := me(); them uuid; st text;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  them := internal.profile_by_name(follow.name, me_id);
  if them is null then raise exception 'There''s nobody by that name.' using errcode = 'P0002'; end if;   -- blocked looks the same
  if not exists (select 1 from follows where follower = me_id and followee = them)
     and (select count(*) from follows where follower = me_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'You''ve followed a lot of people today. Try again tomorrow.' using errcode = 'P0001';   -- v14.5: spam limit
  end if;
  insert into follows (follower, followee, status)
  values (me_id, them, case when (select is_private from profiles where id = them) then 'pending' else 'accepted' end)
  on conflict (follower, followee) do nothing;
  select status into st from follows where follower = me_id and followee = them;
  return case when st = 'accepted' then 'following' else 'requested' end;
end $$;

create or replace function unfollow(name text) returns text
language plpgsql set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  delete from follows where follower = me_id and followee = internal.profile_by_name(unfollow.name, me_id);
  return 'not following';
end $$;

-- your answer to a follow request (or, with accept = false, removing a follower)
create or replace function answer_follow(name text, accept boolean) returns text
language plpgsql set search_path = public as $$
declare me_id uuid := me(); them uuid;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  them := internal.profile_by_name(answer_follow.name, me_id);
  if accept then update follows set status = 'accepted' where follower = them and followee = me_id;
  else delete from follows where follower = them and followee = me_id; end if;
  return case when accept then 'approved' else 'removed' end;
end $$;

-- blocking hides everything both ways and ends any follow between you
create or replace function block(name text) returns text
language plpgsql set search_path = public as $$
declare me_id uuid := me(); them uuid;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  them := internal.profile_by_name(block.name, me_id);
  if them is null then raise exception 'There''s nobody by that name.' using errcode = 'P0002'; end if;
  delete from follows where (follower = me_id and followee = them) or (follower = them and followee = me_id);
  insert into blocks (blocker, blocked) values (me_id, them) on conflict do nothing;
  return 'blocked';
end $$;

create or replace function unblock(name text) returns text
language plpgsql security definer set search_path = public as $$   -- the blocked person can't be found by name while blocked
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  delete from blocks where blocker = me_id and blocked in (select id from profiles where lower(coalesce(legacy_name, display_name)) = lower(btrim(coalesce(unblock.name, ''))));
  return 'unblocked';
end $$;

-- who you follow, who follows you (requests included) and who you've blocked
create or replace function my_people() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'following', coalesce((select jsonb_agg(jsonb_build_object('name', internal.name_of(f.followee), 'color', internal.color_of(f.followee), 'status', f.status, 'friend', private.is_friend(me(), f.followee)) order by internal.name_of(f.followee))
                           from follows f where f.follower = me()), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('name', internal.name_of(f.follower), 'color', internal.color_of(f.follower), 'status', f.status) order by f.status desc, internal.name_of(f.follower))
                           from follows f where f.followee = me()), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(internal.name_of(b.blocked) order by internal.name_of(b.blocked)) from blocks b where b.blocker = me()), '[]'::jsonb));
$$;

-- people whose name or handle starts with what you typed (never anyone blocked either way)
create or replace function find_people(q text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('name', internal.name_of(p.id), 'handle', p.handle, 'color', p.color, 'private', p.is_private,
             'you', (select f.status from follows f where f.follower = me() and f.followee = p.id),
             'followsYou', exists (select 1 from follows f where f.follower = p.id and f.followee = me() and f.status = 'accepted')) as x
    from profiles p
    where p.id <> me() and char_length(btrim(coalesce(q, ''))) >= 2
      and (coalesce(p.legacy_name, p.display_name) ilike btrim(q) || '%' or p.handle ilike btrim(q) || '%')
    limit 20) s;
$$;

-- v14.4, once: the original crew (the Sheet-era private group) start out following each other, so each of them sees
-- the others in their own Profiles row and People list. Anyone can unfollow afterwards; this never runs again.
do $$ begin
  if exists (select 1 from groups where name = 'Original crew') and not exists (select 1 from backend_state where key = 'crew_follows_seeded') then
    perform set_config('dialed.importing', 'on', true);   -- no "started following you" notifications for this
    insert into follows (follower, followee, status)
    select m1.user_id, m2.user_id, 'accepted' from group_members m1 join group_members m2 on m2.group_id = m1.group_id and m2.user_id <> m1.user_id
    join groups g on g.id = m1.group_id where g.name = 'Original crew' and not g.is_open
    on conflict (follower, followee) do nothing;
    insert into backend_state (key, value) values ('crew_follows_seeded', now()::text);
    perform set_config('dialed.importing', '', true);
  end if;
end $$;

-- ---------------------------------------------------------------- groups (phase 3: the database side; no screens yet)
-- Optional. Open groups anyone can find and join; private groups take an invite code and hold up to 30 people. The
-- people in your private groups are the app's people list (pull_events), so they share the group goal.
create or replace function internal.new_code() returns text language sql volatile as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 8);
$$;

create or replace function create_group(name text, open boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); n text := regexp_replace(btrim(coalesce(create_group.name, '')), '\s+', ' ', 'g'); g groups;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if char_length(n) < 2 or char_length(n) > 60 then raise exception 'Give the community a name (2 to 60 characters).' using errcode = '22023'; end if;
  if not internal.name_ok(n) then raise exception 'Pick another name.' using errcode = '22023'; end if;   -- v14.6: the content filter
  perform internal.rate_hit(me_id, 'group');   -- v14.6
  insert into groups (name, is_open, owner_id, invite_code, goal_on, awards_on)
  values (n, coalesce(open, false), me_id, case when coalesce(open, false) then null else internal.new_code() end, true, not coalesce(open, false)) returning * into g;
  insert into group_members (group_id, user_id, role) values (g.id, me_id, 'owner');
  return jsonb_build_object('id', g.id, 'name', g.name, 'open', g.is_open, 'invite', g.invite_code);
end $$;

-- an open group's id, or a private group's invite code
create or replace function join_group(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); g groups; c text := lower(btrim(coalesce(code, '')));
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  select * into g from groups where invite_code = c;
  if not found and c ~ '^[0-9a-f-]{36}$' then select * into g from groups where id = c::uuid and is_open; end if;
  if g.id is null then raise exception 'That invite doesn''t match a group.' using errcode = 'P0002'; end if;
  if exists (select 1 from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id and private.blocked_either(me_id, m.user_id) and m.role = 'owner') then
    raise exception 'That invite doesn''t match a group.' using errcode = 'P0002';
  end if;
  if not g.is_open and (select count(*) from group_members where group_id = g.id) >= 30 then raise exception 'That group is full (30 people).' using errcode = '54000'; end if;
  insert into group_members (group_id, user_id, role) values (g.id, me_id, 'member') on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name, 'open', g.is_open);
end $$;

-- leaving: the group passes to its longest-standing admin (or member); the last one out closes it
create or replace function leave_group(group_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); g groups; heir uuid;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  select * into g from groups where id = leave_group.group_id;
  if not found or not private.is_group_member(g.id, me_id) then return 'not a member'; end if;
  delete from group_members m where m.group_id = g.id and m.user_id = me_id;
  if g.owner_id = me_id then
    select m.user_id into heir from group_members m where m.group_id = g.id order by (m.role = 'admin') desc, m.joined_at limit 1;
    if heir is null then delete from groups where id = g.id; return 'left; the group closed'; end if;
    update groups set owner_id = heir where id = g.id;
    update group_members m set role = 'owner' where m.group_id = g.id and m.user_id = heir;
  end if;
  return 'left';
end $$;

-- owners and admins: a fresh invite code (the old one stops working), and removing someone
create or replace function new_invite(group_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); c text := internal.new_code();
begin
  if me_id is null or not internal.is_group_admin(new_invite.group_id, me_id) then raise exception 'Only the group''s owner or an admin can do that.' using errcode = '42501'; end if;
  update groups set invite_code = c where id = new_invite.group_id and not is_open;
  return c;
end $$;

create or replace function remove_member(group_id uuid, name text) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); them uuid;
begin
  if me_id is null or not internal.is_group_admin(remove_member.group_id, me_id) then raise exception 'Only the group''s owner or an admin can do that.' using errcode = '42501'; end if;
  select m.user_id into them from group_members m join profiles p on p.id = m.user_id
  where m.group_id = remove_member.group_id and lower(coalesce(p.legacy_name, p.display_name)) = lower(btrim(coalesce(name, ''))) and m.role <> 'owner';
  delete from group_members m where m.group_id = remove_member.group_id and m.user_id = them;
  return case when them is null then 'not removed' else 'removed' end;
end $$;

-- the owner makes someone an admin (or back to a member)
create or replace function set_member_role(group_id uuid, name text, role text) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null or not exists (select 1 from groups g where g.id = set_member_role.group_id and g.owner_id = me_id) then raise exception 'Only the group''s owner can do that.' using errcode = '42501'; end if;
  if role not in ('admin', 'member') then raise exception 'A member is an admin or a member.' using errcode = '22023'; end if;
  update group_members m set role = set_member_role.role from profiles p
  where m.group_id = set_member_role.group_id and p.id = m.user_id and m.role <> 'owner' and lower(coalesce(p.legacy_name, p.display_name)) = lower(btrim(coalesce(name, '')));
  return role;
end $$;

-- v14.6: each private community's goal history and awards start when it was made; the crew's own (made by the move to
-- accounts) keeps everything from before
insert into backend_state (key, value) select 'history_group', id::text from groups where name = 'Original crew' order by created_at limit 1 on conflict (key) do nothing;
create or replace function my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'open', g.is_open, 'role', m.role, 'goal', g.goal_on, 'awards', g.awards_on,
           'since', case when g.id::text = (select value from backend_state where key = 'history_group') then null else g.created_at end,
           'invite', case when m.role in ('owner', 'admin') then g.invite_code end,
           'members', (select jsonb_agg(jsonb_build_object('name', internal.name_of(x.user_id), 'role', x.role, 'countsInGoal', x.counts_in_goal) order by x.joined_at)
                       from group_members x where x.group_id = g.id)) order by g.created_at), '[]'::jsonb)
  from group_members m join groups g on g.id = m.group_id where m.user_id = me();
$$;

create or replace function find_groups(q text) returns jsonb
language sql stable set search_path = public as $$
  -- open groups whose name has what you typed; v14.5: with nothing typed, the open groups with the most people
  select coalesce(jsonb_agg(x order by (x->>'members')::int desc, x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('id', g.id, 'name', g.name, 'members', (select count(*) from group_members m where m.group_id = g.id),
             'joined', private.is_group_member(g.id, me())) as x
    from groups g
    where g.is_open and (char_length(btrim(coalesce(q, ''))) = 0 or (char_length(btrim(q)) >= 2 and g.name ilike '%' || btrim(q) || '%'))
    order by (select count(*) from group_members m where m.group_id = g.id) desc, g.name
    limit 30) t;
$$;

-- ---------------------------------------------------------------- notifications (phase 3: the database side; no screens yet)
-- Triggers write them as things happen; nothing is written while the Sheet's history is being imported, or between
-- two people where either has blocked the other.
create or replace function internal.notify(for_id uuid, by_id uuid, what text, ses uuid default null, cof uuid default null, cmt uuid default null, grp uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if for_id is null or by_id is null or for_id = by_id or coalesce(current_setting('dialed.importing', true), '') = 'on' or private.blocked_either(for_id, by_id) then return; end if;
  insert into notifications (user_id, actor_id, kind, session_id, coffee_id, comment_id, group_id) values (for_id, by_id, what, ses, cof, cmt, grp);
end $$;

create or replace function internal.on_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'likes' then perform internal.notify((select owner_id from sessions where id = new.session_id), new.user_id, 'like', new.session_id);
  elsif tg_table_name = 'coffee_likes' then perform internal.notify((select owner_id from coffees where id = new.coffee_id), new.user_id, 'like', null, new.coffee_id);
  else perform internal.notify((select author_id from comments where id = new.comment_id), new.user_id, 'comment_like', null, null, new.comment_id); end if;
  return null;
end $$;

create or replace function internal.on_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid := coalesce((select owner_id from sessions where id = new.session_id), (select owner_id from coffees where id = new.coffee_id));
        parent_author uuid := (select author_id from comments where id = new.parent_id);
begin
  perform internal.notify(owner, new.author_id, 'comment', new.session_id, new.coffee_id, new.id);
  if parent_author is distinct from owner then perform internal.notify(parent_author, new.author_id, 'reply', new.session_id, new.coffee_id, new.id); end if;
  return null;
end $$;

create or replace function internal.on_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform internal.notify(new.followee, new.follower, case when new.status = 'accepted' then 'follow' else 'follow_request' end);
  elsif old.status = 'pending' and new.status = 'accepted' then perform internal.notify(new.follower, new.followee, 'follow_accepted'); end if;
  return null;
end $$;

create or replace function internal.on_join() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' then perform internal.notify((select owner_id from groups where id = new.group_id), new.user_id, 'joined_group', null, null, null, new.group_id); end if;
  return null;
end $$;

drop trigger if exists notify_like on likes;            create trigger notify_like after insert on likes for each row execute function internal.on_like();
drop trigger if exists notify_coffee_like on coffee_likes; create trigger notify_coffee_like after insert on coffee_likes for each row execute function internal.on_like();
drop trigger if exists notify_comment_like on comment_likes; create trigger notify_comment_like after insert on comment_likes for each row execute function internal.on_like();
drop trigger if exists notify_comment on comments;      create trigger notify_comment after insert on comments for each row execute function internal.on_comment();
drop trigger if exists notify_follow on follows;        create trigger notify_follow after insert or update of status on follows for each row execute function internal.on_follow();
drop trigger if exists notify_join on group_members;    create trigger notify_join after insert on group_members for each row execute function internal.on_join();

-- your newest notifications (newest first) and how many are unread
create or replace function my_notifications(max_count int default 50) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'unread', (select count(*) from notifications where user_id = me() and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', n.id, 'kind', n.kind, 'who', internal.name_of(n.actor_id), 'color', internal.color_of(n.actor_id), 'at', n.created_at, 'read', n.read_at is not null,
               'session', (select coalesce(legacy_id, id::text) from sessions where id = n.session_id),
               'sessionCoffee', (select coalesce(k.legacy_id, k.id::text) from sessions s join coffees k on k.id = s.coffee_id where s.id = n.session_id),
               'coffee', (select coalesce(legacy_id, id::text) from coffees where id = n.coffee_id),
               'comment', (select left(body, 140) from comments where id = n.comment_id and deleted_at is null),
               'group', (select name from groups where id = n.group_id))) order by n.id desc)
             from (select * from notifications where user_id = me() order by id desc limit greatest(1, least(coalesce(max_count, 50), 200))) n), '[]'::jsonb));
$$;

create or replace function mark_notifications_read(up_to bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update notifications set read_at = now() where user_id = me() and read_at is null and (up_to is null or id <= up_to);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- the community goal (phase 3 draft; no screens yet)
-- The crew's weekly goal at community scale: the same six types in the same weekly rotation as the app (weeks start
-- Monday at midnight in `tz`, Chicago unless told), with targets from the community's last six weeks. "Everyone
-- brews" becomes a people count. Only totals leave the database, never whose session counted (except your own).
create or replace function community_goal(tz text default 'America/Chicago') returns jsonb
language plpgsql stable security definer set search_path = public as $$
-- v14.5: each target is set by pace: what everyone usually reaches by Saturday midday (day 5.5 of 7) over the last six
-- weeks, the most recent counting most, scaled to how many people are brewing now (counts scale with people, variety
-- more slowly). At the usual pace it's done around Friday or Saturday: a challenge most weeks, never out of reach.
declare
  ws timestamptz := (date_trunc('week', now() at time zone tz)) at time zone tz;
  we timestamptz := ws + interval '7 days';
  types text[] := array['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'];
  t text; est numeric; active_now numeric; methods_seen int;
  target int; progress int; title text; unit text; mine int; brewing int;
begin
  t := types[1 + ((round(extract(epoch from ws) * 1000 / 604800000)::bigint % 6 + 6) % 6)];
  select greatest(1, count(distinct owner_id)) into active_now from sessions
   where brewed_at >= ws - interval '14 days' and brewed_at < ws and deleted_at is null and audience <> 'only_me';
  select count(distinct method) into methods_seen from sessions
   where brewed_at >= ws - interval '42 days' and brewed_at < ws and deleted_at is null and audience <> 'only_me' and method is not null;
  with weeks as (select v.i, v.w, ws - v.i * interval '7 days' as a from (values (1, 0.30), (2, 0.22), (3, 0.16), (4, 0.13), (5, 0.10), (6, 0.09)) v(i, w)),
       per as (
         select wk.w,
           (select count(distinct s.owner_id) from sessions s where s.brewed_at >= wk.a and s.brewed_at < wk.a + interval '7 days' and s.deleted_at is null and s.audience <> 'only_me') as active,
           (select jsonb_build_object(
               'sessions', count(*), 'rated', count(*) filter (where coalesce(s.rating, 0) > 0),
               'notes', count(*) filter (where coalesce(btrim(s.extras->>'flavors'), '') <> ''),
               'origins', count(distinct nullif(lower(btrim(split_part(k.origin, ',', 1))), '')),
               'methods', count(distinct s.method), 'everyone', count(distinct s.owner_id))
            from sessions s left join coffees k on k.id = s.coffee_id
            where s.brewed_at >= wk.a and s.brewed_at < wk.a + interval '132 hours' and s.deleted_at is null and s.audience <> 'only_me') as early   -- by Saturday midday
         from weeks wk)
  select sum(w * (early->>t)::numeric * case when t in ('origins', 'methods') then sqrt(least(2, greatest(0.5, active_now / active))) else least(2, greatest(0.5, active_now / active)) end) / nullif(sum(w), 0)
    into est from per where active > 0;
  if t = 'sessions' then
    target := greatest(4, round(coalesce(est, 4))); title := format('Brew %s sessions together', target); unit := 'sessions';
    select count(*) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me';
  elsif t = 'origins' then
    target := least(30, greatest(2, round(coalesce(est, 2)))); title := format('Taste %s different origins', target); unit := 'origins';
    select count(distinct lower(btrim(split_part(k.origin, ',', 1)))) into progress from sessions s join coffees k on k.id = s.coffee_id
    where s.brewed_at >= ws and s.brewed_at < we and s.deleted_at is null and s.audience <> 'only_me' and coalesce(btrim(split_part(k.origin, ',', 1)), '') <> '';
  elsif t = 'rated' then
    target := greatest(3, round(coalesce(est, 3))); title := format('Rate %s sessions', target); unit := 'rated';
    select count(*) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me' and coalesce(rating, 0) > 0;
  elsif t = 'notes' then
    target := greatest(2, round(coalesce(est, 2))); title := format('Log tasting notes on %s sessions', target); unit := 'with notes';
    select count(*) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me' and coalesce(btrim(extras->>'flavors'), '') <> '';
  elsif t = 'everyone' then
    target := greatest(2, round(coalesce(est, 2))); title := format('%s people brew this week', target); unit := 'people';
    select count(distinct owner_id) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me';
  else
    target := least(greatest(2, methods_seen), 6, greatest(2, round(coalesce(est, 2)))); title := format('Brew with %s different methods', target); unit := 'methods';
    select count(distinct method) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me' and method is not null;
  end if;
  select count(*) into mine from sessions where owner_id = me() and brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me';
  select count(distinct owner_id) into brewing from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and audience <> 'only_me';
  return jsonb_build_object('type', t, 'title', title, 'target', target, 'progress', least(progress, target), 'raw', progress, 'done', progress >= target,
    'unit', unit, 'start', ws, 'end', we, 'yourSessions', mine, 'people', brewing);
end $$;

-- ---------------------------------------------------------------- v14.5: profiles, suggestions, help requests
-- Someone's profile, for anyone you can find (outside your circle too): their card and the sessions of theirs you
-- may see (the row rules decide: what they share with Everyone, unless their profile is private and you don't
-- follow them), newest first, a page at a time, with those sessions' coffees and what their profile shows of their
-- gear (equipment they haven't hidden, favorite coffees). Never their recipes or last setups.
create or replace function profile_page(name text, before timestamptz default null, max_items int default 40) returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); them uuid; lim int := least(greatest(coalesce(max_items, 40), 1), 100); ids uuid[]; oldest timestamptz; nm text; card jsonb; gear jsonb;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  them := internal.profile_by_name(profile_page.name, me_id);
  if them is null then raise exception 'There''s nobody by that name.' using errcode = 'P0002'; end if;   -- blocked looks the same
  nm := internal.name_of(them);
  select array_agg(t.id order by t.brewed_at desc), min(t.brewed_at) into ids, oldest
  from (select s.id, s.brewed_at from sessions s
        where s.owner_id = them and s.deleted_at is null and (profile_page.before is null or s.brewed_at < profile_page.before)
          and not internal.unseen('session', s.id)
        order by s.brewed_at desc limit lim) t;
  select jsonb_strip_nulls(jsonb_build_object('name', nm, 'color', p.color, 'private', p.is_private, 'joined', p.joined_at,
           'you', (select f.status from follows f where f.follower = me_id and f.followee = p.id),
           'followsYou', exists (select 1 from follows f where f.follower = p.id and f.followee = me_id and f.status = 'accepted'),
           'friend', private.is_friend(me_id, p.id),
           'locked', p.is_private and not (p.id = any(private.my_following_ids()) or p.id = any(private.my_close_ids()))))
    into card from profiles p where p.id = them;
  select jsonb_build_object('type', 'gear', 'id', 'gear-' || nm, 'user', nm, 'owner', nm, 'actor', nm,
           'items', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'type', e.type) order by e.sort_order, e.created_at)
                              from equipment e where e.owner_id = them), '[]'::jsonb),
           'lastByMethod', '{}'::jsonb, 'recipes', '[]'::jsonb, 'fabFour', coalesce(pg.fab_four, '[]'::jsonb), 'roasters', '{}'::jsonb,
           'date', coalesce(pg.updated_at, now()), 'eventAt', coalesce(pg.updated_at, now()))
    into gear from (select 1) one left join internal.public_gear(me_id) pg on pg.profile_id = them;
  return jsonb_build_object('profile', card,
    'events', coalesce((select jsonb_agg(internal.coffee_json(k)) from coffees k
                        where k.deleted_at is null and (k.id = any(coalesce((select array_agg(s.coffee_id) from sessions s where s.id = any(ids)), '{}'))
                                                        or coalesce(k.legacy_id, k.id::text) in (select jsonb_array_elements_text(gear->'fabFour')))), '[]'::jsonb)
           || coalesce((select jsonb_agg(internal.session_json(s) order by s.brewed_at desc) from sessions s where s.id = any(ids)), '[]'::jsonb)
           || jsonb_build_array(gear),
    'next', case when array_length(ids, 1) = lim then oldest end);
end $$;

-- People you might like to follow: who brews the same coffees or roasters as you, uses the same grinder, or the
-- methods you use, judged only from what they share with Everyone (it runs as you, so the row rules decide), active
-- in the last two months, not private, not already followed or asked, never anyone blocked either way. Someone who
-- hasn't logged anything yet sees people who are new here too and people brewing this week.
create or replace function suggest_people(max_count int default 8) returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); lim int := least(greatest(coalesce(max_count, 8), 1), 30); out jsonb;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  with mine as (select s.coffee_id, s.method, k.name as coffee, coalesce(k.roaster_text, r.name) as roaster
                from sessions s left join coffees k on k.id = s.coffee_id left join roasters r on r.id = k.roaster_id
                where s.owner_id = me_id and s.deleted_at is null),
       my_grinders as (select lower(btrim(e.name)) as g, e.name from equipment e where e.owner_id = me_id and lower(e.type) = 'grinder'),
       theirs as (select s.owner_id, s.coffee_id, s.method, s.brewed_at, k.name as coffee, coalesce(k.roaster_text, r.name) as roaster
                  from sessions s left join coffees k on k.id = s.coffee_id left join roasters r on r.id = k.roaster_id
                  join profiles o on o.id = s.owner_id
                  where s.audience = 'everyone' and s.deleted_at is null and s.owner_id <> me_id and not o.is_private
                    and s.brewed_at > now() - interval '60 days'
                    and not exists (select 1 from follows f where f.follower = me_id and f.followee = s.owner_id)),
       why as (
         select t.owner_id, 4 as pts, 'Brews ' || max(t.coffee) || ' too' as reason from theirs t
           where t.coffee is not null and exists (select 1 from mine m where m.coffee_id = t.coffee_id or (lower(btrim(m.coffee)) = lower(btrim(t.coffee)) and lower(coalesce(m.roaster, '')) = lower(coalesce(t.roaster, ''))))
           group by t.owner_id
         union all
         select t.owner_id, 2, 'Brews ' || max(t.roaster) || ' too' from theirs t
           where coalesce(btrim(t.roaster), '') <> '' and exists (select 1 from mine m where lower(btrim(m.roaster)) = lower(btrim(t.roaster)))
           group by t.owner_id
         union all
         select e.owner_id, 3, 'Uses a ' || max(e.name) || ' too' from equipment e join my_grinders g on g.g = lower(btrim(e.name))
           where lower(e.type) = 'grinder' and e.owner_id in (select owner_id from theirs) group by e.owner_id
         union all
         select t.owner_id, 1, 'Also brews ' || max(t.method) from theirs t
           where t.method is not null and t.method in (select m.method from mine m where m.method is not null)
           group by t.owner_id
         union all   -- someone with nothing logged yet: people new here too, and people brewing this week
         select t.owner_id, 1, case when (select joined_at from profiles where id = t.owner_id) > now() - interval '14 days' then 'New here too' else 'Brewing this week' end
           from theirs t where not exists (select 1 from mine) and t.brewed_at > now() - interval '7 days' group by t.owner_id),
       ranked as (select w.owner_id, sum(w.pts) as score, (array_agg(w.reason order by w.pts desc, w.reason))[1] as reason,
                         (select max(t.brewed_at) from theirs t where t.owner_id = w.owner_id) as last_at
                  from why w group by w.owner_id)
  select coalesce(jsonb_agg(jsonb_build_object('name', internal.name_of(x.owner_id), 'color', internal.color_of(x.owner_id), 'reason', x.reason) order by x.score desc, x.last_at desc), '[]'::jsonb)
    into out from (select * from ranked order by score desc, last_at desc limit lim) x;
  return out;
end $$;

-- "Help me dial this in": the asker marks the most helpful answer (the session's helpfulAnswer, kept with its other
-- fields), and its author hears about it
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'reply', 'comment_like', 'follow', 'follow_request', 'follow_accepted', 'joined_group', 'helpful', 'report'));
create or replace function internal.on_helpful() returns trigger language plpgsql security definer set search_path = public as $$
declare cid text := nullif(btrim(coalesce(new.extras->>'helpfulAnswer', '')), ''); c comments;
begin
  if cid is null or cid = coalesce(old.extras->>'helpfulAnswer', '') then return null; end if;
  select * into c from comments where session_id = new.id and deleted_at is null and (legacy_ref = coalesce(new.legacy_id, new.id::text) || '#' || cid or id::text = cid) limit 1;
  if found then perform internal.notify(c.author_id, new.owner_id, 'helpful', new.id, null, c.id); end if;
  return null;
end $$;
drop trigger if exists notify_helpful on sessions;
create trigger notify_helpful after update of extras on sessions for each row execute function internal.on_helpful();

-- ---------------------------------------------------------------- v14.5: reviewing reports (admins only)
create or replace function internal.on_report() returns trigger language plpgsql security definer set search_path = public as $$
declare adm uuid;
begin
  if (select count(distinct reporter_id) from reports where target_type = new.target_type and target_id = new.target_id and status in ('open', 'hidden')) >= 3 then
    update reports set status = 'hidden' where target_type = new.target_type and target_id = new.target_id and status = 'open';
  end if;
  -- v14.6: reviewers hear about every report (the bell, and their phone when notifications are on), so a day is enough;
  -- once per person and thing (reporting the same thing again doesn't ping them again)
  if not exists (select 1 from reports r where r.reporter_id = new.reporter_id and r.target_type = new.target_type and r.target_id = new.target_id and r.id <> new.id) then
    for adm in select x::uuid from backend_state, unnest(string_to_array(value, ',')) x where key = 'admins' and x ~ '^[0-9a-f-]{36}$' loop
      perform internal.notify(adm, new.reporter_id, 'report');
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists hide_reported on reports;
create trigger hide_reported after insert on reports for each row execute function internal.on_report();

-- what's waiting: one row per reported thing, with what it is, whose it is, how many people reported it and why
create or replace function review_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not internal.is_admin(me()) then raise exception 'Only reviewers can see reports.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'last' desc) from (
    select jsonb_strip_nulls(jsonb_build_object('kind', r.target_type, 'target', r.target_id,
             'status', case when bool_or(r.status = 'hidden') then 'hidden' else 'open' end,
             'count', count(distinct r.reporter_id), 'reasons', coalesce(jsonb_agg(distinct r.reason) filter (where r.reason is not null), '[]'::jsonb),
             'last', max(r.created_at),
             'who', case r.target_type when 'session' then (select internal.name_of(owner_id) from sessions where id = r.target_id)
                                       when 'comment' then (select internal.name_of(author_id) from comments where id = r.target_id)
                                       when 'profile' then internal.name_of(r.target_id) end,
             'text', case r.target_type when 'comment' then (select left(body, 300) from comments where id = r.target_id)
                                        when 'session' then (select left(coalesce(n.body, ''), 300) from session_notes n where n.session_id = r.target_id) end,
             'coffee', case when r.target_type = 'session' then (select k.name from sessions s join coffees k on k.id = s.coffee_id where s.id = r.target_id) end,
             'ref', case when r.target_type = 'session' then (select coalesce(legacy_id, id::text) from sessions where id = r.target_id) end)) as x
    from reports r where r.status in ('open', 'hidden') group by r.target_type, r.target_id) t), '[]'::jsonb);
end $$;

-- dismiss (nothing wrong: shown again to everyone, reporters included), or remove (a session or comment is deleted)
create or replace function resolve_report(kind text, target uuid, action text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not internal.is_admin(me()) then raise exception 'Only reviewers can do that.' using errcode = '42501'; end if;
  if action = 'dismiss' then
    update reports set status = 'dismissed' where target_type = kind and target_id = target and status in ('open', 'hidden');   -- reporters see it again too
    return 'dismissed';
  elsif action = 'remove' then
    if kind = 'session' then update sessions set deleted_at = now(), updated_at = now() where id = target;
    elsif kind = 'comment' then update comments set deleted_at = now() where id = target; end if;
    update reports set status = 'removed' where target_type = kind and target_id = target and status in ('open', 'hidden');
    return 'removed';
  end if;
  raise exception 'Dismiss or remove.' using errcode = '22023';
end $$;

-- ---------------------------------------------------------------- v14.5: phone notifications (Web Push)
-- A phone that turns notifications on (Settings, from the Home Screen app) saves its push subscription here. When a
-- notification is written, a trigger asks the send-push function (supabase/functions) to deliver it, through pg_net.
-- Nothing happens until the supabase-push workflow has set it up (the function, its address, the VAPID keys); until
-- then push_key() is null and the app shows no switch.
create table if not exists push_subscriptions (
  endpoint      text primary key,
  profile_id    uuid not null references profiles (id) on delete cascade,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists push_subscriptions_profile on push_subscriptions (profile_id);
-- v14.6: the iPhone app gets its notifications from Apple's push service (APNs): endpoint 'apns:<device token>'
alter table push_subscriptions add column if not exists kind text not null default 'web';
alter table push_subscriptions enable row level security;   -- no rules: only the calls below and the sender touch it
revoke all on push_subscriptions from authenticated, anon;

-- the public half of the VAPID key pair the app subscribes with (null until the sender is set up)
create or replace function push_key() returns text
language sql stable security definer set search_path = public as $$
  select value from backend_state where key = 'vapid_public' and exists (select 1 from backend_state where key = 'push_url');
$$;

-- v14.6: what this phone can use: web push (the Home Screen web app) and/or Apple's push service (the iPhone app)
create or replace function push_ready() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('web', (select value from backend_state where key = 'vapid_public'),
                            'apns', exists (select 1 from backend_state where key = 'apns_key'))
  where exists (select 1 from backend_state where key = 'push_url');
$$;

create or replace function save_push(sub jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); ep text := sub->>'endpoint'; k1 text := sub->'keys'->>'p256dh'; k2 text := sub->'keys'->>'auth'; kd text := 'web';
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if sub->>'kind' = 'apns' then   -- v14.6: the iPhone app (a device token from Apple)
    if coalesce(sub->>'token', '') !~ '^[0-9a-fA-F]{32,200}$' then raise exception 'That phone''s notification details don''t look right.' using errcode = '22023'; end if;
    ep := 'apns:' || lower(sub->>'token'); k1 := ''; k2 := ''; kd := 'apns';
  elsif ep is null or ep !~ '^https://' or char_length(ep) > 1000 or coalesce(k1, '') = '' or coalesce(k2, '') = '' or char_length(k1) > 200 or char_length(k2) > 100 then
    raise exception 'That phone''s notification details don''t look right.' using errcode = '22023';
  end if;
  insert into push_subscriptions (endpoint, profile_id, p256dh, auth, kind) values (ep, me_id, k1, k2, kd)
  on conflict (endpoint) do update set profile_id = me_id, p256dh = excluded.p256dh, auth = excluded.auth, kind = excluded.kind, created_at = now();
  delete from push_subscriptions where profile_id = me_id and endpoint not in (select endpoint from push_subscriptions where profile_id = me_id order by created_at desc limit 10);
  return 'on';
end $$;

create or replace function remove_push(endpoint text) returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where push_subscriptions.endpoint = remove_push.endpoint and profile_id = me();
  return 'off';
end $$;

-- what the lock screen says, in the bell's words
create or replace function internal.push_text(n notifications) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', 'Dialed In', 'tag', 'n' || n.id, 'body',
    case when n.kind = 'report' then 'Something was reported. Review it in Settings.' else   -- (who reported it stays off the lock screen)
    coalesce(internal.name_of(n.actor_id), 'Someone') || ' ' || case n.kind
      when 'like' then case when n.coffee_id is not null and n.session_id is null then 'liked your coffee' else 'liked your session' end
      when 'comment' then 'commented' || coalesce(': ' || (select left(body, 120) from comments where id = n.comment_id and deleted_at is null), '')
      when 'reply' then 'replied' || coalesce(': ' || (select left(body, 120) from comments where id = n.comment_id and deleted_at is null), '')
      when 'comment_like' then 'liked your comment'
      when 'follow' then 'started following you'
      when 'follow_request' then 'wants to follow you'
      when 'follow_accepted' then 'approved your follow request'
      when 'joined_group' then 'joined ' || coalesce((select name from groups where id = n.group_id), 'your group')
      when 'helpful' then 'marked your answer most helpful'
      else 'did something' end end);
$$;

-- for the sender only (it connects as the database owner): one notification's text and the phones to send it to
create or replace function internal.push_payload(nid bigint, secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n notifications;
begin
  if secret is null or secret is distinct from (select value from backend_state where key = 'push_secret') then return null; end if;
  select * into n from notifications where id = nid;
  if not found then return null; end if;
  return internal.push_text(n) || jsonb_build_object(
    'subject', coalesce((select value from backend_state where key = 'vapid_subject'), 'mailto:dialedin@example.com'),
    'publicKey', (select value from backend_state where key = 'vapid_public'),
    'privateKey', (select value from backend_state where key = 'vapid_private'),
    'subs', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'kind', s.kind)) from push_subscriptions s where s.profile_id = n.user_id), '[]'::jsonb),
    -- v14.6: Apple's push service, for the iPhone app (set up by the ios workflow from Maceo's Apple key)
    'apns', (select jsonb_build_object('key', max(value) filter (where key = 'apns_key'), 'keyId', max(value) filter (where key = 'apns_key_id'),
                                       'teamId', max(value) filter (where key = 'apns_team_id'), 'topic', max(value) filter (where key = 'apns_topic'),
                                       'host', coalesce(max(value) filter (where key = 'apns_host'), 'api.push.apple.com'))
             from backend_state where key like 'apns_%'));
end $$;
revoke execute on function internal.push_payload(bigint, text) from public, anon, authenticated;
revoke execute on function internal.push_text(notifications) from public, anon, authenticated;

create or replace function internal.on_notification() returns trigger language plpgsql security definer set search_path = public as $$
declare url text := (select value from backend_state where key = 'push_url'); secret text := (select value from backend_state where key = 'push_secret');
begin
  if url is null or secret is null or not exists (select 1 from push_subscriptions where profile_id = new.user_id)
     or not exists (select 1 from pg_extension where extname = 'pg_net') then return null; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using url, jsonb_build_object('id', new.id), jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret);
  return null;
exception when others then return null;   -- a notification is never lost because a push couldn't be queued
end $$;
drop trigger if exists push_notification on notifications;
create trigger push_notification after insert on notifications for each row execute function internal.on_notification();

-- ---------------------------------------------------------------- reporting, your data, leaving
create or replace function report(target_type text, target_id uuid, reason text default null) returns text
language plpgsql set search_path = public as $$
begin
  if me() is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  perform internal.rate_hit(me(), 'report');   -- v14.6
  insert into reports (reporter_id, target_type, target_id, reason) values (me(), report.target_type, report.target_id, left(report.reason, 1000));
  return 'reported';
end $$;

-- v14.4: report something by the names the app knows it by: a profile by name, a session by its id, a comment as
-- "<session or coffee id>#<comment id>". Only things you can see can be reported.
create or replace function report_item(kind text, ref text, reason text default null) returns text
language plpgsql set search_path = public as $$
declare me_id uuid := me(); target uuid; r text := btrim(coalesce(ref, ''));
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if kind = 'profile' then target := internal.profile_by_name(r, me_id);
  elsif kind = 'session' then select id into target from sessions where legacy_id = r or id::text = r limit 1;
  elsif kind = 'comment' then select id into target from comments where legacy_ref = r or id::text = split_part(r, '#', 2) limit 1;
  else raise exception 'Report a profile, a session or a comment.' using errcode = '22023'; end if;
  if target is null then raise exception 'That isn''t there anymore.' using errcode = 'P0002'; end if;
  perform internal.rate_hit(me_id, 'report');   -- v14.6
  insert into reports (reporter_id, target_type, target_id, reason) values (me_id, kind, target, left(nullif(btrim(coalesce(reason, '')), ''), 1000));
  return 'reported';
end $$;

-- everything that's yours, to download
create or replace function export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'auth_id' from profiles p where p.id = me()),
    'coffees', coalesce((select jsonb_agg(to_jsonb(k) order by k.created_at) from coffees k where k.owner_id = me()), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('notes', n.body, 'note_audience', n.audience, 'photo', ph.path, 'photo_audience', ph.audience) order by s.brewed_at)
                          from sessions s left join session_notes n on n.session_id = s.id left join session_photos ph on ph.session_id = s.id where s.owner_id = me()), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from comments c where c.author_id = me()), '[]'::jsonb),
    'likes', coalesce((select jsonb_agg(l.session_id) from likes l where l.user_id = me()), '[]'::jsonb),
    'equipment', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order) from equipment e where e.owner_id = me()), '[]'::jsonb),
    'gear', (select to_jsonb(g) from profile_gear g where g.profile_id = me()),
    'want_to_try', coalesce((select jsonb_agg(w.coffee_id) from want_to_try w where w.owner_id = me()), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(internal.name_of(f.followee)) from follows f where f.follower = me()), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(internal.name_of(f.follower)) from follows f where f.followee = me()), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'role', m.role)) from group_members m join groups g on g.id = m.group_id where m.user_id = me()), '[]'::jsonb));
$$;

-- deletes your account and everything in it. Groups you own pass on (or close); a coffee other people have logged
-- sessions on passes to the first of them, so their sessions keep their coffee. Photos in storage are removed by the
-- app through Supabase's storage API first (storage files can't be deleted from SQL).
create or replace function delete_account(confirm_name text) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); uid uuid := auth.uid(); g record; k record; heir uuid;
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if lower(btrim(coalesce(confirm_name, ''))) <> lower(internal.name_of(me_id)) then raise exception 'Type your name exactly to confirm.' using errcode = '22023'; end if;
  for g in select id from groups where owner_id = me_id loop perform leave_group(g.id); end loop;
  for k in select id from coffees where owner_id = me_id loop
    select s.owner_id into heir from sessions s where s.coffee_id = k.id and s.owner_id <> me_id order by s.brewed_at limit 1;
    if heir is not null then update coffees set owner_id = heir where id = k.id; end if;
  end loop;
  delete from profiles where id = me_id;
  delete from auth.users where id = uid;
  return 'deleted';
end $$;

-- push_event and friends run as the signed-in person (so the row rules apply to every write) and use the helpers in
-- "internal", so signed-in people need them; the app's web address doesn't serve that schema, so they can't be called
-- directly.
grant usage on schema internal to authenticated;
grant execute on all functions in schema internal to authenticated;
-- only signed-in people can call these (Postgres lets everyone run a new function unless told otherwise)
revoke execute on function pull_events(), push_event(jsonb), claim_name(text), create_profile(text, text), my_profile(), set_private(boolean), community_feed(timestamptz, int, text, text, uuid), discover_feed(timestamptz, int, int, text, text), coffee_community(text, text, timestamptz, int), report_item(text, text, text),
  profile_page(text, timestamptz, int), suggest_people(int), review_reports(), resolve_report(text, uuid, text),
  push_key(), push_ready(), save_push(jsonb), remove_push(text),
  follow(text), unfollow(text), answer_follow(text, boolean), block(text), unblock(text), my_people(), find_people(text),
  create_group(text, boolean), join_group(text), leave_group(uuid), new_invite(uuid), remove_member(uuid, text), set_member_role(uuid, text, text), my_groups(), find_groups(text),
  my_notifications(int), mark_notifications_read(bigint), report(text, uuid, text), export_my_data(), delete_account(text), community_goal(text), data_version() from public, anon;
grant execute on function pull_events(), push_event(jsonb), claim_name(text), create_profile(text, text), my_profile(), set_private(boolean), community_feed(timestamptz, int, text, text, uuid), discover_feed(timestamptz, int, int, text, text), coffee_community(text, text, timestamptz, int), report_item(text, text, text),
  profile_page(text, timestamptz, int), suggest_people(int), review_reports(), resolve_report(text, uuid, text),
  push_key(), push_ready(), save_push(jsonb), remove_push(text),
  follow(text), unfollow(text), answer_follow(text, boolean), block(text), unblock(text), my_people(), find_people(text),
  create_group(text, boolean), join_group(text), leave_group(uuid), new_invite(uuid), remove_member(uuid, text), set_member_role(uuid, text, text), my_groups(), find_groups(text),
  my_notifications(int), mark_notifications_read(bigint), report(text, uuid, text), export_my_data(), delete_account(text), community_goal(text), data_version() to authenticated;
revoke execute on all functions in schema internal from public, anon;
revoke execute on function internal.push_payload(bigint, text), internal.push_text(notifications) from authenticated;   -- the sender's alone (it has the phones' addresses and the VAPID key)
