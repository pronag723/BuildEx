-- =============================================================================
-- BuildEx — Fix: rank not recomputed on review (regression from 0016)
--
-- 0014_ranks.sql added `recompute_builder_rank()` to the END of both
-- buyer_confirm_complete and leave_review so a builder is promoted the moment a
-- completed order or a new rating crosses a threshold.
--
-- 0016_notifications.sql then REDEFINED leave_review to add the "New review"
-- notification — but in doing so it reverted to the 0013 body and DROPPED the
-- `recompute_builder_rank()` call. Result: leaving a review refreshes
-- avg_rating / completed_orders but never re-derives builder_profiles.rank, so a
-- builder sitting at e.g. 5 completed orders + 4.25★ stays 'rookie' forever even
-- though they qualify for 'advanced'. (buyer_confirm_complete was untouched by
-- 0016 and still recomputes rank correctly — only leave_review regressed.)
--
-- This migration:
--   1. Redefines leave_review = the 0016 version (review-stats refresh + builder
--      notification) PLUS the missing recompute_builder_rank() call.
--   2. Backfills every existing builder's rank in one pass, fixing anyone already
--      stuck below the rank their metrics earn.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── leave_review — refresh stats, re-derive rank, then notify ───────────────
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
  -- Stage 9 (regressed in 0016, restored here): … then re-derive rank from the
  -- refreshed metrics, since a new rating can cross a rank threshold.
  perform public.recompute_builder_rank(v_builder);

  -- Stage 11: tell the builder a new review landed.
  perform public._notify(
    v_builder,
    'review',
    'New review',
    'You received a ' || p_rating::text || '★ review.',
    '/orders/?id=' || p_order::text
  );

  return v_review_id;
end;
$$;

revoke all on function public.leave_review(uuid, int, text) from public;
grant execute on function public.leave_review(uuid, int, text) to authenticated;

-- ─── Backfill: fix every builder already stuck below their earned rank ───────
select public.recompute_all_ranks();

-- Force PostgREST to reload its schema cache (same pattern as prior migrations).
notify pgrst, 'reload schema';
