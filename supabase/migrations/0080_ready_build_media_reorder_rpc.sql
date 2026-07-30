-- Saving an existing listing reorders its current images before a new version
-- is attached. Keep that multi-row update behind a guarded RPC: browser RLS
-- evaluation can otherwise reject a legitimate owner update mid-save.
create or replace function public.reorder_ready_build_media(
  p_listing uuid,
  p_media_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Sign in to reorder listing images';
  end if;

  if not exists (
    select 1 from public.ready_builds
    where id = p_listing and builder_id = auth.uid()
  ) then
    raise exception 'Listing not found';
  end if;

  if coalesce(cardinality(p_media_ids), 0) = 0
     or array_position(p_media_ids, null) is not null
     or cardinality(p_media_ids) <> cardinality(array(select distinct unnest(p_media_ids))) then
    raise exception 'Listing images are invalid';
  end if;

  select count(*) into v_count
    from public.ready_build_media
   where listing_id = p_listing and id = any(p_media_ids);
  if v_count <> cardinality(p_media_ids) then
    raise exception 'Listing images are invalid';
  end if;

  -- The final position has a per-listing unique constraint, so move all rows
  -- out of the way before assigning the requested order.
  update public.ready_build_media
     set position = 10000 + positions.ordinality - 1
    from unnest(p_media_ids) with ordinality as positions(id, ordinality)
   where ready_build_media.id = positions.id
     and ready_build_media.listing_id = p_listing;

  update public.ready_build_media
     set position = positions.ordinality - 1
    from unnest(p_media_ids) with ordinality as positions(id, ordinality)
   where ready_build_media.id = positions.id
     and ready_build_media.listing_id = p_listing;
end;
$$;

alter function public.reorder_ready_build_media(uuid, uuid[]) owner to postgres;
revoke all on function public.reorder_ready_build_media(uuid, uuid[]) from public;
grant execute on function public.reorder_ready_build_media(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
