-- =============================================================================
-- BuildEx — Basic disputes (Stage 10)
--
-- The buyer's happy path is "Confirm & release" (buyer_confirm_complete). The
-- inverse — rejecting a delivery — needs a path too. This migration adds a
-- lightweight, MANUALLY-resolved dispute flow:
--
--   delivered ──open_dispute──▶ disputed ──resolve_dispute('release')──▶ completed
--                                        └──resolve_dispute('refund') ──▶ cancelled
--
-- Resolution is performed by a platform admin (profiles.is_admin). Refunds and
-- payouts are STUBS until the payment stage (Stage 12) — only the order status
-- and the dispute record move now; no money changes hands.
--
-- New objects:
--   • profiles.is_admin           — admin flag gating resolve_dispute + /admin
--   • dispute_status enum         — open / resolved_release / resolved_refund
--   • disputes table              — one open dispute per order, RLS-guarded
--   • open_dispute(order, reason) — buyer-only, delivered → disputed
--   • resolve_dispute(order, out) — admin-only, disputed → completed|cancelled
--   • list_open_disputes()        — admin-only read with order + party context
--                                   (orders RLS hides rows from non-participants,
--                                    so admins read through this definer RPC)
--
-- Re-uses the Stage 5 chat helpers (_ensure_order_conversation /
-- _post_order_event) so every transition is mirrored into the conversation.
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. profiles.is_admin ───────────────────────────────────────────────────
-- Default false. Promote an account by hand in the SQL editor, e.g.:
--   update public.profiles set is_admin = true where username = 'you';
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ─── 2. dispute_status enum ─────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dispute_status') then
    create type public.dispute_status as enum (
      'open',
      'resolved_release',
      'resolved_refund'
    );
  end if;
end$$;

-- ─── 3. disputes table ──────────────────────────────────────────────────────
-- One dispute row per order (a buyer can't open a second once one exists). The
-- unique constraint is the hard guarantee; the RPC gives a friendly error first.
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 4000),
  status public.dispute_status not null default 'open',
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 4000),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists disputes_status_idx
  on public.disputes (status, created_at desc);

alter table public.disputes enable row level security;

-- Buyer + builder of the order may read their own dispute; admins may read all.
-- No INSERT/UPDATE policies — all mutations go through the RPCs below.
drop policy if exists "participants and admins read disputes" on public.disputes;
create policy "participants and admins read disputes"
  on public.disputes for select
  using (
    exists (
      select 1 from public.orders o
       where o.id = disputes.order_id
         and (o.buyer_id = auth.uid() or o.builder_id = auth.uid())
    )
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_admin
    )
  );

-- ─── 4. open_dispute RPC ────────────────────────────────────────────────────
-- Buyer-only, on a DELIVERED order. Moves it to 'disputed', records the dispute,
-- and posts an order_event into the conversation so the builder sees it.
create or replace function public.open_dispute(p_order uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_status public.order_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dispute_id uuid;
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if v_reason is null then
    raise exception 'A reason is required to open a dispute';
  end if;

  select buyer_id, status into v_buyer, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if v_buyer <> me then
    raise exception 'Only the buyer can open a dispute';
  end if;
  if v_status <> 'delivered' then
    raise exception 'A dispute can only be opened on a delivered order';
  end if;
  if exists (select 1 from public.disputes where order_id = p_order) then
    raise exception 'A dispute has already been opened for this order';
  end if;

  update public.orders
     set status = 'disputed'
   where id = p_order;

  insert into public.disputes (order_id, opened_by, reason, status)
  values (p_order, me, v_reason, 'open')
  returning id into v_dispute_id;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'disputed',
    'Buyer opened a dispute — our team will review the delivery.',
    '{}'::jsonb
  );

  return v_dispute_id;
end;
$$;

revoke all on function public.open_dispute(uuid, text) from public;
grant execute on function public.open_dispute(uuid, text) to authenticated;

-- ─── 5. resolve_dispute RPC ─────────────────────────────────────────────────
-- Admin-only (profiles.is_admin). Two outcomes:
--   'release' → order 'completed' (escrow release to builder is a Stage 12 TODO).
--               Mirrors buyer_confirm_complete's side effects so the builder's
--               cached stats + rank stay correct.
--   'refund'  → order 'cancelled' (buyer refund is a Stage 12 STUB — no money
--               moves yet).
-- Either way the dispute row is closed and the conversation gets an order_event.
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
    -- Resolve in the builder's favour: complete the order.
    -- TODO(Stage 12): release the escrowed funds / pay out the builder here.
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

    -- Keep the builder's cached completed_orders / rank in sync, exactly as
    -- buyer_confirm_complete does (a released dispute is still a completion).
    perform public.recompute_builder_review_stats(v_builder);
    perform public.recompute_builder_rank(v_builder);
  else
    -- Resolve in the buyer's favour: cancel the order.
    -- TODO(Stage 12): refund the buyer through the PSP here (STUB for now).
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
  end if;
end;
$$;

revoke all on function public.resolve_dispute(uuid, text, text) from public;
grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- ─── 6. list_open_disputes RPC (admin) ──────────────────────────────────────
-- Admins aren't party to most orders, so the orders RLS policy hides them; this
-- SECURITY DEFINER read returns every OPEN dispute with the order + both
-- parties' public identity for the /admin queue. Non-admins get an empty set
-- (the function self-checks rather than relying on a GRANT alone).
create or replace function public.list_open_disputes()
returns table (
  dispute_id uuid,
  order_id uuid,
  reason text,
  opened_at timestamptz,
  building_size text,
  style text,
  brief text,
  price_kopecks int,
  buyer_id uuid,
  buyer_username text,
  buyer_display_name text,
  builder_id uuid,
  builder_username text,
  builder_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    return;  -- not an admin → empty result, no error
  end if;

  return query
    select d.id, d.order_id, d.reason, d.created_at,
           o.building_size, o.style, o.brief, o.price_kopecks,
           b.id, b.username, b.display_name,
           bu.id, bu.username, bu.display_name
      from public.disputes d
      join public.orders o on o.id = d.order_id
      join public.profiles b on b.id = o.buyer_id
      join public.profiles bu on bu.id = o.builder_id
     where d.status = 'open'
     order by d.created_at asc;
end;
$$;

revoke all on function public.list_open_disputes() from public;
grant execute on function public.list_open_disputes() to authenticated;

-- Force PostgREST to reload its schema cache so the new RPCs + column are
-- immediately callable (same pattern as 0009/0010/0013/0014).
notify pgrst, 'reload schema';
