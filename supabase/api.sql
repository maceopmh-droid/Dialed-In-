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
  return jsonb_build_object('id', p.id, 'name', p.display_name, 'handle', p.handle);
end $$;

-- the signed-in person's profile, or null when they haven't claimed a name or made one yet
create or replace function my_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'name', coalesce(p.legacy_name, p.display_name), 'handle', p.handle) from profiles p where p.auth_id = auth.uid();
$$;

-- the parts of other people's gear their profile shows: favorite coffees and roaster choices (their merges and "not the
-- same" apply to everyone's roaster pages; favorite roasters and roaster details show there too). Recipes and last
-- setups stay private, so this reads profile_gear past its owner-only rule and returns only these columns.
create or replace function internal.public_gear(viewer uuid) returns table (profile_id uuid, fab_four jsonb, roasters jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.profile_id, coalesce(g.favorites->'fabFour', '[]'::jsonb), coalesce(g.roaster_prefs, '{}'::jsonb), g.updated_at
  from profile_gear g where g.profile_id <> viewer and not blocked_either(viewer, g.profile_id);
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
  where c.deleted_at is null and ((cof is not null and c.coffee_id = cof) or (ses is not null and c.session_id = ses));
$$;

create or replace function pull_events() returns jsonb
language plpgsql stable set search_path = public as $$
declare me_id uuid := me(); out jsonb;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;

  -- coffees
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'type', 'bean', 'id', coalesce(k.legacy_id, k.id::text),
      'user', internal.name_of(k.owner_id), 'owner', internal.name_of(k.owner_id),
      'actor', internal.name_of(k.owner_id), 'actorColor', internal.color_of(k.owner_id),
      'roaster', coalesce(k.roaster_text, r.name, ''), 'name', k.name, 'origin', coalesce(k.origin, ''), 'process', coalesce(k.process, ''),
      'variety', coalesce(k.variety, ''), 'roast', coalesce(k.roast, ''), 'roastDate', coalesce(k.roast_date::text, ''),
      'date', k.created_at, 'eventAt', k.updated_at,
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at) from coffee_likes l where l.coffee_id = k.id), '[]'::jsonb),
      'comments', internal.comments_json(k.id, null),
      'wantToTry', coalesce((select jsonb_agg(internal.name_of(w.owner_id) order by w.added_at) from want_to_try w where w.coffee_id = k.id), '[]'::jsonb)
    ))), '[]'::jsonb) into out
  from coffees k left join roasters r on r.id = k.roaster_id
  where k.deleted_at is null;

  -- sessions (notes and photos only when their own toggle lets you see them; the row rules handle that)
  out := out || coalesce((select jsonb_agg(coalesce(s.extras, '{}'::jsonb) || coalesce(s.taste, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
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
      'date', s.brewed_at, 'eventAt', s.updated_at, 'audience', s.audience, 'noteAudience', n.audience, 'photoAudience', p.audience
    )))
  from sessions s left join coffees k on k.id = s.coffee_id
       left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id
  where s.deleted_at is null), '[]'::jsonb);

  -- your gear in full
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'gear', 'id', 'gear-' || internal.name_of(me_id),
      'user', internal.name_of(me_id), 'owner', internal.name_of(me_id), 'actor', internal.name_of(me_id),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'type', e.type) order by e.sort_order, e.created_at)
                         from equipment e where e.owner_id = me_id), '[]'::jsonb),
      'lastByMethod', coalesce(g.last_by_method, '{}'::jsonb), 'recipes', coalesce(g.recipes, '[]'::jsonb), 'fabFour', coalesce(g.favorites->'fabFour', '[]'::jsonb),
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
    left join internal.public_gear(me_id) pg on pg.profile_id = o.pid), '[]'::jsonb);

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

-- ---------------------------------------------------------------- has anything changed? data_version()
-- A number that goes up whenever anything the app shows is written. The app asks for it (a few bytes) every sync and
-- only pulls everything again when it moved, instead of downloading every coffee and session every 30 seconds.
insert into backend_state (key, value) values ('data_version', '1') on conflict (key) do nothing;
create or replace function internal.bump_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update backend_state set value = (value::bigint + 1)::text, updated_at = now() where key = 'data_version';
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles', 'follows', 'blocks', 'groups', 'group_members', 'roasters', 'coffees', 'sessions', 'session_notes', 'session_photos',
                           'likes', 'comments', 'comment_likes', 'coffee_likes', 'equipment', 'want_to_try', 'profile_gear', 'flavors'] loop
    execute format('drop trigger if exists bump_version on %I', t);
    execute format('create trigger bump_version after insert or update or delete or truncate on %I for each statement execute function internal.bump_version()', t);
  end loop;
