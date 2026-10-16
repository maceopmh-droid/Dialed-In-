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

-- how the app knows people: the Sheet-era name, else the handle
create or replace function internal.name_of(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(legacy_name, handle) from profiles where id = pid;
$$;
create or replace function internal.color_of(pid uuid) returns text
language sql stable security definer set search_path = public as $$ select color from profiles where id = pid; $$;

create or replace function internal.try_ts(t text) returns timestamptz language plpgsql immutable as $$
begin if t is null or btrim(t) = '' then return null; end if; return t::timestamptz; exception when others then return null; end $$;
create or replace function internal.try_date(t text) returns date language plpgsql immutable as $$
begin if t is null or t !~ '^\d{4}-\d{2}-\d{2}' then return null; end if; return left(t, 10)::date; exception when others then return null; end $$;
create or replace function internal.try_num(t text) returns numeric language plpgsql immutable as $$
begin if t is null or btrim(t) = '' then return null; end if; return replace(btrim(t), ',', '.')::numeric; exception when others then return null; end $$;
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
  return jsonb_build_object('id', p.id, 'name', coalesce(p.legacy_name, p.handle), 'handle', p.handle);
end $$;

-- ---------------------------------------------------------------- reading: pull_events()
create or replace function internal.comments_json(cof uuid, ses uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', substr(c.legacy_ref, strpos(c.legacy_ref, '#') + 1),
      'user', internal.name_of(c.author_id),
      'text', c.body,
      'timestamp', c.created_at,
      'parentId', coalesce((select substr(p.legacy_ref, strpos(p.legacy_ref, '#') + 1) from comments p where p.id = c.parent_id), ''),
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at) from comment_likes l where l.comment_id = c.id), '[]'::jsonb)
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
                    else jsonb_build_object('url', p.path) end,
      'likes', coalesce((select jsonb_agg(internal.name_of(l.user_id) order by l.created_at) from likes l where l.session_id = s.id), '[]'::jsonb),
      'comments', internal.comments_json(null, s.id),
      'equipment', coalesce(s.equipment->'ids', '[]'::jsonb), 'equipmentSnapshot', coalesce(s.equipment->'snapshot', '[]'::jsonb),
      'isMaster', coalesce((s.master->>'isMaster')::boolean, false), 'masterProfile', s.master->'profile',
      'date', s.brewed_at, 'eventAt', s.updated_at, 'audience', s.audience
    )))
  from sessions s left join coffees k on k.id = s.coffee_id
       left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id
  where s.deleted_at is null), '[]'::jsonb);

  -- your gear in full; other people's equipment (what their profile shows)
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'gear', 'id', 'gear-' || internal.name_of(g.profile_id),
      'user', internal.name_of(g.profile_id), 'owner', internal.name_of(g.profile_id), 'actor', internal.name_of(g.profile_id),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'type', e.type) order by e.sort_order, e.created_at)
                         from equipment e where e.owner_id = g.profile_id), '[]'::jsonb),
      'lastByMethod', g.last_by_method, 'recipes', g.recipes, 'fabFour', coalesce(g.favorites->'fabFour', '[]'::jsonb), 'roasters', g.roaster_prefs,
      'date', g.updated_at, 'eventAt', g.updated_at))
    from profile_gear g), '[]'::jsonb);
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'gear', 'id', 'gear-' || internal.name_of(o.owner_id),
      'user', internal.name_of(o.owner_id), 'owner', internal.name_of(o.owner_id), 'actor', internal.name_of(o.owner_id),
      'items', o.items, 'lastByMethod', '{}'::jsonb, 'recipes', '[]'::jsonb, 'date', o.at, 'eventAt', o.at))
    from (select e.owner_id, jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'type', e.type) order by e.sort_order, e.created_at) as items, max(e.created_at) as at
          from equipment e where e.owner_id <> me_id group by e.owner_id) o), '[]'::jsonb);

  -- custom tasting notes
  out := out || coalesce((select jsonb_agg(jsonb_build_object('type', 'flavor', 'id', f.id::text, 'name', f.name, 'user', internal.name_of(f.created_by),
      'date', f.created_at, 'eventAt', f.created_at)) from flavors f), '[]'::jsonb);

  -- the shared records the app keeps: who doesn't count toward the group goal, and who's in your circle
  out := out || jsonb_build_array(jsonb_build_object('type', 'gear', 'id', 'gear-__group__', 'user', '__group__', 'owner', '__group__',
      'items', '[]'::jsonb, 'lastByMethod', '{}'::jsonb, 'date', '2026-01-01T00:00:00Z', 'eventAt', '2026-01-01T00:00:00Z',
      'goalExclude', coalesce((select jsonb_agg(distinct internal.name_of(m.user_id)) from group_members m join groups g on g.id = m.group_id
                               where not m.counts_in_goal and not g.is_open), '[]'::jsonb)));
  out := out || jsonb_build_array(jsonb_build_object('type', 'gear', 'id', 'gear-__people__', 'user', '__people__', 'owner', '__people__',
      'items', '[]'::jsonb, 'lastByMethod', '{}'::jsonb, 'date', '2026-01-01T00:00:00Z', 'eventAt', '2026-01-01T00:00:00Z', 'removed', '[]'::jsonb,
      'people', coalesce((select jsonb_agg(jsonb_build_object('name', internal.name_of(x.id), 'addedAt', x.at, 'color', internal.color_of(x.id)))
                          from (select m.user_id as id, min(m.joined_at) as at from group_members m join groups g on g.id = m.group_id where not g.is_open group by m.user_id
                                union select me_id, now()) x), '[]'::jsonb)));
  return out;
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
      insert into comments (legacy_ref, session_id, coffee_id, author_id, parent_id, body, audience, created_at)
      values (ref, case when kind = 'session' then target end, case when kind = 'coffee' then target end, me_id,
              (select id from comments where legacy_ref = rec || '#' || nullif(c->>'parentId', '')),
              coalesce(nullif(left(c->>'text', 2000), ''), '…'), 'friends', coalesce(internal.try_ts(c->>'timestamp'), now()))
      on conflict (legacy_ref) do update set body = excluded.body, parent_id = coalesce(comments.parent_id, excluded.parent_id),
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
       'rating', 'likes', 'comments', 'photo', 'equipment', 'equipmentSnapshot', 'eventAt', 'commentMeta', 'tasted', 'flavorNotes', 'audience', 'helpWanted', 'baseAt'],
    'equipment', jsonb_build_object('ids', coalesce(ev->'equipment', '[]'::jsonb), 'snapshot', coalesce(ev->'equipmentSnapshot', '[]'::jsonb)),
    'master', case when coalesce(ev->>'isMaster', 'false') = 'true' or jsonb_typeof(ev->'masterProfile') = 'object'
                   then jsonb_build_object('isMaster', coalesce(ev->>'isMaster', 'false') = 'true', 'profile', case when jsonb_typeof(ev->'masterProfile') = 'object' then ev->'masterProfile' end) end,
    'notes', coalesce(nullif(btrim(ev->>'notes'), ''), nullif(btrim(ev->>'note'), ''), nullif(btrim(ev->>'observations'), ''), nullif(btrim(ev->>'observation'), ''), nullif(btrim(ev->>'tastingNotes'), ''), ''),
    'photo', case when jsonb_typeof(ev->'photo') = 'object' and coalesce(ev->'photo'->>'fileId', '') <> '' then 'drive:' || (ev->'photo'->>'fileId')
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
    values (ev->>'id', me_id, cof, 'friends', nullif(btrim(ev->>'method'), ''), nullif(btrim(ev->>'grind'), ''),
            internal.try_num(ev->>'dose'), internal.try_num(ev->>'yield'), internal.try_num(ev->>'time'), internal.rating(ev->>'rating'),
            f->'taste', array(select jsonb_array_elements_text(case when jsonb_typeof(ev->'tasted') = 'array' then ev->'tasted' else '[]'::jsonb end)),
            case when jsonb_typeof(ev->'flavorNotes') = 'object' then ev->'flavorNotes' end, ex, f->'equipment', f->'master',
            coalesce(internal.try_ts(ev->>'date'), now()))
    returning * into s;
  elsif s.deleted_at is not null then return;
  elsif s.owner_id = me_id then
    update sessions set coffee_id = cof, method = nullif(btrim(ev->>'method'), ''), grind = nullif(btrim(ev->>'grind'), ''),
      dose = internal.try_num(ev->>'dose'), yield = internal.try_num(ev->>'yield'), time_s = internal.try_num(ev->>'time'), rating = internal.rating(ev->>'rating'),
      taste = f->'taste', tasted = array(select jsonb_array_elements_text(case when jsonb_typeof(ev->'tasted') = 'array' then ev->'tasted' else '[]'::jsonb end)),
      flavor_notes = case when jsonb_typeof(ev->'flavorNotes') = 'object' then ev->'flavorNotes' end, extras = ex, equipment = f->'equipment', master = f->'master',
      brewed_at = coalesce(internal.try_ts(ev->>'date'), brewed_at), updated_at = now()
    where id = s.id;
  end if;
  if s.owner_id = me_id then
    if f->>'notes' <> '' then insert into session_notes (session_id, body) values (s.id, f->>'notes') on conflict (session_id) do update set body = excluded.body, updated_at = now();
    else delete from session_notes where session_id = s.id; end if;
    if f->>'photo' is not null then insert into session_photos (session_id, path) values (s.id, f->>'photo') on conflict (session_id) do update set path = excluded.path;
    elsif jsonb_typeof(ev->'photo') is null or jsonb_typeof(ev->'photo') = 'null' then delete from session_photos where session_id = s.id; end if;
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
  if t = 'bean' then perform internal.push_bean(ev, me_id, me_nm);
  elsif t = 'brew' then perform internal.push_brew(ev, me_id, me_nm);
  elsif t = 'gear' then perform internal.push_gear(ev, me_id, me_nm);
  elsif t = 'delete' then perform internal.push_delete(ev, me_id);
  elsif t = 'flavor' then
    if coalesce(btrim(ev->>'name'), '') <> '' then insert into flavors (name, created_by) values (btrim(ev->>'name'), me_id) on conflict (name) do nothing; end if;
  end if;
  return jsonb_build_object('ok', true, 'type', t, 'id', ev->>'id');
end $$;

grant usage on schema internal to authenticated;
grant execute on all functions in schema internal to authenticated;
-- only signed-in people can call these (Postgres lets everyone run a new function unless told otherwise)
revoke execute on function pull_events(), push_event(jsonb), claim_name(text) from public, anon;
grant execute on function pull_events(), push_event(jsonb), claim_name(text) to authenticated;
revoke execute on all functions in schema internal from public, anon;
