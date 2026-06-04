-- =============================================================================
-- BuildEx — Reviews system (Stage 8)
--
-- Replaces the hardcoded ratings (app/builders/data/reviews.js, the feed card's
-- avg_rating/total_reviews 0s) with real, order-gated reviews.
--
-- Static export → no server, so the single privileged write (leaving a review)
-- goes through a SECURITY DEFINER RPC that re-checks auth.uid() — same pattern
-- as 0009_orders.sql / 0010_chat_order_events.sql.
--
-- This migration introduces:
--   • reviews table              — exactly one review per completed order
--   • builder_profiles aggregates— cached avg_rating / reviews_count /
--                                  completed_orders (read directly by
--                                  fetchBuilders, no extra count query)
--   • recompute_builder_review_stats(builder)  — single source of truth that
--                                  recomputes all three from the base tables
--   • leave_review(order, rating, body)        — buyer of a completed order,
--                                  once; inserts the review + recomputes stats
--   • buyer_confirm_complete is redefined to keep completed_orders fresh the
--     moment an order completes (folds the recompute into the existing 0010
--     definition; the chat order_event fan-out is preserved verbatim).
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. reviews table ───────────────────────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  -- One review per order. The unique constraint is the hard guarantee; the RPC
  -- gives a friendly error before we ever hit it.
  order_id uuid not null unique references public.orders(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists reviews_builder_idx
  on public.reviews (builder_id, created_at desc);

alter table public.reviews enable row level security;

-- Reviews are public — they render on the public builder profile for anyone.
drop policy if exists "reviews are public" on public.reviews;
create policy "reviews are public"
  on public.reviews for select
  using (true);

-- No INSERT/UPDATE/DELETE policies — leaving a review goes through the RPC.

-- ─── 2. Cached aggregates on builder_profiles ───────────────────────────────
-- Cached (not computed-on-the-fly) so fetchBuilders / fetchBuilderByUsername
-- stay a single column read with no correlated subquery. The three values only
-- change on two events — a review is left, or an order completes — and both
-- code paths below recompute them, so the cache never drifts.
alter table public.builder_profiles
  add column if not exists avg_rating numeric(3, 2) not null default 0,
  add column if not exists reviews_count int not null default 0,
  add column if not exists completed_orders int not null default 0;

-- ─── 3. recompute_builder_review_stats — single source of truth ─────────────
-- Recomputes all three aggregates for one builder straight from the base
-- tables. Internal helper: only the SECURITY DEFINER RPCs below call it, so it
-- is revoked from clients. (It runs with the caller's privileges, which inside
-- a definer function is the function owner — RLS is bypassed, same as the
-- order RPCs that update other users' rows.)
create or replace function public.recompute_builder_review_stats(p_builder uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.builder_profiles bp
     set avg_rating = coalesce((
           select round(avg(r.rating)::numeric, 2)
             from public.reviews r
            where r.builder_id = p_builder
         ), 0),
         reviews_count = (
           select count(*)
             from public.reviews r
            where r.builder_id = p_builder
         ),
         completed_orders = (
           select count(*)
             from public.orders o
            where o.builder_id = p_builder
              and o.status = 'completed'
         )
   where bp.id = p_builder;
end;
$$;

revoke all on function public.recompute_builder_review_stats(uuid) from public;

-- ─── 4. leave_review RPC ────────────────────────────────────────────────────
-- Only the buyer of a COMPLETED order may review, exactly once. Inserts the
-- review then recomputes the builder's cached aggregates. Returns the review id.
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
  -- Can't review your own work (guards the buyer==builder edge defensively;
  -- place_order already forbids it).
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

  perform public.recompute_builder_review_stats(v_builder);

  return v_review_id;
end;
$$;

revoke all on function public.leave_review(uuid, int, text) from public;
grant execute on function public.leave_review(uuid, int, text) to authenticated;

-- ─── 5. buyer_confirm_complete — keep completed_orders fresh ─────────────────
-- Redefinition of the 0010 version. The only change is the trailing
-- recompute_builder_review_stats() call so completed_orders bumps the instant
-- an order completes; the status transition + chat order_event fan-out are
-- preserved exactly.
-- TODO(Stage 9): also call recompute_builder_rank(v_builder) here.
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

  -- Stage 8: refresh the builder's cached completed_orders count.
  perform public.recompute_builder_review_stats(v_builder);
end;
$$;

revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

-- ─── 6. Backfill existing builders' aggregates ──────────────────────────────
-- Any orders already completed (or reviews already present) before this
-- migration get their counts populated in one pass.
do $$
declare
  b uuid;
begin
  for b in select id from public.builder_profiles loop
    perform public.recompute_builder_review_stats(b);
  end loop;
end$$;

-- Force PostgREST to reload its schema cache so the new RPC + columns are
-- immediately callable (same pattern as 0009/0010).
notify pgrst, 'reload schema';
