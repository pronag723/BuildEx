-- =============================================================================
-- BuildEx — Community: the global chat
--
-- One shared room for the whole community. Anyone can read it (guests too);
-- signed-in members write. Messages arrive live through Supabase Realtime,
-- which only delivers rows the reader may SELECT — so, unlike the forum
-- tables, this one has a read policy:
--
--   1. community_chat_messages (body 1–1000, optional reply-to). Readable when
--      not hidden by a moderator and the author is not a hidden builder.
--      No insert/update/delete policies: writes go through the RPCs below.
--   2. community_chat_mutes: a moderator can keep someone out of the chat
--      for a while.
--   3. RPCs: send_community_chat (1 message per 3 s and 300 a day per
--      person, muted members refused), list_community_chat (newest page,
--      with authors), admin_set_chat_hidden, admin_mute_chat_user.
--   4. report_content and the moderators' report queue learn 'chat_message'.
--   5. The table joins the supabase_realtime publication.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated, then
-- grants back exactly what the app calls. Nothing here deletes user data.
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 0. TUNING ──────────────────────────────────────────────────────────────

create or replace function public.chat_room_per_day()
returns int language sql immutable set search_path = public as $$ select 300; $$;
revoke all on function public.chat_room_per_day() from public, anon, authenticated;

create or replace function public.chat_room_gap_seconds()
returns int language sql immutable set search_path = public as $$ select 3; $$;
revoke all on function public.chat_room_gap_seconds() from public, anon, authenticated;


-- ─── 1. TABLES ──────────────────────────────────────────────────────────────

