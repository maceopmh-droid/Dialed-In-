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
    into pat, n from blocked_words where char_length(btrim(word)) >= 2
      -- everyday swearing stays (Maceo: "let fuck, shit, damn and other similar level words through"); slurs, hate and
      -- sexual words are still masked
      and lower(btrim(word)) <> all (array['suck', 'sucks', 'fuck', 'fuckin', 'fucking', 'motherfucker', 'clusterfuck', 'shit', 'shitty',
                                           'bullshit', 'apeshit', 'piece of shit', 'ass', 'asshole', 'arsehole', 'bastard', 'bastardo',
                                           'bollocks', 'god damn', 'damn', 'hell', 'crap', 'pissing']);
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
                               when 'bug' then array[5, 60, 20]          -- v15.1: 5 an hour, 20 a day
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
-- v18.3: one comment in the app's format, from what the caller may see of it (its parent, its likes). comments_json
-- (one coffee or session at a time) and pull_events (everything at once) both build comments with it.
create or replace function internal.comment_build(c comments, parent_ref text, likes jsonb) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
      'id', coalesce(substr(c.legacy_ref, strpos(c.legacy_ref, '#') + 1), c.id::text),
      'user', internal.name_of(c.author_id),
      'text', c.body,
      'timestamp', c.created_at,
      'parentId', coalesce(parent_ref, ''),
      'likes', coalesce(likes, '[]'::jsonb),
      'audience', c.audience);
$$;
create or replace function internal.comments_json(cof uuid, ses uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(internal.comment_build(c,
      (select coalesce(substr(p.legacy_ref, strpos(p.legacy_ref, '#') + 1), p.id::text) from comments p where p.id = c.parent_id),
      (select jsonb_agg(internal.name_of(l.user_id) order by l.created_at, l.user_id) from comment_likes l where l.comment_id = c.id and not (l.user_id = any((select private.my_blocked_ids())::uuid[]))))
    order by c.created_at, c.legacy_ref, c.id), '[]'::jsonb)
  from comments c
  where c.deleted_at is null and ((cof is not null and c.coffee_id = cof) or (ses is not null and c.session_id = ses))
    and (c.author_id = me() or not internal.unseen('comment', c.id));   -- v14.5: reported
$$;

-- one coffee / one session in the app's event format (pull_events and community_feed share them). They run as the
-- caller, so the row rules decide which notes, photos, likes and comments come along.
-- v17.0: tea. A coffee item can be a tea (kind 'tea', with its type: Green, White, Yellow, Oolong, Black, Pu-erh,
-- Matcha). Everything else about it (the company, name, origin, process, variety as cultivar) uses the same columns.
alter table coffees add column if not exists kind text not null default 'coffee';
alter table coffees add column if not exists tea_type text;
do $$ begin alter table coffees add constraint coffees_kind check (kind in ('coffee', 'tea'));
exception when duplicate_object then null; end $$;
-- v17.1: a tea's own details: your own blend (no brand), and what's in it ({blend, ingredients: [{name, ref}]})
alter table coffees add column if not exists tea jsonb;
create or replace function internal.tea_details(ev jsonb) returns jsonb language sql immutable as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'blend', case when ev->>'blend' = 'true' then true end,
    'ingredients', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', left(btrim(x->>'name'), 60), 'ref', nullif(left(btrim(coalesce(x->>'ref', '')), 80), ''))) order by o)
                      from jsonb_array_elements(case when jsonb_typeof(ev->'ingredients') = 'array' then ev->'ingredients' else '[]'::jsonb end) with ordinality t(x, o)
                     where jsonb_typeof(x) = 'object' and coalesce(btrim(x->>'name'), '') <> '' and o <= 20))), '{}'::jsonb)
$$;

-- v17.4: a coffee's picture, chosen when it's added or in the coffee editor, so it doesn't change by itself:
-- {hue: 0-359, tone: 0-100 (how colorful), photo: a picture in the owner's own folder of the public "avatars" bucket}
alter table coffees add column if not exists cover jsonb;
alter table coffees add column if not exists learn jsonb;   -- v19.0: Learn's tags (see the Learn section)
create or replace function internal.cover_of(ev jsonb) returns jsonb language sql stable set search_path = public as $$
  select case when jsonb_typeof(ev->'cover') = 'object' then nullif(jsonb_strip_nulls(jsonb_build_object(
    'hue', case when jsonb_typeof(ev->'cover'->'hue') = 'number' and (ev->'cover'->>'hue')::numeric between 0 and 360 then round((ev->'cover'->>'hue')::numeric)::int % 360 end,
    'tone', case when jsonb_typeof(ev->'cover'->'tone') = 'number' and (ev->'cover'->>'tone')::numeric between 0 and 100 then round((ev->'cover'->>'tone')::numeric)::int end,
    'photo', case when jsonb_typeof(ev->'cover'->'photo') = 'string' and split_part(ev->'cover'->>'photo', '/', 1) = auth.uid()::text
                   and ev->'cover'->>'photo' ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,64}\.(jpg|png)$' then ev->'cover'->>'photo' end)), '{}'::jsonb) end
$$;

create or replace function internal.coffee_json(k coffees) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
      'type', 'bean', 'id', coalesce(k.legacy_id, k.id::text),
      'user', internal.name_of(k.owner_id), 'owner', internal.name_of(k.owner_id),
      'actor', internal.name_of(k.owner_id), 'actorColor', internal.color_of(k.owner_id),
      'roaster', coalesce(k.roaster_text, r.name, ''), 'name', k.name, 'origin', coalesce(k.origin, ''), 'process', coalesce(k.process, ''),
      'variety', coalesce(k.variety, ''), 'roast', coalesce(k.roast, ''), 'roastDate', coalesce(k.roast_date::text, ''),
      'kind', case when k.kind = 'tea' then 'tea' end, 'teaType', case when k.kind = 'tea' then k.tea_type end,   -- (v17.0: only on teas, so a coffee reads as it always did)
      'blend', case when k.kind = 'tea' and k.tea->>'blend' = 'true' then true end, 'ingredients', case when k.kind = 'tea' then k.tea->'ingredients' end,   -- (v17.1)
      'cover', k.cover,   -- (v17.4)
      'learnKeep', k.learn->'keep',   -- (v19.0: "Keep as typed" answers, so no phone asks again)
      'date', k.created_at, 'eventAt', k.updated_at,
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at, l.user_id) from coffee_likes l where l.coffee_id = k.id), '[]'::jsonb),
      'comments', internal.comments_json(k.id, null),
      'wantToTry', coalesce((select jsonb_agg(internal.name_of(w.owner_id) order by w.added_at, w.owner_id) from want_to_try w where w.coffee_id = k.id), '[]'::jsonb)
    ))
  from (select 1) one left join roasters r on r.id = k.roaster_id;
$$;

-- v18.3: one session in the app's format, from the parts the caller may see (its coffee, note, photo, likes,
-- comments and when its owner joined). session_json (one at a time) and pull_events (everything at once) share it.
create or replace function internal.session_build(s sessions, k coffees, n session_notes, p session_photos, likes_j jsonb, comments_j jsonb, owner_joined timestamptz) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(s.extras, '{}'::jsonb) || coalesce(s.taste, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'type', 'brew', 'id', coalesce(s.legacy_id, s.id::text),
      'beanId', coalesce(k.legacy_id, s.extras->>'beanId', ''),
      'user', internal.name_of(s.owner_id), 'owner', internal.name_of(s.owner_id),
      'actor', internal.name_of(s.owner_id), 'actorColor', internal.color_of(s.owner_id),
      'method', coalesce(s.method, ''), 'grind', coalesce(s.grind, ''),
      'dose', s.dose, 'yield', s.yield, 'time', s.time_s, 'rating', s.rating,
      'tasted', case when coalesce(cardinality(s.tasted), 0) > 0 then to_jsonb(s.tasted) end, 'flavorNotes', s.flavor_notes,   -- v16.2: no list when it's empty (a session saved before v10 has none; an empty list hid its sliders, and an older app editing it saved them as 5)
      'notes', coalesce(n.body, ''),
      'photo', case when p.path is null then null
                    when p.path like 'drive:%' then jsonb_build_object('fileId', substr(p.path, 7), 'url', 'https://drive.google.com/uc?export=view&id=' || substr(p.path, 7))
                    when p.path like 'sb:%' then jsonb_build_object('path', p.path)   -- in Supabase storage: the app asks for a short-lived link
                    else jsonb_build_object('url', p.path) end,
      'likes', coalesce(likes_j, '[]'::jsonb),
      'comments', coalesce(comments_j, '[]'::jsonb),
      'equipment', coalesce(s.equipment->'ids', '[]'::jsonb), 'equipmentSnapshot', coalesce(s.equipment->'snapshot', '[]'::jsonb),
      'isMaster', coalesce((s.master->>'isMaster')::boolean, false), 'masterProfile', s.master->'profile',
      'date', s.brewed_at, 'eventAt', s.updated_at, 'audience', s.audience, 'noteAudience', n.audience, 'photoAudience', p.audience,
      'helpWanted', case when s.help_wanted then true end,   -- v14.5: "Help me dial this in"
      'newHere', case when owner_joined > now() - interval '14 days' then true end   -- joined in the last two weeks
    ));
$$;

create or replace function internal.session_json(s sessions) returns jsonb
language sql stable set search_path = public as $$
  select internal.session_build(s, k, n, p,
      (select jsonb_agg(internal.name_of(l.user_id) order by l.created_at, l.user_id) from likes l where l.session_id = s.id and not (l.user_id = any((select private.my_blocked_ids())::uuid[]))),
      internal.comments_json(null, s.id),
      (select o.joined_at from profiles o where o.id = s.owner_id))
  from (select 1) one left join coffees k on k.id = s.coffee_id
       left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id;
$$;

