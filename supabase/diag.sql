-- read only: friendships, recent comments and saves, colors (first names, counts, dates; never text people wrote)
begin read only;
select 'profiles (first name, joined, color): ' || string_agg(split_part(internal.name_of(id), ' ', 1) || ' ' || coalesce(to_char(joined_at, 'MM-DD'), '-') || ' ' || coalesce(color, 'none'), ', ' order by joined_at nulls first) from profiles;
select 'follows of ' || split_part(internal.name_of(a.id), ' ', 1) || ': ' || coalesce((select string_agg(split_part(internal.name_of(f.followee), ' ', 1) || '(' || f.status || case when private.is_friend(a.id, f.followee) then ', friend' else '' end || ')', ', ')
  from follows f where f.follower = a.id), 'none')
from profiles a where split_part(internal.name_of(a.id), ' ', 1) in ('Maceo', 'Aidan', 'Julian', 'Yihuan', 'Maceo2', 'Bella') order by 1;
select 'comments since Oct 15: ' || count(*) from comments where created_at > '2026-10-15';
select 'comment ' || to_char(c.created_at, 'MM-DD HH24:MI') || ' by ' || split_part(internal.name_of(c.author_id), ' ', 1) || ' on '
       || coalesce(split_part(internal.name_of(s.owner_id), ' ', 1) || '''s session (' || s.audience || case when s.help_wanted then ', help' else '' end || ')', 'a coffee') || ', audience ' || c.audience
       || case when c.deleted_at is not null then ' [deleted]' else '' end
from comments c left join sessions s on s.id = c.session_id where c.created_at > '2026-10-15' order by c.created_at;
select 'comment saves counted by the rate limit since Oct 15: ' || coalesce((select string_agg(x, ', ') from (select split_part(internal.name_of(r.profile_id), ' ', 1) || ' ' || count(*) as x from internal.rate_log r where r.kind = 'comment' and r.at > '2026-10-15' group by r.profile_id) q), 'none');
select 'sessions without an app id (the app can''t comment on them): ' || count(*) from sessions where legacy_id is null and deleted_at is null;
select 'sessions made since Oct 15 by ' || split_part(internal.name_of(s.owner_id), ' ', 1) || ': ' || count(*) || ' (' || string_agg(distinct s.audience::text, '/') || ')' from sessions s where s.created_at > '2026-10-15' group by s.owner_id order by 1;
select 'rate log by kind since Oct 15: ' || coalesce((select string_agg(kind || ' ' || n || ' (last ' || last || ')', ', ') from (select kind, count(*) n, to_char(max(at), 'MM-DD HH24:MI') last from internal.rate_log where at > '2026-10-15' group by kind) q), 'none');
select 'latest session saves: ' || coalesce((select string_agg(x, ', ') from (select split_part(internal.name_of(owner_id), ' ', 1) || ' ' || to_char(max(updated_at), 'MM-DD HH24:MI') x from sessions group by owner_id order by max(updated_at) desc limit 6) q), 'none');
select 'notifications since Oct 16 by kind: ' || coalesce((select string_agg(kind || ' ' || n || ' (last ' || last || ')', ', ') from (select kind, count(*) n, to_char(max(created_at), 'MM-DD HH24:MI') last from notifications where created_at > '2026-10-16' group by kind) q), 'none');
select 'push set up: url ' || (exists (select 1 from backend_state where key = 'push_url'))::text || ', pg_net ' || (exists (select 1 from pg_extension where extname = 'pg_net'))::text || ', phones ' || (select count(*) from push_subscriptions);
select 'rate_hit owner ' || proowner::regrole::text || ' definer ' || prosecdef::text from pg_proc where proname = 'rate_hit';
select 'now ' || to_char(now(), 'MM-DD HH24:MI TZ');
commit;
