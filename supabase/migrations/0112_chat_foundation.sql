-- =============================================================================
-- BuildEx — Chat foundation: support, updates channel, mutes, people search
-- (chat + community plan, stage 1 — see CHAT_COMMUNITY_STAGE0.md)
--
-- What this adds
-- --------------
--   1. messages: a `system` msg_type, one rule for what counts as unread, and
--      a narrower INSERT policy. Until now a client could insert ANY allowed
--      msg_type with ANY meta — a fake `order_event`, or an `image` whose
--      meta.url points at someone else's server. Clients may now insert only
--      `text`, and `image` whose file sits in their own chat-media folder.
--      Every other type is written by SECURITY DEFINER functions.
--   2. Support: conversation_type 'support' — one thread per user, with no
--      fixed counterpart. The user and every moderator (profiles.is_admin) can
--      read and write it. public.support_threads carries the topic and the
--      closed flag; open / waiting is derived from who wrote last.
--   3. public.conversation_mutes — "Mute notifications" on a thread. The bell
--      and the email queue skip muted threads; the unread count still counts.
--   4. Updates channel: public.announcements, written only by moderators, read
--      by every signed-in user. It is one feed, not a copy of every post in
--      thirty conversations. public.announcement_reads holds each person's
--      read cursor and mute switch.
--   5. list_my_conversations() — rebuilt with the counterpart's builder flag
--      and last_seen_at (online dots), the mute flag and the support thread.
--      A moderator's inbox still shows only their OWN support thread, never
--      everyone's: those live in the /admin console.
--   6. search_people() and my_conversation_quota() for "New chat".
--   7. The bell (0100) and the email queue (0104) learn about support threads
--      and mutes. Moderators get a bell for new support messages, not email.
--
-- Nothing here deletes or rewrites user data. conversations and messages are
-- on the never-touch-destructively list; this only widens a CHECK constraint
-- and adds a type.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated —
-- Supabase grants new functions to both roles directly — then grants back
-- exactly what the app calls.
--
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. MESSAGES ────────────────────────────────────────────────────────────

-- 1a. A `system` line: written by functions, never by clients (see 1c). Its
-- meta always carries {"event": ...}. Stage 2 adds `brief`, stage 3 `preview`.
alter table public.messages drop constraint if exists messages_msg_type_check;
alter table public.messages
  add constraint messages_msg_type_check
  check (msg_type in ('text', 'order_event', 'image', 'system'));

-- 1b. What lights an unread badge. text and image always do; a system line
-- only when the function that wrote it says so (meta.unread = true) — a
-- closed support request, say, should not. Legacy order_event rows never do
-- (the 0025 lesson: your own order actions used to light your own dot).
create or replace function public._counts_as_unread(p_type text, p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_type, 'text')
    when 'text' then true
    when 'image' then true
    when 'system' then coalesce(p_meta->>'unread', 'false') = 'true'
    else false
  end;
$$;

revoke all on function public._counts_as_unread(text, jsonb) from public, anon, authenticated;

-- 1c. What a client may insert by itself. An image's file must live in the
-- sender's own chat-media folder, and its url must be that file's public
-- address. The app now builds the address from `path`, so `url` is kept only
-- for older rows and for the admin views that still read it.
create or replace function public._client_message_ok(p_sender uuid, p_type text, p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_type, 'text')
    when 'text' then true
    when 'image' then
      jsonb_typeof(p_meta) = 'object'
      and coalesce(p_meta->>'path', '') ~ ('^' || p_sender::text || '/[A-Za-z0-9._-]{1,200}$')
      and right(
            coalesce(p_meta->>'url', ''),
            char_length('/storage/v1/object/public/chat-media/' || (p_meta->>'path'))
          ) = '/storage/v1/object/public/chat-media/' || (p_meta->>'path')
    else false
  end;
$$;

revoke all on function public._client_message_ok(uuid, text, jsonb) from public, anon;
grant execute on function public._client_message_ok(uuid, text, jsonb) to authenticated;

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public._can_write_conversation(conversation_id)
    and public._client_message_ok(sender_id, msg_type, meta)
  );


-- ─── 2. SUPPORT THREADS ─────────────────────────────────────────────────────

