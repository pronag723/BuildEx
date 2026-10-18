-- =============================================================================
-- BuildEx — Email notifications for unread chat messages
--
-- What this does
-- --------------
-- When someone messages you and you still have not opened the conversation
-- ~10 minutes later, BuildEx emails you once: who wrote, a short preview, and a
-- button back to the thread. One email per unread burst per conversation, with
-- per-recipient and site-wide caps on top, and a one-click opt-out.
--
--   1. Tunables (delay, caps, retry budget, staleness) as functions, like 0100.
--   2. profiles.email_on_message + profiles.locale, client-writable by column
--      (the 0028 pattern) but NOT client-readable — see §2.
--   3. public.message_emails — one row per unread burst. The queue the sender
--      claims from, and the ledger the caps count.
--   4. queue_message_email() — an AFTER INSERT trigger on messages that opens a
--      burst, or leaves the open one alone.
--   5. claim_message_emails() / complete_message_email() — service-role-only
--      RPCs the send-message-emails Edge Function calls. Recipient emails are
--      read from auth.users here and nowhere else.
--   6. get_my_email_settings() / init_my_locale() — the account page and the
--      language switch.
--   7. pg_cron + pg_net: every 2 minutes, if anything is due, POST to the Edge
--      Function with a shared secret. URL and secret live in Supabase Vault —
--      this repository is public, so neither appears in this file. The secret
--      is generated here, inside the database, and nobody ever copies it.
--
-- Where "read" comes from
-- -----------------------
-- NOT notifications.read_at. That only flips when the bell is clicked, or when
-- a notification lands on the page you are already viewing. Opening a thread
-- from the /chats inbox never touches it, so someone who reads every message
-- but ignores the bell would be emailed about all of them.
--
-- The source of truth is public.conversation_reads.last_read_at (0043): the
-- per-user cursor mark_conversation_read() moves to now() whenever /chats opens
-- a thread, and again for each message that arrives while it is open. It is
-- what list_my_conversations() counts unread messages against, so "unread" here
-- means exactly what the badge in the app means.
--
-- Why not hang this off the 0100 notification row
-- ------------------------------------------------
-- notify_conversation_message() keeps ONE unread notification per thread and
-- rewrites its created_at on every new message. Two problems for email:
--   • Its "burst" ends when the bell is cleared, not when the thread is read. A
--     user who reads in /chats but never clicks the bell stays in one endless
--     burst and would never be emailed again.
--   • created_at moves with every message, so a delay measured from it would
--     slide forward for as long as the sender keeps typing.
-- So bursts get their own table, keyed on the read cursor, with the time of the
-- first unread message stored once and never moved (first_unread_at).
--
-- Burst rules (enforced by the trigger in §4):
--   • No burst for this recipient + thread yet → open one, due at
--     first_unread_at + delay.
--   • Latest burst started AFTER the recipient last read the thread → same
--     burst. Nothing changes: no second email, no postponement. This holds
--     whatever the burst's status — pending, sent, skipped or failed.
--   • Recipient has read since the latest burst started → that burst is over.
--     If it was still pending it is closed as 'read', and a new one opens.
--
-- Nothing here changes chat behaviour. The trigger swallows its own errors, so
-- email bookkeeping can never stop a message from being sent.
--
-- Idempotent — safe to re-run. Do not paste secrets into this file.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ─── 1. TUNING ──────────────────────────────────────────────────────────────
-- Change a number by editing it here and re-running the file. Nothing else
-- hard-codes these values.

-- How long a message must stay unread before it is emailed about.
create or replace function public.message_email_delay()
returns interval
language sql
immutable
set search_path = public
as $$ select interval '10 minutes'; $$;

-- Per-recipient caps, counted over every thread. Bursts beyond them are
-- skipped, not delayed: by the sixth email in an hour the person knows to
-- check BuildEx.
create or replace function public.message_emails_per_hour()
returns int
language sql
immutable
set search_path = public
as $$ select 5; $$;

create or replace function public.message_emails_per_day()
returns int
language sql
immutable
set search_path = public
as $$ select 20; $$;

-- Site-wide ceiling per rolling day. Resend's free tier allows 100 emails a
-- day; this keeps a margin under it. Raise it when the plan changes.
create or replace function public.message_emails_global_per_day()
returns int
language sql
immutable
set search_path = public
as $$ select 90; $$;

