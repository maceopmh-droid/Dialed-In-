-- read only: v18.6's server functions are in, and how fast the feeds answer (times, sizes, counts and first names only)
\timing on
select 'functions: ' || string_agg(p.proname || '(' || p.pronargs || ')', ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'internal' and p.proname in ('sessions_json', 'drop_comments', 'sync_comments', 'session_build', 'comment_build');
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Julian' limit 1), 'role', 'authenticated')::text, true) is not null as ok \g
set local role authenticated;
select 'Julian pull'; select octet_length(pull_events()::text);
select 'Julian pull again'; select octet_length(pull_events()::text);
select 'Julian community'; select jsonb_array_length(community_feed()->'events');
select 'Julian discover'; select jsonb_array_length(discover_feed(now())->'events');
select 'Julian notifications'; select jsonb_array_length(my_notifications()->'items');
select 'Julian profile(Maceo)'; select jsonb_array_length(profile_page('Maceo')->'events');
commit;
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Maceo' limit 1), 'role', 'authenticated')::text, true) is not null as ok \g
set local role authenticated;
select 'Maceo pull'; select octet_length(pull_events()::text);
select 'Maceo community'; select jsonb_array_length(community_feed()->'events');
select 'Maceo notifications'; select jsonb_array_length(my_notifications()->'items');
commit;