create table if not exists public.community_chat_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null
    constraint community_chat_messages_author_id_fkey references public.profiles(id) on delete cascade,
  body text not null,
  reply_to_id uuid
    constraint community_chat_messages_reply_to_id_fkey references public.community_chat_messages(id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_chat_body_len check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists community_chat_messages_created_idx
  on public.community_chat_messages (created_at desc);
create index if not exists community_chat_messages_author_idx
  on public.community_chat_messages (author_id, created_at desc);

alter table public.community_chat_messages enable row level security;
revoke all on public.community_chat_messages from anon, authenticated;
grant select on public.community_chat_messages to anon, authenticated;

-- The policy runs as the reader, and RLS on builder_profiles hides a hidden
-- builder's row from them — so _author_hidden() would always say "visible".
-- This definer helper reads the flag itself (and returns nothing else).
create or replace function public._chat_author_hidden(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.builder_profiles bp where bp.id = p_user and bp.is_hidden);
$$;
revoke all on function public._chat_author_hidden(uuid) from public, anon, authenticated;
grant execute on function public._chat_author_hidden(uuid) to anon, authenticated;

drop policy if exists "Visible chat messages are readable" on public.community_chat_messages;
create policy "Visible chat messages are readable"
  on public.community_chat_messages for select
  to anon, authenticated
  using (hidden_at is null and not public._chat_author_hidden(author_id));

create table if not exists public.community_chat_mutes (
  user_id uuid primary key
    constraint community_chat_mutes_user_id_fkey references public.profiles(id) on delete cascade,
  muted_until timestamptz not null,
  muted_by uuid
    constraint community_chat_mutes_muted_by_fkey references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.community_chat_mutes enable row level security;
revoke all on public.community_chat_mutes from anon, authenticated;


-- ─── 2. RPCs ────────────────────────────────────────────────────────────────

create or replace function public.send_community_chat(p_body text, p_reply_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_last timestamptz;
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'A message can be up to 1000 characters.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.community_chat_mutes m where m.user_id = me and m.muted_until > now()) then
    raise exception 'A moderator has paused your messages in the chat for a while.' using errcode = 'check_violation';
  end if;
  if public._author_hidden(me) then
    raise exception 'A moderator has paused your messages in the chat for a while.' using errcode = 'check_violation';
  end if;
  select max(c.created_at) into v_last from public.community_chat_messages c where c.author_id = me;
  if v_last is not null and v_last > now() - make_interval(secs => public.chat_room_gap_seconds()) then
    raise exception 'You are sending messages too quickly. Please wait a moment.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.community_chat_messages c
       where c.author_id = me and c.created_at > now() - interval '1 day') >= public.chat_room_per_day() then
    raise exception 'You have sent a lot of messages today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.community_chat_messages c where c.id = p_reply_to and c.hidden_at is null
  ) then
    raise exception 'The message you are replying to is not available.' using errcode = 'check_violation';
  end if;

  insert into public.community_chat_messages (author_id, body, reply_to_id)
  values (me, v_body, p_reply_to)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.send_community_chat(text, uuid) from public, anon, authenticated;
grant execute on function public.send_community_chat(text, uuid) to authenticated;

-- The newest messages before p_before (or the newest of all), oldest first
-- within the page, each with its author and the message it replies to.
create or replace function public.list_community_chat(p_before timestamptz default null, p_limit int default 50)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_is_builder boolean,
  reply_to_id uuid,
  reply_body text,
  reply_author text
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  select * from (
    select c.id, c.body, c.created_at, c.author_id, p.username, p.display_name, p.avatar_url,
           exists (select 1 from public.builder_profiles bp where bp.id = c.author_id and not bp.is_hidden),
           c.reply_to_id,
           case when r.hidden_at is null then left(r.body, 140) end,
           coalesce(nullif(btrim(rp.display_name), ''), rp.username)
      from public.community_chat_messages c
      join public.profiles p on p.id = c.author_id
      left join public.community_chat_messages r on r.id = c.reply_to_id
      left join public.profiles rp on rp.id = r.author_id
     where c.hidden_at is null
       and not public._author_hidden(c.author_id)
       and (p_before is null or c.created_at < p_before)
     order by c.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) page
  order by page.created_at asc;
end;
$$;

revoke all on function public.list_community_chat(timestamptz, int) from public, anon, authenticated;
grant execute on function public.list_community_chat(timestamptz, int) to anon, authenticated;

create or replace function public.admin_set_chat_hidden(p_message uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.community_chat_messages
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
   where id = p_message;
  if not found then raise exception 'Message not found'; end if;
end;
$$;

revoke all on function public.admin_set_chat_hidden(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_chat_hidden(uuid, boolean) to authenticated;

-- p_hours: how long (1 hour to 30 days); 0 lifts the mute.
create or replace function public.admin_mute_chat_user(p_user uuid, p_hours int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if coalesce(p_hours, 0) <= 0 then
    delete from public.community_chat_mutes where user_id = p_user;
    return;
  end if;
  insert into public.community_chat_mutes (user_id, muted_until, muted_by)
  values (p_user, now() + make_interval(hours => least(p_hours, 720)), auth.uid())
  on conflict (user_id) do update set muted_until = excluded.muted_until, muted_by = excluded.muted_by;
end;
$$;

revoke all on function public.admin_mute_chat_user(uuid, int) from public, anon, authenticated;
grant execute on function public.admin_mute_chat_user(uuid, int) to authenticated;


-- ─── 3. REPORTS ─────────────────────────────────────────────────────────────

alter table public.community_reports drop constraint if exists community_reports_type;
alter table public.community_reports
  add constraint community_reports_type check (target_type in ('brief', 'work', 'topic', 'reply', 'chat_message'));

-- 0117's report_content, now also for chat messages.
create or replace function public.report_content(p_type text, p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_type not in ('brief', 'work', 'topic', 'reply', 'chat_message') then raise exception 'Unknown report target'; end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 1000 then
    raise exception 'Please describe what is wrong.' using errcode = 'check_violation';
  end if;
  if p_type = 'brief' and not exists (select 1 from public.briefs b where b.id = p_id and b.visibility = 'public') then
    raise exception 'That request is not available.' using errcode = 'check_violation';
  end if;
  if p_type = 'work' and not public._work_is_public(p_id) then
    raise exception 'That work is not available.' using errcode = 'check_violation';
  end if;
  if p_type = 'topic' and not exists (select 1 from public.forum_topics t where t.id = p_id) then
    raise exception 'Topic not found';
  end if;
  if p_type = 'reply' and not exists (select 1 from public.forum_replies r where r.id = p_id) then
    raise exception 'Reply not found';
  end if;
  if p_type = 'chat_message' and not exists (select 1 from public.community_chat_messages c where c.id = p_id) then
    raise exception 'Message not found';
  end if;
  if exists (select 1 from public.community_reports r
              where r.target_type = p_type and r.target_id = p_id and r.reporter_id = auth.uid() and r.status = 'open') then
    raise exception 'You have already reported this. Our team is reviewing it.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.community_reports r
       where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') >= public.community_reports_per_day() then
    raise exception 'You have submitted too many reports today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into public.community_reports (target_type, target_id, reporter_id, reason)
  values (p_type, p_id, auth.uid(), v_reason)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.report_content(text, uuid, text) from public, anon, authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;

-- 0118's queue, naming chat messages too (same return type).
create or replace function public.admin_list_community_reports(p_status text default 'open')
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_title text,
  target_owner text,
  target_hidden boolean,
  reason text,
  status text,
  created_at timestamptz,
  reporter_username text,
  topic_id uuid,
  target_kind text
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select r.id, r.target_type, r.target_id,
         case r.target_type
           when 'brief' then (select b.title from public.briefs b where b.id = r.target_id)
           when 'work' then (select coalesce(w.title, '') from public.works w where w.id = r.target_id)
           when 'topic' then (select t.title from public.forum_topics t where t.id = r.target_id)
           when 'chat_message' then (select left(c.body, 120) from public.community_chat_messages c where c.id = r.target_id)
           else (select left(x.body, 120) from public.forum_replies x where x.id = r.target_id) end,
         case r.target_type
           when 'brief' then (select p.username from public.briefs b join public.profiles p on p.id = b.author_id where b.id = r.target_id)
           when 'work' then (select p.username from public.works w join public.profiles p on p.id = w.builder_id where w.id = r.target_id)
           when 'topic' then (select p.username from public.forum_topics t join public.profiles p on p.id = t.author_id where t.id = r.target_id)
           when 'chat_message' then (select p.username from public.community_chat_messages c join public.profiles p on p.id = c.author_id where c.id = r.target_id)
           else (select p.username from public.forum_replies x join public.profiles p on p.id = x.author_id where x.id = r.target_id) end,
         case r.target_type
           when 'brief' then (select b.hidden_at is not null from public.briefs b where b.id = r.target_id)
           when 'work' then (select w.removed_at is not null from public.works w where w.id = r.target_id)
           when 'topic' then (select t.hidden_at is not null from public.forum_topics t where t.id = r.target_id)
           when 'chat_message' then (select c.hidden_at is not null from public.community_chat_messages c where c.id = r.target_id)
           else (select x.hidden_at is not null from public.forum_replies x where x.id = r.target_id) end,
         r.reason, r.status, r.created_at, rp.username,
         case r.target_type
           when 'topic' then r.target_id
           when 'reply' then (select x.topic_id from public.forum_replies x where x.id = r.target_id) end,
         case r.target_type
           when 'topic' then (select t.kind from public.forum_topics t where t.id = r.target_id)
           when 'reply' then (select t.kind from public.forum_replies x join public.forum_topics t on t.id = x.topic_id where x.id = r.target_id) end
    from public.community_reports r
    join public.profiles rp on rp.id = r.reporter_id
   where p_status is null or p_status = 'all' or r.status = p_status
   order by r.created_at desc
   limit 200;
end;
$$;

revoke all on function public.admin_list_community_reports(text) from public, anon, authenticated;
grant execute on function public.admin_list_community_reports(text) to authenticated;


-- ─── 4. REALTIME ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_chat_messages'
  ) then
    alter publication supabase_realtime add table public.community_chat_messages;
  end if;
end $$;
