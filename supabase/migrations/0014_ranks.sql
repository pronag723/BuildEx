-- =============================================================================
-- BuildEx — Ranks & rank-based commission (Stage 9)
--
-- builder_profiles.rank has existed since 0002 but was cosmetic (always
-- 'rookie'). This migration ties it to REAL metrics and makes the platform
-- commission depend on it, replacing the flat 15 % snapshot in place_order
-- (the TODO left in 0009_orders.sql).
--
-- Ranks are derived from the cached aggregates maintained in 0013_reviews.sql
-- (builder_profiles.completed_orders + avg_rating):
--
--   rookie    →  starting rank                                    (15 % commission)
--   advanced  →  ≥ 5  completed orders AND avg rating > 4.0★       (12 %)
--   expert    →  ≥ 12 completed orders AND avg rating > 4.5★       ( 8 %)
--   master    →  ≥ 22 completed orders AND avg rating > 4.8★       ( 5 %)
--
-- These numbers are mirrored in lib/ranks.js — keep the two in sync.
--
-- New objects:
--   • commission_bps_for_rank(text)         — single SQL source for the rate
--   • rank_for_metrics(int, numeric)        — single SQL source for the criteria
--   • recompute_builder_rank(uuid)          — set one builder's rank from metrics
--   • recompute_all_ranks()                 — bulk pass (for pg_cron later)
--   • place_order(...)                      — redefined: rank-based commission
--   • buyer_confirm_complete(uuid)          — redefined: recompute rank on complete
--   • leave_review(uuid, int, text)         — redefined: recompute rank on review
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

