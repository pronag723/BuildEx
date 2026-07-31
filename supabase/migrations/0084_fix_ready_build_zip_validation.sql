-- Avoid regex/backslash differences when migrations are copied through SQL
-- editors. A normalized suffix check accepts ordinary .zip filenames while
-- keeping the server-side file-type guard explicit.

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

  if lower(right(btrim(p_file_name), 4)) <> '.zip' then
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

alter function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) owner to postgres;
revoke all on function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) from public;
grant execute on function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
