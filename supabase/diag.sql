-- read only: why a comment that sent a notification isn't seen (first names, counts, times; never text people wrote)
begin read only;
select 'now ' || to_char(now() at time zone 'America/Chicago', 'MM-DD HH24:MI') || ' Chicago';
select 'new comments saved (rate log) since Oct 26 by ' || split_part(internal.name_of(r.profile_id), ' ', 1) || ': ' || count(*) || ', last '
       || to_char(max(r.at) at time zone 'America/Chicago', 'MM-DD HH24:MI')
from internal.rate_log r where r.kind = 'comment' and r.at > '2026-10-26' group by r.profile_id order by 1;
select 'comment rows now, written since Oct 26 by ' || split_part(internal.name_of(c.author_id), ' ', 1) || ': ' || count(*) || ' (deleted ' || count(c.deleted_at) || ')'
from comments c where c.created_at > '2026-10-26' group by c.author_id order by 1;
select 'comment/reply notifications since Oct 26: ' || coalesce((select string_agg(x, ', ') from (
  select split_part(internal.name_of(n.actor_id), ' ', 1) || '->' || split_part(internal.name_of(n.user_id), ' ', 1) || ' ' || n.kind || ' ' || count(*)
         || ' (last ' || to_char(max(n.created_at) at time zone 'America/Chicago', 'MM-DD HH24:MI') || ')' x
  from notifications n where n.kind in ('comment', 'reply') and n.created_at > '2026-10-26' group by n.actor_id, n.user_id, n.kind) q), 'none');
-- every comment since Oct 26: where it is and who the rules let see it
select 'c ' || left(c.id::text, 6) || ' ' || to_char(c.created_at at time zone 'America/Chicago', 'MM-DD HH24:MI') || ' by ' || split_part(internal.name_of(c.author_id), ' ', 1)
       || ' on ' || coalesce(split_part(internal.name_of(s.owner_id), ' ', 1) || '''s session ' || left(coalesce(s.legacy_id, '-'), 14) || ' (' || s.audience || case when s.deleted_at is not null then ', session deleted' else '' end || ')',
                             split_part(internal.name_of(k.owner_id), ' ', 1) || '''s coffee', '?')
       || ', ' || c.audience || case when c.parent_id is not null then ', reply' else '' end || case when c.deleted_at is not null then ' [deleted]' else '' end
       || ', ref ok ' || (c.legacy_ref like coalesce(s.legacy_id, k.legacy_id, '?') || '#%')::text
       || ', reports ' || (select count(*) from reports r where r.target_id = c.id)
       || ', notified ' || (select count(*) from notifications n where n.comment_id = c.id)
       || ', sees: ' || coalesce((select string_agg(split_part(internal.name_of(p.id), ' ', 1), '/' order by 1) from profiles p
                                   where split_part(internal.name_of(p.id), ' ', 1) in ('Maceo', 'Aidan', 'Julian') and private.can_see_comment(p.id, c)), 'nobody')
from comments c left join sessions s on s.id = c.session_id left join coffees k on k.id = c.coffee_id
where c.created_at > '2026-10-26' order by c.created_at;
-- latest saves of sessions that got comments since Oct 26 (owner's saves move updated_at)
select 'session ' || left(coalesce(s.legacy_id, '-'), 14) || ' of ' || split_part(internal.name_of(s.owner_id), ' ', 1) || ': updated ' || to_char(s.updated_at at time zone 'America/Chicago', 'MM-DD HH24:MI')
       || ', comments now ' || (select count(*) from comments x where x.session_id = s.id and x.deleted_at is null)
from sessions s where exists (select 1 from notifications n where n.session_id = s.id and n.kind in ('comment', 'reply') and n.created_at > '2026-10-26');
commit;
-- what each of the three gets from the app's sync (as them, read only)
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Julian' limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'Julian''s sync: comments since Oct 26 by ' || coalesce(c->>'user', '?') || ': ' || count(*)
from jsonb_array_elements(pull_events()) e, jsonb_array_elements(case when jsonb_typeof(e->'comments') = 'array' then e->'comments' else '[]'::jsonb end) c
where (c->>'timestamp')::timestamptz > '2026-10-26' group by 1 order by 1;
commit;
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Aidan' limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'Aidan''s sync: comments since Oct 26 by ' || coalesce(c->>'user', '?') || ': ' || count(*)
from jsonb_array_elements(pull_events()) e, jsonb_array_elements(case when jsonb_typeof(e->'comments') = 'array' then e->'comments' else '[]'::jsonb end) c
where (c->>'timestamp')::timestamptz > '2026-10-26' group by 1 order by 1;
commit;
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from profiles where split_part(internal.name_of(id), ' ', 1) = 'Maceo' limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'Maceo''s sync: comments since Oct 26 by ' || coalesce(c->>'user', '?') || ': ' || count(*)
from jsonb_array_elements(pull_events()) e, jsonb_array_elements(case when jsonb_typeof(e->'comments') = 'array' then e->'comments' else '[]'::jsonb end) c
where (c->>'timestamp')::timestamptz > '2026-10-26' group by 1 order by 1;
commit;
