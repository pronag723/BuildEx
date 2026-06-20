-- =============================================================================
-- BuildEx — Real payments (NOWPayments, crypto + card)   [Stage 12 / Phase 3]
--
-- Replaces the MOCK payment path (mark_order_paid in 0009) with a real,
-- webhook-driven flow. BuildEx ships as a static export (no server), so the
-- secret-holding, signature-verifying half lives in Supabase Edge Functions
-- (supabase/functions/create-invoice + payment-webhook). This migration adds the
-- DB pieces those functions and the app need:
--
--   • payments table              — one row per order (idempotency key), holds the
--                                   gateway invoice id / amount / method / status
--   • builder payout preference   — builder_profiles.payout_method / payout_details
--                                   (where the builder wants to be paid out)
--   • mark_order_paid_internal()  — SECURITY DEFINER, service_role-only. The real
--                                   replacement for the client mock; the webhook
--                                   calls it after verifying the gateway signature.
--
-- Money stays integer USD cents in the legacy *_kopecks columns — the commission
-- math (place_order / ranks / studio overrides) is NOT touched.
--
-- DORMANT BY DEFAULT: the client mock (mark_order_paid) is intentionally LEFT IN
-- PLACE. The app gates the real vs mock path on NEXT_PUBLIC_PAYMENTS_ENABLED, so
-- until NOWPayments keys exist the mock keeps the demo working. When real payments
-- are switched live, follow this with a tiny 0032 that
--   revoke execute on function public.mark_order_paid(uuid) from authenticated;
-- (Do NOT do that here — it would break the working mock path.)
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. payments table ──────────────────────────────────────────────────────
-- order_id is UNIQUE so the webhook is idempotent (a gateway may retry the same
-- callback). amount_cents mirrors the order price we requested. `method` is the
-- buyer's chosen rail (crypto | card), `raw` keeps the last gateway payload for
-- debugging / chargeback defense.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'nowpayments',
  invoice_id text,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',
  method text check (method is null or method in ('crypto', 'card')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on public.payments (status);

-- updated_at touch (reuse the shared trigger fn from 0009).
drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.touch_order_updated_at();

alter table public.payments enable row level security;

-- A payment is readable by the order's buyer or builder, and by admins. No
-- client INSERT/UPDATE/DELETE — every write goes through the service-role RPC
-- below (the webhook) or the create-invoice Edge Function (service role).
drop policy if exists "participants read payments" on public.payments;
create policy "participants read payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders o
       where o.id = payments.order_id
         and (o.buyer_id = auth.uid() or o.builder_id = auth.uid())
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

-- ─── 2. Builder payout preference ───────────────────────────────────────────
-- Where the builder wants to be paid out once an order completes. These carry no
-- economic privilege (they don't affect price / commission / rank), so unlike
-- the 0028-locked columns they are safe for the builder to self-edit.
alter table public.builder_profiles
  add column if not exists payout_method text
    check (payout_method is null or payout_method in ('crypto', 'card')),
  add column if not exists payout_details text
    check (payout_details is null or char_length(payout_details) <= 400);

-- 0028 column-privilege lockdown revoked the blanket INSERT/UPDATE and granted
-- back only an explicit column list. GRANT is additive, so we extend that list
-- with the two new self-editable columns (the upsert path in
-- lib/onboarding/api.js needs BOTH insert and update).
grant insert (payout_method, payout_details) on public.builder_profiles to authenticated;
grant update (payout_method, payout_details) on public.builder_profiles to authenticated;

-- ─── 3. mark_order_paid_internal — the real, webhook-driven mark-paid ────────
-- Called ONLY by the payment-webhook Edge Function, which authenticates to
-- Supabase with the service-role key and has already verified the gateway's
-- signature. SECURITY DEFINER + revoked from public/authenticated so no signed-in
-- user can flip an order to paid without actually paying.
--
-- Idempotent: a no-op if the order is already past pending_payment (the gateway
-- may deliver the same callback more than once). Records / updates the payments
-- row in the same transaction as the status flip.
create or replace function public.mark_order_paid_internal(
  p_order uuid,
  p_invoice text default null,
  p_amount_cents int default null,
  p_method text default null,
  p_raw jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_price int;
begin
  select status, price_kopecks into v_status, v_price
    from public.orders where id = p_order for update;

  if v_status is null then
    raise exception 'Order not found';
  end if;

  -- Already handled (or no longer awaiting payment) → idempotent no-op. We still
  -- upsert the payments row so a late callback updates the ledger/raw payload.
  insert into public.payments (order_id, invoice_id, amount_cents, method, status, raw)
  values (
    p_order,
    p_invoice,
    coalesce(p_amount_cents, v_price),
    nullif(p_method, ''),
    'paid',
    p_raw
  )
  on conflict (order_id) do update
    set invoice_id = coalesce(excluded.invoice_id, public.payments.invoice_id),
        method     = coalesce(excluded.method, public.payments.method),
        status     = 'paid',
        raw        = coalesce(excluded.raw, public.payments.raw);

  if v_status <> 'pending_payment' then
    return;  -- order already advanced; ledger updated above, nothing else to do
  end if;

  update public.orders
     set status = 'paid',
         paid_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) from public;
grant execute on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) to service_role;

-- ─── 4. record_pending_payment — create-invoice's ledger insert ──────────────
-- The create-invoice Edge Function (service role) calls this after the gateway
-- returns a checkout URL, so the payments row exists in 'pending' before the
-- buyer pays. Idempotent on re-checkout of the same order (updates the invoice).
create or replace function public.record_pending_payment(
  p_order uuid,
  p_invoice text,
  p_amount_cents int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payments (order_id, invoice_id, amount_cents, status)
  values (p_order, p_invoice, p_amount_cents, 'pending')
  on conflict (order_id) do update
    set invoice_id = excluded.invoice_id,
        amount_cents = excluded.amount_cents,
        -- never downgrade a paid row back to pending on a stray re-checkout
        status = case when public.payments.status = 'paid' then 'paid' else 'pending' end;
end;
$$;

revoke all on function public.record_pending_payment(uuid, text, int) from public;
grant execute on function public.record_pending_payment(uuid, text, int) to service_role;

-- Refunds (cancel_order / resolve_dispute refund leg) stay MANUAL via the
-- NOWPayments dashboard at this volume; payments.status = 'refunded' is reserved
-- for when that's recorded. Studio override clawback on refund already works
-- (resolve_dispute in 0026). No auto-refund is built here.

-- Force PostgREST to reload its schema cache so the new objects are immediately
-- visible (same pattern as every other migration here).
notify pgrst, 'reload schema';
