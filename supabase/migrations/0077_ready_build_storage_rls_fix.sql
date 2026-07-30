-- Ready-build uploads must not evaluate public-table RLS from Storage RLS.
-- Keep the ownership lookup inside a narrowly scoped SECURITY DEFINER helper.
create or replace function public.can_manage_ready_build(p_listing_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.ready_builds
       where id::text = p_listing_id and builder_id = auth.uid()
     );
$$;

revoke all on function public.can_manage_ready_build(text) from public;
grant execute on function public.can_manage_ready_build(text) to authenticated;

drop policy if exists "owners manage ready build media" on public.ready_build_media;
create policy "owners manage ready build media"
  on public.ready_build_media for all to authenticated
  using (public.can_manage_ready_build(listing_id::text))
  with check (public.can_manage_ready_build(listing_id::text));

drop policy if exists "ready build owners write assets" on storage.objects;
drop policy if exists "ready build owners update assets" on storage.objects;
drop policy if exists "ready build owners delete assets" on storage.objects;

create policy "ready build owners write assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('ready_build_images', 'ready_build_worlds', 'ready_build_previews')
    and public.can_manage_ready_build((storage.foldername(name))[1])
  );

create policy "ready build owners update assets"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('ready_build_images', 'ready_build_worlds', 'ready_build_previews')
    and public.can_manage_ready_build((storage.foldername(name))[1])
  );

create policy "ready build owners delete assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('ready_build_images', 'ready_build_worlds', 'ready_build_previews')
    and public.can_manage_ready_build((storage.foldername(name))[1])
  );

notify pgrst, 'reload schema';