-- ─── 1. Commission rate per rank (single SQL source of truth) ────────────────
-- Basis points so the kopeck math in place_order stays integer. Mirrors the
-- commissionBps values in lib/ranks.js (RANK_RULES).
create or replace function public.commission_bps_for_rank(p_rank text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_rank
    when 'master'   then 500
    when 'expert'   then 800
    when 'advanced' then 1200
    else 1500  -- rookie, and any unknown value, fall back to the highest rate
  end;
$$;

-- ─── 2. Rank derived from real metrics (single SQL source of truth) ──────────
-- Returns the HIGHEST rank whose thresholds are all met. Rating is a strict
-- greater-than ("above 4.0★"); an unrated builder has avg_rating 0 and so
-- stays rookie. Mirrors computeRankFromMetrics in lib/ranks.js.
create or replace function public.rank_for_metrics(p_completed int, p_avg numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_completed, 0) >= 22 and coalesce(p_avg, 0) > 4.8 then 'master'
    when coalesce(p_completed, 0) >= 12 and coalesce(p_avg, 0) > 4.5 then 'expert'
    when coalesce(p_completed, 0) >= 5  and coalesce(p_avg, 0) > 4.0 then 'advanced'
    else 'rookie'
  end;
$$;

-- ─── 3. recompute_builder_rank — set one builder's rank ──────────────────────
-- Internal helper (not granted to clients). Reads the cached aggregates that
-- recompute_builder_review_stats keeps fresh, derives the rank, and stores it.
-- Same plain-function pattern as recompute_builder_review_stats in 0013: it is
-- only ever called from inside SECURITY DEFINER functions (or by the migration
-- owner), so it runs with RLS-bypassing privileges there. Returns the new rank.
create or replace function public.recompute_builder_rank(p_builder uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_completed int;
  v_avg numeric;
  v_rank text;
begin
  select completed_orders, avg_rating
    into v_completed, v_avg
    from public.builder_profiles
   where id = p_builder;

  if not found then
    return null;
  end if;

  v_rank := public.rank_for_metrics(coalesce(v_completed, 0), coalesce(v_avg, 0));

  update public.builder_profiles
     set rank = v_rank
   where id = p_builder
     and rank is distinct from v_rank;  -- avoid a no-op write / touch

  return v_rank;
end;
$$;

revoke all on function public.recompute_builder_rank(uuid) from public;

-- ─── 4. recompute_all_ranks — bulk pass ─────────────────────────────────────
-- For a periodic sweep. NOTE: scheduling this can use Supabase pg_cron later
-- (e.g. `select cron.schedule('nightly-ranks', '0 3 * * *',
-- $$select public.recompute_all_ranks()$$);`) — not required now, ranks already
-- update on every confirm/review below.
create or replace function public.recompute_all_ranks()
returns void
language plpgsql
set search_path = public
as $$
declare
  b uuid;
begin
  for b in select id from public.builder_profiles loop
    perform public.recompute_builder_rank(b);
  end loop;
end;
$$;

revoke all on function public.recompute_all_ranks() from public;

-- ─── 5. place_order — rank-based commission ─────────────────────────────────
-- Redefinition of the 0009 version. Only the commission source changes: instead
-- of a hard-coded 15 % it now snapshots the rate from the builder's CURRENT
-- rank via commission_bps_for_rank. Everything else (validation, price
-- snapshot, status) is preserved. The snapshot means a later rank change never
-- retro-edits an existing order's economics.
create or replace function public.place_order(
  p_builder uuid,
  p_size text,
  p_style text,
  p_brief text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_rates jsonb;
  v_tier jsonb;
  v_specialties text[];
  v_rank text;
  v_price int;
  v_commission int;
  v_earnings int;
  v_commission_bps int;
  v_order_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_builder is null or p_builder = me then
    raise exception 'Invalid builder';
  end if;
  if p_size not in ('small', 'medium', 'large') then
    raise exception 'Invalid size';
  end if;
  if p_style is null or char_length(btrim(p_style)) = 0 then
    raise exception 'Style is required';
  end if;
  if p_brief is null or char_length(btrim(p_brief)) = 0 then
    raise exception 'Brief is required';
  end if;

  select rates, specialties, rank
    into v_rates, v_specialties, v_rank
    from public.builder_profiles
   where id = p_builder;

  if v_rates is null then
    raise exception 'Builder not found';
  end if;

  v_tier := v_rates -> p_size;
  if v_tier is null
     or coalesce((v_tier ->> 'enabled')::boolean, false) is not true then
    raise exception 'Builder does not offer this size';
  end if;

  v_price := nullif(v_tier ->> 'price', '')::int;
  if v_price is null or v_price <= 0 then
    raise exception 'Builder has not set a price for this size';
  end if;

  if v_specialties is null or not (p_style = any(v_specialties)) then
    raise exception 'Style not offered by builder';
  end if;

  -- Stage 9: commission rate comes from the builder's current rank.
  v_commission_bps := public.commission_bps_for_rank(coalesce(v_rank, 'rookie'));
  v_commission := (v_price * v_commission_bps) / 10000;
  v_earnings := v_price - v_commission;

  insert into public.orders (
    buyer_id, builder_id, building_size, style, brief,
    price_kopecks, commission_kopecks, builder_earnings_kopecks,
    status
  )
  values (
    me, p_builder, p_size, p_style, p_brief,
    v_price, v_commission, v_earnings,
    'pending_payment'
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text, text) from public;
grant execute on function public.place_order(uuid, text, text, text) to authenticated;

-- ─── 6. buyer_confirm_complete — recompute rank on completion ───────────────
-- Redefinition of the 0013 version. The only addition is the trailing
-- recompute_builder_rank() call, so a completed order that pushes the builder
-- over a threshold promotes them immediately. The status transition, chat
-- order_event fan-out, and review-stats refresh are preserved verbatim.
-- recompute_builder_rank MUST run after recompute_builder_review_stats so it
-- reads the freshly-bumped completed_orders count.
-- TODO(Stage 12): trigger escrow release / payout to the builder here.
create or replace function public.buyer_confirm_complete(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_builder uuid;
  v_status public.order_status;
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, builder_id, status into v_buyer, v_builder, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then raise exception 'Order not found'; end if;
  if v_buyer <> me then raise exception 'Only the buyer can confirm'; end if;
  if v_status <> 'delivered' then raise exception 'Order is not awaiting confirmation'; end if;

  update public.orders
     set status = 'completed',
         completed_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'completed',
    'Buyer confirmed the delivery — order completed.',
    '{}'::jsonb
  );

  -- Stage 8: refresh the builder's cached completed_orders count …
  perform public.recompute_builder_review_stats(v_builder);
  -- Stage 9: … then re-derive their rank from the refreshed metrics.
  perform public.recompute_builder_rank(v_builder);
end;
$$;

revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

-- ─── 7. leave_review — recompute rank on review ─────────────────────────────
-- Redefinition of the 0013 version. The only addition is the trailing
-- recompute_builder_rank() call: a new rating changes avg_rating, which can
-- cross (or drop below) a rank threshold. Runs after the review-stats refresh
-- so it sees the new avg_rating.
create or replace function public.leave_review(
  p_order uuid,
  p_rating int,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_builder uuid;
  v_status public.order_status;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_review_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select buyer_id, builder_id, status
    into v_buyer, v_builder, v_status
    from public.orders
   where id = p_order
   for update;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if v_buyer <> me then
    raise exception 'Only the buyer can review this order';
  end if;
  if v_builder = me then
    raise exception 'You cannot review your own work';
  end if;
  if v_status <> 'completed' then
    raise exception 'You can only review a completed order';
  end if;
  if exists (select 1 from public.reviews where order_id = p_order) then
    raise exception 'This order has already been reviewed';
  end if;

  insert into public.reviews (order_id, reviewer_id, builder_id, rating, body)
  values (p_order, me, v_builder, p_rating, v_body)
  returning id into v_review_id;

  -- Stage 8: refresh avg_rating / reviews_count …
  perform public.recompute_builder_review_stats(v_builder);
  -- Stage 9: … then re-derive rank (a new rating can change avg_rating).
  perform public.recompute_builder_rank(v_builder);

  return v_review_id;
end;
$$;

revoke all on function public.leave_review(uuid, int, text) from public;
grant execute on function public.leave_review(uuid, int, text) to authenticated;

-- ─── 8. Backfill existing builders' ranks ───────────────────────────────────
-- One pass so anyone who already has completed orders / reviews from earlier
-- stages gets their correct rank the moment this migration runs.
select public.recompute_all_ranks();

-- Force PostgREST to reload its schema cache so the new/redefined RPCs are
-- immediately callable (same pattern as 0009/0010/0013).
notify pgrst, 'reload schema';