end $$;
create or replace function data_version() returns bigint
language sql stable security definer set search_path = public as $$ select value::bigint from backend_state where key = 'data_version'; $$;

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
      insert into comments (legacy_ref, session_id, coffee_id, author_id, parent_id, body, audience, created_at)
      values (ref, case when kind = 'session' then target end, case when kind = 'coffee' then target end, me_id,
              (select id from comments where legacy_ref = rec || '#' || nullif(c->>'parentId', '')),
              coalesce(nullif(left(c->>'text', 2000), ''), '…'), coalesce(internal.item_aud(c->>'audience'), 'friends'), coalesce(internal.try_ts(c->>'timestamp'), now()))
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
       'rating', 'likes', 'comments', 'photo', 'equipment', 'equipmentSnapshot', 'eventAt', 'commentMeta', 'tasted', 'flavorNotes', 'audience', 'noteAudience', 'photoAudience', 'helpWanted', 'baseAt'],
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
    insert into sessions (legacy_id, owner_id, coffee_id, audience, method, grind, dose, yield, time_s, rating, taste, tasted, flavor_notes, extras, equipment, master, brewed_at)
    values (ev->>'id', me_id, cof, coalesce(internal.aud(ev->>'audience'), 'friends'), nullif(btrim(ev->>'method'), ''), nullif(btrim(ev->>'grind'), ''),
            internal.try_num(ev->>'dose'), internal.try_num(ev->>'yield'), internal.try_num(ev->>'time'), internal.rating(ev->>'rating'),
            f->'taste', array(select jsonb_array_elements_text(case when jsonb_typeof(ev->'tasted') = 'array' then ev->'tasted' else '[]'::jsonb end)),
            case when jsonb_typeof(ev->'flavorNotes') = 'object' then ev->'flavorNotes' end, ex, f->'equipment', f->'master',
            coalesce(internal.try_ts(ev->>'date'), now()))
    returning * into s;
  elsif s.deleted_at is not null then return;
  elsif s.owner_id = me_id then
    update sessions set coffee_id = cof, audience = coalesce(internal.aud(ev->>'audience'), audience), method = nullif(btrim(ev->>'method'), ''), grind = nullif(btrim(ev->>'grind'), ''),
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
          jsonb_build_object('fabFour', coalesce(case when jsonb_typeof(ev->'fabFour') = 'array' then ev->'fabFour' end, '[]'::jsonb)), now())
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
  where lower(coalesce(p.legacy_name, p.display_name)) = lower(btrim(coalesce(nm, ''))) and p.id <> viewer and not blocked_either(viewer, p.id)
  limit 1;
$$;

create or replace function follow(name text) returns text   -- 'following' or 'requested'
language plpgsql set search_path = public as $$
declare me_id uuid := me(); them uuid; st text;
begin
  if me_id is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  them := internal.profile_by_name(follow.name, me_id);
  if them is null then raise exception 'There''s nobody by that name.' using errcode = 'P0002'; end if;   -- blocked looks the same
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
    'following', coalesce((select jsonb_agg(jsonb_build_object('name', internal.name_of(f.followee), 'status', f.status, 'friend', is_friend(me(), f.followee)) order by internal.name_of(f.followee))
                           from follows f where f.follower = me()), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('name', internal.name_of(f.follower), 'status', f.status) order by f.status desc, internal.name_of(f.follower))
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
  if char_length(n) < 2 or char_length(n) > 60 then raise exception 'Give the group a name (2 to 60 characters).' using errcode = '22023'; end if;
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
  if exists (select 1 from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id and blocked_either(me_id, m.user_id) and m.role = 'owner') then
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
  if not found or not is_group_member(g.id, me_id) then return 'not a member'; end if;
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

create or replace function my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'open', g.is_open, 'role', m.role, 'goal', g.goal_on, 'awards', g.awards_on,
           'invite', case when m.role in ('owner', 'admin') then g.invite_code end,
           'members', (select jsonb_agg(jsonb_build_object('name', internal.name_of(x.user_id), 'role', x.role, 'countsInGoal', x.counts_in_goal) order by x.joined_at)
                       from group_members x where x.group_id = g.id)) order by g.created_at), '[]'::jsonb)
  from group_members m join groups g on g.id = m.group_id where m.user_id = me();
$$;

create or replace function find_groups(q text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'members', (select count(*) from group_members m where m.group_id = g.id),
           'joined', is_group_member(g.id, me())) order by g.name), '[]'::jsonb)
  from groups g where g.is_open and char_length(btrim(coalesce(q, ''))) >= 2 and g.name ilike '%' || btrim(q) || '%';
$$;

