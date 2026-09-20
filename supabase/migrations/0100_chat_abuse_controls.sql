-- =============================================================================
-- BuildEx — Chat abuse controls + message notifications (Stage 6)
--
-- NOTE ON THE FILE NUMBER: this is the file Stage 6 called "0099". 0099 was
-- already taken by 0099_builder_social_links.sql, so it ships as 0100.
--
-- Why this exists
-- ---------------
-- Chat was never order-gated: get_or_create_conversation only checks that the
-- caller is authenticated and that the recipient exists. That was acceptable
-- while creating an account meant completing a paid, role-gated registration.
-- After the pivot, signing in is one click — so the cheap attack is a single
-- account opening a thread with every builder in the directory and dropping one
-- message in each. The 0030 flood guard does not stop that: it caps messages per
-- SENDER per 10 seconds, and one message per builder is not a flood.
--
-- This migration adds the control that does stop it, plus the reporting path the
-- moderator console (Stage 7) reads from:
--
--   1. Tunable limits on how many NEW conversations one account may open, per
--      rolling hour and per rolling day.
--   2. public.conversation_opens — the ledger those limits count. Only genuine
--      creations are recorded; re-opening an existing thread is free, forever.
--   3. get_or_create_conversation REDEFINED to enforce them, with a plain-English
--      error the chat UI can show verbatim.
--   4. public.conversation_reports + report_conversation(uuid, text) — a
--      participant flags a thread for review. Reporters read their own reports;
--      admins read all.
--   5. A new-message notification producer. Every other notification type was
--      written by the order/review/dispute RPCs, which are decommissioned, so
--      without this the bell could only ever show dead history.
--
-- Nothing here deletes or rewrites user data. conversations, messages and the
-- existing notification rows are untouched.
--
-- Idempotent — safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";


-- ─── 1. TUNING — the two numbers this whole file turns on ───────────────────
-- Kept as functions rather than inline literals so changing a limit is a
-- two-line edit and a re-run of this file, with no other call site to find.
--
-- The defaults are set well above real use and well below an attack: a person
-- shopping for a builder might open five or six threads in an evening, and a
-- script wants hundreds. Both are per ACCOUNT, and only count threads the caller
-- actually created — replying in, or reopening, an existing thread never counts.

create or replace function public.chat_new_conversations_per_hour()
returns int
language sql
immutable
set search_path = public
as $$ select 10; $$;

create or replace function public.chat_new_conversations_per_day()
returns int
language sql
immutable
set search_path = public
as $$ select 30; $$;

revoke all on function public.chat_new_conversations_per_hour() from public;
revoke all on function public.chat_new_conversations_per_day() from public;
grant execute on function public.chat_new_conversations_per_hour() to authenticated;
grant execute on function public.chat_new_conversations_per_day() to authenticated;

-- Reports one account may file per rolling day. Reporting is a safety valve, not
-- something a genuine user does in bulk; this only stops report-flooding the
-- moderator queue.
create or replace function public.chat_reports_per_day()
returns int
language sql
immutable
set search_path = public
as $$ select 20; $$;

revoke all on function public.chat_reports_per_day() from public;
grant execute on function public.chat_reports_per_day() to authenticated;


