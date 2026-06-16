-- =============================================================================
-- BuildEx — Fix: order lifecycle events shouldn't light the chat unread badge
--
-- Order actions (place/pay/start/deliver/complete/cancel/dispute) post an
-- `order_event` system message into the 1:1 conversation AND fan out a bell
-- notification (Stage 11). The chat unread_count in list_my_conversations
-- (0007) counted EVERY unread message from the other side, including these
-- system order_events. Effects:
--   • A buyer's "paid" event sits unread in the conversation, so the moment the
--     builder takes the next action (e.g. clicks "Start work") an inbox refresh
--     surfaces a red chat-unread dot on the BUILDER — confusing, since they
--     didn't receive a human message and already see the event in the bell.
--   • Order progress is double-surfaced: once in the bell, once in the chat dot.
--
-- Fix: exclude msg_type = 'order_event' from unread_count. Real human messages
-- (text/image) still drive the badge exactly as before; order events are
-- surfaced only through the notifications bell, which already targets the
-- correct (other) party. The conversation still appears in the inbox and its
-- last-message preview is unchanged — only the unread COUNT is affected.
--
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    c.last_message_preview,
    c.last_message_at,
    (
      select count(*)
        from public.messages m
       where m.conversation_id = c.id
         and m.sender_id <> auth.uid()
         and m.read_at is null
         -- Order lifecycle events are surfaced via the notifications bell, not
         -- the chat unread badge.
         and m.msg_type <> 'order_event'
    ) as unread_count
  from public.conversations c
  join public.profiles p
    on p.id = (case when c.user_a = auth.uid() then c.user_b else c.user_a end)
  where (auth.uid() = c.user_a or auth.uid() = c.user_b)
    -- Hide freshly-created threads that never received a message.
    and c.last_message_preview is not null
  order by c.last_message_at desc;
$$;

revoke all on function public.list_my_conversations() from public;
grant execute on function public.list_my_conversations() to authenticated;

notify pgrst, 'reload schema';
