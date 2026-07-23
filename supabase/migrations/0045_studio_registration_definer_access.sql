-- The studio registration RPC creates the storefront atomically, then claims
-- the invitation and updates the moderator profile.  On projects where the
-- dashboard migration role is not the owner of the legacy studios table,
-- SECURITY DEFINER alone can still lack table privileges.  Pin the two public
-- onboarding RPCs to postgres and grant only that definer role the access they
-- need; browser roles retain no direct studios write permissions.

alter function public.validate_studio_moderator_invite(text) owner to postgres;
alter function public.complete_studio_registration(text, text, text, text, jsonb) owner to postgres;

grant usage on schema public to postgres;
grant select, insert, update, delete on table public.studios to postgres;
grant select, update on table public.studio_moderator_invites to postgres;
grant select, insert on table public.studio_portfolio_images to postgres;
grant select, update, delete on table public.profiles to postgres;
grant delete on table public.builder_profiles to postgres;

alter function public.validate_studio_moderator_invite(text) set row_security = off;
alter function public.complete_studio_registration(text, text, text, text, jsonb) set row_security = off;

revoke all on function public.validate_studio_moderator_invite(text) from public;
grant execute on function public.validate_studio_moderator_invite(text) to authenticated;
revoke all on function public.complete_studio_registration(text, text, text, text, jsonb) from public;
grant execute on function public.complete_studio_registration(text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