-- ─── 2. conversation_opens — the ledger the limits count ────────────────────
-- A separate append-only table rather than a created_by column on
-- conversations: conversations is on the never-touch list, and a thread's
-- opener is an abuse-control fact, not part of the thread itself.
--
-- No client-facing policies. The only writer is get_or_create_conversation
-- (SECURITY DEFINER) and the only reader is the limit check inside it, so the
-- table is RLS-enabled with no policy at all — which denies every client.
create table if not exists public.conversation_opens (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opener_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The limit query is "count my rows since <timestamp>", so index exactly that.
create index if not exists conversation_opens_opener_idx
  on public.conversation_opens (opener_id, created_at desc);

alter table public.conversation_opens enable row level security;


-- ─── 3. get_or_create_conversation — now rate limited ───────────────────────
-- Same contract as 0064 (returns the canonical thread id, creating it if
-- needed), with two additions: the per-account open limits, and a neutral
-- wording for the can_direct_message rejection.
--
-- can_direct_message is deliberately still called. 0097 §"DELIBERATELY NOT
-- REVOKED" explains why: the messages RLS chain runs through it, production has
-- no rows that make it say no, and removing it here would silently diverge from
-- the policies that still consult it.
--
-- Ordering matters. An EXISTING thread short-circuits before any limit check, so
-- a rate-limited account can always keep talking to the people it already knows
-- — the limit costs new strangers, never an ongoing conversation.
create or replace function public.get_or_create_conversation(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  lo uuid;
  hi uuid;
  conv uuid;
  v_hour int;
  v_day  int;
  v_created boolean := false;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if other is null or other = me then raise exception 'Invalid recipient'; end if;
  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'Recipient not found';
  end if;
  if not public.can_direct_message(me, other) then
    raise exception 'This member is not accepting direct messages.'
      using errcode = 'check_violation';
  end if;

  if me < other then lo := me; hi := other; else lo := other; hi := me; end if;

  -- Already talking to this person? Nothing to rate limit.
  select id into conv from public.conversations where user_a = lo and user_b = hi;
  if conv is not null then
    return conv;
  end if;

  -- Opening a NEW thread. Both windows are checked before anything is written,
  -- and the messages are written for a person to read, not a log to parse.
  select count(*) into v_hour
    from public.conversation_opens
   where opener_id = me
     and created_at > now() - interval '1 hour';

  if v_hour >= public.chat_new_conversations_per_hour() then
    raise exception
      'You have started too many new conversations in the past hour. Please try again later.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_day
    from public.conversation_opens
   where opener_id = me
     and created_at > now() - interval '1 day';

  if v_day >= public.chat_new_conversations_per_day() then
    raise exception
      'You have reached the daily limit for starting new conversations. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  -- ON CONFLICT covers the race where the other party opened the same thread
  -- between the SELECT above and here: that returns no row, so the open is not
  -- counted against either side.
  insert into public.conversations (user_a, user_b)
  values (lo, hi)
  on conflict (user_a, user_b) do nothing
  returning id into conv;

  v_created := conv is not null;

  if not v_created then
    select id into conv from public.conversations where user_a = lo and user_b = hi;
  else
    insert into public.conversation_opens (conversation_id, opener_id)
    values (conv, me);
  end if;

  return conv;
end;
$$;

revoke all on function public.get_or_create_conversation(uuid) from public;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;


-- ─── 4. conversation_reports ────────────────────────────────────────────────
-- One row per report. Status moves open → reviewed | dismissed; Stage 7 gives
-- the moderator console the write side of that.
create table if not exists public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists conversation_reports_status_idx
  on public.conversation_reports (status, created_at desc);

create index if not exists conversation_reports_reporter_idx
  on public.conversation_reports (reporter_id, created_at desc);

-- One OPEN report per (conversation, reporter). Re-reporting the same thread
-- while a moderator still has it in the queue is a duplicate, not a second
-- signal; once it is reviewed or dismissed, a fresh report is allowed.
create unique index if not exists conversation_reports_one_open_idx
  on public.conversation_reports (conversation_id, reporter_id)
  where status = 'open';

alter table public.conversation_reports enable row level security;

-- A reporter reads their own reports (so the UI can say "already reported").
drop policy if exists "reporter reads own reports" on public.conversation_reports;
create policy "reporter reads own reports"
  on public.conversation_reports for select
  using (reporter_id = auth.uid());

-- Admins read every report — this is the moderator queue.
drop policy if exists "admins read all reports" on public.conversation_reports;
create policy "admins read all reports"
  on public.conversation_reports for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- No INSERT/UPDATE/DELETE policies: writes go through the definer RPC below
-- (and, in Stage 7, an admin RPC), matching how every other privileged write in
-- this schema works.


-- ─── 5. report_conversation RPC ─────────────────────────────────────────────
create or replace function public.report_conversation(
  p_conversation uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_today int;
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from public.conversations c
     where c.id = p_conversation
       and (c.user_a = me or c.user_b = me)
  ) then
    raise exception 'Conversation not found';
  end if;

  if v_reason = '' then
    raise exception 'Please describe what is wrong with this conversation.'
      using errcode = 'check_violation';
  end if;

  v_reason := left(v_reason, 2000);

  if exists (
    select 1 from public.conversation_reports
     where conversation_id = p_conversation
       and reporter_id = me
       and status = 'open'
  ) then
    raise exception 'You have already reported this conversation. Our team is reviewing it.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_today
    from public.conversation_reports
   where reporter_id = me
     and created_at > now() - interval '1 day';

  if v_today >= public.chat_reports_per_day() then
    raise exception 'You have submitted too many reports today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  insert into public.conversation_reports (conversation_id, reporter_id, reason)
  values (p_conversation, me, v_reason)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.report_conversation(uuid, text) from public;
grant execute on function public.report_conversation(uuid, text) to authenticated;

-- Has the caller already got an open report on this thread? Lets the composer
-- show "Reported" without the client needing to read the reports table.
create or replace function public.have_i_reported_conversation(p_conversation uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_reports r
     where r.conversation_id = p_conversation
       and r.reporter_id = auth.uid()
       and r.status = 'open'
  );
$$;

revoke all on function public.have_i_reported_conversation(uuid) from public;
grant execute on function public.have_i_reported_conversation(uuid) to authenticated;


-- ─── 6. New-message notifications ───────────────────────────────────────────
-- The notifications feed (0016) was populated exclusively by _post_order_event
-- and leave_review. Both are decommissioned, so the bell has no living producer
-- and chat activity — the only thing left worth interrupting someone for — was
-- never one. This trigger is that producer.
--
-- One row per conversation, not per message: if the recipient already has an
-- UNREAD notification pointing at this thread, the new message updates it in
-- place instead of stacking. A twenty-message burst is one bell, and the bell
-- clears in one click.
--
-- Skipped for the sender's own messages, and for the legacy msg_type values the
-- order lifecycle wrote.
create or replace function public.notify_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_sender    text;
  v_preview   text;
  v_link      text;
begin
  if coalesce(new.msg_type, 'text') not in ('text', 'image') then
    return new;
  end if;

  select case when c.user_a = new.sender_id then c.user_b else c.user_a end
    into v_recipient
    from public.conversations c
   where c.id = new.conversation_id
     and c.conversation_type = 'direct'
     and new.sender_id in (c.user_a, c.user_b);

  if v_recipient is null or v_recipient = new.sender_id then
    return new;
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), '@' || p.username, 'Someone')
    into v_sender
    from public.profiles p
   where p.id = new.sender_id;

  v_preview := case
    when new.msg_type = 'image' and coalesce(btrim(new.body), '') = '' then 'Sent a photo'
    when new.msg_type = 'image' then 'Photo · ' || left(new.body, 100)
    else left(coalesce(new.body, ''), 120)
  end;

  v_link := '/chats?c=' || new.conversation_id::text;

  update public.notifications
     set title      = coalesce(v_sender, 'New message'),
         body       = v_preview,
         created_at = new.created_at
   where user_id = v_recipient
     and type = 'message'
     and link = v_link
     and read_at is null;

  if not found then
    perform public._notify(
      v_recipient,
      'message',
      coalesce(v_sender, 'New message'),
      v_preview,
      v_link
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_conversation_message() from public;

drop trigger if exists messages_notify_recipient on public.messages;
create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_conversation_message();


notify pgrst, 'reload schema';
