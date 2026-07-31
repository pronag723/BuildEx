-- The owner check used by Storage policies must itself run with a privileged
-- table read. Otherwise its query can still be filtered by public-table RLS
-- while Storage evaluates an insert, which rejects a builder's valid upload.

create or replace function public.can_manage_ready_build(p_listing_id text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.ready_builds
        where id::text = p_listing_id
          and builder_id = auth.uid()
     );
$$;

alter function public.can_manage_ready_build(text) owner to postgres;
revoke all on function public.can_manage_ready_build(text) from public;
grant execute on function public.can_manage_ready_build(text) to authenticated;

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
  )
  with check (
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