-- Delivery attempts per burst before it is marked failed.
create or replace function public.message_email_max_attempts()
returns int
language sql
immutable
set search_path = public
as $$ select 3; $$;

-- Bursts older than this are dropped instead of sent. Stops a backlog (say,
-- the queue filling for days before the Edge Function is deployed) from
-- emailing people about week-old messages.
create or replace function public.message_email_max_age()
returns interval
language sql
immutable
set search_path = public
as $$ select interval '2 days'; $$;

revoke all on function public.message_email_delay() from public, anon, authenticated;
revoke all on function public.message_emails_per_hour() from public, anon, authenticated;
revoke all on function public.message_emails_per_day() from public, anon, authenticated;
revoke all on function public.message_emails_global_per_day() from public, anon, authenticated;
revoke all on function public.message_email_max_attempts() from public, anon, authenticated;
revoke all on function public.message_email_max_age() from public, anon, authenticated;


-- ─── 2. profiles: the opt-out and the email language ────────────────────────
-- email_on_message: on by default for everyone, builders and clients alike.
--
-- locale: the language emails are written in. NULL means "never chosen" and is
-- sent as English, so the effective default is 'en'. It is nullable rather than
-- `default 'en'` because the app fills it from the interface language at sign-in
-- only while it is empty (init_my_locale, §6) — with a stored default there
-- would be no way to tell "picked English" from "never picked".
alter table public.profiles
  add column if not exists email_on_message boolean not null default true,
  add column if not exists locale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_locale_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locale_check check (locale is null or locale in ('en', 'ru'));
  end if;
end;
$$;

-- Writes follow 0028: table-wide UPDATE was revoked there, so a new column has
-- no write privilege until it is granted by name. The owner-row RLS policy
-- (0001) still limits the write to the caller's own row.
grant update (email_on_message, locale) on public.profiles to authenticated;

-- Reads deliberately are NOT granted. profiles is publicly readable (0001 +
-- 0028's column list), so a column SELECT grant would let anyone read anyone's
-- notification preference. The owner reads both through get_my_email_settings()
-- (§6). 0028 also revoked table-wide SELECT, so a new column is unreadable by
-- clients until granted by name — this REVOKE just states the intent.
revoke select (email_on_message, locale) on public.profiles from anon, authenticated;


-- ─── 3. message_emails — one row per unread burst ───────────────────────────
-- status:
--   pending  waiting for due_at (or for a retry after a failed attempt)
--   sending  claimed by a run of send-message-emails; reclaimable after 15 min
--   sent     delivered to Resend
--   read     the recipient opened the thread before it was sent
--   skipped  not sent on purpose — skip_reason says why
--   failed   out of attempts, or a permanent provider error
--
-- The sender_name / preview_* / unread_count / locale columns are a snapshot
-- taken at the first claim. Retries reuse them verbatim, so a retry sends the
-- same payload under the same Resend Idempotency-Key — which is what lets
-- Resend recognise a duplicate after a run dies between "sent" and "recorded".
--
-- The recipient's email address is never stored here. It is read from
-- auth.users at claim time and handed straight to the Edge Function.
create table if not exists public.message_emails (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  -- When the first unread message of the burst arrived. Never moved by later
  -- messages: that is what stops a chatty sender postponing the email forever.
  first_unread_at timestamptz not null,
  -- Earliest moment to send: first_unread_at + delay, pushed out only by retry
  -- backoff.
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'read', 'skipped', 'failed')),
  skip_reason text,
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  locale text,
  sender_name text,
  preview_kind text check (preview_kind is null or preview_kind in ('text', 'photo', 'photo_caption')),
  preview_text text,
  unread_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open burst per recipient + thread. The trigger's
-- ON CONFLICT relies on exactly this predicate.
create unique index if not exists message_emails_one_pending_idx
  on public.message_emails (recipient_id, conversation_id)
  where status = 'pending';

-- The trigger's "latest burst for this pair" lookup.
create index if not exists message_emails_pair_idx
  on public.message_emails (recipient_id, conversation_id, first_unread_at desc);

-- The claim scan.
create index if not exists message_emails_due_idx
  on public.message_emails (due_at)
  where status = 'pending';

-- The caps: "how many did this recipient (or everyone) get in the last day".
create index if not exists message_emails_claimed_idx
  on public.message_emails (recipient_id, claimed_at desc)
  where status in ('sending', 'sent');

