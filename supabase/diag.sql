-- read only: photo paths the app asks links for (counts only)
begin read only;
select 'session photos in storage: ' || count(*) || ', with unusual characters: ' || count(*) filter (where substr(p.path, 4) !~ '^[A-Za-z0-9/_.-]+$')
       || ', with no file in storage: ' || count(*) filter (where not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = substr(p.path, 4)))
       || ', in a folder that isn''t the owner''s: ' || count(*) filter (where split_part(substr(p.path, 4), '/', 1) <> coalesce((select auth_id::text from profiles pr join sessions s on s.owner_id = pr.id where s.id = p.session_id), '?'))
from session_photos p where p.path like 'sb:%';
select 'longest photo path: ' || max(length(path)) from session_photos where path like 'sb:%';
commit;
