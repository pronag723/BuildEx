-- =============================================================================
-- BuildEx — Discard an abandoned (incomplete) registration
-- A profiles row is created as soon as a user authenticates (ensureProfile),
-- long before they finish onboarding. If they bail out — sign out, or navigate
-- away from /onboarding — without ever clicking the final "Create Profile"
-- (which sets profiles.onboarding_completed_at), the half-filled row lingers and
-- breaks the next sign-in (e.g. a half-claimed unique username).
--
-- This SECURITY DEFINER function lets a signed-in user delete *their own*
-- auth.users row, but ONLY while onboarding is still incomplete. Deleting that
-- row cascades to public.profiles → builder_profiles + portfolio_images via the
-- existing `on delete cascade` foreign keys (same mechanism as
-- delete_own_account in 0006). A finished account can never be removed here.
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.delete_incomplete_registration()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_completed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select onboarding_completed_at into v_completed
  from public.profiles
  where id = auth.uid();

  -- Already completed onboarding → never delete; this is a real account.
  if v_completed is not null then
    return false;
  end if;

  delete from auth.users where id = auth.uid();
  return true;
end;
$$;

-- Only signed-in users may call it; it always acts on their own id and is gated
-- on their own onboarding_completed_at being null.
revoke all on function public.delete_incomplete_registration() from public;
grant execute on function public.delete_incomplete_registration() to authenticated;

-- Force PostgREST to reload its schema cache so the RPC is immediately callable.
notify pgrst, 'reload schema';
