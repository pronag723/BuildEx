-- Publishing a ready-made build uploads an image first, then records its public
-- metadata.  Do that metadata write through the same narrowly scoped, guarded
-- RPC pattern as the other ready-build writes so it does not depend on a
-- browser-evaluated nested RLS policy.
create or replace function public.attach_ready_build_media(
  p_listing uuid,
  p_storage_path text,
  p_url text,
  p_alt text,
  p_position int
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_media_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add listing images';
  end if;

  if not exists (
    select 1 from public.ready_builds
    where id = p_listing and builder_id = auth.uid()
  ) then
    raise exception 'Listing not found';
  end if;

  if p_storage_path !~ ('^' || p_listing::text || '/[^/]+$') then
    raise exception 'Invalid listing image path';
  end if;
  if coalesce(btrim(p_url), '') = '' then
    raise exception 'Listing image URL is required';
  end if;
  if p_position < 0 then
    raise exception 'Listing image position is invalid';
  end if;

  insert into public.ready_build_media(listing_id, storage_path, url, alt, position)
  values (p_listing, p_storage_path, p_url, nullif(btrim(p_alt), ''), p_position)
  returning id into v_media_id;

  return v_media_id;
end;
$$;

alter function public.attach_ready_build_media(uuid, text, text, text, int) owner to postgres;
revoke all on function public.attach_ready_build_media(uuid, text, text, text, int) from public;
grant execute on function public.attach_ready_build_media(uuid, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';
