-- =============================================================================
-- BuildEx Studios — defer code redemption to onboarding completion
--
-- Bug: redeem_studio_code (0026) consumed a code slot the moment the builder
-- entered it at the identity step. If they then abandoned onboarding, the slot
-- stayed burned (and builder_profiles got deleted on cleanup, but the
-- studio_codes.redemptions_used counter was never given back).
--
-- Fix: split redemption into two phases.
--   • validate_studio_code(code) — at the identity step: checks the code is
--     usable and returns the studio, but does NOT consume a slot.
--   • the entered code is stashed on builder_profiles.pending_studio_code.
--   • finalize_studio_code()      — at onboarding completion: atomically
--     consumes the slot and links the builder. If the code filled up / expired
--     in the meantime, it just clears the pending code and the builder finishes
--     without the promo (never blocks completion).
-- An abandoned registration therefore never consumes a slot.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.builder_profiles
  add column if not exists pending_studio_code citext;

-- ─── validate_studio_code — check WITHOUT consuming ─────────────────────────
create or replace function public.validate_studio_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code citext := btrim(coalesce(p_code, ''));
  v_existing uuid;
  v_sid uuid;
  v_name text;
  v_slug citext;
  v_logo text;
  v_promo int;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(v_code) = 0 then
    raise exception 'A studio code is required';
  end if;

  -- Already linked to a studio? (only meaningful once a builder row exists)
  select studio_id into v_existing from public.builder_profiles where id = me;
  if found and v_existing is not null then
    raise exception 'You have already joined a studio';
  end if;

  select s.id, s.name, s.slug, s.logo_url, s.promo_bps
    into v_sid, v_name, v_slug, v_logo, v_promo
    from public.studio_codes c
    join public.studios s on s.id = c.studio_id
   where c.code = v_code
     and c.status = 'active'
     and s.status = 'active'
     and (c.expires_at is null or c.expires_at > now())
     and c.redemptions_used < c.max_redemptions;

  if not found then
    raise exception 'That code is invalid, expired, or fully used';
  end if;

  return jsonb_build_object(
    'name', v_name,
    'slug', v_slug::text,
    'logo_url', v_logo,
    'promo_bps', v_promo
  );
end;
$$;

revoke all on function public.validate_studio_code(text) from public;
grant execute on function public.validate_studio_code(text) to authenticated;

-- ─── finalize_studio_code — consume the pending code at completion ──────────
-- No-arg; reads builder_profiles.pending_studio_code. Best-effort: returns the
-- studio on success, NULL if there's nothing to apply (no pending code, already
-- joined, or the code is no longer usable). Never raises for the "couldn't
-- apply" cases so it can't block onboarding completion.
create or replace function public.finalize_studio_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_existing uuid;
  v_code citext;
  v_code_id uuid;
  v_studio_id uuid;
  v_promo_bps int;
  v_ends timestamptz := now() + interval '4 months';
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select studio_id, pending_studio_code
    into v_existing, v_code
    from public.builder_profiles where id = me;

  if not found then
    return null;  -- no builder profile
  end if;
  if v_existing is not null then
    -- Already joined a studio; nothing to apply, just drop any stale pending.
    update public.builder_profiles set pending_studio_code = null where id = me;
    return null;
  end if;
  if v_code is null or char_length(btrim(v_code)) = 0 then
    return null;  -- no code was entered
  end if;

  -- Find + lock the code. If it's gone / disabled / expired now, clear pending
  -- and finish without the promo.
  select c.id, c.studio_id, s.promo_bps
    into v_code_id, v_studio_id, v_promo_bps
    from public.studio_codes c
    join public.studios s on s.id = c.studio_id
   where c.code = v_code
     and c.status = 'active'
     and s.status = 'active'
     and (c.expires_at is null or c.expires_at > now())
   for update of c;

  if not found then
    update public.builder_profiles set pending_studio_code = null where id = me;
    return null;
  end if;

  -- Atomic cap: only succeeds while there is room left.
  update public.studio_codes
     set redemptions_used = redemptions_used + 1
   where id = v_code_id
     and redemptions_used < max_redemptions;
  if not found then
    -- Filled up between validate and finish — finish without the promo.
    update public.builder_profiles set pending_studio_code = null where id = me;
    return null;
  end if;

  update public.builder_profiles
     set studio_id = v_studio_id,
         studio_promo_bps = v_promo_bps,
         studio_promo_ends_at = v_ends,
         pending_studio_code = null
   where id = me;

  return (
    select jsonb_build_object(
      'name', s.name,
      'slug', s.slug::text,
      'logo_url', s.logo_url,
      'promo_bps', v_promo_bps,
      'promo_ends_at', v_ends
    )
    from public.studios s where s.id = v_studio_id
  );
end;
$$;

revoke all on function public.finalize_studio_code() from public;
grant execute on function public.finalize_studio_code() to authenticated;

-- redeem_studio_code (0026) is now superseded by validate + finalize and is no
-- longer called by the app. It is left in place (harmless) for backward safety.

notify pgrst, 'reload schema';
