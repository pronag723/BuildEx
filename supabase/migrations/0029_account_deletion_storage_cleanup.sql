-- =============================================================================
-- BuildEx — Purge a user's storage objects on account deletion (PRIVACY FIX)
--
-- delete_own_account (0006) and delete_incomplete_registration (0021) remove the
-- auth.users row, which cascades to profiles → builder_profiles / portfolio_images
-- / orders. But Storage objects live outside those FKs, so a deleted user's
-- avatars / banners / portfolio images stayed in the PUBLIC buckets and remained
-- fetchable by their (still-valid) public URLs — an unbounded leak of personal
-- images. Delivered world files + 3D previews for their orders were likewise
-- orphaned.
--
-- Fix: both deletion RPCs now remove the caller's storage objects first, then
-- delete the auth user. The functions are SECURITY DEFINER (run as the owner),
-- so they can delete from storage.objects regardless of the storage RLS that
-- applies to the caller. Path convention is <owner_id>/… for the per-user
-- buckets and <order_id>/… for the order buckets, matching the storage policies
-- in 0003 / 0011 / 0012.
--
-- Behaviour is otherwise identical (same return types, same auth/onboarding
-- guards), so existing callers (lib/onboarding/api.js) are unaffected.
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── helper: delete every storage object owned by a user ─────────────────────
-- Internal only. Removes the per-user bucket objects (first path segment = uid)
-- plus the deliverables/previews for every order the user is a party to.
create or replace function public._purge_user_storage(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Per-user buckets: avatars/<uid>/…, banners/<uid>/…, portfolios/<uid>/…
  delete from storage.objects
   where bucket_id in ('avatars', 'banners', 'portfolios')
     and (storage.foldername(name))[1] = p_uid::text;

  -- Order buckets: deliverables/<order_id>/…, order_previews/<order_id>/…
  -- for any order this user placed or built (about to be cascade-deleted).
  delete from storage.objects
   where bucket_id in ('deliverables', 'order_previews')
     and (storage.foldername(name))[1] in (
       select o.id::text
         from public.orders o
        where o.buyer_id = p_uid or o.builder_id = p_uid
     );
end;
$$;

revoke all on function public._purge_user_storage(uuid) from public;

-- ─── delete_own_account — now purges storage first ───────────────────────────
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public._purge_user_storage(v_uid);
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ─── delete_incomplete_registration — purge storage too ──────────────────────
create or replace function public.delete_incomplete_registration()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_completed timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select onboarding_completed_at into v_completed
  from public.profiles
  where id = v_uid;

  -- Already completed onboarding → never delete; this is a real account.
  if v_completed is not null then
    return false;
  end if;

  perform public._purge_user_storage(v_uid);
  delete from auth.users where id = v_uid;
  return true;
end;
$$;

revoke all on function public.delete_incomplete_registration() from public;
grant execute on function public.delete_incomplete_registration() to authenticated;

notify pgrst, 'reload schema';
