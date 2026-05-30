-- =============================================================================
-- BuildEx — User-to-user chat (1:1 conversations + messages)
--
-- BuildEx ships as a static export (no server / API routes), so all privileged
-- or race-prone writes go through SECURITY DEFINER RPCs, exactly like
-- delete_own_account (migration 0006). The client talks to:
--   • get_or_create_conversation(other) — find-or-create the canonical 1:1 thread
--   • list_my_conversations()           — inbox rows (other participant + preview)
--   • mark_conversation_read(conv)       — clear unread markers
--
-- Plain message reads/writes go straight through PostgREST under RLS. New
-- messages stream to the client via Supabase Realtime (postgres_changes on
-- public.messages), which honours the SELECT policy below so a user only ever
-- receives messages from conversations they belong to.
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── 1. conversations ────────────────────────────────────────────────────────
-- A conversation is a single 1:1 thread between two distinct users. The pair is
-- stored in a canonical order (user_a < user_b) with a UNIQUE constraint so the
-- same two people can never end up with two parallel threads, regardless of who
-- starts it.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  last_message_at timestamptz default now(),
  last_message_preview text,
  constraint conversations_distinct check (user_a <> user_b),
  constraint conversations_ordered check (user_a < user_b),
  constraint conversations_pair_unique unique (user_a, user_b)
);

create index if not exists conversations_user_a_idx on public.conversations (user_a, last_message_at desc);
create index if not exists conversations_user_b_idx on public.conversations (user_b, last_message_at desc);

alter table public.conversations enable row level security;

-- Participants may read their own threads. (The find-or-create write path is the
-- RPC below, which runs as definer, so no INSERT policy is needed here.)
drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations"
  on public.conversations for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- ─── 2. messages ─────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

-- A user may read messages in any conversation they participate in. The
-- subquery is itself filtered by the conversations SELECT policy above, so this
-- only ever matches the caller's own threads. Realtime postgres_changes reuses
-- this policy, keeping the stream private.
drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- A user may only post as themselves, and only into a conversation they belong
-- to.
drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- ─── 3. Keep conversations.last_message_* fresh ──────────────────────────────
-- Runs as the function owner, so it updates the conversation row regardless of
-- the (read-only) RLS the sender has on conversations.
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 140)
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_on_message();

-- ─── 4. RPC: find-or-create the canonical thread with another user ───────────
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
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other is null or other = me then
    raise exception 'Invalid recipient';
  end if;
  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'Recipient not found';
  end if;

  if me < other then lo := me; hi := other; else lo := other; hi := me; end if;

  insert into public.conversations (user_a, user_b)
  values (lo, hi)
  on conflict (user_a, user_b) do nothing;

  select id into conv
    from public.conversations
   where user_a = lo and user_b = hi;

  return conv;
end;
$$;

revoke all on function public.get_or_create_conversation(uuid) from public;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- ─── 5. RPC: the signed-in user's inbox ──────────────────────────────────────
-- One row per conversation: the OTHER participant's public identity, the last
-- message preview, and how many of their messages the caller hasn't read.
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

-- ─── 6. RPC: mark the other party's messages as read ─────────────────────────
create or replace function public.mark_conversation_read(conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = conv and (me = c.user_a or me = c.user_b)
  ) then
    raise exception 'Not a participant';
  end if;

  update public.messages
     set read_at = now()
   where conversation_id = conv
     and sender_id <> me
     and read_at is null;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ─── 7. Realtime ─────────────────────────────────────────────────────────────
-- Stream INSERTs on public.messages to subscribed clients. Realtime enforces the
-- SELECT policy above, so each client only receives messages from its own
-- conversations. Guard the ADD so re-running doesn't error if it's already there.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end$$;

-- Force PostgREST to reload its schema cache so the new RPCs are immediately
-- callable (matches the pattern in 0006_delete_account.sql).
notify pgrst, 'reload schema';
