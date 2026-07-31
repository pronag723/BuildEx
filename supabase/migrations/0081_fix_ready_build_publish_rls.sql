-- The initial ready-build RPCs were SECURITY DEFINER, but did not explicitly
-- disable RLS or pin the function owner. On projects where the migration role
-- does not bypass RLS, publishing fails before the first asset can be uploaded.
-- Keep the browser limited to the authenticated builder while the definer RPC
-- performs the tightly-scoped listing/version writes.

create or replace function public.create_ready_build(
  p_title text,
  p_description text,
  p_style text,
  p_price_kopecks int
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_independent_builder(auth.uid()) then
    raise exception 'Only independent builders can publish ready-made builds';
  end if;

  insert into public.ready_builds(builder_id, title, description, style, price_kopecks)
  values (auth.uid(), btrim(p_title), btrim(p_description), lower(btrim(p_style)), p_price_kopecks)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_ready_build(
  p_listing uuid,
  p_title text,
  p_description text,
  p_style text,
  p_price_kopecks int,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.ready_builds
     set title = btrim(p_title),
         description = btrim(p_description),
         style = lower(btrim(p_style)),
         price_kopecks = p_price_kopecks,
         is_active = false,
         updated_at = now()
   where id = p_listing and builder_id = auth.uid();

  if not found then
    raise exception 'Listing not found';
  end if;

  if p_active then
    if not exists (
      select 1 from public.ready_build_versions
       where id = (select current_version_id from public.ready_builds where id = p_listing)
    ) or not exists (
      select 1 from public.ready_build_media where listing_id = p_listing
    ) then
      raise exception 'Add photos and a world preview before publishing';
    end if;

    update public.ready_builds
       set is_active = true, updated_at = now()
     where id = p_listing;
  end if;
end;
$$;

create or replace function public.attach_ready_build_version(
  p_listing uuid,
  p_world_path text,
  p_file_name text,
  p_size bigint,
  p_preview_path text,
  p_preview_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.ready_builds
     where id = p_listing and builder_id = auth.uid()
  ) then
    raise exception 'Listing not found';
  end if;
  if p_file_name !~* '\.zip$' then
    raise exception 'Ready-made worlds must be ZIP files';
  end if;
  if p_world_path not like p_listing::text || '/%'
     or p_preview_path not like p_listing::text || '/%' then
    raise exception 'Invalid listing asset path';
  end if;

  insert into public.ready_build_versions(
    listing_id, world_path, world_file_name, world_size_bytes, preview_path, preview_meta
  )
  values (
    p_listing, p_world_path, btrim(p_file_name), p_size, p_preview_path,
    coalesce(p_preview_meta, '{}'::jsonb)
  )
  returning id into v_id;

  update public.ready_builds
     set current_version_id = v_id, updated_at = now()
   where id = p_listing;

  return v_id;
end;
$$;

alter function public.create_ready_build(text, text, text, int) owner to postgres;
alter function public.update_ready_build(uuid, text, text, text, int, boolean) owner to postgres;
alter function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) owner to postgres;

revoke all on function public.create_ready_build(text, text, text, int) from public;
revoke all on function public.update_ready_build(uuid, text, text, text, int, boolean) from public;
revoke all on function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) from public;
grant execute on function public.create_ready_build(text, text, text, int) to authenticated;
grant execute on function public.update_ready_build(uuid, text, text, text, int, boolean) to authenticated;
grant execute on function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
