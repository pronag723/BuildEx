-- =============================================================================
-- BuildEx — 3D previews in chat (chat + community plan, stage 3)
--
-- A builder picks a .schem, .litematic or world .zip. The browser reads it and
-- keeps only the outer blocks and their colours (the BXV1 format, lib/preview);
-- the file itself is never uploaded. What leaves the builder's machine is that
-- compact preview plus a small picture of it for the chat card.
--
--   1. Bucket `chat-previews`: public read like chat-media (random names under
--      the uploader's own folder), 4 MB per object, only the preview and its
--      picture. Flat paths `<uid>/<file>` so the account-deletion purge (the
--      delete-account Edge Function) clears it.
--   2. msg_type `preview`, written only by send_preview_message(), which checks
--      the caller is in the conversation, that both files are theirs and exist,
--      and stores a checked meta: paths, size, block counts, source format and
--      an optional caption.
--   3. Previews count as unread and notify like a photo.
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. BUCKET ──────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-previews', 'chat-previews', true, 4194304,
        array['application/octet-stream', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Chat previews are publicly readable" on storage.objects;
create policy "Chat previews are publicly readable"
  on storage.objects for select
  using (bucket_id = 'chat-previews');

drop policy if exists "Users write own chat previews" on storage.objects;
create policy "Users write own chat previews"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-previews'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'
  );

drop policy if exists "Users delete own chat previews" on storage.objects;
create policy "Users delete own chat previews"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-previews'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─── 2. MESSAGES ────────────────────────────────────────────────────────────

alter table public.messages drop constraint if exists messages_msg_type_check;
alter table public.messages
  add constraint messages_msg_type_check
  check (msg_type in ('text', 'order_event', 'image', 'system', 'brief', 'preview'));

create or replace function public._counts_as_unread(p_type text, p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_type, 'text')
    when 'text' then true
    when 'image' then true
    when 'brief' then true
    when 'preview' then true
    when 'system' then coalesce(p_meta->>'unread', 'false') = 'true'
    else false
  end;
$$;

revoke all on function public._counts_as_unread(text, jsonb) from public, anon, authenticated;

create or replace function public._message_notifies(p_type text, p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_type, 'text')
    when 'text' then true
    when 'image' then true
    when 'brief' then true
    when 'preview' then true
    when 'system' then coalesce(p_meta->>'notify', 'false') = 'true'
    else false
  end;
$$;

revoke all on function public._message_notifies(text, jsonb) from public, anon, authenticated;

-- 0114's mapping, plus the preview's body.
create or replace function public._ru_message_text(p_body text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_body like 'Brief · %' then 'ТЗ · ' || substr(p_body, 9)
    when p_body = '3D preview' then '3D-превью'
    when p_body like '3D preview · %' then '3D-превью · ' || substr(p_body, 14)
    when p_body = 'Edited the brief' then 'Изменил(а) ТЗ'
    when p_body = 'Proposed terms' then 'Предложил(а) свои условия'
    when p_body = 'Took the order' then 'Взял(а) заказ'
    when p_body = 'Accepted the terms' then 'Согласился(ась) с условиями'
    when p_body = 'Turned down the terms' then 'Не согласился(ась) с условиями'
    when p_body = 'Declined the order' then 'Отказался(ась) от заказа'
    when p_body = 'Delivered the work' then 'Сдал(а) работу'
    when p_body = 'Confirmed the order is complete' then 'Подтвердил(а), что заказ выполнен'
    when p_body = 'Cancelled the order' then 'Отменил(а) заказ'
    when p_body = 'Asked to confirm the order' then 'Просит подтвердить заказ'
    else p_body
  end;
$$;

revoke all on function public._ru_message_text(text) from public, anon, authenticated;


-- ─── 3. SENDING A PREVIEW ───────────────────────────────────────────────────

create or replace function public.send_preview_message(
  p_conversation uuid,
  p_path text,
  p_thumb text,
  p_meta jsonb,
  p_caption text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_size jsonb := p_meta->'size';
  v_format text := p_meta->>'format';
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public._can_write_conversation(p_conversation) then
    raise exception 'Conversation not found';
  end if;
  if coalesce(p_path, '') !~ ('^' || me::text || '/[A-Za-z0-9._-]{1,200}\.bxv$')
     or coalesce(p_thumb, '') !~ ('^' || me::text || '/[A-Za-z0-9._-]{1,200}\.(webp|png)$') then
    raise exception 'The preview files are not valid.' using errcode = 'check_violation';
  end if;
  if (select count(*) from storage.objects o
       where o.bucket_id = 'chat-previews' and o.name in (p_path, p_thumb)) <> 2 then
    raise exception 'The preview files are not valid.' using errcode = 'check_violation';
  end if;
  if v_format is null or v_format not in ('schem', 'litematic', 'world')
     or jsonb_typeof(v_size) <> 'array' or jsonb_array_length(v_size) <> 3 then
    raise exception 'The preview files are not valid.' using errcode = 'check_violation';
  end if;
  if v_caption is not null and char_length(v_caption) > 200 then
    raise exception 'The caption can be up to 200 characters.' using errcode = 'check_violation';
  end if;

  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    p_conversation, me,
    case when v_caption is null then '3D preview' else '3D preview · ' || v_caption end,
    'preview',
    jsonb_build_object(
      'path', p_path,
      'thumb', p_thumb,
      'format', v_format,
      'size', jsonb_build_array(
        least(greatest(coalesce((v_size->>0)::int, 0), 0), 100000),
        least(greatest(coalesce((v_size->>1)::int, 0), 0), 100000),
        least(greatest(coalesce((v_size->>2)::int, 0), 0), 100000)),
      'voxels', least(greatest(coalesce((p_meta->>'voxels')::int, 0), 0), 10000000),
      'blocks', least(greatest(coalesce((p_meta->>'blocks')::int, 0), 0), 100000000),
      'caption', v_caption
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.send_preview_message(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.send_preview_message(uuid, text, text, jsonb, text) to authenticated;


notify pgrst, 'reload schema';

select
  (select count(*) from storage.buckets where id = 'chat-previews') as bucket,
  has_function_privilege('anon', 'public.send_preview_message(uuid, text, text, jsonb, text)', 'execute') as anon_can_send,
  public._message_notifies('preview', null) as preview_notifies;
