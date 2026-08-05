-- Fix production ready-build publishing and consistently expose studio About
-- text in public catalog/profile reads.

grant select (about, bio) on public.studios to anon, authenticated;

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
  v_offset int;
begin
  if not public.can_manage_ready_build(p_listing::text) then
    raise exception 'Listing not found';
  end if;

  if cardinality(p_media_ids) < 1
     or cardinality(p_media_ids) <> (
       select count(*) from public.ready_build_media where listing_id = p_listing
     )
     or cardinality(p_media_ids) <> (
       select count(distinct media_id)
       from unnest(p_media_ids) as ids(media_id)
     ) then
    raise exception 'Include every listing image exactly once';
  end if;

  if exists (
    select 1
    from unnest(p_media_ids) as ids(media_id)
    where not exists (
      select 1 from public.ready_build_media
      where id = ids.media_id and listing_id = p_listing
    )
  ) then
    raise exception 'Listing image not found';
  end if;

  -- Move the current positions out of the destination range first so the
  -- listing's unique (listing_id, position) index cannot conflict mid-update.
  select coalesce(max(position), 0) + cardinality(p_media_ids) + 1
    into v_offset
    from public.ready_build_media
   where listing_id = p_listing;

  update public.ready_build_media
     set position = position + v_offset
   where listing_id = p_listing;

  update public.ready_build_media media
     set position = ordered.position
    from (
      select media_id as id, ordinality::int - 1 as position
      from unnest(p_media_ids) with ordinality as ids(media_id, ordinality)
    ) ordered
   where media.id = ordered.id
     and media.listing_id = p_listing;
end;
$$;

alter function public.reorder_ready_build_media(uuid, uuid[]) owner to postgres;
revoke all on function public.reorder_ready_build_media(uuid, uuid[]) from public;
grant execute on function public.reorder_ready_build_media(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
