-- Allow both independent builders and studio moderators to save the required
-- compatibility disclosures. The original legal-launch RPC predated studio
-- listings and still filtered exclusively by direct builder ownership.
create or replace function public.set_ready_build_disclosures(
  p_listing uuid, p_edition text, p_version text, p_file_format text,
  p_included_content text, p_dependencies text, p_license_version text
) returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if nullif(btrim(p_edition), '') is null
     or nullif(btrim(p_version), '') is null
     or lower(btrim(p_version)) = 'not specified'
     or nullif(btrim(p_file_format), '') is null
     or nullif(btrim(p_included_content), '') is null
     or nullif(btrim(p_dependencies), '') is null
     or nullif(btrim(p_license_version), '') is null then
    raise exception 'Complete all compatibility, content, dependency, and license disclosures';
  end if;

  if not public.can_manage_ready_build(p_listing::text) then
    raise exception 'Listing not found';
  end if;

  update public.ready_builds
     set minecraft_edition = btrim(p_edition),
         minecraft_version = btrim(p_version),
         file_format = btrim(p_file_format),
         included_content = btrim(p_included_content),
         dependencies = btrim(p_dependencies),
         license_version = btrim(p_license_version),
         is_active = false,
         updated_at = now()
   where id = p_listing;
end;
$$;

alter function public.set_ready_build_disclosures(uuid,text,text,text,text,text,text) owner to postgres;
revoke all on function public.set_ready_build_disclosures(uuid,text,text,text,text,text,text) from public;
grant execute on function public.set_ready_build_disclosures(uuid,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
