-- =============================================================================
-- BuildEx — Builder payouts (crypto, NOWPayments Mass Payout)   [Stage 12 / Phase 4]
--
-- The incoming half (buyer → platform) shipped in 0031/0032. This adds the
-- OUTGOING half: paying the builder their `builder_earnings_kopecks` after an
-- order completes, in USDT (TRC-20) to the wallet they set in their profile.
--
-- BuildEx is a static export (no server), and a real payout must hold the
-- NOWPayments payout credentials + complete a 2FA step, so the actual send lives
-- in Supabase Edge Functions (supabase/functions/create-payout + verify-payout).
-- This migration adds the DB pieces those functions and the admin console need:
--
--   • payouts table          — one row per completed order (idempotency key),
--                              the payout queue: amount, destination, status,
--                              and the gateway batch id.
--   • _enqueue_payout()      — internal; called from completion / dispute-release
--                              to queue a payout (mirrors _accrue_studio_override).
--   • mark_payouts_* RPCs    — service-role only; the Edge Functions flip status
--                              after the gateway call (create batch → verify 2FA).
--   • admin_requeue_payout() — admin re-queues a 'blocked'/'failed' row once the
--                              builder's wallet is fixed.
--
-- Money stays integer USD cents in `amount_cents`; USDT is treated 1:1 with USD
-- at payout time (the small network fee comes out of platform margin, so the
-- builder receives their earnings in full). Commission math is NOT touched.
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. payouts table (the queue) ───────────────────────────────────────────
-- order_id is UNIQUE so a payout is enqueued exactly once per order (a double
-- completion / dispute-release is a no-op). `destination` snapshots the builder's
-- USDT wallet at completion time. `raw` keeps the last gateway payload.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USDT',
  destination text,
  provider text not null default 'nowpayments',
  provider_batch_id text,
  provider_payout_id text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'blocked')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists payouts_status_idx on public.payouts (status);
create index if not exists payouts_builder_idx on public.payouts (builder_id, created_at desc);
create index if not exists payouts_batch_idx on public.payouts (provider_batch_id);

-- updated_at touch (reuse the shared trigger fn from 0009).
drop trigger if exists payouts_touch_updated_at on public.payouts;
create trigger payouts_touch_updated_at
  before update on public.payouts
  for each row execute function public.touch_order_updated_at();

alter table public.payouts enable row level security;

