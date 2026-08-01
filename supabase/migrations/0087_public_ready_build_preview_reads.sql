-- Active ready-made listings advertise an interactive preview to every visitor.
-- Signed URL creation still evaluates storage.objects RLS, so the owner-only
-- policy from 0083 made the same preview appear missing to every other account.
-- Keep world archives private and expose only preview paths attached to an
-- active listing.

create or replace function public.can_read_active_ready_build_preview(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.ready_build_versions v
    join public.ready_builds l on l.id = v.listing_id
    where v.preview_path = p_path
      and l.is_active = true
  );
$$;

revoke all on function public.can_read_active_ready_build_preview(text) from public;
grant execute on function public.can_read_active_ready_build_preview(text) to anon, authenticated;

drop policy if exists "public reads active ready build previews" on storage.objects;
create policy "public reads active ready build previews"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'ready_build_previews'
    and public.can_read_active_ready_build_preview(name)
  );

notify pgrst, 'reload schema';
