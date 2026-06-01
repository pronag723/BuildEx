-- =============================================================================
-- BuildEx — Chat ↔ Order integration (Stage 5)
--
-- Lifecycle events on public.orders now post a system message into the 1:1
-- conversation between buyer and builder, so both parties can coordinate in
-- one place. The PAID event in particular carries the full order summary +
-- brief — that's the "brief copied into the chat" behaviour the buyer
-- described.
--
-- Approach:
--   1. Add a discriminated type column (msg_type) + structured meta (jsonb)
--      to public.messages so the UI can render system events distinctly
--      without touching plain text messages.
--   2. Add two SECURITY DEFINER helpers:
--        _ensure_order_conversation(order)  → idempotent get-or-create of the
--          canonical conversation, also stamps orders.conversation_id.
--        _post_order_event(order, conv, event, body, meta) → inserts the
--          system message with msg_type='order_event'. Runs as definer so
--          RLS doesn't fight us (the chat INSERT policy is sender-checked).
--   3. Rewrite the five lifecycle RPCs (mark_order_paid, builder_start_work,
--      builder_deliver, buyer_confirm_complete, cancel_order) so each
--      transition fans out an order_event message after the status update.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── 1. messages.msg_type + meta ────────────────────────────────────────────
alter table public.messages
  add column if not exists msg_type text not null default 'text',
  add column if not exists meta jsonb;

-- Constraint is added separately so re-runs don't fail with "already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_msg_type_check'
  ) then
    alter table public.messages
      add constraint messages_msg_type_check
      check (msg_type in ('text', 'order_event'));
  end if;
end$$;

-- ─── 2. Helper: get-or-create conversation for an order ─────────────────────
-- Pulls buyer/builder from the order row, find-or-creates the canonical
-- (user_a < user_b) conversation, and stamps it on the order so the UI can
-- "Open chat" straight from /orders/?id=.
create or replace function public._ensure_order_conversation(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_builder uuid;
  v_existing uuid;
  v_conv uuid;
  lo uuid;
  hi uuid;
begin
  select buyer_id, builder_id, conversation_id
    into v_buyer, v_builder, v_existing
    from public.orders where id = p_order_id;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  if v_buyer < v_builder then
    lo := v_buyer; hi := v_builder;
  else
    lo := v_builder; hi := v_buyer;
  end if;

  insert into public.conversations (user_a, user_b)
  values (lo, hi)
  on conflict (user_a, user_b) do nothing;

  select id into v_conv
    from public.conversations
   where user_a = lo and user_b = hi;

  update public.orders set conversation_id = v_conv where id = p_order_id;
  return v_conv;
end;
$$;

revoke all on function public._ensure_order_conversation(uuid) from public;

-- ─── 3. Helper: post an order_event system message ──────────────────────────
-- sender_id is set to auth.uid() (the user who triggered the transition) so
-- the existing chat INSERT policy is satisfied even if a future migration
-- enables `force row level security` on messages. The UI keys on
-- msg_type='order_event' to render as a card regardless of sender.
create or replace function public._post_order_event(
  p_order_id uuid,
  p_conv_id  uuid,
  p_event    text,
  p_body     text,
  p_meta     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
begin
  v_meta := coalesce(p_meta, '{}'::jsonb)
         || jsonb_build_object('event', p_event, 'order_id', p_order_id);

  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (p_conv_id, auth.uid(), p_body, 'order_event', v_meta);
end;
$$;

revoke all on function public._post_order_event(uuid, uuid, text, text, jsonb) from public;

-- ─── 4. Rewrite the lifecycle RPCs to fan out order_event messages ──────────
-- The status-transition logic is identical to 0009_orders.sql; the only
-- additions are the _ensure_order_conversation + _post_order_event calls
-- after each successful update.

-- 4a. mark_order_paid — MOCK PAYMENT; brief copied into the chat here.
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
  v_size text;
  v_style text;
  v_brief text;
  v_price int;
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status, building_size, style, brief, price_kopecks
    into v_buyer, v_status, v_size, v_style, v_brief, v_price
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

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'paid',
    'Order paid — escrowed until you confirm the delivery.',
    jsonb_build_object(
      'size', v_size,
      'style', v_style,
      'price_kopecks', v_price,
      'brief', v_brief
    )
  );
end;
$$;

revoke all on function public.mark_order_paid(uuid) from public;
grant execute on function public.mark_order_paid(uuid) to authenticated;

-- 4b. builder_start_work
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
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then raise exception 'Order not found'; end if;
  if v_builder <> me then raise exception 'Only the builder can start work'; end if;
  if v_status <> 'paid' then raise exception 'Order is not in a startable state'; end if;

  update public.orders
     set status = 'in_progress',
         started_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'started',
    'Builder started work on this order.',
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.builder_start_work(uuid) from public;
grant execute on function public.builder_start_work(uuid) to authenticated;

-- 4c. builder_deliver
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
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then raise exception 'Order not found'; end if;
  if v_builder <> me then raise exception 'Only the builder can deliver'; end if;
  if v_status <> 'in_progress' then raise exception 'Order is not in a deliverable state'; end if;

  update public.orders
     set status = 'delivered',
         delivered_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'delivered',
    'Builder marked the order as delivered — review and confirm to release escrow.',
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.builder_deliver(uuid) from public;
grant execute on function public.builder_deliver(uuid) to authenticated;

-- 4d. buyer_confirm_complete
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
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status into v_buyer, v_status
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
end;
$$;

revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

-- 4e. cancel_order
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
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status into v_buyer, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then raise exception 'Order not found'; end if;
  if v_buyer <> me then raise exception 'Only the buyer can cancel'; end if;
  if v_status not in ('pending_payment', 'paid') then
    raise exception 'Order can no longer be cancelled';
  end if;

  -- TODO(Stage 12): if v_status = 'paid', refund the buyer through the PSP.

  update public.orders
     set status = 'cancelled',
         cancelled_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'cancelled',
    'Order was cancelled.',
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.cancel_order(uuid) from public;
grant execute on function public.cancel_order(uuid) to authenticated;

-- Reload PostgREST so the changed function signatures are visible immediately.
notify pgrst, 'reload schema';