-- v18.5: many sessions at once in the app's format, built in one pass (pull_events, the feeds and profile pages).
-- Asking session by session ran the row rules' "who's close to me" lookups again for every session, note, photo, like
-- and comment (a sync took 4-5 seconds, a Community page 1-3). The same rows (the caller's row rules still decide), the
-- same format, built by the same session_build; newest first.
create or replace function internal.sessions_json(ids uuid[]) returns jsonb
language sql stable set search_path = public as $$
  with ss as materialized (select s from sessions s where s.id = any(ids)),
       cs as materialized (select c from comments c where c.deleted_at is null and c.session_id in (select (ss.s).id from ss)
                            and (c.author_id = (select me()) or not internal.unseen('comment', c.id))),   -- v14.5: reported
       cl as (select l.comment_id, jsonb_agg(internal.name_of(l.user_id) order by l.created_at, l.user_id) as j
                from comment_likes l where l.comment_id in (select (cs.c).id from cs)
                 and not (l.user_id = any((select private.my_blocked_ids())::uuid[])) group by l.comment_id),   -- (v18.6: not from someone blocked)
       cj as (select (cs.c).session_id as session_id,
                     jsonb_agg(internal.comment_build(cs.c, coalesce(substr(pc.legacy_ref, strpos(pc.legacy_ref, '#') + 1), pc.id::text), cl.j)
                               order by (cs.c).created_at, (cs.c).legacy_ref, (cs.c).id) as j
                from cs left join comments pc on pc.id = (cs.c).parent_id left join cl on cl.comment_id = (cs.c).id
               group by (cs.c).session_id),
       lj as (select l.session_id, jsonb_agg(internal.name_of(l.user_id) order by l.created_at, l.user_id) as j
                from likes l where l.session_id in (select (ss.s).id from ss)
                 and not (l.user_id = any((select private.my_blocked_ids())::uuid[])) group by l.session_id)
  select coalesce(jsonb_agg(internal.session_build(ss.s, k, n, p, lj.j, cj.j, o.joined_at) order by (ss.s).brewed_at desc, (ss.s).id), '[]'::jsonb)
  from ss left join coffees k on k.id = (ss.s).coffee_id
          left join session_notes n on n.session_id = (ss.s).id left join session_photos p on p.session_id = (ss.s).id
          left join profiles o on o.id = (ss.s).owner_id
          left join lj on lj.session_id = (ss.s).id left join cj on cj.session_id = (ss.s).id;
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

  -- sessions (notes and photos only when their own toggle lets you see them; the row rules handle that).
  -- v18.3: built in one pass (internal.sessions_json) instead of one session at a time: asking per session ran the row
  -- rules' lookups again for every session, note, photo, like and comment, and a sync passed the server's 8-second limit.
  out := out || internal.sessions_json(array(select s.id from sessions s where s.deleted_at is null and s.owner_id = any(circle)
                                               and (s.owner_id = me_id or not internal.unseen('session', s.id))));

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
           || internal.sessions_json(ids),
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

-- v15.0: with_friends also ranks sessions kept to Friends that you can see (while few people share with Everyone, the
-- app asks for these so Discover isn't empty; the same ranking, and people you follow still count a bit less)
drop function if exists discover_feed(timestamptz, int, int, text, text);
create or replace function discover_feed(as_of timestamptz default null, page int default 0, max_items int default 20, feed_filter text default null, feed_method text default null, with_friends boolean default false) returns jsonb
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
    where s.deleted_at is null and (s.audience = 'everyone' or (coalesce(with_friends, false) and s.audience = 'friends')) and s.owner_id <> me_id
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
             || internal.sessions_json(ids) end,
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
             || internal.sessions_json(ids) end,
    'next', case when coalesce(array_length(ids, 1), 0) = lim then oldest end,
    'summary', summary);
end $$;

-- ---------------------------------------------------------------- v14.7: monthly highlights
-- Instead of awards that would go to the same heavy brewers every month: a handful of people spotlighted for
-- different reasons, from what was shared with Everyone last month. Nobody is featured two months running, and one
-- person gets at most one highlight a month. Worked out once, the first time anyone asks after the month ends, then
-- kept (so it never changes under people). Everyone sees the same ones, except people they've blocked.
--   first_month  best first month: joined that month, the most sessions (at least 3)
--   improved     most improved on one coffee: the biggest rise from their first rating on it that month (at least 1 star)
--   helpful      most helpful: answers marked most helpful that month
--   explorer     most origins explored (at least 3)
--   photo        standout photo: the session photo with the most likes from other people (at least 2)
create table if not exists highlights (
  month       date not null,
  kind        text not null,
  profile_id  uuid not null references profiles (id) on delete cascade,
  session_id  uuid references sessions (id) on delete set null,
  detail      jsonb not null default '{}',
  made_at     timestamptz not null default now(),
  primary key (month, kind)
);
alter table highlights enable row level security;   -- no rules: read through monthly_highlights() only
revoke all on highlights from anon, authenticated;
create table if not exists highlight_months (month date primary key, made_at timestamptz not null default now());
alter table highlight_months enable row level security;
revoke all on highlight_months from anon, authenticated;

create or replace function internal.make_highlights(m date) returns void
language plpgsql security definer set search_path = public as $$
declare taken uuid[]; m1 date := (m + interval '1 month')::date; r record;
        -- v18.6: the month in Central time (the app's home), not UTC (Oct 31 evening sessions landed in November)
        ma timestamptz := (m::timestamp at time zone 'America/Chicago'); mb timestamptz := (m1::timestamp at time zone 'America/Chicago');
begin
  perform pg_advisory_xact_lock(hashtext('highlights:' || m::text));
  if exists (select 1 from highlight_months where month = m) then return; end if;
  taken := coalesce((select array_agg(profile_id) from highlights where month = (m - interval '1 month')::date), '{}');   -- last month's: not again
  create temp table hl_pool on commit drop as
    select s.id, s.owner_id, s.rating, s.brewed_at, s.coffee_id,
           coalesce(nullif(lower(btrim(k.roaster_text)), ''), '?') || '|' || coalesce(nullif(lower(btrim(k.name)), ''), s.coffee_id::text) as ckey, k.name as cname,
           nullif(lower(btrim(split_part(coalesce(k.origin, ''), ',', 1))), '') as origin
    from sessions s left join coffees k on k.id = s.coffee_id
    where s.deleted_at is null and s.audience = 'everyone' and s.brewed_at >= ma and s.brewed_at < mb
      and not exists (select 1 from reports x where x.target_type = 'session' and x.target_id = s.id and x.status in ('hidden', 'removed'));
  -- best first month
  select p.owner_id, count(*) as n into r from hl_pool p join profiles o on o.id = p.owner_id
  where o.joined_at >= ma and o.joined_at < mb and not (p.owner_id = any(taken))
  group by p.owner_id having count(*) >= 3 order by count(*) desc, avg(coalesce(p.rating, 0)) desc, p.owner_id limit 1;
  if found then insert into highlights (month, kind, profile_id, detail) values (m, 'first_month', r.owner_id, jsonb_build_object('sessions', r.n)); taken := taken || r.owner_id; end if;
  -- most improved on one coffee
  select x.owner_id, x.cname, x.first_r, x.best_r, x.best_id into r from (
    select p.owner_id, max(p.cname) as cname,
           (array_agg(p.rating order by p.brewed_at) filter (where p.rating > 0))[1] as first_r,
           max(p.rating) as best_r,
           (array_agg(p.id order by p.rating desc nulls last, p.brewed_at desc))[1] as best_id,
           count(*) filter (where p.rating > 0) as n
    from hl_pool p where not (p.owner_id = any(taken)) group by p.owner_id, p.ckey) x
  where x.n >= 3 and x.best_r - x.first_r >= 1 order by x.best_r - x.first_r desc, x.best_r desc, x.owner_id limit 1;
  if found then insert into highlights (month, kind, profile_id, session_id, detail) values (m, 'improved', r.owner_id, r.best_id, jsonb_build_object('coffee', r.cname, 'from', r.first_r, 'to', r.best_r)); taken := taken || r.owner_id; end if;
  -- most helpful
  select c.author_id, count(*) as n into r from comments c join sessions s on s.id = c.session_id
  where (c.most_helpful or s.extras->>'helpfulAnswer' = coalesce(substr(c.legacy_ref, strpos(c.legacy_ref, '#') + 1), c.id::text))   -- (v18.6: the app marks it on the session)
    and c.deleted_at is null and c.created_at >= ma and c.created_at < mb and s.audience = 'everyone' and not (c.author_id = any(taken))
  group by c.author_id order by count(*) desc, c.author_id limit 1;
  if found then insert into highlights (month, kind, profile_id, detail) values (m, 'helpful', r.author_id, jsonb_build_object('answers', r.n)); taken := taken || r.author_id; end if;
  -- most origins explored
  select p.owner_id, count(distinct p.origin) as n into r from hl_pool p where p.origin is not null and not (p.owner_id = any(taken))
  group by p.owner_id having count(distinct p.origin) >= 3 order by count(distinct p.origin) desc, p.owner_id limit 1;
  if found then insert into highlights (month, kind, profile_id, detail) values (m, 'explorer', r.owner_id, jsonb_build_object('origins', r.n)); taken := taken || r.owner_id; end if;
  -- standout photo
  select p.owner_id, p.id, (select count(*) from likes l where l.session_id = p.id and l.user_id <> p.owner_id) as n into r
  from hl_pool p join session_photos ph on ph.session_id = p.id and ph.audience = 'everyone'
  where not (p.owner_id = any(taken)) order by 3 desc, p.brewed_at desc limit 1;
  if found and r.n >= 2 then insert into highlights (month, kind, profile_id, session_id, detail) values (m, 'photo', r.owner_id, r.id, jsonb_build_object('likes', r.n)); end if;
  insert into highlight_months (month) values (m);
end $$;

create or replace function monthly_highlights(month date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); here timestamp := now() at time zone 'America/Chicago';   -- (v18.6: months in Central time)
        m date := date_trunc('month', coalesce(monthly_highlights.month, (here - interval '1 month')::date))::date;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if m >= date_trunc('month', here)::date then raise exception 'That month isn''t over yet.' using errcode = '22023'; end if;
  if not exists (select 1 from highlight_months where highlight_months.month = m) then perform internal.make_highlights(m); end if;
  return jsonb_build_object('month', m, 'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'kind', h.kind, 'name', internal.name_of(h.profile_id), 'color', internal.color_of(h.profile_id),
      'session', (select coalesce(s.legacy_id, s.id::text) from sessions s where s.id = h.session_id and s.deleted_at is null and s.audience = 'everyone'),
      'detail', h.detail)) order by array_position(array['first_month', 'improved', 'helpful', 'explorer', 'photo'], h.kind))
    from highlights h where h.month = m and not private.blocked_either(me_id, h.profile_id)), '[]'::jsonb));
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
-- v16.9: how your own shots stand (the tables are the machine functions' alone, so this reads them for you)
create or replace function internal.shots_mark(pid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.shots') is null then return ''; end if;
  return (select count(*) || ':' || coalesce(max(updated_at)::text, '') from shots where owner_id = pid);
end $$;
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
    internal.report_mark(),
    internal.shots_mark(me_id)));   -- v16.9: your shots (a new draft from your machine)
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

-- v18.6: comments a save removed (the app lists them as cmtGone): your own, or anyone's on your own session or coffee
-- (an owner tidying their page); replies go with them. Runs as the definer because the row rules only let people
-- delete their own comments, so it checks who's asking itself.
create or replace function internal.drop_comments(kind text, target uuid, rec text, gone jsonb, me_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if me_id is null or me_id is distinct from me() or jsonb_typeof(gone) <> 'array' or jsonb_array_length(gone) = 0 then return; end if;
  owner := case when kind = 'session' then (select owner_id from sessions where id = target) else (select owner_id from coffees where id = target) end;
  delete from comments c
   where (case when kind = 'session' then c.session_id = target else c.coffee_id = target end)
     and (c.author_id = me_id or owner = me_id)
     and (c.legacy_ref in (select rec || '#' || x from jsonb_array_elements_text(gone) x)
          or (c.legacy_ref is null and c.id::text in (select x from jsonb_array_elements_text(gone) x)));
end $$;
revoke all on function internal.drop_comments(text, uuid, text, jsonb, uuid) from public;

-- your comments (and your likes on any comment) on a coffee or session
drop function if exists internal.sync_comments(text, uuid, text, jsonb, uuid, text);
create or replace function internal.sync_comments(kind text, target uuid, rec text, list jsonb, me_id uuid, me_nm text, gone jsonb default null) returns void
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
  if gone is null then
    -- (an app from before v18.6) your comments that the app no longer has were removed
    if kind = 'session' then delete from comments where session_id = target and author_id = me_id and not (legacy_ref = any(mine));
    else delete from comments where coffee_id = target and author_id = me_id and not (legacy_ref = any(mine)); end if;
  else
    -- v18.6: only the comments this save removed. A copy that simply hadn't seen a comment made on another phone no
    -- longer deletes it, and an owner's Delete on someone else's comment sticks.
    perform internal.drop_comments(kind, target, rec, gone, me_id);
  end if;
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

-- a tea's type, as the app offers them (anything else is dropped)
create or replace function internal.tea_type(t text) returns text language sql immutable as $$
  select case lower(btrim(coalesce(t, ''))) when 'green' then 'Green' when 'white' then 'White' when 'yellow' then 'Yellow'
              when 'oolong' then 'Oolong' when 'black' then 'Black' when 'pu-erh' then 'Pu-erh' when 'matcha' then 'Matcha'
              when 'herbal' then 'Herbal' when 'tisane' then 'Herbal' end   -- (v17.1: herbal teas)
$$;

create or replace function internal.push_bean(ev jsonb, me_id uuid, me_nm text) returns void
language plpgsql set search_path = public as $$
declare k coffees;
begin
  select * into k from coffees where legacy_id = ev->>'id';
  if not found then
    if lower(btrim(coalesce(ev->>'owner', ev->>'user', me_nm))) <> lower(me_nm) then return; end if;   -- someone else's coffee you can't see
    perform internal.rate_hit(me_id, 'coffee');   -- v14.6
    insert into coffees (legacy_id, owner_id, roaster_id, roaster_text, name, origin, process, variety, roast, roast_date, created_at, kind, tea_type, tea, cover, learn)
    values (ev->>'id', me_id, internal.roaster_for(ev->>'roaster', me_id), nullif(btrim(ev->>'roaster'), ''), coalesce(nullif(btrim(ev->>'name'), ''), case when ev->>'kind' = 'tea' then 'Tea' else 'Coffee' end),
            nullif(btrim(ev->>'origin'), ''), nullif(btrim(ev->>'process'), ''), nullif(btrim(ev->>'variety'), ''), nullif(btrim(ev->>'roast'), ''),
            internal.try_date(ev->>'roastDate'), coalesce(internal.try_ts(ev->>'date'), now()),
            case when ev->>'kind' = 'tea' then 'tea' else 'coffee' end, case when ev->>'kind' = 'tea' then internal.tea_type(ev->>'teaType') end,
            case when ev->>'kind' = 'tea' then internal.tea_details(ev) end, internal.cover_of(ev), internal.learn_on_save(null::coffees, ev))
    returning * into k;
  elsif k.deleted_at is not null then return;                                                         -- deleted stays deleted
  elsif k.owner_id = me_id then                                                    -- only the owner edits a coffee, as in the app today
    update coffees set roaster_id = internal.roaster_for(ev->>'roaster', me_id), roaster_text = nullif(btrim(ev->>'roaster'), ''), name = coalesce(nullif(btrim(ev->>'name'), ''), name),
      origin = nullif(btrim(ev->>'origin'), ''), process = nullif(btrim(ev->>'process'), ''), variety = nullif(btrim(ev->>'variety'), ''),
      roast = nullif(btrim(ev->>'roast'), ''), roast_date = internal.try_date(ev->>'roastDate'), updated_at = now(),
      -- (a save from a version before tea has no "kind": it leaves the kind and type as they were)
      kind = case when not ev ? 'kind' then kind when ev->>'kind' = 'tea' then 'tea' else 'coffee' end,
      tea_type = case when not ev ? 'kind' then tea_type when ev->>'kind' = 'tea' then internal.tea_type(ev->>'teaType') end,
      -- (v17.1: a save from a version before blends has no "ingredients": it leaves them as they were)
      tea = case when ev->>'kind' is distinct from 'tea' and ev ? 'kind' then null when not ev ? 'ingredients' then tea else internal.tea_details(ev) end,
      -- (v17.4: a save from a version before pictures has no "cover": it leaves the picture as it was)
      cover = case when not ev ? 'cover' then cover else internal.cover_of(ev) end,
      -- (v19.0: Learn's tags: the ones sent, else kept while the words stay the same, else cleared for the backfill)
      learn = internal.learn_on_save(k, ev)
    where id = k.id;
  end if;
  perform internal.sync_like('coffee', k.id, ev->'likes', me_id, me_nm);
  perform internal.sync_comments('coffee', k.id, ev->>'id', internal.with_comment_meta(ev->'comments', ev->'commentMeta'), me_id, me_nm, case when jsonb_typeof(ev->'cmtGone') = 'array' then ev->'cmtGone' end);
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
       'rating', 'likes', 'comments', 'photo', 'equipment', 'equipmentSnapshot', 'eventAt', 'commentMeta', 'cmtGone', 'tasted', 'flavorNotes', 'audience', 'noteAudience', 'photoAudience', 'helpWanted', 'newHere', 'baseAt'],
    'equipment', jsonb_build_object('ids', coalesce(ev->'equipment', '[]'::jsonb), 'snapshot', coalesce(ev->'equipmentSnapshot', '[]'::jsonb)),
    'master', case when coalesce(ev->>'isMaster', 'false') = 'true' or jsonb_typeof(ev->'masterProfile') = 'object'
                   then jsonb_build_object('isMaster', coalesce(ev->>'isMaster', 'false') = 'true', 'profile', case when jsonb_typeof(ev->'masterProfile') = 'object' then ev->'masterProfile' end) end,
    'notes', coalesce(nullif(btrim(ev->>'notes'), ''), nullif(btrim(ev->>'note'), ''), nullif(btrim(ev->>'observations'), ''), nullif(btrim(ev->>'observation'), ''), nullif(btrim(ev->>'tastingNotes'), ''), ''),
    'photo', case when jsonb_typeof(ev->'photo') = 'object' and (ev->'photo'->>'path') like 'sb:%' then ev->'photo'->>'path'
                  when jsonb_typeof(ev->'photo') = 'object' and coalesce(ev->'photo'->>'fileId', '') <> '' then 'drive:' || (ev->'photo'->>'fileId')
                  when jsonb_typeof(ev->'photo') = 'object' and (ev->'photo'->>'url') ~ '^https?://' then ev->'photo'->>'url'
                  when jsonb_typeof(ev->'photo') = 'string' and (ev->>'photo') ~ '^https?://' then ev->>'photo' end);
