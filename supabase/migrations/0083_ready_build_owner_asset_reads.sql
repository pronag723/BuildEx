-- Storage upserts require SELECT in addition to INSERT/UPDATE. The app now
-- creates unique object paths with insert-only uploads, but builders should
-- still be able to read assets belonging to their own listings and older
-- clients must not fail solely because they request upsert semantics.

drop policy if exists "ready build owners read assets" on storage.objects;

create policy "ready build owners read assets"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('ready_build_images', 'ready_build_worlds', 'ready_build_previews')
    and public.can_manage_ready_build((storage.foldername(name))[1])
  );

notify pgrst, 'reload schema';
