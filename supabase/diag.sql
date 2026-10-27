-- read only: how long the app's sync takes on the server, and which part (counts and times only)
\timing on
begin read only;
select 'now ' || to_char(now() at time zone 'America/Chicago', 'MM-DD HH24:MI') || ' Chicago';
select 'rows: sessions ' || (select count(*) from sessions where deleted_at is null) || ', coffees ' || (select count(*) from coffees where deleted_at is null) || ', comments ' || (select count(*) from comments)
       || ', likes ' || (select count(*) from likes) || ', notes ' || (select count(*) from session_notes) || ', photos ' || (select count(*) from session_photos) || ', reports ' || (select count(*) from reports);
commit;
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Julian' limit 1), 'role', 'authenticated')::text, true) is not null as ok \gset
set local role authenticated;
select 'Julian version';
select length(data_version());
select 'Julian pull 1';
select octet_length(pull_events()::text);
select 'Julian pull 2';
select octet_length(pull_events()::text);
select 'Julian circle';
select array_length(array[me()] || (select private.my_close_ids()) || (select private.my_following_ids()), 1);
select 'Julian coffees part';
select octet_length(coalesce(jsonb_agg(internal.coffee_json(k)), '[]'::jsonb)::text) from coffees k, (select array[me()] || (select private.my_close_ids()) || (select private.my_following_ids()) c) q
  where k.deleted_at is null and (k.owner_id = any(q.c) or exists (select 1 from sessions s where s.coffee_id = k.id and s.deleted_at is null and s.owner_id = any(q.c)));
select 'Julian sessions part';
select octet_length(coalesce(jsonb_agg(internal.session_json(s)), '[]'::jsonb)::text), count(*) from sessions s, (select array[me()] || (select private.my_close_ids()) || (select private.my_following_ids()) c) q
  where s.deleted_at is null and s.owner_id = any(q.c);
select 'Julian session comments only';
select count(*), sum(jsonb_array_length(internal.comments_json(null, s.id))) from sessions s, (select array[me()] || (select private.my_close_ids()) || (select private.my_following_ids()) c) q
  where s.deleted_at is null and s.owner_id = any(q.c);
select 'Julian sessions unseen check';
select count(*) from sessions s, (select array[me()] || (select private.my_close_ids()) || (select private.my_following_ids()) c) q
  where s.deleted_at is null and s.owner_id = any(q.c) and not internal.unseen('session', s.id);
commit;
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Aidan' limit 1), 'role', 'authenticated')::text, true) is not null as ok \gset
set local role authenticated;
select 'Aidan pull';
select octet_length(pull_events()::text);
commit;
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Maceo' limit 1), 'role', 'authenticated')::text, true) is not null as ok \gset
set local role authenticated;
select 'Maceo pull';
select octet_length(pull_events()::text);
commit;