$$;

-- v16.9: is "shot_<id>" one of your machine's shots (the shots table is the machine functions' alone)
create or replace function internal.owns_shot(app_id text, pid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.shots') is null or not internal.is_uuid(substr(coalesce(app_id, ''), 6)) then return false; end if;
  return exists (select 1 from shots where id = substr(app_id, 6)::uuid and owner_id = pid);
end $$;
create or replace function internal.is_uuid(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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
    if ev->>'id' like 'shot\_%' and not internal.owns_shot(ev->>'id', me_id) then return; end if;   -- v16.9: a machine shot's id is only its owner's to use
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
  perform internal.sync_comments('session', s.id, ev->>'id', internal.with_comment_meta(ev->'comments', ev->'commentMeta'), me_id, me_nm, case when jsonb_typeof(ev->'cmtGone') = 'array' then ev->'cmtGone' end);
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
          internal.keep_local(coalesce(case when jsonb_typeof(ev->'roasters') = 'object' then ev->'roasters' end, '{}'::jsonb), me_id, internal.try_ts(ev->>'baseAt')),   -- v15.8, v16.0
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
  if not internal.wants(for_id, what) then return; end if;   -- v15.8: they turned this kind off (Settings, Notifications)
  insert into notifications (user_id, actor_id, kind, session_id, coffee_id, comment_id, group_id) values (for_id, by_id, what, ses, cof, cmt, grp);
end $$;

create or replace function internal.on_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'likes' then perform internal.notify((select owner_id from sessions where id = new.session_id), new.user_id, 'like', new.session_id);
  elsif tg_table_name = 'coffee_likes' then perform internal.notify((select owner_id from coffees where id = new.coffee_id), new.user_id, 'like', null, new.coffee_id);
  else perform internal.notify((select author_id from comments where id = new.comment_id), new.user_id, 'comment_like',   -- (v18.6: with the comment's session or coffee, so a tap opens it)
                              (select session_id from comments where id = new.comment_id), (select coffee_id from comments where id = new.comment_id), new.comment_id); end if;
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

-- your newest notifications (newest first) and how many are unread. v18.6: a like on your comment (saved without its
-- session or coffee before v18.6) is about the comment's session or coffee; whose session it is comes along, so a tap
-- can open their profile when the session isn't on your phone; nothing from someone blocked either way.
create or replace function my_notifications(max_count int default 50) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'unread', (select count(*) from notifications where user_id = me() and read_at is null and not private.blocked_either(user_id, actor_id)),
    'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', n.id, 'kind', n.kind, 'who', internal.name_of(n.actor_id), 'color', internal.color_of(n.actor_id), 'at', n.created_at, 'read', n.read_at is not null,
               'session', (select coalesce(legacy_id, id::text) from sessions where id = n.sid),
               'sessionCoffee', (select coalesce(k.legacy_id, k.id::text) from sessions s join coffees k on k.id = s.coffee_id where s.id = n.sid),
               'sessionOwner', (select internal.name_of(owner_id) from sessions where id = n.sid),
               'coffee', (select coalesce(legacy_id, id::text) from coffees where id = n.cid),
               'comment', (select left(body, 140) from comments where id = n.comment_id and deleted_at is null),
               'group', (select name from groups where id = n.group_id))) order by n.id desc)
             from (select x.*, coalesce(x.session_id, (select c.session_id from comments c where c.id = x.comment_id)) as sid,
                          coalesce(x.coffee_id, (select c.coffee_id from comments c where c.id = x.comment_id)) as cid
                   from notifications x where x.user_id = me() and not private.blocked_either(x.user_id, x.actor_id)
                   order by x.id desc limit greatest(1, least(coalesce(max_count, 50), 200))) n), '[]'::jsonb));
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
           || internal.sessions_json(ids)
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
  check (kind in ('like', 'comment', 'reply', 'comment_like', 'follow', 'follow_request', 'follow_accepted', 'joined_group', 'helpful', 'report', 'bug', 'friend_session'));   -- v15.1: bug; v15.8: friend_session
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
  -- v15.0: who did it is the title and what they did is the text ("Aidan" / "Started following you"); the phone already
  -- shows the app's name above it (a "Dialed In" title showed it twice)
  select jsonb_build_object('title', case when n.kind = 'report' then 'New report' when n.kind = 'bug' then 'Bug report' else coalesce(internal.name_of(n.actor_id), 'Someone') end, 'tag', 'n' || n.id, 'body',
    case when n.kind = 'report' then 'Something was reported. Review it in Settings.' when n.kind = 'bug' then coalesce(internal.name_of(n.actor_id), 'Someone') || ' reported a bug. Read it in Settings.' else   -- (who reported it stays off the lock screen)
    case n.kind
      when 'like' then case when n.coffee_id is not null and n.session_id is null then (case when (select kind from coffees where id = n.coffee_id) = 'tea' then 'Liked your tea' else 'Liked your coffee' end) else 'Liked your session' end   -- (v17.0: a tea)
      when 'comment' then 'Commented' || coalesce(': ' || (select left(body, 120) from comments where id = n.comment_id and deleted_at is null), '')
      when 'reply' then 'Replied' || coalesce(': ' || (select left(body, 120) from comments where id = n.comment_id and deleted_at is null), '')
      when 'comment_like' then 'Liked your comment'
      when 'follow' then 'Started following you'
      when 'follow_request' then 'Wants to follow you'
      when 'follow_accepted' then 'Approved your follow request'
      when 'joined_group' then 'Joined ' || coalesce((select name from groups where id = n.group_id), 'your group')
      when 'helpful' then 'Marked your answer most helpful'
      when 'friend_session' then 'Logged a session' || coalesce(': ' || (select k.name from sessions x join coffees k on k.id = x.coffee_id where x.id = n.session_id), '')   -- v15.8
      else 'Did something' end end);
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
-- (v16.9: replaced further down by the version that also has your machines and shots)
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

-- ---------------------------------------------------------------- v15.1: the shared coffee list and profile pictures
-- Typing a coffee's name or roaster: the coffees people have logged that match, one row per coffee (same name and
-- roaster, ignoring capitals), with its most common origin, process, variety and roast and how many people logged it.
-- Never who: only coffees of public profiles (and your own), never anyone you've blocked or who blocked you.
create or replace function coffee_catalog(q text, max_items int default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := me(); s text := lower(btrim(coalesce(q, ''))); pat text;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if char_length(s) < 2 then return '[]'::jsonb; end if;
  pat := '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((select jsonb_agg(row_to_json(t)::jsonb order by t.people desc, t.name) from (
    select mode() within group (order by btrim(c.name)) as name,
           mode() within group (order by btrim(coalesce(r.name, c.roaster_text))) as roaster,
           mode() within group (order by nullif(btrim(c.origin), '')) as origin,
           mode() within group (order by nullif(btrim(c.process), '')) as process,
           mode() within group (order by nullif(btrim(c.variety), '')) as variety,
           mode() within group (order by nullif(btrim(c.roast), '')) as roast,
           c.kind as kind, mode() within group (order by c.tea_type) as "teaType",   -- (v17.0: teas and coffees never mix)
           count(distinct c.owner_id) as people
    from coffees c join profiles p on p.id = c.owner_id left join roasters r on r.id = c.roaster_id
    where c.deleted_at is null and btrim(c.name) <> '' and coalesce(c.tea->>'blend', '') <> 'true'   -- (v17.1: your own blend stays yours)
      and (c.owner_id = me_id or not p.is_private)
      and not exists (select 1 from blocks b where (b.blocker = me_id and b.blocked = c.owner_id) or (b.blocker = c.owner_id and b.blocked = me_id))
      and (lower(c.name) like pat or lower(coalesce(r.name, c.roaster_text, '')) like pat)
    group by lower(btrim(c.name)), lower(btrim(coalesce(r.name, c.roaster_text, ''))), c.kind
    order by count(distinct c.owner_id) desc, lower(btrim(c.name))
    limit greatest(1, least(coalesce(max_items, 8), 12))) t), '[]'::jsonb);
end $$;

-- your profile picture: a file in your own folder of the "avatars" storage bucket (or none)
create or replace function set_avatar(path text) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); p text := nullif(btrim(coalesce(path, '')), '');
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if p is not null and (split_part(p, '/', 1) <> auth.uid()::text or p !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,64}\.(jpg|png)$') then
    raise exception 'That picture can''t be used.' using errcode = '22023';
  end if;
  update profiles set avatar_path = p where id = me_id;
  return coalesce(p, '');
end $$;

