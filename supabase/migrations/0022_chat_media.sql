-- =============================================================================
-- BuildEx — Chat media (image attachments)
-- Adds an image bucket for chat photos and teaches the messages table about a
-- new 'image' message type. Image messages carry the photo URL in `meta`
-- (jsonb) and may have an empty `body` (an optional caption), so the original
-- "body length 1..4000" check is relaxed for non-text messages.
--
-- Layout convention: chat-media/<user_id>/<filename> — the first path segment
-- (user_id) is enforced by the write policies so a user can only upload to
-- their own folder. Public read (URLs are random/unguessable), mirroring the
-- avatars/portfolios buckets in 0003.
-- Run after 0010 (which added messages.msg_type + meta). Idempotent.
-- =============================================================================

-- ─── 1. Bucket (public read) ────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Chat media is publicly readable" on storage.objects;
create policy "Chat media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'chat-media');

drop policy if exists "Users write own chat media" on storage.objects;
create policy "Users write own chat media"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own chat media" on storage.objects;
create policy "Users update own chat media"
  on storage.objects for update
  using (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own chat media" on storage.objects;
create policy "Users delete own chat media"
  on storage.objects for delete
  using (
    bucket_id = 'chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 2. Allow msg_type = 'image' ────────────────────────────────────────────
alter table public.messages drop constraint if exists messages_msg_type_check;
alter table public.messages
  add constraint messages_msg_type_check
  check (msg_type in ('text', 'order_event', 'image'));

-- ─── 3. Relax the body-length check for non-text messages ───────────────────
-- The original inline check (Postgres names it messages_body_check) required
-- 1..4000 chars. Image messages may have no caption, so allow an empty body
-- when the message isn't plain text.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check
  check (
    (msg_type = 'text' and char_length(body) between 1 and 4000)
    or (msg_type <> 'text' and char_length(body) between 0 and 4000)
  );

notify pgrst, 'reload schema';
