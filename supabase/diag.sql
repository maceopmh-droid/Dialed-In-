-- read only: communities, members, friendships (first names, counts, dates)
begin read only;
select 'groups: ' || count(*) || ' (' || count(*) filter (where is_open) || ' open)' from groups;
select 'group ' || left(g.id::text, 8) || case when g.id::text = (select value from backend_state where key = 'history_group') then ' [history]' else '' end
       || ' open=' || g.is_open || ' made ' || to_char(g.created_at, 'YYYY-MM-DD HH24:MI') || ' by ' || coalesce(split_part(internal.name_of(g.owner_id), ' ', 1), '?')
       || ' members: ' || coalesce((select string_agg(split_part(internal.name_of(m.user_id), ' ', 1) || '(' || m.role || ')', ', ' order by m.joined_at) from group_members m where m.group_id = g.id), 'none')
from groups g order by g.created_at;
select 'history_group set: ' || coalesce((select 'yes' from backend_state where key = 'history_group'), 'no');
select 'profiles: ' || string_agg(split_part(display_name, ' ', 1) || ' (joined ' || to_char(joined_at, 'MM-DD') || ', color ' || coalesce(color, 'none') || ')', ', ' order by joined_at) from profiles;
select 'mutual friends of ' || split_part(a.display_name, ' ', 1) || ': ' || coalesce((select string_agg(split_part(b.display_name, ' ', 1), ', ') from profiles b
  where exists (select 1 from follows f1 where f1.follower_id = a.id and f1.followee_id = b.id and f1.status = 'accepted')
    and exists (select 1 from follows f2 where f2.follower_id = b.id and f2.followee_id = a.id and f2.status = 'accepted')), 'none')
from profiles a where a.handle <> 'appreview' order by a.joined_at;
commit;