-- ---------------------------------------------------------------- notifications (phase 3: the database side; no screens yet)
-- Triggers write them as things happen; nothing is written while the Sheet's history is being imported, or between
-- two people where either has blocked the other.
create or replace function internal.notify(for_id uuid, by_id uuid, what text, ses uuid default null, cof uuid default null, cmt uuid default null, grp uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if for_id is null or by_id is null or for_id = by_id or coalesce(current_setting('dialed.importing', true), '') = 'on' or blocked_either(for_id, by_id) then return; end if;
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
    'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', n.id, 'kind', n.kind, 'who', internal.name_of(n.actor_id), 'at', n.created_at, 'read', n.read_at is not null,
               'session', (select coalesce(legacy_id, id::text) from sessions where id = n.session_id),
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
declare
  ws timestamptz := (date_trunc('week', now() at time zone tz)) at time zone tz;
  we timestamptz := ws + interval '7 days';
  types text[] := array['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'];
  t text; base numeric; avg_origins numeric; methods_seen int; brewers numeric;
  target int; progress int; title text; unit text; mine int;
begin
  t := types[1 + ((round(extract(epoch from ws) * 1000 / 604800000)::bigint % 6 + 6) % 6)];
  with weeks as (select i, ws - i * interval '7 days' as a, ws - (i - 1) * interval '7 days' as b from generate_series(1, 6) i),
       per as (select w.i, count(s.id) n, count(distinct coalesce(nullif(split_part(k.origin, ',', 1), ''), null)) o, count(distinct s.owner_id) p
               from weeks w left join sessions s on s.brewed_at >= w.a and s.brewed_at < w.b and s.deleted_at is null left join coffees k on k.id = s.coffee_id group by w.i)
  select coalesce((select percentile_disc(0.5) within group (order by n) from per where n > 0), 6),
         coalesce((select avg(o) from per where n > 0), 1),
         coalesce((select percentile_disc(0.5) within group (order by p) from per where n > 0), 2)
    into base, avg_origins, brewers from (select 1) x;
  select count(distinct method) into methods_seen from sessions where brewed_at >= ws - interval '42 days' and brewed_at < ws and deleted_at is null and method is not null;
  if t = 'sessions' then
    target := greatest(4, round(base * 1.15)); title := format('Brew %s sessions together', target); unit := 'sessions';
    select count(*) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null;
  elsif t = 'origins' then
    target := least(30, greatest(2, round(avg_origins + 1))); title := format('Taste %s different origins', target); unit := 'origins';
    select count(distinct lower(btrim(split_part(k.origin, ',', 1)))) into progress from sessions s join coffees k on k.id = s.coffee_id
    where s.brewed_at >= ws and s.brewed_at < we and s.deleted_at is null and coalesce(btrim(split_part(k.origin, ',', 1)), '') <> '';
  elsif t = 'rated' then
    target := greatest(3, round(base * 0.7)); title := format('Rate %s sessions', target); unit := 'rated';
    select count(*) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and coalesce(rating, 0) > 0;
  elsif t = 'notes' then
    target := greatest(3, round(base * 0.5)); title := format('Log tasting notes on %s sessions', target); unit := 'with notes';
    select count(*) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and coalesce(btrim(extras->>'flavors'), '') <> '';
  elsif t = 'everyone' then
    target := greatest(2, round(brewers * 1.1)); title := format('%s people brew this week', target); unit := 'people';
    select count(distinct owner_id) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null;
  else
    target := case when methods_seen >= 3 then 3 else 2 end; title := format('Brew with %s different methods', target); unit := 'methods';
    select count(distinct method) into progress from sessions where brewed_at >= ws and brewed_at < we and deleted_at is null and method is not null;
  end if;
  select count(*) into mine from sessions where owner_id = me() and brewed_at >= ws and brewed_at < we and deleted_at is null;
  return jsonb_build_object('type', t, 'title', title, 'target', target, 'progress', least(progress, target), 'raw', progress, 'done', progress >= target,
    'unit', unit, 'start', ws, 'end', we, 'yourSessions', mine);
end $$;

-- ---------------------------------------------------------------- reporting, your data, leaving
create or replace function report(target_type text, target_id uuid, reason text default null) returns text
language plpgsql set search_path = public as $$
begin
  if me() is null then raise exception 'Sign in and claim your name first.' using errcode = '28000'; end if;
  insert into reports (reporter_id, target_type, target_id, reason) values (me(), report.target_type, report.target_id, left(report.reason, 1000));
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

grant usage on schema internal to authenticated;
grant execute on all functions in schema internal to authenticated;
-- only signed-in people can call these (Postgres lets everyone run a new function unless told otherwise)
revoke execute on function pull_events(), push_event(jsonb), claim_name(text), create_profile(text, text), my_profile(),
  follow(text), unfollow(text), answer_follow(text, boolean), block(text), unblock(text), my_people(), find_people(text),
  create_group(text, boolean), join_group(text), leave_group(uuid), new_invite(uuid), remove_member(uuid, text), set_member_role(uuid, text, text), my_groups(), find_groups(text),
  my_notifications(int), mark_notifications_read(bigint), report(text, uuid, text), export_my_data(), delete_account(text), community_goal(text), data_version() from public, anon;
grant execute on function pull_events(), push_event(jsonb), claim_name(text), create_profile(text, text), my_profile(),
  follow(text), unfollow(text), answer_follow(text, boolean), block(text), unblock(text), my_people(), find_people(text),
  create_group(text, boolean), join_group(text), leave_group(uuid), new_invite(uuid), remove_member(uuid, text), set_member_role(uuid, text, text), my_groups(), find_groups(text),
  my_notifications(int), mark_notifications_read(bigint), report(text, uuid, text), export_my_data(), delete_account(text), community_goal(text), data_version() to authenticated;
revoke execute on all functions in schema internal from public, anon;
