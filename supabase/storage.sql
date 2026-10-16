-- Dialed In: session photos in Supabase storage. Load after schema.sql and api.sql.
--
-- One private bucket, "photos", with a folder per account: <sign-in id>/<session id>-<fingerprint>.jpg.
-- You can put files only in your own folder. You can read a file if it's in your own folder, or if it's the photo
-- of a session whose photo you're allowed to see: the check reads session_photos, whose own row rules apply, so a
-- Friends-only photo stays Friends-only here too. The app never gets a permanent link: it asks for links that
-- expire after two hours.

insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;

create policy photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_replace on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text
                                   or exists (select 1 from public.session_photos p where p.path = 'sb:' || storage.objects.name)));