-- the profile pictures of the people the app is showing (by the names it knows them by)
drop function if exists faces(text[]);
create or replace function faces(names jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.legacy_name, p.display_name), 'avatar', p.avatar_path))
    from profiles p
    where lower(coalesce(p.legacy_name, p.display_name)) in (select lower(btrim(n)) from jsonb_array_elements_text(case when jsonb_typeof(names) = 'array' then names else '[]'::jsonb end) with ordinality as x(n, i) where i <= 200)
      and not exists (select 1 from blocks b where (b.blocker = me_id and b.blocked = p.id) or (b.blocker = p.id and b.blocked = me_id))), '[]'::jsonb);
end $$;

-- the "avatars" bucket: anyone can look at a picture (its address has the account's id and a random name in it);
-- only you can list, add, replace or remove the ones in your own folder. (Here so it reaches the live project: storage.sql
-- only ever runs on an empty one.)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do update set public = true;
    drop policy if exists avatars_add on storage.objects;
    drop policy if exists avatars_replace on storage.objects;
    drop policy if exists avatars_remove on storage.objects;
    drop policy if exists avatars_read on storage.objects;
    create policy avatars_add on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy avatars_replace on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy avatars_remove on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    -- you list only your own folder (the pictures themselves are public links; listing everyone's showed every account's id)
    create policy avatars_read on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    -- pictures only, up to 2 MB (the app sends a small JPEG)
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types')
       and exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
      update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'avatars';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- v15.1: crema (levels) and bug reports
-- Crema: points for brewing, trying new coffees, commenting, likes, achievements, goals and awards. Each person's own
-- app adds them up from everything it has (it's the only one that sees all of it) and saves the total here, so everyone
-- sees the same level beside their name. faces() hands it out with the picture.
alter table profiles add column if not exists crema int;
alter table profiles add column if not exists crema_at timestamptz;
create or replace function set_crema(points int) returns void
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  update profiles set crema = least(greatest(coalesce(points, 0), 0), 1000000), crema_at = now() where id = me_id;
end $$;

create or replace function faces(names jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.legacy_name, p.display_name), 'avatar', p.avatar_path, 'crema', p.crema))
    from profiles p
    where lower(coalesce(p.legacy_name, p.display_name)) in (select lower(btrim(n)) from jsonb_array_elements_text(case when jsonb_typeof(names) = 'array' then names else '[]'::jsonb end) with ordinality as x(n, i) where i <= 200)
      and not exists (select 1 from blocks b where (b.blocker = me_id and b.blocked = p.id) or (b.blocker = p.id and b.blocked = me_id))), '[]'::jsonb);
end $$;

-- Bug reports from Settings: what happened in the person's words, plus the app version, phone and screen. Reviewers
-- hear about each one (the bell, and their phone) and read them in Settings.
create table if not exists bug_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  context     jsonb not null default '{}',
  status      text not null default 'open' check (status in ('open', 'done')),
  created_at  timestamptz not null default now()
);
alter table bug_reports enable row level security;   -- only through the functions below
create or replace function report_bug(body text, context jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); t text := left(btrim(coalesce(body, '')), 2000); adm uuid;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if t = '' then raise exception 'Say what happened first.' using errcode = '22023'; end if;
  perform internal.rate_hit(me_id, 'bug');
  insert into bug_reports (reporter_id, body, context)
  values (me_id, t, case when jsonb_typeof(context) = 'object' and char_length(context::text) < 4000 then context else '{}'::jsonb end);
  for adm in select x::uuid from backend_state, unnest(string_to_array(value, ',')) x where key = 'admins' and x ~ '^[0-9a-f-]{36}$' loop
    perform internal.notify(adm, me_id, 'bug');
  end loop;
  return 'sent';
end $$;

-- reviewers: the newest first (open ones on top)
create or replace function review_bugs(max_items int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not internal.is_admin(me()) then raise exception 'Only reviewers can see bug reports.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'body', b.body, 'context', b.context, 'status', b.status, 'at', b.created_at,
                                                        'name', internal.name_of(b.reporter_id)) order by (b.status = 'open') desc, b.created_at desc)
                   from (select * from bug_reports order by (status = 'open') desc, created_at desc limit least(greatest(coalesce(max_items, 50), 1), 200)) b), '[]'::jsonb);
end $$;

