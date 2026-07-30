-- A ready-build purchase is created only through this guarded RPC. Explicitly
-- run it as the database owner with RLS disabled so the insert is not rejected
-- by the ledger's intentionally read-only browser policies.
create or replace function public.create_ready_build_purchase(p_listing uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_listing public.ready_builds;
  v_version public.ready_build_versions;
  v_bps int;
  v_commission int;
  v_purchase uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to buy this build';
  end if;

  select * into v_listing
    from public.ready_builds
   where id = p_listing and is_active = true
   for share;

  if v_listing.id is null then
    raise exception 'This build is no longer for sale';
  end if;
  if auth.uid() = v_listing.builder_id then
    raise exception 'You cannot buy your own build';
  end if;

  select * into v_version
    from public.ready_build_versions
   where id = v_listing.current_version_id;
  if v_version.id is null then
    raise exception 'This listing is unavailable';
  end if;

  select public.commission_bps_for_rank(coalesce(rank, 'rookie'))
    into v_bps
    from public.builder_profiles
   where id = v_listing.builder_id;

  v_commission := (v_listing.price_kopecks * coalesce(v_bps, 1500)) / 10000;

  insert into public.ready_build_purchases (
    listing_id, version_id, buyer_id, builder_id, title_snapshot,
    price_kopecks, commission_kopecks, builder_earnings_kopecks,
    world_path_snapshot, world_file_name_snapshot
  ) values (
    p_listing, v_version.id, auth.uid(), v_listing.builder_id, v_listing.title,
    v_listing.price_kopecks, v_commission, v_listing.price_kopecks - v_commission,
    v_version.world_path, v_version.world_file_name
  ) returning id into v_purchase;

  return v_purchase;
end;
$$;

alter function public.create_ready_build_purchase(uuid) owner to postgres;
revoke all on function public.create_ready_build_purchase(uuid) from public;
grant execute on function public.create_ready_build_purchase(uuid) to authenticated;

notify pgrst, 'reload schema';
