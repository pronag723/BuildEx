-- =============================================================================
-- BuildEx — Orders data model + lifecycle RPCs (Stage 2)
--
-- BuildEx ships as a static export (no server / API routes), so every
-- privileged write goes through SECURITY DEFINER RPCs that re-check
-- auth.uid() — same pattern as 0006_delete_account.sql and 0007_chat.sql.
--
-- This migration introduces the transactional spine of the marketplace:
--   • order_status enum     — the order state machine
--   • orders table          — one row per commission
--   • six lifecycle RPCs    — place / pay / start / deliver / confirm / cancel
--
-- Money is stored as integer kopecks. Commission is currently a flat 15 %;
-- rank-based commission replaces this in Stage 9 (see TODO inside place_order).
-- Real SBP payment replaces mark_order_paid in Stage 12 (mock for now).
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. order_status enum ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'pending_payment',
      'paid',
      'in_progress',
      'delivered',
      'completed',
      'cancelled',
      'disputed'
    );
  end if;
end$$;

-- ─── 2. orders table ────────────────────────────────────────────────────────
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  building_size text not null check (building_size in ('small', 'medium', 'large')),
  style text not null,
  brief text not null check (char_length(brief) between 1 and 8000),
  price_kopecks int not null check (price_kopecks > 0),
  commission_kopecks int not null check (commission_kopecks >= 0),
  builder_earnings_kopecks int not null check (builder_earnings_kopecks >= 0),
  status public.order_status not null default 'pending_payment',
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  started_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint orders_distinct_parties check (buyer_id <> builder_id)
);

create index if not exists orders_buyer_idx
  on public.orders (buyer_id, created_at desc);
create index if not exists orders_builder_idx
  on public.orders (builder_id, created_at desc);
create index if not exists orders_status_idx
  on public.orders (status);

alter table public.orders enable row level security;

-- Buyer and builder may read their own orders; no other reader.
drop policy if exists "participants read orders" on public.orders;
create policy "participants read orders"
  on public.orders for select
  using (auth.uid() = buyer_id or auth.uid() = builder_id);

-- No direct INSERT or UPDATE policies — all mutations go through SECURITY
-- DEFINER RPCs below.

-- updated_at touch trigger
create or replace function public.touch_order_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_order_updated_at();

-- ─── 3. place_order RPC ─────────────────────────────────────────────────────
-- Snapshots price from builder_profiles.rates at order time. Computes a flat
-- 15 % platform commission. TODO(Stage 9): replace the flat rate with a
-- rank-based lookup via lib/ranks (recompute_builder_rank).
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
  v_price int;
  v_commission int;
  v_earnings int;
  v_order_id uuid;
  -- Flat 15 % commission expressed in basis points so the math stays integer.
  -- TODO(Stage 9): look up from rank.
  v_commission_bps constant int := 1500;
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

  select rates, specialties
    into v_rates, v_specialties
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

-- ─── 4. mark_order_paid RPC (MOCK) ──────────────────────────────────────────
-- TODO(Stage 12): real SBP payment via Supabase Edge Function + webhook
-- replaces this. The webhook will call an internal "mark_order_paid_internal"
-- after verifying the PSP signature.
create or replace function public.mark_order_paid(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_status public.order_status;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status into v_buyer, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if v_buyer <> me then
    raise exception 'Only the buyer can pay';
  end if;
  if v_status <> 'pending_payment' then
    raise exception 'Order is not awaiting payment';
  end if;

  update public.orders
     set status = 'paid',
         paid_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.mark_order_paid(uuid) from public;
grant execute on function public.mark_order_paid(uuid) to authenticated;

-- ─── 5. builder_start_work RPC ──────────────────────────────────────────────
create or replace function public.builder_start_work(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_builder uuid;
  v_status public.order_status;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then
    raise exception 'Order not found';
  end if;
  if v_builder <> me then
    raise exception 'Only the builder can start work';
  end if;
  if v_status <> 'paid' then
    raise exception 'Order is not in a startable state';
  end if;

  update public.orders
     set status = 'in_progress',
         started_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.builder_start_work(uuid) from public;
grant execute on function public.builder_start_work(uuid) to authenticated;

-- ─── 6. builder_deliver RPC ─────────────────────────────────────────────────
-- Stage 6 adds the actual file upload (order_deliveries) and folds the
-- attach + transition together; the bare transition is exposed now so the
-- order dashboard in Stage 4 has a placeholder action to wire up.
create or replace function public.builder_deliver(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_builder uuid;
  v_status public.order_status;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then
    raise exception 'Order not found';
  end if;
  if v_builder <> me then
    raise exception 'Only the builder can deliver';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Order is not in a deliverable state';
  end if;

  update public.orders
     set status = 'delivered',
         delivered_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.builder_deliver(uuid) from public;
grant execute on function public.builder_deliver(uuid) to authenticated;

-- ─── 7. buyer_confirm_complete RPC ──────────────────────────────────────────
-- TODO(Stage 12): trigger escrow release / payout to the builder here once
-- real payments are wired up.
create or replace function public.buyer_confirm_complete(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_status public.order_status;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status into v_buyer, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if v_buyer <> me then
    raise exception 'Only the buyer can confirm';
  end if;
  if v_status <> 'delivered' then
    raise exception 'Order is not awaiting confirmation';
  end if;

  update public.orders
     set status = 'completed',
         completed_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

-- ─── 8. cancel_order RPC ────────────────────────────────────────────────────
-- Buyer can cancel while pending_payment or paid (pre-work). Once the builder
-- has started, cancellation belongs to the dispute flow (Stage 10).
create or replace function public.cancel_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_status public.order_status;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status into v_buyer, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if v_buyer <> me then
    raise exception 'Only the buyer can cancel';
  end if;
  if v_status not in ('pending_payment', 'paid') then
    raise exception 'Order can no longer be cancelled';
  end if;

  -- TODO(Stage 12): if v_status = 'paid', refund the buyer through the PSP.

  update public.orders
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.cancel_order(uuid) from public;
grant execute on function public.cancel_order(uuid) to authenticated;

-- Force PostgREST to reload its schema cache so the new RPCs are immediately
-- callable (same pattern as 0006/0007).
notify pgrst, 'reload schema';
