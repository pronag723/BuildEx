-- =============================================================================
-- BuildEx — Self-service account deletion
-- BuildEx ships as a static export (no server / API routes), so the client
-- cannot use the service-role key to remove an auth user. Instead we expose a
-- SECURITY DEFINER function that lets a signed-in user delete *their own*
-- auth.users row. Deleting that row cascades to public.profiles (and through
-- it to builder_profiles + portfolio_images) via the existing
-- `on delete cascade` foreign keys.
--
-- Storage objects (avatars / banners / portfolio images) are NOT removed here;
-- they are orphaned and can be cleaned up by a separate storage lifecycle job.
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only signed-in users may call it; it always acts on their own id.
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- Force PostgREST to reload its schema cache so the RPC is immediately callable
-- (otherwise the client gets "Could not find the function ... in the schema
-- cache" until the next automatic reload).
notify pgrst, 'reload schema';
