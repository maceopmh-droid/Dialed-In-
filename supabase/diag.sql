-- read only: the sync's speed after v18.3, and that it still carries the comments (times, counts, first names only)
\timing on
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Julian' limit 1), 'role', 'authenticated')::text, true) is not null as ok \gset
set local role authenticated;
select 'Julian pull';
select octet_length(pull_events()::text);
select 'Julian pull again';
select octet_length(pull_events()::text);
select 'Julian''s sync: comments since Oct 26 by ' || u || ': ' || n from (select coalesce(c->>'user', '?') u, count(*) n
from (select pull_events() as j) pe, jsonb_array_elements(j) e, jsonb_array_elements(case when jsonb_typeof(e->'comments') = 'array' then e->'comments' else '[]'::jsonb end) c
where (c->>'timestamp')::timestamptz > '2026-10-26' group by 1) q order by 1;
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