create index if not exists message_emails_claimed_global_idx
  on public.message_emails (claimed_at desc)
  where status in ('sending', 'sent');

-- No client ever touches this table: RLS on with no policies denies everyone
-- but the service role and the SECURITY DEFINER functions below. The REVOKE
-- removes the grants Supabase's default privileges hand every new table.
alter table public.message_emails enable row level security;
revoke all on table public.message_emails from anon, authenticated;


-- ─── 4. The trigger: open a burst, or leave the open one alone ──────────────
-- Mirrors notify_conversation_message() (0100) for what counts: direct threads
-- only, text and image messages only, never the sender's own messages.
--
-- Timestamps use now(), not new.created_at. Clients insert messages directly
-- and can set created_at; now() is what an honest insert gets anyway, and it
-- cannot be pushed into the future to park a burst.
create or replace function public.queue_message_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_now       timestamptz := now();
  v_wants     boolean;
  v_read      timestamptz;
  v_latest    public.message_emails%rowtype;
begin
  if coalesce(new.msg_type, 'text') not in ('text', 'image') then
    return new;
  end if;

  begin
    select case when c.user_a = new.sender_id then c.user_b else c.user_a end
      into v_recipient
      from public.conversations c
     where c.id = new.conversation_id
       and c.conversation_type = 'direct'
       and new.sender_id in (c.user_a, c.user_b);

    if v_recipient is null or v_recipient = new.sender_id then
      return new;
    end if;

    -- Opted out: keep no bookkeeping at all. (Re-checked at send time too.)
    select p.email_on_message into v_wants
      from public.profiles p
     where p.id = v_recipient;

    if not coalesce(v_wants, false) then
      return new;
    end if;

    select cr.last_read_at into v_read
      from public.conversation_reads cr
     where cr.conversation_id = new.conversation_id
       and cr.user_id = v_recipient;

    select * into v_latest
      from public.message_emails e
     where e.recipient_id = v_recipient
       and e.conversation_id = new.conversation_id
     order by e.first_unread_at desc
     limit 1
     for update;

    -- Not read since the latest burst began: this message belongs to it.
    if found and coalesce(v_read, '-infinity'::timestamptz) < v_latest.first_unread_at then
      return new;
    end if;

    -- Read since then. A burst still waiting to send is over — close it as
    -- read rather than reusing the row, so every row id is exactly one burst
    -- (the Edge Function uses the id as the Resend Idempotency-Key).
    if found and v_latest.status = 'pending' then
      update public.message_emails
         set status = 'read',
             updated_at = v_now
       where id = v_latest.id;
    end if;

    insert into public.message_emails (
      recipient_id, conversation_id, sender_id, first_unread_at, due_at
    )
    values (
      v_recipient, new.conversation_id, new.sender_id, v_now,
      v_now + public.message_email_delay()
    )
    on conflict (recipient_id, conversation_id) where status = 'pending' do nothing;
  exception when others then
    -- Never let email bookkeeping block a chat message.
    raise warning 'queue_message_email failed for message %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

revoke all on function public.queue_message_email() from public, anon, authenticated;

drop trigger if exists messages_queue_email on public.messages;
create trigger messages_queue_email
  after insert on public.messages
  for each row execute function public.queue_message_email();


