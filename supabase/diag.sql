-- read only: App Review's sample account is still there with its sample data (counts and a first name only)
select 'review sign-in account exists: ' || exists(select 1 from auth.users where lower(email) = 'appreview' || '@dialed-in.app');
select 'its profile: ' || coalesce((select split_part(internal.name_of(p.id), ' ', 1) from profiles p join auth.users u on u.id = p.auth_id where lower(u.email) = 'appreview' || '@dialed-in.app'), 'none');
select 'its coffees: ' || count(*) from coffees k join profiles p on p.id = k.owner_id join auth.users u on u.id = p.auth_id where lower(u.email) = 'appreview' || '@dialed-in.app' and k.deleted_at is null;
select 'its sessions: ' || count(*) from sessions s join profiles p on p.id = s.owner_id join auth.users u on u.id = p.auth_id where lower(u.email) = 'appreview' || '@dialed-in.app' and s.deleted_at is null;
select 'its last sign-in: ' || coalesce(to_char((select last_sign_in_at from auth.users where lower(email) = 'appreview' || '@dialed-in.app') at time zone 'America/Chicago', 'MM-DD HH24:MI'), 'never');