-- 2a. The shape check gains a third kind of conversation. The first two
-- branches are 0041's, unchanged.
alter table public.conversations drop constraint if exists conversations_shape_check;
alter table public.conversations
  add constraint conversations_shape_check check (
    (
      conversation_type = 'direct'
      and user_a is not null and user_b is not null
      and studio_id is null and client_id is null
    )
    or
    (
      conversation_type = 'studio_client'
      and user_a is null and user_b is null
      and studio_id is not null and client_id is not null
    )
    or
    (
      conversation_type = 'support'
      and user_a is null and user_b is null
      and studio_id is null and client_id is not null
    )
  );

create unique index if not exists conversations_support_unique
  on public.conversations (client_id)
  where conversation_type = 'support';

create or replace function public._is_admin(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.is_admin);
$$;

revoke all on function public._is_admin(uuid) from public, anon, authenticated;
grant execute on function public._is_admin(uuid) to authenticated;

-- 2b. Read/write access: 0064's definitions plus the support branch.
create or replace function public._can_read_conversation_message(
  p_conversation uuid,
  p_message_created_at timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (
        (c.conversation_type = 'direct'
          and auth.uid() in (c.user_a, c.user_b)
          and public.can_direct_message(c.user_a, c.user_b))
        or
        (c.conversation_type = 'studio_client' and (
          c.client_id = auth.uid()
          or exists (select 1 from public.studios s where s.id = c.studio_id and s.moderator_id = auth.uid())
          or exists (
            select 1 from public.orders o
            join public.studio_order_assignments a on a.order_id = o.id
            where o.conversation_id = c.id and a.builder_id = auth.uid()
              and (a.released_at is null or p_message_created_at <= a.released_at)
          )
        ))
        or
        (c.conversation_type = 'support' and (
          c.client_id = auth.uid()
          or public._is_admin(auth.uid())
        ))
      )
  );
$$;

create or replace function public._can_write_conversation(p_conversation uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (
        (c.conversation_type = 'direct'
          and auth.uid() in (c.user_a, c.user_b)
          and public.can_direct_message(c.user_a, c.user_b))
        or
        (c.conversation_type = 'studio_client' and (
          c.client_id = auth.uid()
          or exists (select 1 from public.studios s where s.id = c.studio_id and s.moderator_id = auth.uid())
          or exists (
            select 1 from public.orders o
            join public.studio_order_assignments a on a.order_id = o.id
            where o.conversation_id = c.id and a.builder_id = auth.uid()
              and a.released_at is null
              and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
          )
        ))
        or
        (c.conversation_type = 'support' and (
          c.client_id = auth.uid()
          or public._is_admin(auth.uid())
        ))
      )
  );
$$;

-- 2c. One row per support conversation. Status is derived, not stored:
--   closed_at set                       → closed
--   the user wrote last                 → open (waiting on us)
--   a moderator wrote last              → waiting (on the user)
-- A new message from the user reopens a closed thread (2d).
create table if not exists public.support_threads (
  conversation_id uuid primary key
    constraint support_threads_conversation_id_fkey references public.conversations(id) on delete cascade,
  user_id uuid not null
    constraint support_threads_user_id_fkey references public.profiles(id) on delete cascade,
  topic text,
  created_at timestamptz not null default now(),
  last_user_message_at timestamptz,
  last_staff_message_at timestamptz,
  closed_at timestamptz,
  closed_by uuid
    constraint support_threads_closed_by_fkey references public.profiles(id) on delete set null,
  constraint support_threads_one_per_user unique (user_id),
  constraint support_threads_topic check (topic is null or topic in ('account', 'report', 'bug', 'idea', 'other'))
);

alter table public.support_threads enable row level security;
revoke all on table public.support_threads from anon, authenticated;

