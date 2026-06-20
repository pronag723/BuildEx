-- =============================================================================
-- BuildEx — Column-level privilege lockdown (SECURITY FIX)
--
-- ROOT CAUSE: the "users update own profile" (0001) and "users update own
-- builder profile" (0002) RLS policies only restrict WHICH ROW a user may touch
-- (auth.uid() = id). RLS does NOT restrict WHICH COLUMNS, and Supabase's default
-- GRANT ALL leaves the `authenticated` role able to UPDATE/INSERT *every* column
-- of its own row straight through PostgREST. That let any signed-in user:
--   • PATCH profiles.is_admin = true            → full platform admin
--   • PATCH builder_profiles.rank = 'master'    → 9% instead of 18% commission
--   • PATCH builder_profiles.avg_rating/…       → fabricate ratings & order count
--   • PATCH builder_profiles.studio_promo_bps=0,
--           studio_promo_ends_at = '2099-…'     → 0% commission forever, no code
--
-- FIX: revoke the blanket table-level INSERT/UPDATE from anon + authenticated and
-- grant back ONLY the columns the app legitimately writes (enumerated from
-- lib/onboarding/api.js, lib/auth/profile.js, lib/presence/api.js). The
-- privileged columns (is_admin, rank, the cached aggregates, the studio promo
-- fields) are then settable ONLY by the SECURITY DEFINER RPCs that already own
-- those transitions — which is the intended design.
--
-- Every column the client currently reads/writes is preserved, so all existing
-- flows (sign-in, onboarding, account edits, presence heartbeat, the public
-- feed) behave exactly as before. The ONLY behaviour change is that a direct
-- write to a non-granted column now returns "permission denied".
--
-- Also hardens profiles.discord_id: it is stored at sign-in but never read by
-- any client query, yet the public SELECT policy exposed it to anyone. We switch
-- profiles to column-level SELECT grants that cover every column EXCEPT
-- discord_id (no query uses `select *` on profiles, verified), so the public
-- feed keeps working while the Discord id stops leaking.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── 1. profiles: lock down writes to the columns onboarding/account edit ────
-- INSERT columns come from ensureProfile (lib/auth/profile.js) — the first-login
-- row: id, username, display_name, avatar_url, discord_id, role.
-- UPDATE columns come from saveIdentity / saveClientProfile / saveBuilderIdentity
-- / saveRole / markOnboardingComplete / cancelOnboarding / touchPresence.
revoke insert, update on public.profiles from anon, authenticated;

grant insert (id, username, display_name, avatar_url, discord_id, role)
  on public.profiles to authenticated;

grant update (
  username, display_name, avatar_url, banner_url, bio, role,
  interests, preferred_server_type, minecraft_username,
  onboarding_completed_at, last_seen_at
) on public.profiles to authenticated;

-- ─── 2. profiles: hide discord_id from public reads ──────────────────────────
-- Replace the table-wide SELECT grant with column-level grants covering every
-- column except discord_id. The "profiles are viewable" RLS policy (0001) still
-- applies on top; this just removes discord_id from what any client can ask for.
revoke select on public.profiles from anon, authenticated;

grant select (
  id, username, display_name, avatar_url, role, bio, minecraft_username,
  created_at, banner_url, interests, preferred_server_type,
  onboarding_completed_at, is_admin, last_seen_at
) on public.profiles to anon, authenticated;

-- ─── 3. builder_profiles: lock down writes to the builder-editable columns ────
-- upsertBuilderProfile (lib/onboarding/api.js) issues INSERT … ON CONFLICT DO
-- UPDATE, so each editable column needs BOTH privileges. Columns: id + tagline,
-- pending_studio_code, tools, project_types, response_time_hours,
-- availability_status, is_available, specialties, build_types, rates.
-- NOT granted (RPC-managed only): rank, avg_rating, reviews_count,
-- completed_orders, studio_id, studio_promo_bps, studio_promo_ends_at,
-- years_experience, created_at, updated_at.
revoke insert, update on public.builder_profiles from anon, authenticated;

grant insert (
  id, tagline, pending_studio_code, tools, project_types,
  response_time_hours, availability_status, is_available,
  specialties, build_types, rates
) on public.builder_profiles to authenticated;

grant update (
  id, tagline, pending_studio_code, tools, project_types,
  response_time_hours, availability_status, is_available,
  specialties, build_types, rates
) on public.builder_profiles to authenticated;

-- builder_profiles SELECT is intentionally left table-wide: the public feed
-- reads it via `builder_profiles!inner(*)`, and the only sensitive column
-- (pending_studio_code) is always NULL by the time a builder appears in the feed
-- (finalize_studio_code clears it at onboarding completion).

-- PostgREST caches table/column privileges; reload so the new grants take effect
-- immediately (same pattern as every other migration here).
notify pgrst, 'reload schema';