create or replace function close_bug(bug_id uuid, done boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not internal.is_admin(me()) then raise exception 'Only reviewers can do that.' using errcode = '42501'; end if;
  update bug_reports set status = case when done then 'done' else 'open' end where id = bug_id;
end $$;

-- ---------------------------------------------------------------- v15.8: choose your notifications; friends' new sessions
-- Each person picks the kinds they hear about in Settings, Notifications. Off means nothing is written for that kind:
-- not in the bell, not on the phone. Everything starts on. A friend's new session is news for the people who follow
-- them (approved) or share a private community with them and are allowed to see it, at most once per friend every
-- three hours (dialing in can mean five shots in a row).
create table if not exists notification_prefs (
  profile_id  uuid primary key references profiles (id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table notification_prefs enable row level security;   -- no rules: only the calls below touch it
revoke all on notification_prefs from authenticated, anon;

-- which switch a kind belongs to (reports and bug reports for reviewers always come through)
create or replace function internal.notif_pref_key(what text) returns text
language sql immutable as $$
  select case what when 'like' then 'likes' when 'comment' then 'comments' when 'reply' then 'replies' when 'comment_like' then 'comment_likes'
    when 'follow' then 'follows' when 'follow_request' then 'follows' when 'follow_accepted' then 'follows' when 'joined_group' then 'groups'
    when 'helpful' then 'helpful' when 'friend_session' then 'friend_sessions' else null end;
$$;

create or replace function internal.wants(for_id uuid, what text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when jsonb_typeof(p.prefs -> internal.notif_pref_key(what)) = 'boolean' then (p.prefs ->> internal.notif_pref_key(what))::boolean end
                   from notification_prefs p where p.profile_id = for_id), true);
$$;

-- v16.0: "Local to me" ticks merge; they're never just replaced. Every gear save carries your whole roaster choices (logging
-- a session saves your last setup, say), so a phone or app that hadn't caught up since a tick made elsewhere wiped it.
-- Each tick is [name, when] and each one taken off leaves [name, when] in localOff: per roaster the newest of the two
-- wins, whichever copy it came from. A phone on v15.8 or v15.9 doesn't send localOff: a tick it left out that was
-- there when its copy was made (baseAt) was taken off on that phone. A phone older than v15.8 doesn't send "local" at
-- all, and changes none of them.
drop function if exists internal.keep_local(jsonb, uuid);
create or replace function internal.local_key(e jsonb) returns text language sql immutable as $$
  select lower(btrim(coalesce(case jsonb_typeof(e) when 'array' then e->>0 when 'string' then e #>> '{}' end, '')));
$$;
create or replace function internal.keep_local(r jsonb, me_id uuid, base_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  old jsonb; s_on jsonb; s_off jsonb; i_on jsonb; i_off jsonb; gone jsonb := '[]'::jsonb; res jsonb;
  arr constant text := 'array';
begin
  select pg.roaster_prefs into old from profile_gear pg where pg.profile_id = me_id;
  old := coalesce(old, '{}'::jsonb);
  s_on := case when jsonb_typeof(old->'local') = arr then old->'local' else '[]'::jsonb end;
  s_off := case when jsonb_typeof(old->'localOff') = arr then old->'localOff' else '[]'::jsonb end;
  i_on := case when jsonb_typeof(r->'local') = arr then r->'local' else '[]'::jsonb end;
  i_off := case when jsonb_typeof(r->'localOff') = arr then r->'localOff' else '[]'::jsonb end;
  if r ? 'local' and not (r ? 'localOff') and base_at is not null then
    -- v15.8 / v15.9: a tick it had when its copy was made and has left out, it took off
    select coalesce(jsonb_agg(jsonb_build_array(o->>0, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), '[]'::jsonb) into gone
    from jsonb_array_elements(s_on) o
    where jsonb_typeof(o) = arr and internal.try_ts(o->>1) <= base_at
      and not exists (select 1 from jsonb_array_elements(i_on) i where internal.local_key(i) = internal.local_key(o));
  end if;
  with ev as (
    select e, internal.local_key(e) k, coalesce(case when jsonb_typeof(e) = arr then internal.try_ts(e->>1) end, '-infinity'::timestamptz) at, on_ from (
      select e, true on_ from jsonb_array_elements(s_on) e union all select e, true from jsonb_array_elements(i_on) e
      union all select e, false from jsonb_array_elements(s_off) e union all select e, false from jsonb_array_elements(i_off) e
      union all select e, false from jsonb_array_elements(gone) e) x
  ), last as (
    select distinct on (k) k, e, at, on_ from ev where k <> '' order by k, at desc, on_ asc
  )
  select jsonb_build_object(
      'local', coalesce((select jsonb_agg(case when jsonb_typeof(e) = arr then e else jsonb_build_array(e #>> '{}') end order by at) from last where on_), '[]'::jsonb),
      'localOff', coalesce((select jsonb_agg(e order by at) from (select e, at from last where not on_ and jsonb_typeof(e) = arr order by at desc limit 100) z), '[]'::jsonb))
    into res;
  -- (someone who never ticked one keeps roaster choices exactly as sent: no empty lists added)
  if res->'local' = '[]'::jsonb and not (r ? 'local') and not (old ? 'local') then res := res - 'local'; end if;
  if res->'localOff' = '[]'::jsonb and not (r ? 'localOff') and not (old ? 'localOff') then res := res - 'localOff'; end if;
  return r || res;
end $$;

create or replace function my_notification_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('likes', true, 'comments', true, 'replies', true, 'comment_likes', true, 'follows', true, 'groups', true, 'helpful', true, 'friend_sessions', true)
         || coalesce((select prefs from notification_prefs where profile_id = me()), '{}'::jsonb);
$$;

create or replace function set_notification_pref(pref text, turn_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if pref is null or pref not in ('likes', 'comments', 'replies', 'comment_likes', 'follows', 'groups', 'helpful', 'friend_sessions') or turn_on is null then
    raise exception 'That isn''t a notification you can choose.' using errcode = '22023';
  end if;
  insert into notification_prefs (profile_id, prefs) values (me_id, jsonb_build_object(pref, turn_on))
  on conflict (profile_id) do update set prefs = notification_prefs.prefs || jsonb_build_object(pref, turn_on), updated_at = now();
  return my_notification_prefs();
end $$;

create or replace function internal.on_session() returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  -- history isn't news: an import, a replay of old saves, or a session brewed more than two days ago
  if coalesce(current_setting('dialed.importing', true), '') = 'on' or coalesce(current_setting('dialed.replay', true), '') = 'on'
     or new.brewed_at < now() - interval '2 days' then return null; end if;
  for v in
    select x.id from profiles x
    where x.id <> new.owner_id
      and (exists (select 1 from follows f where f.follower = x.id and f.followee = new.owner_id and f.status = 'accepted')
           or private.shares_private_group(x.id, new.owner_id))
      and private.can_see_session(x.id, new)
      and not exists (select 1 from notifications n where n.user_id = x.id and n.actor_id = new.owner_id and n.kind = 'friend_session' and n.created_at > now() - interval '3 hours')
  loop
    perform internal.notify(v, new.owner_id, 'friend_session', new.id, new.coffee_id);
  end loop;
  return null;
end $$;
drop trigger if exists notify_friend_session on sessions;
create trigger notify_friend_session after insert on sessions for each row execute function internal.on_session();

-- ---------------------------------------------------------------- v16.9: the Shot Logger (espresso machines that send each shot)
-- A GaggiMate kit on a Gaggia sends every shot it pulls to the shot-inbox function (supabase/functions/shot-inbox),
-- with the machine's own secret token, and the function hands it here. The token names the machine and its owner;
-- nothing in the shot itself is trusted for that. A shot arrives as a draft the moment it ends (the machine says
-- "Saved to Dialed In") and may come again: rated on the machine and posted, or retried after the machine was offline.
-- One shot is one row here however many times it's sent, and a posted shot is one normal session whose app id is
-- "shot_<shot id>": the machine, the app's "Taste and rate" and a late retry all land on that same session. A draft is
-- the owner's alone: it's in no feed, profile, goal, award or stat until it's posted.
-- The contract with the machine side is claude/shot-logger-app-handoff.md (the project docs); the example shot it
-- describes is supabase/fixtures/shot-example.json.
create table if not exists machines (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  token_hash    text not null unique,                  -- sha-256 of the machine's token; the token itself is never stored
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz                            -- unlinked: its token no longer works
);
create index if not exists machines_owner on machines (owner_id);
create table if not exists shots (
  id            uuid primary key,                      -- the machine's shot_id
  machine_id    uuid not null references machines (id) on delete cascade,
  owner_id      uuid not null references profiles (id) on delete cascade,
  coffee_id     uuid references coffees (id) on delete set null,
  state         text not null default 'draft' check (state in ('draft', 'posted', 'dismissed')),
  payload       jsonb not null,                        -- the latest send, curves included (about 6 KB)
  session_id    uuid references sessions (id) on delete set null,
  brewed_at     timestamptz not null,                  -- the shot's started_at, never when it arrived (unless the machine's clock wasn't set: time_approx)
  asked_at      timestamptz,                           -- the app's "Taste and rate" popup was answered (Later or X)
  sends         int not null default 1,
  received_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists shots_owner on shots (owner_id, state, brewed_at desc);
-- (Oct 24 evening, the machine side's update) a machine whose clock was never set sends started_at: null, and one whose
-- clock is wrong sends a time we can't believe: the shot is kept, dated when it arrived, and marked as approximate
alter table shots add column if not exists time_approx boolean not null default false;
-- a test machine (the desktop simulator): what it posts is "Only me", so friends never see test shots
alter table machines add column if not exists test boolean not null default false;
alter table machines enable row level security;   -- no rules: only the calls below and the two machine functions touch them
alter table shots enable row level security;
revoke all on machines, shots from authenticated, anon;

-- a grind as the app writes it: the Sette 270Wi's "12.0D" is "12D" (how people type letter grinds: "8H", "10E"), so
-- the machine's shots and hand-logged ones read as the same setting; "12.5D" stays as it is
create or replace function internal.shot_grind(g text) returns text language sql immutable as $$
  select nullif(left(regexp_replace(btrim(coalesce(g, '')), '^(\d+)\.0+(\s*[A-Ia-i]?)$', '\1\2'), 24), '');
$$;
-- a number from the shot, only if it's a number in the range (else null)
create or replace function internal.shot_num(v jsonb, lo numeric, hi numeric) returns numeric language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between lo and hi then (v #>> '{}')::numeric end;
$$;
create or replace function internal.token_hash(token text) returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(token, ''), 'utf8')), 'hex');   -- (built in; no extension needed)
$$;

-- what's wrong with a shot, in words the machine side can log (null: nothing)
-- when the shot was pulled, if the machine's clock can be believed: null when it sent none (its clock was never set)
-- or one more than 10 minutes in the future or over 60 days old (a wrong clock). The shot is then dated when it arrives.
create or replace function internal.shot_started(b jsonb) returns timestamptz language plpgsql stable as $$
declare t timestamptz := case when b->>'started_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then internal.try_ts(b->>'started_at') end;
begin
  if t is null or t > now() + interval '10 minutes' or t < now() - interval '60 days' then return null; end if;
  return t;
end $$;

create or replace function internal.shot_problem(b jsonb) returns text
language plpgsql stable as $$
declare
  t timestamptz; e timestamptz; smp jsonb; n int; k text; i int; prev numeric; x jsonb; ph jsonb; r jsonb;
  tastes constant text[] := array['acidity', 'sweetness', 'body', 'finish', 'bitterness'];
  num constant text := 'number';
begin
  if jsonb_typeof(b) is distinct from 'object' then return 'The shot must be a JSON object.'; end if;
  if b->'v' is distinct from '1'::jsonb then return 'Unknown version: v must be 1.'; end if;
  if not internal.is_uuid(b->>'shot_id') then return 'shot_id must be a UUID.'; end if;
  if coalesce(b->>'status', '') not in ('draft', 'post') then return 'status must be "draft" or "post".'; end if;
  -- started_at / ended_at: ISO 8601, or null when the machine's clock was never set (the shot is then dated when it arrives)
  if b ? 'started_at' and jsonb_typeof(b->'started_at') <> 'null'
     and (jsonb_typeof(b->'started_at') <> 'string' or b->>'started_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or internal.try_ts(b->>'started_at') is null) then return 'started_at must be an ISO 8601 time, or null when the machine''s clock isn''t set.'; end if;
  if b ? 'ended_at' and jsonb_typeof(b->'ended_at') <> 'null'
     and (jsonb_typeof(b->'ended_at') <> 'string' or b->>'ended_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or internal.try_ts(b->>'ended_at') is null) then return 'ended_at must be an ISO 8601 time, or null.'; end if;
  t := internal.shot_started(b); e := internal.try_ts(b->>'ended_at');
  if t is not null and e is not null and (e < t or e > t + interval '10 minutes') then return 'ended_at must be a time after started_at (within 10 minutes).'; end if;
  if lower(coalesce(b->>'method', '')) <> 'espresso' then return 'method must be "Espresso".'; end if;
  if not internal.is_uuid(b->>'coffee_id') then return 'coffee_id must be a Dialed In coffee id (a UUID).'; end if;
  if jsonb_typeof(b->'coffee_name') = 'string' and char_length(b->>'coffee_name') > 120 then return 'coffee_name is too long.'; end if;
  if b ? 'recipe' and jsonb_typeof(b->'recipe') not in ('object', 'null') then return 'recipe must be an object.'; end if;
  if jsonb_typeof(b->'recipe') = 'object' and (char_length(coalesce(b->'recipe'->>'name', '')) > 60 or char_length(coalesce(b->'recipe'->>'id', '')) > 60) then return 'recipe name and id must be 60 characters or fewer.'; end if;
  if jsonb_typeof(b->'recipe'->'temp_c') = num and internal.shot_num(b->'recipe'->'temp_c', 50, 110) is null then return 'recipe.temp_c must be between 50 and 110.'; end if;
  -- (dose and yield can be empty: the dose screen is skippable, and a shot without the scale has no yield)
  if b ? 'dose_g' and jsonb_typeof(b->'dose_g') <> 'null' and internal.shot_num(b->'dose_g', 1, 40) is null then return 'dose_g must be a number from 1 to 40.'; end if;
  if b ? 'yield_g' and jsonb_typeof(b->'yield_g') <> 'null' and internal.shot_num(b->'yield_g', 0, 200) is null then return 'yield_g must be a number from 0 to 200.'; end if;
  if internal.shot_num(b->'time_s', 0, 300) is null then return 'time_s must be a number from 0 to 300.'; end if;
  if b ? 'grind' and jsonb_typeof(b->'grind') not in ('string', 'null') then return 'grind must be text, like "12.0D".'; end if;
  if char_length(coalesce(b->>'grind', '')) > 24 then return 'grind is too long.'; end if;
  if b ? 'target_yield_g' and jsonb_typeof(b->'target_yield_g') <> 'null' and internal.shot_num(b->'target_yield_g', 0, 200) is null then return 'target_yield_g must be a number from 0 to 200.'; end if;
  if b ? 'temp_c' and jsonb_typeof(b->'temp_c') <> 'null' and internal.shot_num(b->'temp_c', 50, 110) is null then return 'temp_c must be between 50 and 110.'; end if;
  if b ? 'peak_bar' and jsonb_typeof(b->'peak_bar') <> 'null' and internal.shot_num(b->'peak_bar', 0, 20) is null then return 'peak_bar must be between 0 and 20.'; end if;
  -- phases: what the recipe did, in order
  if b ? 'phases' and jsonb_typeof(b->'phases') not in ('array', 'null') then return 'phases must be a list.'; end if;
  if jsonb_typeof(b->'phases') = 'array' then
    if jsonb_array_length(b->'phases') > 20 then return 'A shot can have at most 20 phases.'; end if;
    for ph in select * from jsonb_array_elements(b->'phases') loop
      if jsonb_typeof(ph) <> 'object' or char_length(coalesce(ph->>'name', '')) not between 1 and 40
         or internal.shot_num(ph->'start_s', 0, 600) is null or internal.shot_num(ph->'end_s', 0, 600) is null
         or (ph->>'end_s')::numeric < (ph->>'start_s')::numeric
         or char_length(coalesce(ph->>'ended_by', '')) > 20 or char_length(coalesce(ph->>'target', '')) > 30 then
        return 'Each phase needs a name, start_s and end_s (end after start).';
      end if;
    end loop;
  end if;
  -- the curves: same length lists, time going forward
  smp := b->'samples';
  if jsonb_typeof(smp) <> 'object' or jsonb_typeof(smp->'t_s') <> 'array' then return 'samples.t_s must be a list.'; end if;
  n := jsonb_array_length(smp->'t_s');
  if n < 2 or n > 3000 then return 'samples must have between 2 and 3000 points.'; end if;
  prev := -1;
  for i in 0 .. n - 1 loop
    x := smp->'t_s'->i;
    if jsonb_typeof(x) <> num or (x #>> '{}')::numeric < prev or (x #>> '{}')::numeric > 600 then return 'samples.t_s must be numbers that only go forward (seconds).'; end if;
    prev := (x #>> '{}')::numeric;
  end loop;
  -- (a list a later machine version adds is kept as long as it has the same shape: refusing it would make the machine
  -- drop the whole shot; the app draws only the ones it knows)
  if (select count(*) from jsonb_object_keys(smp)) > 12 then return 'samples has too many lists (12 at most).'; end if;
  for k in select jsonb_object_keys(smp) loop
    if k <> 't_s' and jsonb_typeof(smp->k) <> 'null' then
      if char_length(k) > 40 then return 'samples has a list with too long a name.'; end if;
      if jsonb_typeof(smp->k) <> 'array' or jsonb_array_length(smp->k) <> n then return format('samples.%s must be a list as long as samples.t_s.', k); end if;
      if exists (select 1 from jsonb_array_elements(smp->k) v where jsonb_typeof(v) not in ('number', 'null')
                 or (jsonb_typeof(v) = num and abs((v #>> '{}')::numeric) > 1000)) then return format('samples.%s must hold numbers (or null).', k); end if;
    end if;
  end loop;
  -- a rating from the machine: stars and five sliders (the app's complexity stays empty)
  r := b->'rating';
  if r is not null and jsonb_typeof(r) not in ('object', 'null') then return 'rating must be an object or null.'; end if;
  if jsonb_typeof(r) = 'object' then
    if r ? 'stars' and jsonb_typeof(r->'stars') <> 'null' and (internal.shot_num(r->'stars', 0.5, 5) is null or ((r->>'stars')::numeric * 2) % 1 <> 0) then return 'rating.stars must be 1 to 5 (halves allowed).'; end if;
    if r ? 'taste' and jsonb_typeof(r->'taste') not in ('object', 'null') then return 'rating.taste must be an object.'; end if;
    if jsonb_typeof(r->'taste') = 'object' then
      if exists (select 1 from jsonb_object_keys(r->'taste') o where o <> all (tastes)) then return 'rating.taste has a slider the app doesn''t know.'; end if;
      if exists (select 1 from jsonb_each(r->'taste') v where jsonb_typeof(v.value) <> 'null' and internal.shot_num(v.value, 1, 10) is null) then return 'Each taste slider must be 1 to 10.'; end if;
    end if;
  end if;
  return null;
end $$;

-- a posted shot becomes (or updates) its session. The machine's own numbers are the machine's to set; a person's
-- tasting (stars, sliders) is never overwritten by a later send, only filled in where it's empty.
create or replace function internal.shot_post(shot uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s shots; p jsonb; ses sessions; lid text; r jsonb; v_stars numeric; v_taste jsonb; ex jsonb; eq jsonb := '[]'::jsonb; snap jsonb := '[]'::jsonb; aud audience;
begin
  select * into s from shots where id = shot for update;
  if not found or s.state = 'dismissed' then return null; end if;
  p := s.payload; lid := 'shot_' || s.id::text;
  r := case when jsonb_typeof(p->'rating') = 'object' then p->'rating' end;
  v_stars := internal.shot_num(r->'stars', 0.5, 5);
  v_taste := jsonb_strip_nulls(jsonb_build_object(
    'acidity', internal.shot_num(r->'taste'->'acidity', 1, 10), 'sweetness', internal.shot_num(r->'taste'->'sweetness', 1, 10),
    'body', internal.shot_num(r->'taste'->'body', 1, 10), 'finish', internal.shot_num(r->'taste'->'finish', 1, 10),
    'bitterness', internal.shot_num(r->'taste'->'bitterness', 1, 10)));
  ex := jsonb_strip_nulls(jsonb_build_object(
    'temp', coalesce(internal.shot_num(p->'temp_c', 50, 110), internal.shot_num(p->'recipe'->'temp_c', 50, 110)),
    'machineRecipe', nullif(internal.clean_text(left(btrim(coalesce(p->'recipe'->>'name', '')), 60)), ''), 'peakBar', internal.shot_num(p->'peak_bar', 0, 20),
    'targetYield', internal.shot_num(p->'target_yield_g', 0, 200), 'shotId', s.id::text, 'timeApprox', case when s.time_approx then true end,
    'machine', (select name from machines where id = s.machine_id)));
  select * into ses from sessions where legacy_id = lid;
  if not found then
    -- who sees it: where the person's last session was set (the app does the same for a new session), else the default
    aud := case when (select test from machines where id = s.machine_id) then 'only_me'::audience end;   -- (a test machine's shots: yours alone)
    aud := coalesce(aud, (select x.audience from sessions x where x.owner_id = s.owner_id and x.deleted_at is null order by x.created_at desc limit 1),
                    case when (select joined_at from profiles where id = s.owner_id) is not null then 'everyone'::audience else 'friends'::audience end);
    -- the gear: what the person last used for espresso (as the app fills in a new session)
    select coalesce(case when jsonb_typeof(g.last_by_method->'Espresso') = 'array' then g.last_by_method->'Espresso' end, '[]'::jsonb) into eq
      from profile_gear g where g.profile_id = s.owner_id;
    eq := coalesce(eq, '[]'::jsonb);
    select coalesce(jsonb_agg(e.name order by x.ord), '[]'::jsonb) into snap
      from jsonb_array_elements_text(eq) with ordinality x(gid, ord) join equipment e on e.owner_id = s.owner_id and coalesce(e.legacy_id, e.id::text) = x.gid;
    insert into sessions (legacy_id, owner_id, coffee_id, audience, method, grind, dose, yield, time_s, rating, taste, tasted, extras, equipment, brewed_at)
    values (lid, s.owner_id, s.coffee_id, aud, 'Espresso', internal.shot_grind(p->>'grind'), internal.shot_num(p->'dose_g', 1, 40),
            internal.shot_num(p->'yield_g', 0, 200), internal.shot_num(p->'time_s', 0, 300), v_stars, nullif(v_taste, '{}'::jsonb),
            array(select jsonb_object_keys(v_taste)), ex, jsonb_build_object('ids', eq, 'snapshot', snap), s.brewed_at)
    returning * into ses;
  elsif ses.owner_id <> s.owner_id then return null;   -- (never someone else's session)
  elsif ses.deleted_at is null and ses.owner_id = s.owner_id then
    update sessions set coffee_id = coalesce(s.coffee_id, coffee_id), grind = internal.shot_grind(p->>'grind'),
      dose = internal.shot_num(p->'dose_g', 1, 40), yield = internal.shot_num(p->'yield_g', 0, 200), time_s = internal.shot_num(p->'time_s', 0, 300),
      brewed_at = s.brewed_at, rating = coalesce(sessions.rating, v_stars),
      taste = nullif(v_taste || coalesce(sessions.taste, '{}'::jsonb), '{}'::jsonb),
      tasted = case when coalesce(cardinality(sessions.tasted), 0) > 0 or coalesce(sessions.taste, '{}'::jsonb) <> '{}'::jsonb then sessions.tasted
                    else array(select jsonb_object_keys(v_taste)) end,
      extras = coalesce(sessions.extras, '{}'::jsonb) || ex, updated_at = now()
    where id = ses.id;
  end if;   -- (a session deleted in the app stays deleted)
  update shots set state = 'posted', session_id = ses.id, updated_at = now() where id = s.id;
  return ses.id;
end $$;

-- the machine is who its token says (null: no such machine, or it was unlinked)
create or replace function internal.machine_for(token text) returns machines
language sql stable security definer set search_path = public as $$
  select * from machines where token_hash = internal.token_hash(token) and revoked_at is null
   and char_length(coalesce(token, '')) between 20 and 200;
$$;

-- the shot-inbox function's whole job (it passes the token and the body, already checked for size and JSON).
-- Answers {status, ok, shot_id, state} or {status, error}: 200, 401 (the token), 413 (too big), 422 (the data: don't
-- send it again), 429 (too many sends: keep it and retry).
create or replace function internal.shot_inbox(token text, body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m machines; s shots; why text; sid uuid; cof uuid; started timestamptz; posting boolean;
begin
  m := internal.machine_for(token);
  if m.id is null then return jsonb_build_object('status', 401, 'error', 'Unknown machine. Link it again in Dialed In.'); end if;
  update machines set last_seen_at = now() where id = m.id;
  if octet_length(body::text) > 262144 then return jsonb_build_object('status', 413, 'error', 'The shot is too big (256 KB at most).'); end if;
  why := internal.shot_problem(body);
  if why is not null then return jsonb_build_object('status', 422, 'error', why); end if;
  sid := (body->>'shot_id')::uuid; started := internal.shot_started(body); posting := body->>'status' = 'post';
  -- a coffee the owner can log against: it's there and not deleted (anyone signed in can log on any coffee)
  select k.id into cof from coffees k where k.id = (body->>'coffee_id')::uuid and k.deleted_at is null;
  if cof is null then return jsonb_build_object('status', 422, 'error', 'That coffee isn''t on Dialed In any more. Pick it again on the machine.'); end if;
  begin
    perform internal.rate_hit(m.owner_id, 'shot');
  exception when others then return jsonb_build_object('status', 429, 'error', 'Too many sends from this machine. Keep the shot and try again in a few minutes.'); end;   -- (429: the machine keeps it and retries)
  select * into s from shots where id = sid for update;
  if found and s.owner_id <> m.owner_id then return jsonb_build_object('status', 422, 'error', 'That shot_id belongs to someone else''s machine.'); end if;
  if not found then
    insert into shots (id, machine_id, owner_id, coffee_id, state, payload, brewed_at, time_approx) values (sid, m.id, m.owner_id, cof, 'draft', body, coalesce(started, now()), started is null)
    returning * into s;
  elsif s.state = 'draft' or posting then
    -- the latest send wins, but never backwards: a draft retry after the shot was posted (or deleted in the app) changes nothing
    update shots set payload = body, machine_id = m.id, coffee_id = cof, brewed_at = coalesce(started, brewed_at), time_approx = started is null and time_approx,
                     sends = sends + 1, updated_at = now(),
                     state = case when state = 'dismissed' then 'draft' else state end
     where id = sid returning * into s;
  else
    update shots set sends = sends + 1 where id = sid returning * into s;
  end if;
  if posting then perform internal.shot_post(sid); select * into s from shots where id = sid; end if;
  return jsonb_build_object('status', 200, 'ok', true, 'shot_id', sid, 'state', case when s.state = 'posted' then 'posted' else 'draft' end);
end $$;

-- what the machine reads at power-on and every few minutes: the coffees on its owner's shelf for the picker (most
-- recently brewed first) and, for each, the owner's own last espresso on that coffee to prefill dose and grind. Only
-- ever the owner's own grind: grinds don't carry across grinders.
create or replace function internal.machine_sync(token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m machines;
begin
  m := internal.machine_for(token);
  if m.id is null then return jsonb_build_object('status', 401, 'error', 'Unknown machine. Link it again in Dialed In.'); end if;
  update machines set last_seen_at = now() where id = m.id;
  return jsonb_build_object('status', 200, 'ok', true, 'v', 1, 'at', now(),
    'machine', jsonb_build_object('id', m.id, 'name', m.name), 'owner', internal.name_of(m.owner_id),
    'coffees', coalesce((
      with shelf as (   -- your coffees and the ones you've brewed, one per coffee (same roaster and name), yours first
        select distinct on (internal.coffee_key(k.roaster_text), internal.coffee_key(k.name))
               k.id, k.name, coalesce(k.roaster_text, r.name, '') roaster, internal.coffee_key(k.roaster_text) rk, internal.coffee_key(k.name) nk, k.created_at
          from coffees k left join roasters r on r.id = k.roaster_id
         where k.deleted_at is null and k.kind = 'coffee'   -- (v17.0: an espresso machine's picker never lists teas)
           and (k.owner_id = m.owner_id or exists (select 1 from sessions x where x.coffee_id = k.id and x.owner_id = m.owner_id and x.deleted_at is null))
         order by internal.coffee_key(k.roaster_text), internal.coffee_key(k.name), (k.owner_id = m.owner_id) desc, k.created_at desc
      ), mine as (
        select s.dose, s.grind, s.yield, s.time_s, s.brewed_at, s.method, internal.coffee_key(k.roaster_text) rk, internal.coffee_key(k.name) nk
          from sessions s join coffees k on k.id = s.coffee_id where s.owner_id = m.owner_id and s.deleted_at is null
      ), listed as (
        select sh.id, sh.name, sh.roaster, sh.created_at, lb.last_brewed, ls.dose, ls.grind, ls.yield, ls.time_s, ls.brewed_at shot_at
          from shelf sh
          left join lateral (select max(x.brewed_at) last_brewed from mine x where x.rk = sh.rk and x.nk = sh.nk) lb on true
          left join lateral (select x.dose, x.grind, x.yield, x.time_s, x.brewed_at from mine x
                              where x.rk = sh.rk and x.nk = sh.nk and lower(coalesce(x.method, '')) = 'espresso' order by x.brewed_at desc limit 1) ls on true
      )
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'roaster', l.roaster,
               'last', case when l.shot_at is not null then jsonb_strip_nulls(jsonb_build_object('dose_g', l.dose, 'grind', l.grind,
                       'yield_g', l.yield, 'time_s', l.time_s, 'at', l.shot_at)) end)
               order by l.last_brewed desc nulls last, l.created_at desc)
        from (select * from listed order by last_brewed desc nulls last, created_at desc limit 40) l), '[]'::jsonb));
end $$;

-- the app's own calls -------------------------------------------------------------------------------------------
-- your drafts from your machines, newest first, curves included (the popup draws the newest; Drafts draws them all)
create or replace function my_shots(max_items int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := me(); lim int := least(greatest(coalesce(max_items, 30), 1), 100);
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'drafts', coalesce((select jsonb_agg(d.j order by d.brewed_at desc) from (
      select s.brewed_at, jsonb_build_object('id', s.id, 'machine', m.name, 'brewedAt', s.brewed_at, 'approx', s.time_approx, 'test', m.test, 'receivedAt', s.received_at, 'asked', s.asked_at is not null,
               'beanId', coalesce(k.legacy_id, k.id::text), 'coffee', coalesce(k.name, s.payload->>'coffee_name'), 'roaster', coalesce(k.roaster_text, r.name, ''),
               'grind', internal.shot_grind(s.payload->>'grind'), 'shot', s.payload) j
        from shots s join machines m on m.id = s.machine_id left join coffees k on k.id = s.coffee_id left join roasters r on r.id = k.roaster_id
       where s.owner_id = me_id and s.state = 'draft'
       order by s.brewed_at desc limit lim) d), '[]'::jsonb),
    'count', (select count(*) from shots where owner_id = me_id and state = 'draft'),
    'machines', (select count(*) from machines where owner_id = me_id and revoked_at is null));
end $$;

-- "Post as is": the shot becomes a session right away with the machine's numbers only (no stars, no tasting)
create or replace function post_shot(shot_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me_id uuid := me(); s shots;
begin
  if me_id is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into s from shots where id = post_shot.shot_id and owner_id = me_id;
  if not found then raise exception 'That shot isn''t yours.' using errcode = '42501'; end if;
  if s.state = 'dismissed' then raise exception 'That shot was deleted.' using errcode = '22023'; end if;
  if s.state = 'draft' then perform internal.shot_post(s.id); end if;
  return 'shot_' || s.id::text;
end $$;

-- "Later" (or the X): it stays in Drafts and the popup doesn't ask about it again
create or replace function shot_later(shot_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  update shots set asked_at = coalesce(asked_at, now()) where id = shot_later.shot_id and owner_id = me();
  return 'later';
end $$;

-- delete a draft (it's kept as dismissed, so a late retry from the machine doesn't bring it back)
create or replace function dismiss_shot(shot_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  update shots set state = 'dismissed', asked_at = coalesce(asked_at, now()), updated_at = now()
   where id = dismiss_shot.shot_id and owner_id = me() and state = 'draft';
  return 'deleted';
end $$;

-- the curves for one of your posted sessions (its shot page). Yours only, like drafts.
create or replace function shot_for_session(session_ref text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'machine', m.name, 'brewedAt', s.brewed_at, 'approx', s.time_approx, 'shot', s.payload)
    from shots s join machines m on m.id = s.machine_id
   where s.owner_id = me() and s.state = 'posted'
     and (('shot_' || s.id::text) = session_ref or s.session_id = (select x.id from sessions x where coalesce(x.legacy_id, x.id::text) = session_ref and x.owner_id = me()))
   limit 1;
$$;

-- saving "Taste and rate" in the app: the session it saves has the shot's app id ("shot_<shot id>"), so the shot
-- becomes posted and points at it (only your own shot)
create or replace function internal.on_shot_session() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.legacy_id like 'shot\_%' and internal.is_uuid(substr(new.legacy_id, 6)) and new.deleted_at is null then
    update shots set state = 'posted', session_id = new.id, updated_at = now()
     where id = substr(new.legacy_id, 6)::uuid and owner_id = new.owner_id and (state <> 'posted' or session_id is distinct from new.id);
  end if;
  return null;
end $$;
drop trigger if exists link_shot_session on sessions;
create trigger link_shot_session after insert on sessions for each row execute function internal.on_shot_session();

-- a machine for someone (until linking from the app is designed: supabase/make_machine.js calls this). Returns the
-- token once; only its hash is kept.
create or replace function internal.add_machine(owner uuid, machine_name text) returns text
language plpgsql security definer set search_path = public as $$
declare tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 244 random bits (built in)
begin
  if not exists (select 1 from profiles where id = owner) then raise exception 'No such profile.'; end if;
  insert into machines (owner_id, name, token_hash) values (owner, left(btrim(coalesce(machine_name, 'Espresso machine')), 60), internal.token_hash(tok));
  return tok;
end $$;

-- your data, now with your machines (never their tokens) and every shot they sent (this replaces the export_my_data
-- above, which can't name tables made further down)
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
    'groups', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'role', m.role)) from group_members m join groups g on g.id = m.group_id where m.user_id = me()), '[]'::jsonb),
    'machines', coalesce((select jsonb_agg(jsonb_build_object('name', mc.name, 'linked_at', mc.created_at, 'last_seen_at', mc.last_seen_at, 'unlinked_at', mc.revoked_at) order by mc.created_at)
                          from machines mc where mc.owner_id = me()), '[]'::jsonb),
    'shots', coalesce((select jsonb_agg(jsonb_build_object('id', sh.id, 'state', sh.state, 'brewed_at', sh.brewed_at, 'session_id', sh.session_id, 'shot', sh.payload) order by sh.brewed_at)
                       from shots sh where sh.owner_id = me()), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------- v19.0: Learn
-- Each coffee keeps a small copy of what kind of coffee it is (coffees.learn), worked out on the phone from the bag's
-- words by the same recognizer the app uses (LearnEngine). Phones never need it back (they read the bag themselves);
-- it's here only so Learn's community numbers can be grouped by kind. A save that sends tags stores them (if they're
-- the known shape and ids); a save that changes the words without tags (an older app) clears them, and the nightly
-- backfill (supabase/learn_tags.js) fills them in again. "keep" holds the person's "Keep as typed" answers.
-- learn ids: written by tools/learn_ids.js from the recognizer; do not edit by hand
create or replace function internal.learn_ids() returns jsonb language sql immutable as $learnids$ select '{"variety":["74110","74112","74140","74148","74158","74165","744","75227","anacafe-14","andungsari","arara","ateng","batian","blue-mountain","bm139","bourbon","bourbon-aji","casiopea","castillo","catigua","catimor","catisic","catuai","catucai","caturra","cenicafe-1","centroamericano","chandragiri","chiroso","colombia-var","costa-rica-95","cuscatleco","dawairi","esperanza","ethiopian-landrace","evaluna","french-mission","gesha","gesha-1931","gori-gesha","h3","iapar-59","icatu","ihcafe-90","ipr-107","jaadi","jackson","java","k7","kent","kurume","laurina","lempira","limani","maragogipe","marsellesa","mibirizi","milenio","monte-claro","mundo-maya","mundo-novo","mundomex","nayarita","obata","orange-bourbon","oro-azteca","pacamara","pacas","pache","papayo","parainema","paraiso","pink-bourbon","ruiru-11","rume-sudan","s795","sarchimor","sidra","sigarar-utang","sl14","sl28","sl34","sln-9","starmaya","tabi","tekisic","timor-hybrid","tufahi","tupi","typica","typica-mejorado","udaini","villa-sarchi","villalobos","wolisho","wush-wush","yellow-bourbon","yemenia"],"species":["eugenioides","excelsa","liberica","racemosa","robusta","stenophylla"],"country":["AUS","BDI","BOL","BRA","CHN","CIV","CMR","COD","COL","CRI","CUB","DOM","ECU","ETH","GTM","HI","HND","HTI","IDN","IND","JAM","KEN","LAO","LKA","MDG","MEX","MMR","MWI","MYS","NIC","NPL","PAN","PER","PHL","PNG","PRI","RWA","SAU","SDS","SLE","SLV","THA","TLS","TWN","TZA","UGA","VEN","VNM","YEM","ZMB","ZWE"],"region":["acatenango","aceh","amazonas","antigua","antioquia","apaneca","araku","arusha","atitlan","ayacucho","bali","bench-maji","blue-mountain","bolaven","boquete","brunca","bugisu","cajamarca","caldas","caranavi","carmo-de-minas","cauca","cerrado","chalatenango","chapada","chiang-rai","chiapas","chiriqui","coban","comayagua","copan","cundinamarca","cusco","eje-cafetero","el-paraiso","embu","ermera","espirito-santo","flores","fraijanes","galapagos","guji","haraz","harrar","hayma","highlands","huanuco","huehuetenango","huila","huye","intibuca","ituri","java","jimma","jinotega","junin","kaffa","karnataka","karongi","kau","kauai","kayanza","kerala","kiambu","kilimanjaro","kirinyaga","kirundo","kisii","kivu","kona","lam-dong","limu","loja","magdalena","malabar","mantiqueira","marcala","matagalpa","matari","matas-de-minas","maui","mbeya","mbinga","meru","minas-gerais","mogiana","montecillos","muranga","muyinga","narino","ngozi","norte-de-santander","nueva-segovia","nuevo-oriente","nyamasheke","nyeri","oaxaca","opalaca","orosi","papua","pasco","pichincha","piura","puebla","puno","quindio","renacimiento","risaralda","rondonia","rulindo","rusizi","rwenzori","san-marcos","san-martin","sanani","santa-ana","santa-barbara","santander","sidama","sierra-nevada","sul-de-minas","sulawesi","sumatra","tarrazu","tolima","tres-rios","turrialba","valle-del-cauca","veracruz","volcan","west-nile","west-valley","wollega","yirgacheffe","yungas","yunnan","zamora-chinchipe"],"place":["acevedo","adola","agaro","bensa","bruselas","bulehora","chanchamayo","chire","coatepec","gedeb","hambela","inza","jaen","kercha","kochere","laconvencion","lintong","mandheling","mocha","nensebo","oxapampa","pitalito","sandia","sanignacio","satipo","shakiso","uraga","urrao","wenago"],"process":["anaerobic","carbonic","co-ferment","cold-ferment","extended","fermentation","honey","kenyan-soak","koji","lactic","mechanical","monsooned","mossto","natural","patio","raised-beds","slow-dry","thermal-shock","washed","wet-hulled","yeast"],"decaf":["co2","decaf","mountain-water","solvent","sugarcane","swiss-water"]}'::jsonb $learnids$;
-- end of learn ids
create or replace function internal.learn_ok(j jsonb) returns jsonb language plpgsql immutable as $$
declare ids jsonb := internal.learn_ids(); v jsonb; o jsonb; p jsonb; k jsonb; keep jsonb := '{}'::jsonb; f text;
begin
  if j is null or jsonb_typeof(j) <> 'object' or octet_length(j::text) > 2000 then return null; end if;
  v := coalesce(j->'variety', '[]'::jsonb); o := coalesce(j->'origin', '{}'::jsonb); p := coalesce(j->'process', '{}'::jsonb);
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 8 or jsonb_typeof(o) <> 'object' or jsonb_typeof(p) <> 'object' then return null; end if;
  if exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or not (ids->'variety') ? (x #>> '{}')) then return null; end if;
  if jsonb_typeof(coalesce(o->'countries', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(o->'countries', '[]'::jsonb)) > 8
     or exists (select 1 from jsonb_array_elements(coalesce(o->'countries', '[]'::jsonb)) x where jsonb_typeof(x) <> 'string' or not (ids->'country') ? (x #>> '{}'))
     or (o ? 'region' and jsonb_typeof(o->'region') <> 'null' and not (ids->'region') ? (o->>'region'))
     or (o ? 'place' and jsonb_typeof(o->'place') <> 'null' and not (ids->'place') ? (o->>'place')) then return null; end if;
  if (p ? 'base' and jsonb_typeof(p->'base') <> 'null' and coalesce(p->>'base', '') not in ('washed', 'natural', 'honey', 'wet-hulled'))
     or jsonb_typeof(coalesce(p->'layers', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'layers', '[]'::jsonb)) > 8
     or exists (select 1 from jsonb_array_elements(coalesce(p->'layers', '[]'::jsonb)) x where jsonb_typeof(x) <> 'string' or not (ids->'process') ? (x #>> '{}'))
     or (p ? 'decaf' and jsonb_typeof(p->'decaf') <> 'null' and not (ids->'decaf') ? (p->>'decaf')) then return null; end if;
  if j ? 'species' and jsonb_typeof(j->'species') <> 'null' and not (ids->'species') ? (j->>'species') then return null; end if;
  k := j->'keep';
  if k is not null and jsonb_typeof(k) = 'object' then
    foreach f in array array['variety', 'origin', 'process'] loop
      if jsonb_typeof(k->f) = 'string' then keep := keep || jsonb_build_object(f, left(k->>f, 80)); end if;
    end loop;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'v', case when (j->>'v') ~ '^\d{1,3}$' then (j->>'v')::int end,
    'variety', v,
    'species', case when jsonb_typeof(j->'species') = 'string' then j->'species' end,
    'origin', jsonb_strip_nulls(jsonb_build_object('countries', coalesce(o->'countries', '[]'::jsonb), 'region', case when jsonb_typeof(o->'region') = 'string' then o->'region' end,
                                                   'place', case when jsonb_typeof(o->'place') = 'string' then o->'place' end, 'blend', coalesce(o->>'blend', 'false') = 'true')),
    'process', jsonb_strip_nulls(jsonb_build_object('base', case when jsonb_typeof(p->'base') = 'string' then p->'base' end, 'layers', coalesce(p->'layers', '[]'::jsonb),
                                                    'decaf', case when jsonb_typeof(p->'decaf') = 'string' then p->'decaf' end, 'added', coalesce(p->>'added', 'false') = 'true')),
    'keep', case when keep <> '{}'::jsonb then keep end));
end $$;
-- the tags to keep on a save: sent ones (checked), else the old ones if the bag's words didn't change, else only the
-- person's "Keep as typed" answers (the words changed under an older app: the backfill tags it again)
create or replace function internal.learn_on_save(old coffees, ev jsonb) returns jsonb language sql immutable as $$
  select case
    when coalesce(ev->>'kind', '') = 'tea' or ev->>'teaType' is not null and ev->>'teaType' <> '' then null
    when ev ? 'learn' then internal.learn_ok(ev->'learn')
    when old.id is null then null
    when nullif(btrim(ev->>'origin'), '') is not distinct from old.origin and nullif(btrim(ev->>'process'), '') is not distinct from old.process
         and nullif(btrim(ev->>'variety'), '') is not distinct from old.variety then old.learn
    when old.learn ? 'keep' then jsonb_build_object('keep', old.learn->'keep')
    else null end;
$$;

-- Learn's numbers for kinds of coffee. wants: up to 8 objects, each naming any of variety, species, country, process
-- (all must match: {"variety": "caturra", "country": "COL"} is Colombian Caturras). For each, the sessions the caller
-- may open (it runs as the caller, so the sessions row rule decides; their own included), on coffees tagged that kind.
-- Country means single-origin coffees only. A unit is one person × one coffee; "dialed" keeps each unit's better half
-- by rating. Averages go unit, then person, then everyone, so no one person or bag decides. Grind is never read.
create or replace function learn_community(wants jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); w jsonb; out jsonb := '[]'::jsonb; r jsonb;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  if jsonb_typeof(wants) <> 'array' or jsonb_array_length(wants) = 0 or jsonb_array_length(wants) > 8 then raise exception 'Ask for 1 to 8 kinds.' using errcode = '22023'; end if;
  for w in select x from jsonb_array_elements(wants) x loop
    if jsonb_typeof(w) <> 'object' or not (w ?| array['variety', 'species', 'country', 'process']) then out := out || jsonb_build_array(null); continue; end if;
    with pool as (
      select s.id, s.owner_id, internal.coffee_key(k.name) || '|' || internal.coffee_key(coalesce(k.roaster_text, '')) as ckey,
             k.legacy_id as cid, k.owner_id as cowner, k.name as cname, coalesce(k.roaster_text, '') as croaster,
             lower(btrim(coalesce(s.method, ''))) as method, coalesce(s.rating, 0) as rating, s.dose, s.yield, s.time_s, s.taste, coalesce(s.tasted, '{}') as tasted,
             s.extras->>'flavors' as flv, s.flavor_notes as fnotes, s.brewed_at
      from sessions s join coffees k on k.id = s.coffee_id
      where s.deleted_at is null and k.deleted_at is null and k.kind = 'coffee' and k.learn is not null
        and (s.owner_id = me_id or not internal.unseen('session', s.id))
        and (not w ? 'variety' or (k.learn->'variety') ? (w->>'variety'))
        and (not w ? 'species' or k.learn->>'species' = w->>'species')
        and (not w ? 'country' or (k.learn->'origin'->'countries' = jsonb_build_array(w->>'country') and coalesce(k.learn->'origin'->>'blend', 'false') <> 'true'))
        and (not w ? 'process' or k.learn->'process'->>'base' = w->>'process' or (k.learn->'process'->'layers') ? (w->>'process'))
    ), ranked as (
      select p.*, row_number() over (partition by owner_id, ckey order by rating desc, brewed_at desc, id) as rn,
             count(*) over (partition by owner_id, ckey) as un from pool p
    ), views as (
      select 'all' as view, r.* from ranked r union all select 'dialed', r.* from ranked r where rn <= greatest(1, ceil(un / 2.0))
    ), sliders as (
      select v.view, v.owner_id, v.ckey, t.key, internal.try_num(v.taste->>t.key) as val
      from views v, unnest(array['acidity', 'sweetness', 'body', 'finish', 'bitterness', 'balance']) t(key)
      where internal.try_num(v.taste->>t.key) between 1 and 10
        and (t.key = any(v.tasted) or (cardinality(v.tasted) = 0 and internal.try_num(v.taste->>t.key) <> 5))
    ), slider_unit as (select view, key, owner_id, ckey, avg(val) a from sliders group by 1, 2, 3, 4),
       slider_person as (select view, key, owner_id, avg(a) a from slider_unit group by 1, 2, 3),
       slider_all as (select view, key, round(avg(a), 1) v, count(*) people from slider_person group by 1, 2),
       rating_unit as (select view, owner_id, ckey, avg(rating) a from views where rating > 0 group by 1, 2, 3),
       rating_person as (select view, owner_id, avg(a) a from rating_unit group by 1, 2),
       rating_all as (select view, round(avg(a), 1) v, count(*) people from rating_person group by 1),
       notes_unit as (
         select distinct v.view, v.owner_id, v.ckey, lower(btrim(n)) as note
         from views v, lateral (select unnest(string_to_array(coalesce(v.flv, ''), ',')) union
                                select jsonb_object_keys(case when jsonb_typeof(v.fnotes) = 'object' then v.fnotes else '{}'::jsonb end)) f(n)
         where btrim(n) <> ''),
       notes_top as (select view, note, count(*) c from notes_unit group by 1, 2),
       counts as (select view, count(*) sessions, count(distinct owner_id) people, count(distinct ckey) coffees, count(distinct (owner_id, ckey)) units from views group by 1),
       brew as (
         select method, count(*) n, count(distinct owner_id) people,
                percentile_cont(0.5) within group (order by yield / dose) as ratio,
                percentile_cont(0.5) within group (order by time_s) filter (where case method
                     when 'espresso' then time_s between 10 and 90 when 'pour over' then time_s between 60 and 600 when 'french press' then time_s between 120 and 900
                     when 'aeropress' then time_s between 30 and 360 when 'moka pot' then time_s between 60 and 600 when 'cold brew' then time_s between 4 and 48 else false end) as t,
                percentile_cont(0.5) within group (order by dose) as dose
         from ranked
         where rating >= 4 and dose > 5 and yield > 0 and case method
               when 'espresso' then yield / dose between 1 and 5 and dose between 5 and 30
               when 'pour over' then yield / dose between 10 and 22 and dose between 5 and 60
               when 'french press' then yield / dose between 8 and 20 and dose between 5 and 80
               when 'aeropress' then yield / dose between 4 and 20 and dose between 5 and 40
               when 'moka pot' then yield / dose between 4 and 12 and dose between 5 and 40
               when 'cold brew' then yield / dose between 3 and 20 and dose between 10 and 300 else false end
         group by method),
       per_person as (select owner_id, count(*) n from ranked group by 1),
       coffees_list as (
         select ckey, max(cname) cname, max(croaster) croaster, count(*) n, count(distinct owner_id) people,
                round(avg(rating) filter (where rating > 0), 1) avg,
                coalesce(max(cid) filter (where cowner = me_id), max(cid)) cid
         from ranked group by ckey)
    select jsonb_build_object(
      'want', w,
      'views', coalesce((select jsonb_object_agg(c.view, jsonb_build_object(
          'sessions', c.sessions, 'people', c.people, 'coffees', c.coffees, 'units', c.units,
          'rating', (select jsonb_build_object('v', ra.v, 'people', ra.people) from rating_all ra where ra.view = c.view),
          'taste', coalesce((select jsonb_object_agg(sa.key, jsonb_build_object('v', sa.v, 'people', sa.people)) from slider_all sa where sa.view = c.view), '{}'::jsonb),
          'notes', coalesce((select jsonb_agg(jsonb_build_array(nt.note, nt.c) order by nt.c desc, nt.note) from (select * from notes_top x where x.view = c.view order by c desc, note limit 15) nt), '[]'::jsonb)))
        from counts c), '{}'::jsonb),
      'brew', coalesce((select jsonb_agg(jsonb_build_object('method', b.method, 'n', b.n, 'people', b.people, 'ratio', round(b.ratio::numeric, 1), 'time', round(b.t::numeric), 'dose', round(b.dose::numeric, 1)) order by b.n desc, b.method) from brew b), '[]'::jsonb),
      'names', coalesce((select jsonb_agg(jsonb_build_object('name', case when pp.owner_id = me_id then null else internal.name_of(pp.owner_id) end, 'me', pp.owner_id = me_id, 'n', pp.n) order by pp.n desc)
                         from per_person pp where pp.owner_id = me_id or private.is_friend(me_id, pp.owner_id)), '[]'::jsonb),
      'others', coalesce((select jsonb_build_object('people', count(*), 'n', sum(pp.n)) from per_person pp where pp.owner_id <> me_id and not private.is_friend(me_id, pp.owner_id)), '{}'::jsonb),
      'coffees', coalesce((select jsonb_agg(jsonb_build_object('id', cl.cid, 'name', cl.cname, 'roaster', cl.croaster, 'n', cl.n, 'people', cl.people, 'avg', cl.avg) order by cl.n desc, cl.cname) from (select * from coffees_list order by n desc, cname limit 40) cl), '[]'::jsonb))
      into r;
    out := out || jsonb_build_array(r);
  end loop;
  return out;
end $$;

-- Learn's home and lists: how many sessions, people and coffees each kind has, from the sessions the caller may open.
-- Countries count single-origin coffees only.
create or replace function learn_overview() returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me();
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  return (with pool as (
      select s.owner_id, internal.coffee_key(k.name) || '|' || internal.coffee_key(coalesce(k.roaster_text, '')) as ckey, k.learn
      from sessions s join coffees k on k.id = s.coffee_id
      where s.deleted_at is null and k.deleted_at is null and k.kind = 'coffee' and k.learn is not null
        and (s.owner_id = me_id or not internal.unseen('session', s.id))
    ), tags as (
      select 'variety' as kind, x as id, owner_id, ckey from pool, jsonb_array_elements_text(coalesce(learn->'variety', '[]'::jsonb)) x
      union all select 'species', learn->>'species', owner_id, ckey from pool where learn->>'species' is not null
      union all select 'origin', learn->'origin'->'countries'->>0, owner_id, ckey from pool
        where jsonb_array_length(coalesce(learn->'origin'->'countries', '[]'::jsonb)) = 1 and coalesce(learn->'origin'->>'blend', 'false') <> 'true'
      union all select 'process', learn->'process'->>'base', owner_id, ckey from pool where learn->'process'->>'base' is not null
      union all select 'process', x, owner_id, ckey from pool, jsonb_array_elements_text(coalesce(learn->'process'->'layers', '[]'::jsonb)) x
    ), agg as (select kind, id, count(*) sessions, count(distinct owner_id) people, count(distinct ckey) coffees from tags group by 1, 2)
    select jsonb_build_object('kinds', coalesce(jsonb_object_agg(kind || ':' || id, jsonb_build_array(sessions, people, coffees)), '{}'::jsonb)) from agg);
end $$;

-- push_event and friends run as the signed-in person (so the row rules apply to every write) and use the helpers in
-- "internal", so signed-in people need them; the app's web address doesn't serve that schema, so they can't be called
-- directly.
grant usage on schema internal to authenticated;
grant execute on all functions in schema internal to authenticated;
-- only signed-in people can call these (Postgres lets everyone run a new function unless told otherwise)
revoke execute on function pull_events(), push_event(jsonb), claim_name(text), create_profile(text, text), my_profile(), set_private(boolean), community_feed(timestamptz, int, text, text, uuid), discover_feed(timestamptz, int, int, text, text, boolean), coffee_community(text, text, timestamptz, int), monthly_highlights(date), report_item(text, text, text),
  profile_page(text, timestamptz, int), suggest_people(int), review_reports(), resolve_report(text, uuid, text),
  push_key(), push_ready(), save_push(jsonb), remove_push(text),
  follow(text), unfollow(text), answer_follow(text, boolean), block(text), unblock(text), my_people(), find_people(text),
  create_group(text, boolean), join_group(text), leave_group(uuid), new_invite(uuid), remove_member(uuid, text), set_member_role(uuid, text, text), my_groups(), find_groups(text),
  my_notifications(int), mark_notifications_read(bigint), report(text, uuid, text), export_my_data(), delete_account(text), community_goal(text), data_version(),
  coffee_catalog(text, int), set_avatar(text), faces(jsonb), set_crema(int), report_bug(text, jsonb), review_bugs(int), close_bug(uuid, boolean), my_notification_prefs(), set_notification_pref(text, boolean),
  my_shots(int), post_shot(uuid), shot_later(uuid), dismiss_shot(uuid), shot_for_session(text), learn_community(jsonb), learn_overview() from public, anon;
grant execute on function pull_events(), push_event(jsonb), claim_name(text), create_profile(text, text), my_profile(), set_private(boolean), community_feed(timestamptz, int, text, text, uuid), discover_feed(timestamptz, int, int, text, text, boolean), coffee_community(text, text, timestamptz, int), monthly_highlights(date), report_item(text, text, text),
  profile_page(text, timestamptz, int), suggest_people(int), review_reports(), resolve_report(text, uuid, text),
  push_key(), push_ready(), save_push(jsonb), remove_push(text),
  follow(text), unfollow(text), answer_follow(text, boolean), block(text), unblock(text), my_people(), find_people(text),
  create_group(text, boolean), join_group(text), leave_group(uuid), new_invite(uuid), remove_member(uuid, text), set_member_role(uuid, text, text), my_groups(), find_groups(text),
  my_notifications(int), mark_notifications_read(bigint), report(text, uuid, text), export_my_data(), delete_account(text), community_goal(text), data_version(),
  coffee_catalog(text, int), set_avatar(text), faces(jsonb), set_crema(int), report_bug(text, jsonb), review_bugs(int), close_bug(uuid, boolean), my_notification_prefs(), set_notification_pref(text, boolean),
  my_shots(int), post_shot(uuid), shot_later(uuid), dismiss_shot(uuid), shot_for_session(text), learn_community(jsonb), learn_overview() to authenticated;
revoke execute on all functions in schema internal from public, anon;
revoke execute on function internal.push_payload(bigint, text), internal.push_text(notifications) from authenticated;   -- the sender's alone (it has the phones' addresses and the VAPID key)
-- v16.9: the machine functions' alone (they take a machine's token and act as its owner), and making machines
revoke execute on function internal.shot_inbox(text, jsonb), internal.machine_sync(text), internal.machine_for(text), internal.add_machine(uuid, text), internal.shot_post(uuid) from authenticated;