-- A payout is readable by the builder it pays, and by admins. No client
-- INSERT/UPDATE/DELETE — every write goes through the SECURITY DEFINER functions
-- below (enqueue from completion; the Edge Functions via service role).
drop policy if exists "participants read payouts" on public.payouts;
create policy "participants read payouts"
  on public.payouts for select
  using (
    builder_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ─── 2. _enqueue_payout — queue a completed order's payout ───────────────────
-- Internal (not granted to clients), mirrors _accrue_studio_override (0026): it's
-- only ever called from within the SECURITY DEFINER completion functions, so it
-- runs in their privileged context and the insert bypasses RLS. Idempotent via
-- payouts.order_id UNIQUE. A builder with no wallet on file → status 'blocked'
-- (the operator sees it; admin_requeue_payout recovers it once a wallet is set).
create or replace function public._enqueue_payout(p_order uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_builder      uuid;
  v_earnings     int;
  v_wallet       text;
  v_payout_method text;
  v_currency     text;
begin
  -- Already queued? (idempotent re-entry / double completion guard.)
  if exists (select 1 from public.payouts where order_id = p_order) then
    return;
  end if;

  select o.builder_id, o.builder_earnings_kopecks
    into v_builder, v_earnings
    from public.orders o
   where o.id = p_order;

  if v_builder is null then
    return;  -- order vanished; nothing to enqueue
  end if;

  select nullif(btrim(coalesce(payout_details, '')), ''),
         coalesce(payout_method, 'usdt_trc20')
    into v_wallet, v_payout_method
    from public.builder_profiles
   where id = v_builder;

  -- Map the builder's chosen network to the NOWPayments withdrawal currency code.
  v_currency := case v_payout_method
    when 'usdt_erc20' then 'usdterc20'
    else 'usdttrc20'   -- usdt_trc20 + legacy "crypto" both default to TRC-20
  end;

  insert into public.payouts (order_id, builder_id, amount_cents, currency, destination, status)
  values (
    p_order,
    v_builder,
    coalesce(v_earnings, 0),
    v_currency,
    v_wallet,
    case when v_wallet is null then 'blocked' else 'pending' end
  );
end;
$$;

revoke all on function public._enqueue_payout(uuid) from public;

-- ─── 3. buyer_confirm_complete — enqueue payout on completion ────────────────
-- Redefinition of the 0026 version. Adds the _enqueue_payout call after the
-- studio override accrual. Everything else (status transition / chat event /
-- stats + rank refresh) preserved verbatim.
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

  perform public.recompute_builder_review_stats(v_builder);
  perform public.recompute_builder_rank(v_builder);
  -- Studios: ledger the studio's permanent override on this completed order.
  perform public._accrue_studio_override(p_order);
  -- Payments: queue the builder's earnings payout.
  perform public._enqueue_payout(p_order);
end;
$$;

revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

-- ─── 4. resolve_dispute — enqueue payout on release ─────────────────────────
-- Redefinition of the 0026 version. A 'release' is a completion → enqueue the
-- payout exactly like buyer_confirm_complete. 'refund' is unchanged (no payout;
-- any accrued override is clawed back).
create or replace function public.resolve_dispute(
  p_order uuid,
  p_outcome text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_is_admin boolean;
  v_builder uuid;
  v_status public.order_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where id = me;
  if v_is_admin is not true then
    raise exception 'Only an admin can resolve disputes';
  end if;
  if p_outcome not in ('release', 'refund') then
    raise exception 'Outcome must be release or refund';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then
    raise exception 'Order not found';
  end if;
  if v_status <> 'disputed' then
    raise exception 'Order is not under dispute';
  end if;
  if not exists (
    select 1 from public.disputes where order_id = p_order and status = 'open'
  ) then
    raise exception 'No open dispute for this order';
  end if;

  v_conv := public._ensure_order_conversation(p_order);

  if p_outcome = 'release' then
    update public.orders
       set status = 'completed',
           completed_at = now()
     where id = p_order;

    update public.disputes
       set status = 'resolved_release',
           resolution_note = v_note,
           resolved_by = me,
           resolved_at = now()
     where order_id = p_order;

    perform public._post_order_event(
      p_order, v_conv, 'dispute_released',
      'Dispute resolved — released to the builder. Order completed.',
      '{}'::jsonb
    );

    perform public.recompute_builder_review_stats(v_builder);
    perform public.recompute_builder_rank(v_builder);
    -- A released dispute is still a completion → accrue the studio override.
    perform public._accrue_studio_override(p_order);
    -- …and queue the builder's earnings payout.
    perform public._enqueue_payout(p_order);
  else
    update public.orders
       set status = 'cancelled',
           cancelled_at = now()
     where id = p_order;

    update public.disputes
       set status = 'resolved_refund',
           resolution_note = v_note,
           resolved_by = me,
           resolved_at = now()
     where order_id = p_order;

    perform public._post_order_event(
      p_order, v_conv, 'dispute_refunded',
      'Dispute resolved — refunded to the buyer. Order cancelled.',
      '{}'::jsonb
    );

    -- Refunded: undo any override accrued for this order (normally none).
    update public.studio_overrides
       set status = 'clawed_back'
     where order_id = p_order
       and status = 'accrued';
  end if;
end;
$$;

revoke all on function public.resolve_dispute(uuid, text, text) from public;
grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- ─── 5. mark_payouts_* — service-role status flips (Edge Functions) ──────────
-- Called ONLY by the create-payout / verify-payout Edge Functions, which
-- authenticate with the service-role key after verifying the caller is an admin
-- and after the NOWPayments call. Revoked from public/authenticated.

-- create-payout: a Mass Payout batch was created → move pending rows to
-- 'processing' and stamp the batch id. Only touches 'pending' rows (so a stray
-- call can't re-process a sent/failed payout).
create or replace function public.mark_payouts_processing(p_payouts uuid[], p_batch_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'processing',
         provider_batch_id = p_batch_id
   where id = any(p_payouts)
     and status = 'pending';
end;
$$;
revoke all on function public.mark_payouts_processing(uuid[], text) from public;
grant execute on function public.mark_payouts_processing(uuid[], text) to service_role;

-- verify-payout: the 2FA-verified batch settled → mark its rows 'sent'.
create or replace function public.mark_payouts_sent(p_batch_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'sent',
         sent_at = now(),
         raw = coalesce(p_raw, raw)
   where provider_batch_id = p_batch_id
     and status = 'processing';
end;
$$;
revoke all on function public.mark_payouts_sent(text, jsonb) from public;
grant execute on function public.mark_payouts_sent(text, jsonb) to service_role;

-- A batch failed / was rejected → return its rows to a re-queueable 'failed'.
create or replace function public.mark_payouts_failed(p_batch_id text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'failed',
         raw = coalesce(
           case when p_note is null then null
                else jsonb_build_object('error', p_note) end,
           raw
         )
   where provider_batch_id = p_batch_id
     and status = 'processing';
end;
$$;
revoke all on function public.mark_payouts_failed(text, text) from public;
grant execute on function public.mark_payouts_failed(text, text) to service_role;

-- ─── 6. admin_requeue_payout — recover a blocked/failed row ──────────────────
-- Admin-callable (is_admin re-checked). Re-reads the builder's CURRENT wallet and
-- returns a 'blocked' (no wallet at completion) or 'failed' (gateway error) row to
-- 'pending' so it can be sent again. Clears the stale batch id.
create or replace function public.admin_requeue_payout(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_builder uuid;
  v_wallet text;
  v_status text;
begin
  perform public._require_admin();

  select builder_id, status into v_builder, v_status
    from public.payouts where id = p_payout for update;
  if v_builder is null then
    raise exception 'Payout not found';
  end if;
  if v_status not in ('blocked', 'failed') then
    raise exception 'Only blocked or failed payouts can be re-queued';
  end if;

  select nullif(btrim(coalesce(payout_details, '')), '')
    into v_wallet
    from public.builder_profiles where id = v_builder;
  if v_wallet is null then
    raise exception 'Builder still has no payout wallet on file';
  end if;

  update public.payouts
     set status = 'pending',
         destination = v_wallet,
         provider_batch_id = null
   where id = p_payout;
end;
$$;
revoke all on function public.admin_requeue_payout(uuid) from public;
grant execute on function public.admin_requeue_payout(uuid) to authenticated;

-- Force PostgREST to reload its schema cache so the new objects are immediately
-- visible (same pattern as every other migration here).
notify pgrst, 'reload schema';