create or replace function public._support_status(
  p_closed_at timestamptz,
  p_last_user timestamptz,
  p_last_staff timestamptz
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_closed_at is not null then 'closed'
    when p_last_user is null then 'waiting'
    when p_last_staff is null or p_last_user > p_last_staff then 'open'
    else 'waiting'
  end;
$$;

revoke all on function public._support_status(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

-- 2d. Keep the timestamps current. A no-op for every non-support message (no
-- row matches the primary key).
create or replace function public.support_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads st
     set last_user_message_at = case
           when new.sender_id = st.user_id then new.created_at
           else st.last_user_message_at end,
         last_staff_message_at = case
           when new.sender_id <> st.user_id and coalesce(new.msg_type, 'text') in ('text', 'image')
             then new.created_at
           else st.last_staff_message_at end,
         closed_at = case when new.sender_id = st.user_id then null else st.closed_at end,
         closed_by = case when new.sender_id = st.user_id then null else st.closed_by end
   where st.conversation_id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.support_thread_on_message() from public, anon, authenticated;

drop trigger if exists messages_support_thread on public.messages;
create trigger messages_support_thread
  after insert on public.messages
  for each row execute function public.support_thread_on_message();

-- 2e. The user's side. Called before their first support message; returns the
-- thread id, creating it on first use. Picking a topic again just updates it.
create or replace function public.open_support_thread(p_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_conv uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_topic is not null and p_topic not in ('account', 'report', 'bug', 'idea', 'other') then
    raise exception 'Unknown support topic' using errcode = 'check_violation';
  end if;

  select st.conversation_id into v_conv
    from public.support_threads st
   where st.user_id = me;

  if v_conv is null then
    insert into public.conversations (conversation_type, client_id)
    values ('support', me)
    on conflict (client_id) where conversation_type = 'support' do nothing
    returning id into v_conv;

    if v_conv is null then
      select c.id into v_conv
        from public.conversations c
       where c.conversation_type = 'support' and c.client_id = me;
    end if;

    insert into public.support_threads (conversation_id, user_id, topic)
    values (v_conv, me, p_topic)
    on conflict (conversation_id) do nothing;
  elsif p_topic is not null then
    update public.support_threads set topic = p_topic where conversation_id = v_conv;
  end if;

  return v_conv;
end;
$$;

revoke all on function public.open_support_thread(text) from public, anon, authenticated;
grant execute on function public.open_support_thread(text) to authenticated;

-- 2f. The moderator's inbox. p_status: 'open' | 'waiting' | 'closed' | null.
-- unread_count is what the CALLING moderator has not read yet.
create or replace function public.admin_list_support_threads(p_status text default null)
returns table (
  conversation_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_seen_at timestamptz,
  is_builder boolean,
  topic text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count int,
  unread_count int
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  if p_status is not null and p_status not in ('open', 'waiting', 'closed') then
    raise exception 'Unknown support status';
  end if;

  return query
  select
    st.conversation_id,
    st.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.last_seen_at,
    exists (select 1 from public.builder_profiles bp where bp.id = st.user_id),
    st.topic,
    public._support_status(st.closed_at, st.last_user_message_at, st.last_staff_message_at),
    st.created_at,
    st.closed_at,
    c.last_message_at,
    c.last_message_preview,
    (select count(*)::int from public.messages m where m.conversation_id = st.conversation_id),
    (select count(*)::int
       from public.messages m
      where m.conversation_id = st.conversation_id
        and m.sender_id = st.user_id
        and m.created_at > coalesce((
          select cr.last_read_at from public.conversation_reads cr
           where cr.conversation_id = st.conversation_id and cr.user_id = auth.uid()
        ), '-infinity'::timestamptz))
  from public.support_threads st
  join public.conversations c on c.id = st.conversation_id
  join public.profiles p on p.id = st.user_id
  where exists (select 1 from public.messages m where m.conversation_id = st.conversation_id)
    and (p_status is null
         or public._support_status(st.closed_at, st.last_user_message_at, st.last_staff_message_at) = p_status)
  order by c.last_message_at desc nulls last;
end;
$$;

revoke all on function public.admin_list_support_threads(text) from public, anon, authenticated;
grant execute on function public.admin_list_support_threads(text) to authenticated;

-- 2g. Close or reopen. Closing leaves a line in the thread the user can see.
create or replace function public.admin_set_support_closed(p_conversation uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed timestamptz;
begin
  perform public._require_admin();

  select st.closed_at into v_closed
    from public.support_threads st
   where st.conversation_id = p_conversation
   for update;
  if not found then
    raise exception 'Conversation not found';
  end if;

  if p_closed then
    if v_closed is not null then return; end if;
    update public.support_threads
       set closed_at = now(), closed_by = auth.uid()
     where conversation_id = p_conversation;
    insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
    values (p_conversation, auth.uid(), 'Request closed', 'system',
            jsonb_build_object('event', 'support_closed'));
  else
    update public.support_threads
       set closed_at = null, closed_by = null
     where conversation_id = p_conversation;
  end if;
end;
$$;

revoke all on function public.admin_set_support_closed(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_support_closed(uuid, boolean) to authenticated;


-- ─── 3. MUTES ───────────────────────────────────────────────────────────────

create table if not exists public.conversation_mutes (
  conversation_id uuid not null
    constraint conversation_mutes_conversation_id_fkey references public.conversations(id) on delete cascade,
  user_id uuid not null
    constraint conversation_mutes_user_id_fkey references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_mutes enable row level security;
revoke all on table public.conversation_mutes from anon, authenticated;

create or replace function public._is_conversation_muted(p_conversation uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_mutes cm
     where cm.conversation_id = p_conversation and cm.user_id = p_user
  );
$$;

revoke all on function public._is_conversation_muted(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_conversation_muted(p_conversation uuid, p_muted boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public._can_read_conversation_message(p_conversation, now()) then
    raise exception 'Conversation not found';
  end if;

  if p_muted then
    insert into public.conversation_mutes (conversation_id, user_id)
    values (p_conversation, me)
    on conflict do nothing;
  else
    delete from public.conversation_mutes
     where conversation_id = p_conversation and user_id = me;
  end if;
  return p_muted;
end;
$$;

revoke all on function public.set_conversation_muted(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;


-- ─── 4. UPDATES CHANNEL ─────────────────────────────────────────────────────

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'post',
  title text not null,
  body text not null,
  -- An optional button under the post: a site path ("/about") or an https link.
  link_url text,
  link_label text,
  -- Events show their dates on the post.
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  created_by uuid
    constraint announcements_created_by_fkey references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  notified_count int not null default 0,
  constraint announcements_kind check (kind in ('post', 'event')),
  constraint announcements_title_len check (char_length(btrim(title)) between 1 and 120),
  constraint announcements_body_len check (char_length(btrim(body)) between 1 and 4000),
  constraint announcements_link check (
    link_url is null
    or (char_length(link_url) <= 500 and (link_url ~ '^https://[^\s]+$' or link_url ~ '^/[^\s]*$'))
  ),
  constraint announcements_link_label_len check (link_label is null or char_length(btrim(link_label)) between 1 and 40),
  constraint announcements_event check (kind = 'post' or event_starts_at is not null),
  constraint announcements_event_order check (
    event_ends_at is null or event_starts_at is null or event_ends_at >= event_starts_at
  )
);

create index if not exists announcements_created_idx
  on public.announcements (created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "signed-in users read announcements" on public.announcements;
create policy "signed-in users read announcements"
  on public.announcements for select
  to authenticated
  using (hidden_at is null or public._is_admin(auth.uid()));

-- Who posted and how many were notified stay server-side.
revoke all on table public.announcements from anon, authenticated;
grant select (id, kind, title, body, link_url, link_label, event_starts_at, event_ends_at, created_at, hidden_at)
  on public.announcements to authenticated;

create table if not exists public.announcement_reads (
  user_id uuid primary key
    constraint announcement_reads_user_id_fkey references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  muted boolean not null default false
);

alter table public.announcement_reads enable row level security;
revoke all on table public.announcement_reads from anon, authenticated;

-- The pinned row in the inbox: how many posts I have not read, whether I muted
-- the channel, and the newest post. Posts from before the account existed do
-- not count as unread — a new member should not open the site to a badge.
create or replace function public.my_announcements_summary()
returns table (
  unread_count int,
  muted boolean,
  latest_id uuid,
  latest_title text,
  latest_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with me as (
    select p.id,
           coalesce(r.last_read_at, p.created_at, now()) as since,
           coalesce(r.muted, false) as muted
      from public.profiles p
      left join public.announcement_reads r on r.user_id = p.id
     where p.id = auth.uid()
  ),
  latest as (
    select a.id, a.title, a.created_at
      from public.announcements a
     where a.hidden_at is null
     order by a.created_at desc
     limit 1
  )
  select
    (select count(*)::int from public.announcements a, me
      where a.hidden_at is null and a.created_at > me.since),
    me.muted,
    latest.id,
    latest.title,
    latest.created_at
  from me
  left join latest on true;
$$;

revoke all on function public.my_announcements_summary() from public, anon, authenticated;
grant execute on function public.my_announcements_summary() to authenticated;

create or replace function public.mark_announcements_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.announcement_reads (user_id, last_read_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function public.mark_announcements_read() from public, anon, authenticated;
grant execute on function public.mark_announcements_read() to authenticated;

create or replace function public.set_announcements_muted(p_muted boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.announcement_reads (user_id, muted)
  values (auth.uid(), coalesce(p_muted, false))
  on conflict (user_id) do update set muted = excluded.muted;
  return coalesce(p_muted, false);
end;
$$;

revoke all on function public.set_announcements_muted(boolean) from public, anon, authenticated;
grant execute on function public.set_announcements_muted(boolean) to authenticated;

-- Who a post's bell would reach: everyone but the author, minus those who
-- muted the channel. The console shows this number before sending.
create or replace function public.admin_announcement_audience()
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_count int;
begin
  perform public._require_admin();
  select count(*)::int into v_count
    from public.profiles p
    left join public.announcement_reads r on r.user_id = p.id
   where p.id <> auth.uid()
     and not coalesce(r.muted, false);
  return v_count;
end;
$$;

revoke all on function public.admin_announcement_audience() from public, anon, authenticated;
grant execute on function public.admin_announcement_audience() to authenticated;

create or replace function public.admin_publish_announcement(
  p_kind text,
  p_title text,
  p_body text,
  p_link_url text default null,
  p_link_label text default null,
  p_event_starts_at timestamptz default null,
  p_event_ends_at timestamptz default null,
  p_notify boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
  v_user uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public._require_admin();

  insert into public.announcements (
    kind, title, body, link_url, link_label, event_starts_at, event_ends_at, created_by
  )
  values (
    coalesce(p_kind, 'post'), v_title, v_body,
    nullif(btrim(coalesce(p_link_url, '')), ''),
    nullif(btrim(coalesce(p_link_label, '')), ''),
    p_event_starts_at, p_event_ends_at, auth.uid()
  )
  returning id into v_id;

  if coalesce(p_notify, true) then
    for v_user in
      select p.id
        from public.profiles p
        left join public.announcement_reads r on r.user_id = p.id
       where p.id <> auth.uid()
         and not coalesce(r.muted, false)
    loop
      perform public._notify(v_user, 'announcement', v_title, left(v_body, 140), '/chats?c=updates');
      v_count := v_count + 1;
    end loop;
    update public.announcements set notified_count = v_count where id = v_id;
  end if;

  -- The author has seen their own post.
  insert into public.announcement_reads (user_id, last_read_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_read_at = excluded.last_read_at;

  return v_id;
end;
$$;

revoke all on function public.admin_publish_announcement(text, text, text, text, text, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_publish_announcement(text, text, text, text, text, timestamptz, timestamptz, boolean)
  to authenticated;

create or replace function public.admin_set_announcement_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.announcements
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
   where id = p_id;
  if not found then
    raise exception 'That post does not exist';
  end if;
end;
$$;

revoke all on function public.admin_set_announcement_hidden(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_announcement_hidden(uuid, boolean) to authenticated;


-- ─── 5. THE INBOX ───────────────────────────────────────────────────────────
-- 0043's columns and studio logic are kept as they were (studio rows are
-- dormant and the app skips them); the new columns are appended at the end.
drop function if exists public.list_my_conversations();
create function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint,
  conversation_type text,
  studio_id uuid,
  studio_slug text,
  assigned_builder_id uuid,
  assigned_builder_name text,
  can_write boolean,
  other_is_builder boolean,
  other_last_seen_at timestamptz,
  is_muted boolean,
  support_status text
)
language sql
security definer
set search_path = public
as $$
  with accessible as (
    select c.*
      from public.conversations c
     where (c.conversation_type = 'support' and c.client_id = auth.uid())
        or (c.conversation_type <> 'support' and (
              public._can_read_conversation_message(c.id, now())
              or exists (
                select 1
                  from public.studio_order_assignments soa
                  join public.orders o on o.id = soa.order_id
                 where o.conversation_id = c.id
                   and soa.builder_id = auth.uid()
              )
           ))
  )
  select
    c.id,
    case
      when c.conversation_type = 'direct'
        then case when c.user_a = auth.uid() then c.user_b else c.user_a end
      when c.conversation_type = 'support' then null
      when c.client_id = auth.uid() then s.moderator_id
      else c.client_id
    end,
    case
      when c.conversation_type = 'direct' then dp.username
      when c.conversation_type = 'support' then null
      when c.client_id = auth.uid() then s.slug::text
      else cp.username
    end,
    case
      when c.conversation_type = 'direct' then dp.display_name
      when c.conversation_type = 'support' then null
      when c.client_id = auth.uid() then s.name
      else cp.display_name
    end,
    case
      when c.conversation_type = 'direct' then dp.avatar_url
      when c.conversation_type = 'support' then null
      when c.client_id = auth.uid() then s.logo_url
      else cp.avatar_url
    end,
    visible_last.body,
    visible_last.created_at,
    (
      select count(*)
        from public.messages m
       where m.conversation_id = c.id
         and m.sender_id <> auth.uid()
         and public._counts_as_unread(m.msg_type, m.meta)
         and m.created_at > coalesce((
           select cr.last_read_at from public.conversation_reads cr
            where cr.conversation_id = c.id and cr.user_id = auth.uid()
         ), '-infinity'::timestamptz)
         and public._can_read_conversation_message(c.id, m.created_at)
    ),
    c.conversation_type,
    c.studio_id,
    s.slug::text,
    active_order.assigned_builder_id,
    assigned.display_name,
    public._can_write_conversation(c.id),
    (c.conversation_type = 'direct' and exists (
      select 1 from public.builder_profiles bp where bp.id = dp.id
    )),
    case when c.conversation_type = 'direct' then dp.last_seen_at end,
    public._is_conversation_muted(c.id, auth.uid()),
    case when c.conversation_type = 'support'
      then public._support_status(st.closed_at, st.last_user_message_at, st.last_staff_message_at)
    end
  from accessible c
  left join public.profiles dp
    on c.conversation_type = 'direct'
   and dp.id = (case when c.user_a = auth.uid() then c.user_b else c.user_a end)
  left join public.studios s on s.id = c.studio_id
  left join public.profiles cp on cp.id = c.client_id and c.conversation_type = 'studio_client'
  left join public.support_threads st on st.conversation_id = c.id
  left join lateral (
    select m.id, left(
             case
               when m.msg_type = 'image' then 'Photo'
               else coalesce(m.body, '')
             end,
             120
           ) as body,
           m.created_at
      from public.messages m
     where m.conversation_id = c.id
       and public._can_read_conversation_message(c.id, m.created_at)
     order by m.created_at desc
     limit 1
  ) visible_last on true
  left join lateral (
    select o.assigned_builder_id
      from public.orders o
     where o.conversation_id = c.id
       and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
     order by o.created_at desc limit 1
  ) active_order on true
  left join public.profiles assigned on assigned.id = active_order.assigned_builder_id
  order by visible_last.created_at desc nulls last, c.created_at desc;
$$;

revoke all on function public.list_my_conversations() from public, anon, authenticated;
grant execute on function public.list_my_conversations() to authenticated;


-- ─── 6. NEW CHAT: PEOPLE SEARCH + QUOTA ─────────────────────────────────────
-- Who a search finds (≥2 characters, at most 20 rows):
--   • builders whose profile is not hidden, by part of the @handle or name;
--   • anyone you already have a chat with, the same way;
--   • anyone at all, but only by their exact @handle.
-- Members without a builder profile are not public, so a search box must not
-- let a stranger list them all.
create or replace function public.search_people(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_builder boolean,
  last_seen_at timestamptz,
  conversation_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  v_handle text := lower(ltrim(btrim(coalesce(p_query, '')), '@'));
  v_pattern text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(v_handle) < 2 or char_length(v_handle) > 64 then
    return;
  end if;
  v_pattern := '%' || replace(replace(replace(v_handle, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id, p.username, p.display_name, p.avatar_url,
         (bp.id is not null),
         p.last_seen_at,
         c.id
    from public.profiles p
    left join public.builder_profiles bp on bp.id = p.id
    left join public.conversations c
      on c.conversation_type = 'direct'
     and c.user_a = least(me, p.id)
     and c.user_b = greatest(me, p.id)
   where p.id <> me
     and p.username is not null
     and (
       lower(p.username) = v_handle
       or (
         ((bp.id is not null and not coalesce(bp.is_hidden, false)) or c.id is not null)
         and (p.username ilike v_pattern or coalesce(p.display_name, '') ilike v_pattern)
       )
     )
   order by (lower(p.username) = v_handle) desc,
            (c.id is not null) desc,
            (bp.id is not null) desc,
            lower(coalesce(nullif(btrim(p.display_name), ''), p.username))
   limit 20;
end;
$$;

revoke all on function public.search_people(text) from public, anon, authenticated;
grant execute on function public.search_people(text) to authenticated;

-- How many NEW conversations the caller has opened against 0100's limits.
create or replace function public.my_conversation_quota()
returns table (hour_used int, hour_limit int, day_used int, day_limit int)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*)::int from public.conversation_opens o
      where o.opener_id = auth.uid() and o.created_at > now() - interval '1 hour'),
    public.chat_new_conversations_per_hour(),
    (select count(*)::int from public.conversation_opens o
      where o.opener_id = auth.uid() and o.created_at > now() - interval '1 day'),
    public.chat_new_conversations_per_day();
$$;

revoke all on function public.my_conversation_quota() from public, anon, authenticated;
grant execute on function public.my_conversation_quota() to authenticated;


-- ─── 7. THE BELL AND THE EMAIL QUEUE ────────────────────────────────────────

-- 7a. One unread bell row per person per thread, updated in place (0100's rule).
create or replace function public._upsert_thread_notification(
  p_user uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text,
  p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return; end if;
  update public.notifications
     set title = p_title,
         body = p_body,
         created_at = p_at
   where user_id = p_user
     and type = p_type
     and link = p_link
     and read_at is null;
  if not found then
    perform public._notify(p_user, p_type, p_title, p_body, p_link);
  end if;
end;
$$;

revoke all on function public._upsert_thread_notification(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;

-- 7b. 0100's trigger, now aware of support threads and mutes.
--   direct:  the other person, unless they muted the thread.
--   support: a moderator's reply → the user ("BuildEx Support"), unless muted;
--            the user's message → every moderator, linking to the console.
create or replace function public.notify_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv      public.conversations%rowtype;
  v_recipient uuid;
  v_sender    text;
  v_preview   text;
  v_admin     uuid;
begin
  if coalesce(new.msg_type, 'text') not in ('text', 'image') then
    return new;
  end if;

  select * into v_conv from public.conversations c where c.id = new.conversation_id;
  if not found then
    return new;
  end if;

  v_preview := case
    when new.msg_type = 'image' and coalesce(btrim(new.body), '') = '' then 'Sent a photo'
    when new.msg_type = 'image' then 'Photo · ' || left(new.body, 100)
    else left(coalesce(new.body, ''), 120)
  end;

  select coalesce(nullif(btrim(p.display_name), ''), '@' || p.username, 'Someone')
    into v_sender
    from public.profiles p
   where p.id = new.sender_id;

  if v_conv.conversation_type = 'direct' then
    if new.sender_id not in (v_conv.user_a, v_conv.user_b) then
      return new;
    end if;
    v_recipient := case when v_conv.user_a = new.sender_id then v_conv.user_b else v_conv.user_a end;
    if v_recipient is null or v_recipient = new.sender_id
       or public._is_conversation_muted(new.conversation_id, v_recipient) then
      return new;
    end if;
    perform public._upsert_thread_notification(
      v_recipient, 'message', coalesce(v_sender, 'New message'), v_preview,
      '/chats?c=' || new.conversation_id::text, new.created_at);

  elsif v_conv.conversation_type = 'support' then
    if new.sender_id = v_conv.client_id then
      for v_admin in
        select p.id from public.profiles p
         where p.is_admin and p.id <> new.sender_id
      loop
        perform public._upsert_thread_notification(
          v_admin, 'support', 'Support · ' || coalesce(v_sender, 'Someone'), v_preview,
          '/admin?section=support&c=' || new.conversation_id::text, new.created_at);
      end loop;
    elsif not public._is_conversation_muted(new.conversation_id, v_conv.client_id) then
      perform public._upsert_thread_notification(
        v_conv.client_id, 'message', 'BuildEx Support', v_preview,
        '/chats?c=' || new.conversation_id::text, new.created_at);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_conversation_message() from public, anon, authenticated;

-- 7c. 0104's email trigger. Same burst rules; the recipient is now worked out
-- for support replies too (moderators are not emailed — the email links to
-- /chats, and their support work happens in /admin), and muted threads are
-- skipped like opted-out people.
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
    select case
             when c.conversation_type = 'direct' and new.sender_id in (c.user_a, c.user_b)
               then case when c.user_a = new.sender_id then c.user_b else c.user_a end
             when c.conversation_type = 'support' and new.sender_id <> c.client_id
               then c.client_id
           end
      into v_recipient
      from public.conversations c
     where c.id = new.conversation_id;

    if v_recipient is null or v_recipient = new.sender_id then
      return new;
    end if;

    if public._is_conversation_muted(new.conversation_id, v_recipient) then
      return new;
    end if;

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

    if found and coalesce(v_read, '-infinity'::timestamptz) < v_latest.first_unread_at then
      return new;
    end if;

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
    raise warning 'queue_message_email failed for message %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

revoke all on function public.queue_message_email() from public, anon, authenticated;

-- 7d. 0104's claim, with two changes: a thread muted since the burst opened is
-- skipped ('muted'), and a support reply is signed "BuildEx Support" rather
-- than with the moderator's own name. Everything else is 0104 verbatim.
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
  v_support boolean;
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
    v_reason  := null;
    v_wants   := null;
    v_locale  := null;
    v_email   := null;
    v_read    := null;
    v_count   := 0;
    v_kind    := null;
    v_body    := null;
    v_name    := null;
    v_support := false;

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

    if v_reason is null and public._is_conversation_muted(r.conversation_id, r.recipient_id) then
      v_reason := 'muted';
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

    if v_reason is null and exists (
      select 1 from public.conversation_reports cr
       where cr.conversation_id = r.conversation_id
         and cr.reporter_id = r.recipient_id
    ) then
      v_reason := 'reported';
    end if;

    select (c.conversation_type = 'support') into v_support
      from public.conversations c
     where c.id = r.conversation_id;
    v_support := coalesce(v_support, false);

    -- A hidden builder's threads are not amplified by email — but a moderator
    -- answering support is never "a hidden builder".
    if v_reason is null and not v_support and exists (
      select 1 from public.builder_profiles bp
       where bp.id = r.sender_id
         and bp.is_hidden
    ) then
      v_reason := 'sender_hidden';
    end if;

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

    if r.sender_name is null then
      if v_support then
        v_name := 'BuildEx Support';
      else
        select coalesce(nullif(btrim(p.display_name), ''), '@' || nullif(btrim(p.username), ''))
          into v_name
          from public.profiles p
         where p.id = r.sender_id;
      end if;

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


notify pgrst, 'reload schema';

-- Verification (read-only): the new objects exist and the policy is in place.
select
  (select count(*) from pg_constraint where conname = 'conversations_shape_check') as shape_check,
  (select count(*) from pg_policies where tablename = 'messages' and policyname = 'participants send messages') as insert_policy,
  to_regclass('public.support_threads') is not null as support_threads,
  to_regclass('public.announcements') is not null as announcements,
  to_regclass('public.conversation_mutes') is not null as mutes;
