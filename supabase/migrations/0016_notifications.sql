-- =============================================================================
-- BuildEx — Lightweight in-app notifications (Stage 11)
--
-- Order/review/dispute events already fan out an order_event message into the
-- 1:1 conversation (Stage 5, _post_order_event). But a user shouldn't have to
-- sit in /chats to learn their order was paid, started, delivered, completed,
-- disputed, or that a new review landed. This migration adds a small, generic
-- notifications feed — surfaced by a navbar bell — reusing the same Realtime
-- mechanism as chat.
--
-- Design (least-invasive):
--   • notifications table          — one row per (user, event), RLS-guarded so
--                                     a user only ever sees / marks their own.
--   • _notify(user,type,...)       — internal SECURITY DEFINER insert helper.
--   • _post_order_event is REDEFINED so that, in addition to posting the chat
--     message it already posts, it also notifies every party of the order
--     EXCEPT whoever triggered the transition (auth.uid()). Because all five
--     lifecycle RPCs + both dispute RPCs already call _post_order_event, this
--     single change wires notifications into every order/dispute event without
--     touching those RPCs.
--   • leave_review is REDEFINED to additionally notify the builder of a new
--     review (reviews don't post an order_event, so they need their own hook).
--   • notifications is added to the supabase_realtime publication, exactly like
--     messages in 0007_chat.sql, so the navbar bell updates live.
--
-- Mutations a client makes are read-its-own (SELECT) and mark-read (UPDATE
-- read_at) only — both allowed by RLS directly, mirroring how the chat UI reads
-- messages without an RPC. All INSERTs go through the definer helpers above.
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. notifications table ─────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Free-form event discriminator (matches the order_event names: 'paid',
  -- 'started', 'delivered', 'completed', 'cancelled', 'disputed',
  -- 'dispute_released', 'dispute_refunded', 'review'). Kept as text — no enum —
  -- so future event kinds don't need a migration.
  type text not null,
  title text not null,
  body text,
  -- In-app destination, e.g. '/orders/?id=<uuid>' or '/chats'. Resolved through
  -- withBase() on the client.
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- Partial index to make the unread-count query cheap.
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

-- Owner may read their own notifications.
drop policy if exists "owner reads own notifications" on public.notifications;
create policy "owner reads own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

-- Owner may mark their own notifications read (the only column the UI writes is
-- read_at). No INSERT/DELETE policies — inserts go through _notify (definer).
drop policy if exists "owner updates own notifications" on public.notifications;
create policy "owner updates own notifications"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── 2. _notify — internal insert helper ────────────────────────────────────
-- SECURITY DEFINER so the order/review/dispute RPCs can drop a notification on
-- another user (the counterpart) without an INSERT policy. Revoked from clients.
create or replace function public._notify(
  p_user  uuid,
  p_type  text,
  p_title text,
  p_body  text,
  p_link  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, p_type, p_title, p_body, p_link);
end;
$$;

revoke all on function public._notify(uuid, text, text, text, text) from public;

-- ─── 3. Redefine _post_order_event to also fan out notifications ────────────
-- Identical to the 0010 definition (insert the order_event chat message), with
-- a trailing step: notify both parties of the order EXCEPT the user who
-- triggered the event (auth.uid()). For admin-resolved disputes auth.uid() is
-- neither party, so BOTH buyer and builder get notified — exactly what we want.
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
  v_meta  jsonb;
  v_buyer uuid;
  v_builder uuid;
  v_title text;
  v_link  text := '/orders/?id=' || p_order_id::text;
  r uuid;
begin
  v_meta := coalesce(p_meta, '{}'::jsonb)
         || jsonb_build_object('event', p_event, 'order_id', p_order_id);

  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (p_conv_id, auth.uid(), p_body, 'order_event', v_meta);

  -- Stage 11: mirror the event into the notifications feed.
  v_title := case p_event
    when 'paid'             then 'Order paid'
    when 'started'          then 'Work started'
    when 'delivered'        then 'Delivery ready to review'
    when 'completed'        then 'Order completed'
    when 'cancelled'        then 'Order cancelled'
    when 'disputed'         then 'Dispute opened'
    when 'dispute_released' then 'Dispute resolved'
    when 'dispute_refunded' then 'Dispute resolved'
    else 'Order update'
  end;

  select buyer_id, builder_id into v_buyer, v_builder
    from public.orders where id = p_order_id;

  foreach r in array array[v_buyer, v_builder] loop
    if r is not null and r <> auth.uid() then
      perform public._notify(r, p_event, v_title, p_body, v_link);
    end if;
  end loop;
end;
$$;

revoke all on function public._post_order_event(uuid, uuid, text, text, jsonb) from public;

-- ─── 4. Redefine leave_review to notify the builder ─────────────────────────
-- Identical to the 0013 definition; the only addition is the _notify call after
-- the review is inserted (reviews don't post an order_event, so they need their
-- own notification hook). The reviewer is the buyer, so we always notify the
-- builder (the counterpart).
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

  perform public.recompute_builder_review_stats(v_builder);

  -- Stage 11: tell the builder a new review landed. Star count in the body so
  -- the bell line is meaningful without opening the profile.
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

-- ─── 5. Add notifications to the Realtime publication ───────────────────────
-- Same guarded pattern as messages in 0007_chat.sql — RLS still applies to the
-- Realtime stream, so a client only ever receives its own notification rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end$$;

-- Force PostgREST to reload its schema cache so the new table + functions are
-- immediately visible (same pattern as 0009/0010/0013/0014/0015).
notify pgrst, 'reload schema';