-- ─── 5. Claim + complete — called by the send-message-emails Edge Function ──
-- claim_message_emails picks due bursts, re-checks every reason not to send
-- against live data, and marks the survivors 'sending' in the same transaction,
-- returning what the email needs. Everything it decides not to send is closed
-- with a reason, so a burst is never looked at twice.
--
-- Overlapping runs cannot double-send: claims are serialised by a transaction
-- advisory lock (which also makes the caps exact), rows are taken FOR UPDATE
-- SKIP LOCKED, and a claimed row is 'sending' — no longer due — by the time the
-- lock is released.
--
-- A run that dies after claiming leaves rows in 'sending'. They become
-- claimable again after 15 minutes, with the same snapshot and id, so the
-- retry carries the same Idempotency-Key and Resend drops it if the first
-- attempt did go out.
create or replace function public.claim_message_emails(p_limit int default 20)
returns table (
  email_id uuid,
  attempt int,
  recipient_id uuid,
  recipient_email text,
  locale text,
  conversation_id uuid,
  sender_name text,
  preview_kind text,
  preview_text text,
  unread_count int
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r         public.message_emails%rowtype;
  v_limit   int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_reason  text;
  v_wants   boolean;
  v_locale  text;
  v_email   text;
  v_read    timestamptz;
  v_count   int;
  v_kind    text;
  v_body    text;
  v_name    text;
begin
  perform pg_advisory_xact_lock(hashtext('public.claim_message_emails'));

  for r in
    select e.*
      from public.message_emails e
     where (e.status = 'pending' and e.due_at <= now())
        or (e.status = 'sending' and e.claimed_at < now() - interval '15 minutes')
     order by e.due_at
     limit v_limit
     for update skip locked
  loop
    v_reason := null;
    v_wants  := null;
    v_locale := null;
    v_email  := null;
    v_read   := null;
    v_count  := 0;
    v_kind   := null;
    v_body   := null;
    v_name   := null;

    -- A run died mid-send on its last attempt.
    if r.attempts >= public.message_email_max_attempts() then
      update public.message_emails e
         set status = 'failed',
             last_error = coalesce(e.last_error, 'A send run stopped before recording the result'),
             updated_at = now()
       where e.id = r.id;
      continue;
    end if;

    select p.email_on_message, coalesce(p.locale, 'en')
      into v_wants, v_locale
      from public.profiles p
     where p.id = r.recipient_id;

    if not found then
      v_reason := 'no_account';
    end if;

    if v_reason is null then
      select cr.last_read_at into v_read
        from public.conversation_reads cr
       where cr.conversation_id = r.conversation_id
         and cr.user_id = r.recipient_id;

      if v_read is not null and v_read >= r.first_unread_at then
        update public.message_emails e
           set status = 'read', updated_at = now()
         where e.id = r.id;
        continue;
      end if;
    end if;

    if v_reason is null and r.first_unread_at < now() - public.message_email_max_age() then
      v_reason := 'stale';
    end if;

    if v_reason is null and not coalesce(v_wants, false) then
      v_reason := 'opted_out';
    end if;

    if v_reason is null then
      select nullif(btrim(u.email), '') into v_email
        from auth.users u
       where u.id = r.recipient_id
         and u.deleted_at is null
         and (u.banned_until is null or u.banned_until <= now());

      if v_email is null then
        v_reason := 'no_email';
      end if;
    end if;

    -- The recipient reported this thread (0100). There is no block feature;
    -- a report is the only "I don't want this" signal, so honour any of them,
    -- whatever a moderator later decided.
    if v_reason is null and exists (
      select 1 from public.conversation_reports cr
       where cr.conversation_id = r.conversation_id
         and cr.reporter_id = r.recipient_id
    ) then
      v_reason := 'reported';
    end if;

    -- The sender's builder profile was taken down by a moderator (0101). Their
    -- threads still work, but BuildEx should not be amplifying them by email.
    if v_reason is null and exists (
      select 1 from public.builder_profiles bp
       where bp.id = r.sender_id
         and bp.is_hidden
    ) then
      v_reason := 'sender_hidden';
    end if;

    -- What is unread right now, counted the way list_my_conversations() does.
    if v_reason is null then
      select count(*)::int into v_count
        from public.messages m
       where m.conversation_id = r.conversation_id
         and m.sender_id <> r.recipient_id
         and coalesce(m.msg_type, 'text') in ('text', 'image')
         and m.created_at > coalesce(v_read, '-infinity'::timestamptz);

      if v_count = 0 then
        v_reason := 'nothing_unread';
      end if;
    end if;

    if v_reason is null and (
      select count(*) from public.message_emails e
       where e.id <> r.id
         and e.recipient_id = r.recipient_id
         and e.status in ('sending', 'sent')
         and e.claimed_at > now() - interval '1 hour'
    ) >= public.message_emails_per_hour() then
      v_reason := 'recipient_hourly_cap';
    end if;

    if v_reason is null and (
      select count(*) from public.message_emails e
       where e.id <> r.id
         and e.recipient_id = r.recipient_id
         and e.status in ('sending', 'sent')
         and e.claimed_at > now() - interval '1 day'
    ) >= public.message_emails_per_day() then
      v_reason := 'recipient_daily_cap';
    end if;

    if v_reason is null and (
      select count(*) from public.message_emails e
       where e.id <> r.id
         and e.status in ('sending', 'sent')
         and e.claimed_at > now() - interval '1 day'
    ) >= public.message_emails_global_per_day() then
      v_reason := 'global_daily_cap';
    end if;

    if v_reason is not null then
      update public.message_emails e
         set status = 'skipped',
             skip_reason = v_reason,
             updated_at = now()
       where e.id = r.id;
      continue;
    end if;

    -- Snapshot on the first claim only (see §3).
    if r.sender_name is null then
      select coalesce(nullif(btrim(p.display_name), ''), '@' || nullif(btrim(p.username), ''))
        into v_name
        from public.profiles p
       where p.id = r.sender_id;

      select coalesce(m.msg_type, 'text'), regexp_replace(btrim(coalesce(m.body, '')), '\s+', ' ', 'g')
        into v_kind, v_body
        from public.messages m
       where m.conversation_id = r.conversation_id
         and m.sender_id <> r.recipient_id
         and coalesce(m.msg_type, 'text') in ('text', 'image')
         and m.created_at > coalesce(v_read, '-infinity'::timestamptz)
       order by m.created_at desc
       limit 1;

      r.sender_name  := coalesce(v_name, '');
      r.preview_kind := case
                          when v_kind = 'image' and v_body = '' then 'photo'
                          when v_kind = 'image' then 'photo_caption'
                          else 'text'
                        end;
      r.preview_text := left(v_body, 300);
      r.unread_count := v_count;
      r.locale       := v_locale;
    end if;

    update public.message_emails e
       set status = 'sending',
           attempts = e.attempts + 1,
           claimed_at = now(),
           sender_name = r.sender_name,
           preview_kind = r.preview_kind,
           preview_text = r.preview_text,
           unread_count = r.unread_count,
           locale = r.locale,
           updated_at = now()
     where e.id = r.id;

    email_id        := r.id;
    attempt         := r.attempts + 1;
    recipient_id    := r.recipient_id;
    recipient_email := v_email;
    locale          := r.locale;
    conversation_id := r.conversation_id;
    sender_name     := r.sender_name;
    preview_kind    := r.preview_kind;
    preview_text    := r.preview_text;
    unread_count    := r.unread_count;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_message_emails(int) from public, anon, authenticated;
grant execute on function public.claim_message_emails(int) to service_role;

-- Record the outcome of one send. A retryable failure goes back to 'pending'
-- with linear backoff (5, 10 minutes) until the attempt budget runs out.
-- Returns the row's new status.
create or replace function public.complete_message_email(
  p_id uuid,
  p_sent boolean,
  p_provider_id text default null,
  p_error text default null,
  p_retryable boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.message_emails%rowtype;
begin
  select * into r
    from public.message_emails e
   where e.id = p_id
   for update;

  if not found then
    return 'missing';
  end if;

  -- Only a claimed row can be completed; anything else was already settled.
  if r.status <> 'sending' then
    return r.status;
  end if;

  if p_sent then
    update public.message_emails e
       set status = 'sent',
           sent_at = now(),
           provider_message_id = left(p_provider_id, 200),
           last_error = null,
           updated_at = now()
     where e.id = p_id;
    return 'sent';
  end if;

  -- Back to pending for another try — unless a newer burst for the same thread
  -- is already pending (the recipient read in between), which makes this one
  -- moot and would collide with the one-pending index.
  if coalesce(p_retryable, true)
     and r.attempts < public.message_email_max_attempts()
     and not exists (
       select 1 from public.message_emails o
        where o.recipient_id = r.recipient_id
          and o.conversation_id = r.conversation_id
          and o.status = 'pending'
     ) then
    update public.message_emails e
       set status = 'pending',
           due_at = now() + make_interval(mins => 5 * r.attempts),
           last_error = left(p_error, 1000),
           updated_at = now()
     where e.id = p_id;
    return 'pending';
  end if;

  update public.message_emails e
     set status = 'failed',
         last_error = left(p_error, 1000),
         updated_at = now()
   where e.id = p_id;
  return 'failed';
end;
$$;

revoke all on function public.complete_message_email(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_message_email(uuid, boolean, text, text, boolean) to service_role;


-- ─── 6. The signed-in user's own settings ───────────────────────────────────
-- The account page's toggle reads through this (the columns have no client
-- SELECT grant, §2) and writes with a plain UPDATE on the granted column.
create or replace function public.get_my_email_settings()
returns table (email_on_message boolean, locale text)
language sql
security definer
stable
set search_path = public
as $$
  select p.email_on_message, p.locale
    from public.profiles p
   where p.id = auth.uid();
$$;

revoke all on function public.get_my_email_settings() from public, anon, authenticated;
grant execute on function public.get_my_email_settings() to authenticated;

-- Fill profiles.locale from the interface language, only while it is empty.
-- Called once per signed-in session; an explicit choice made with the header
-- switch (a plain UPDATE) is never overwritten. Returns the stored locale.
create or replace function public.init_my_locale(p_locale text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_locale text;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_locale is null or p_locale not in ('en', 'ru') then
    raise exception 'Unsupported language' using errcode = 'check_violation';
  end if;

  update public.profiles
     set locale = p_locale
   where id = me
     and locale is null;

  select p.locale into v_locale from public.profiles p where p.id = me;
  return v_locale;
end;
$$;

revoke all on function public.init_my_locale(text) from public, anon, authenticated;
grant execute on function public.init_my_locale(text) to authenticated;


-- ─── 7. Scheduling: pg_cron → pg_net → Edge Function ────────────────────────
-- The cron job runs in the database every 2 minutes and costs nothing when
-- there is nothing to send: the HTTP call is made only if a burst is due.
--
-- Both values the job needs live in Supabase Vault and are read at run time:
--
--   message_emails_cron_secret  — the x-cron-secret header. Created just below
--     with a random value, so it is never typed, pasted or committed. The Edge
--     Function checks the header against the same Vault entry through
--     message_emails_cron_secret() (service role only). Rotate it with
--     vault.update_secret(); nothing else needs to change.
--   message_emails_function_url — not a secret, but it names the project, so it
--     stays out of this public file. Create it once:
--       select vault.create_secret(
--         'https://<ref>.supabase.co/functions/v1/send-message-emails',
--         'message_emails_function_url');
--
-- Until the URL exists the job logs a warning and sends nothing.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'message_emails_cron_secret') then
    -- Two v4 UUIDs: 244 random bits, from a core function (no extension needed).
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'message_emails_cron_secret',
      'x-cron-secret that pg_cron sends to the send-message-emails Edge Function'
    );
  end if;
end;
$$;

create or replace function public.message_emails_cron_secret()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select ds.decrypted_secret
    from vault.decrypted_secrets ds
   where ds.name = 'message_emails_cron_secret'
   limit 1;
$$;

revoke all on function public.message_emails_cron_secret() from public, anon, authenticated;
grant execute on function public.message_emails_cron_secret() to service_role;

create or replace function public._kick_message_email_sender()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (
    select 1 from public.message_emails e
     where (e.status = 'pending' and e.due_at <= now())
        or (e.status = 'sending' and e.claimed_at < now() - interval '15 minutes')
  ) then
    return;
  end if;

  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds
   where ds.name = 'message_emails_function_url'
   limit 1;

  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'message_emails_cron_secret'
   limit 1;

  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    raise warning 'message emails: Vault entry message_emails_function_url (or message_emails_cron_secret) is missing; nothing sent';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public._kick_message_email_sender() from public, anon, authenticated;

-- Settled bursts are only needed for the caps (a day) and for debugging; keep
-- a month. Deleting a thread's last row means a still-unread thread can earn
-- one more email a month later, which is fine.
create or replace function public._prune_message_emails()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.message_emails e
   where e.status in ('sent', 'read', 'skipped', 'failed')
     and e.updated_at < now() - interval '30 days';
$$;

revoke all on function public._prune_message_emails() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-message-emails') then
    perform cron.unschedule('send-message-emails');
  end if;
  perform cron.schedule(
    'send-message-emails',
    '*/2 * * * *',
    'select public._kick_message_email_sender();'
  );

  if exists (select 1 from cron.job where jobname = 'prune-message-emails') then
    perform cron.unschedule('prune-message-emails');
  end if;
  perform cron.schedule(
    'prune-message-emails',
    '41 3 * * *',
    'select public._prune_message_emails();'
  );
end;
$$;


notify pgrst, 'reload schema';

-- Verification: both jobs should be listed and active.
select jobname, schedule, active
  from cron.job
 where jobname in ('send-message-emails', 'prune-message-emails');
