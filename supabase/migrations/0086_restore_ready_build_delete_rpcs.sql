-- Production recovery for projects where the ready-build deletion migration
-- was not applied or PostgREST cached the schema before the functions existed.
-- Repeating these definitions is intentional and idempotent.
create or replace function public.prepare_ready_build_delete(p_listing uuid)
returns table(image_paths text[], world_paths text[], preview_paths text[])
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.ready_builds
    where id = p_listing and builder_id = auth.uid()
  ) then
    raise exception 'Listing not found';
  end if;

  if exists (select 1 from public.ready_build_purchases where listing_id = p_listing) then
    raise exception 'Builds with purchase history cannot be deleted; unlist this build instead';
  end if;

  update public.ready_builds
  set is_active = false, updated_at = now()
  where id = p_listing;

  return query select
    coalesce((select array_agg(m.storage_path) from public.ready_build_media m where m.listing_id = p_listing), array[]::text[]),
    coalesce((select array_agg(v.world_path) from public.ready_build_versions v where v.listing_id = p_listing), array[]::text[]),
    coalesce((select array_agg(v.preview_path) from public.ready_build_versions v where v.listing_id = p_listing), array[]::text[]);
end;
$$;

create or replace function public.delete_ready_build(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.ready_builds
    where id = p_listing and builder_id = auth.uid()
  ) then
    raise exception 'Listing not found';
  end if;
  if exists (select 1 from public.ready_build_purchases where listing_id = p_listing) then
    raise exception 'Builds with purchase history cannot be deleted; unlist this build instead';
  end if;
  delete from public.ready_builds where id = p_listing and builder_id = auth.uid();
end;
$$;

alter function public.prepare_ready_build_delete(uuid) owner to postgres;
alter function public.delete_ready_build(uuid) owner to postgres;
revoke all on function public.prepare_ready_build_delete(uuid) from public;
revoke all on function public.delete_ready_build(uuid) from public;
grant execute on function public.prepare_ready_build_delete(uuid) to authenticated;
grant execute on function public.delete_ready_build(uuid) to authenticated;
notify pgrst, 'reload schema';
