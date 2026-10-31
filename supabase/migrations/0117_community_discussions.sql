-- =============================================================================
-- BuildEx — Community, part two: Discussions (chat + community plan, stage 4b)
--
-- One section with three kinds of topic — question, guide, idea — instead of
-- separate Help / Guides / Ideas sections while the community is small
-- (stage-0 proposal П7). Questions can be marked solved with a best answer.
--
--   1. public.forum_topics and public.forum_replies — public, readable by
--      guests through the list/get functions; written only by RPCs, with
--      daily caps. Replies are a flat list; a reply may quote another.
--   2. "Helpful" on topics and replies (public.forum_helpful, counters kept by
--      the RPC), "Save" on topics (public.forum_saves).
--   3. The topic's author gets one bell per topic for new replies.
--   4. Moderation: reports on topics and replies (0116's community_reports
--      now accepts them), hide a topic or reply, pin a topic.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated, then
-- grants back exactly what the app calls. Nothing here deletes user data.
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 0. TUNING ──────────────────────────────────────────────────────────────

create or replace function public.forum_topics_per_day()
returns int language sql immutable set search_path = public as $$ select 5; $$;

create or replace function public.forum_replies_per_day()
returns int language sql immutable set search_path = public as $$ select 60; $$;

revoke all on function public.forum_topics_per_day() from public, anon, authenticated;
revoke all on function public.forum_replies_per_day() from public, anon, authenticated;


-- ─── 1. TABLES ──────────────────────────────────────────────────────────────

create table if not exists public.forum_topics (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null
    constraint forum_topics_author_id_fkey references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  solved_reply_id uuid,
  reply_count int not null default 0,
  helpful_count int not null default 0,
  last_activity_at timestamptz not null default now(),
  pinned_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint forum_topics_kind check (kind in ('question', 'guide', 'idea')),
  constraint forum_topics_title_len check (char_length(btrim(title)) between 3 and 120),
  constraint forum_topics_body_len check (char_length(btrim(body)) between 1 and 10000)
);

create index if not exists forum_topics_activity_idx on public.forum_topics (last_activity_at desc) where hidden_at is null;
create index if not exists forum_topics_author_idx on public.forum_topics (author_id, created_at desc);

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null
    constraint forum_replies_topic_id_fkey references public.forum_topics(id) on delete cascade,
  author_id uuid not null
    constraint forum_replies_author_id_fkey references public.profiles(id) on delete cascade,
  body text not null,
  quote_reply_id uuid
    constraint forum_replies_quote_reply_id_fkey references public.forum_replies(id) on delete set null,
  helpful_count int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint forum_replies_body_len check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists forum_replies_topic_idx on public.forum_replies (topic_id, created_at);
create index if not exists forum_replies_author_idx on public.forum_replies (author_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forum_topics_solved_reply_id_fkey') then
    alter table public.forum_topics
      add constraint forum_topics_solved_reply_id_fkey
      foreign key (solved_reply_id) references public.forum_replies(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.forum_helpful (
  user_id uuid not null
    constraint forum_helpful_user_id_fkey references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id),
  constraint forum_helpful_type check (target_type in ('topic', 'reply'))
);

create table if not exists public.forum_saves (
  user_id uuid not null
    constraint forum_saves_user_id_fkey references public.profiles(id) on delete cascade,
  topic_id uuid not null
    constraint forum_saves_topic_id_fkey references public.forum_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

alter table public.forum_topics enable row level security;
alter table public.forum_replies enable row level security;
alter table public.forum_helpful enable row level security;
alter table public.forum_saves enable row level security;
revoke all on table public.forum_topics from anon, authenticated;
revoke all on table public.forum_replies from anon, authenticated;
revoke all on table public.forum_helpful from anon, authenticated;
revoke all on table public.forum_saves from anon, authenticated;


-- ─── 2. READING ─────────────────────────────────────────────────────────────

-- p_kind: null | 'question' | 'guide' | 'idea'. p_sort: 'active' | 'new' |
-- 'top'. p_scope: 'all' | 'mine' (topics I started) | 'saved'.
create or replace function public.list_forum_topics(
  p_kind text default null,
  p_sort text default 'active',
  p_scope text default 'all',
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid,
  kind text,
  title text,
  excerpt text,
  solved boolean,
  reply_count int,
  helpful_count int,
  last_activity_at timestamptz,
  created_at timestamptz,
  pinned boolean,
  hidden boolean,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin boolean := public._is_admin(auth.uid());
begin
  return query
  select t.id, t.kind, t.title, left(regexp_replace(t.body, '\s+', ' ', 'g'), 180),
         t.solved_reply_id is not null, t.reply_count, t.helpful_count,
         t.last_activity_at, t.created_at, t.pinned_at is not null, t.hidden_at is not null,
         t.author_id, p.username, p.display_name, p.avatar_url
    from public.forum_topics t
    join public.profiles p on p.id = t.author_id
   where (t.hidden_at is null or v_admin or t.author_id = auth.uid())
     and (p_kind is null or t.kind = p_kind)
     and (coalesce(p_scope, 'all') = 'all'
          or (p_scope = 'mine' and t.author_id = auth.uid())
          or (p_scope = 'saved' and exists (
                select 1 from public.forum_saves s where s.topic_id = t.id and s.user_id = auth.uid())))
   order by (coalesce(p_scope, 'all') = 'all' and t.pinned_at is not null) desc,
            case when p_sort = 'top' then t.helpful_count end desc nulls last,
            case when p_sort = 'new' then t.created_at end desc nulls last,
            t.last_activity_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_forum_topics(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.list_forum_topics(text, text, text, int, int) to anon, authenticated;

-- One topic with its replies, as JSON: { topic, replies }.
create or replace function public.get_forum_topic(p_topic uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_admin boolean := public._is_admin(auth.uid());
  t public.forum_topics;
  v_topic jsonb;
  v_replies jsonb;
begin
  select * into t from public.forum_topics where id = p_topic;
  if not found or (t.hidden_at is not null and not v_admin and t.author_id is distinct from auth.uid()) then
    return null;
  end if;

  select jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'body', t.body,
    'solved_reply_id', t.solved_reply_id, 'reply_count', t.reply_count,
    'helpful_count', t.helpful_count, 'created_at', t.created_at, 'edited_at', t.edited_at,
    'pinned', t.pinned_at is not null, 'hidden', t.hidden_at is not null,
    'author_id', t.author_id, 'author_username', p.username,
    'author_display_name', p.display_name, 'author_avatar_url', p.avatar_url,
    'author_is_builder', exists (select 1 from public.builder_profiles bp where bp.id = t.author_id and not bp.is_hidden),
    'author_topics', (select count(*) from public.forum_topics x where x.author_id = t.author_id and x.hidden_at is null),
    'author_joined', p.created_at,
    'helpful_by_me', exists (select 1 from public.forum_helpful h where h.user_id = auth.uid() and h.target_type = 'topic' and h.target_id = t.id),
    'saved_by_me', exists (select 1 from public.forum_saves s where s.user_id = auth.uid() and s.topic_id = t.id)
  ) into v_topic
    from public.profiles p where p.id = t.author_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'body', case when r.hidden_at is not null and not v_admin then null else r.body end,
    'hidden', r.hidden_at is not null,
    'quote_reply_id', r.quote_reply_id, 'helpful_count', r.helpful_count,
    'created_at', r.created_at, 'edited_at', r.edited_at,
    'author_id', r.author_id, 'author_username', p.username,
    'author_display_name', p.display_name, 'author_avatar_url', p.avatar_url,
    'author_is_builder', exists (select 1 from public.builder_profiles bp where bp.id = r.author_id and not bp.is_hidden),
    'helpful_by_me', exists (select 1 from public.forum_helpful h where h.user_id = auth.uid() and h.target_type = 'reply' and h.target_id = r.id)
  ) order by r.created_at), '[]'::jsonb) into v_replies
    from public.forum_replies r
    join public.profiles p on p.id = r.author_id
   where r.topic_id = t.id;

  return jsonb_build_object('topic', v_topic, 'replies', v_replies);
end;
$$;

revoke all on function public.get_forum_topic(uuid) from public, anon, authenticated;
grant execute on function public.get_forum_topic(uuid) to anon, authenticated;


-- ─── 3. WRITING ─────────────────────────────────────────────────────────────

create or replace function public.create_forum_topic(p_kind text, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('question', 'guide', 'idea') then
    raise exception 'Pick what kind of topic this is.' using errcode = 'check_violation';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'The title is 3 to 120 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 10000 then
    raise exception 'The text can be up to 10000 characters.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.forum_topics t
       where t.author_id = auth.uid() and t.created_at > now() - interval '1 day') >= public.forum_topics_per_day() then
    raise exception 'You have started too many topics today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into public.forum_topics (author_id, kind, title, body)
  values (auth.uid(), p_kind, v_title, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_forum_topic(text, text, text) from public, anon, authenticated;
grant execute on function public.create_forum_topic(text, text, text) to authenticated;

create or replace function public.edit_forum_topic(p_topic uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'The title is 3 to 120 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 10000 then
    raise exception 'The text can be up to 10000 characters.' using errcode = 'check_violation';
  end if;
  update public.forum_topics
     set title = v_title, body = v_body, edited_at = now()
   where id = p_topic and author_id = auth.uid();
  if not found then raise exception 'Topic not found'; end if;
end;
$$;

revoke all on function public.edit_forum_topic(uuid, text, text) from public, anon, authenticated;
grant execute on function public.edit_forum_topic(uuid, text, text) to authenticated;

create or replace function public.reply_to_forum_topic(p_topic uuid, p_body text, p_quote uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.forum_topics;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_name text;
  v_link text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select * into t from public.forum_topics where id = p_topic for update;
  if not found or t.hidden_at is not null then raise exception 'Topic not found'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 5000 then
    raise exception 'A reply can be up to 5000 characters.' using errcode = 'check_violation';
  end if;
  if p_quote is not null and not exists (
    select 1 from public.forum_replies r where r.id = p_quote and r.topic_id = p_topic and r.hidden_at is null
  ) then
    raise exception 'The quoted reply is not available.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.forum_replies r
       where r.author_id = me and r.created_at > now() - interval '1 day') >= public.forum_replies_per_day() then
    raise exception 'You have replied too many times today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;

  insert into public.forum_replies (topic_id, author_id, body, quote_reply_id)
  values (p_topic, me, v_body, p_quote)
  returning id into v_id;
  update public.forum_topics
     set reply_count = reply_count + 1, last_activity_at = now()
   where id = p_topic;

  -- One bell per topic for its author, updated in place (0112's helper).
  if t.author_id <> me then
    select coalesce(nullif(btrim(p.display_name), ''), '@' || p.username, 'Someone') into v_name
      from public.profiles p where p.id = me;
    v_link := '/community?s=discussions&t=' || p_topic::text;
    perform public._upsert_thread_notification(
      t.author_id, 'forum', 'Reply · ' || left(t.title, 80), coalesce(v_name, 'Someone') || ': ' || left(v_body, 100),
      v_link, now());
  end if;
  return v_id;
end;
$$;

revoke all on function public.reply_to_forum_topic(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reply_to_forum_topic(uuid, text, uuid) to authenticated;

create or replace function public.edit_forum_reply(p_reply uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) < 1 or char_length(v_body) > 5000 then
    raise exception 'A reply can be up to 5000 characters.' using errcode = 'check_violation';
  end if;
  update public.forum_replies
     set body = v_body, edited_at = now()
   where id = p_reply and author_id = auth.uid();
  if not found then raise exception 'Reply not found'; end if;
end;
$$;

revoke all on function public.edit_forum_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.edit_forum_reply(uuid, text) to authenticated;

-- "Helpful" on a topic or a reply; not on your own. Returns the new state.
create or replace function public.toggle_forum_helpful(p_type text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_type = 'topic' then
    select author_id into v_owner from public.forum_topics where id = p_id and hidden_at is null;
  elsif p_type = 'reply' then
    select author_id into v_owner from public.forum_replies where id = p_id and hidden_at is null;
  else
    raise exception 'Unknown target';
  end if;
  if v_owner is null then raise exception 'Not available'; end if;
  if v_owner = auth.uid() then
    raise exception 'You cannot mark your own post as helpful.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.forum_helpful h where h.user_id = auth.uid() and h.target_type = p_type and h.target_id = p_id) then
    delete from public.forum_helpful where user_id = auth.uid() and target_type = p_type and target_id = p_id;
    if p_type = 'topic' then
      update public.forum_topics set helpful_count = greatest(helpful_count - 1, 0) where id = p_id;
    else
      update public.forum_replies set helpful_count = greatest(helpful_count - 1, 0) where id = p_id;
    end if;
    return false;
  end if;
  insert into public.forum_helpful (user_id, target_type, target_id) values (auth.uid(), p_type, p_id);
  if p_type = 'topic' then
    update public.forum_topics set helpful_count = helpful_count + 1 where id = p_id;
  else
    update public.forum_replies set helpful_count = helpful_count + 1 where id = p_id;
  end if;
  return true;
end;
$$;

revoke all on function public.toggle_forum_helpful(text, uuid) from public, anon, authenticated;
grant execute on function public.toggle_forum_helpful(text, uuid) to authenticated;

create or replace function public.toggle_forum_save(p_topic uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.forum_saves where user_id = auth.uid() and topic_id = p_topic) then
    delete from public.forum_saves where user_id = auth.uid() and topic_id = p_topic;
    return false;
  end if;
  if not exists (select 1 from public.forum_topics where id = p_topic and hidden_at is null) then
    raise exception 'Topic not found';
  end if;
  insert into public.forum_saves (user_id, topic_id) values (auth.uid(), p_topic);
  return true;
end;
$$;

revoke all on function public.toggle_forum_save(uuid) from public, anon, authenticated;
grant execute on function public.toggle_forum_save(uuid) to authenticated;

-- The author of a question picks the best answer (or clears it with null).
create or replace function public.mark_forum_solved(p_topic uuid, p_reply uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reply is not null and not exists (
    select 1 from public.forum_replies r where r.id = p_reply and r.topic_id = p_topic and r.hidden_at is null
  ) then
    raise exception 'The reply is not available.' using errcode = 'check_violation';
  end if;
  update public.forum_topics
     set solved_reply_id = p_reply
   where id = p_topic and author_id = auth.uid() and kind = 'question';
  if not found then raise exception 'Topic not found'; end if;
end;
$$;

revoke all on function public.mark_forum_solved(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_forum_solved(uuid, uuid) to authenticated;


-- ─── 4. MODERATION ──────────────────────────────────────────────────────────

alter table public.community_reports drop constraint if exists community_reports_type;
alter table public.community_reports
  add constraint community_reports_type check (target_type in ('brief', 'work', 'topic', 'reply'));

-- 0116's report_content, now also for topics and replies.
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
  if p_type not in ('brief', 'work', 'topic', 'reply') then raise exception 'Unknown report target'; end if;
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

-- 0116's queue, now naming topics and replies too. The return type gains
-- topic_id, so the old function is dropped first.
drop function if exists public.admin_list_community_reports(text);
create function public.admin_list_community_reports(p_status text default 'open')
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
  topic_id uuid
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
           else (select left(x.body, 120) from public.forum_replies x where x.id = r.target_id) end,
         case r.target_type
           when 'brief' then (select p.username from public.briefs b join public.profiles p on p.id = b.author_id where b.id = r.target_id)
           when 'work' then (select p.username from public.works w join public.profiles p on p.id = w.builder_id where w.id = r.target_id)
           when 'topic' then (select p.username from public.forum_topics t join public.profiles p on p.id = t.author_id where t.id = r.target_id)
           else (select p.username from public.forum_replies x join public.profiles p on p.id = x.author_id where x.id = r.target_id) end,
         case r.target_type
           when 'brief' then (select b.hidden_at is not null from public.briefs b where b.id = r.target_id)
           when 'work' then (select w.removed_at is not null from public.works w where w.id = r.target_id)
           when 'topic' then (select t.hidden_at is not null from public.forum_topics t where t.id = r.target_id)
           else (select x.hidden_at is not null from public.forum_replies x where x.id = r.target_id) end,
         r.reason, r.status, r.created_at, rp.username,
         case r.target_type
           when 'topic' then r.target_id
           when 'reply' then (select x.topic_id from public.forum_replies x where x.id = r.target_id) end
    from public.community_reports r
    join public.profiles rp on rp.id = r.reporter_id
   where p_status is null or p_status = 'all' or r.status = p_status
   order by r.created_at desc
   limit 200;
end;
$$;

revoke all on function public.admin_list_community_reports(text) from public, anon, authenticated;
grant execute on function public.admin_list_community_reports(text) to authenticated;

create or replace function public.admin_set_forum_hidden(p_type text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_type = 'topic' then
    update public.forum_topics
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
     where id = p_id;
  elsif p_type = 'reply' then
    update public.forum_replies
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
     where id = p_id;
  else
    raise exception 'Unknown target';
  end if;
  if not found then raise exception 'Not found'; end if;
end;
$$;

revoke all on function public.admin_set_forum_hidden(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_forum_hidden(text, uuid, boolean) to authenticated;

create or replace function public.admin_set_forum_pinned(p_topic uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.forum_topics
     set pinned_at = case when p_pinned then coalesce(pinned_at, now()) else null end
   where id = p_topic;
  if not found then raise exception 'Topic not found'; end if;
end;
$$;

revoke all on function public.admin_set_forum_pinned(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_forum_pinned(uuid, boolean) to authenticated;


notify pgrst, 'reload schema';

select
  to_regclass('public.forum_topics') is not null as topics,
  to_regclass('public.forum_replies') is not null as replies,
  has_function_privilege('anon', 'public.list_forum_topics(text, text, text, int, int)', 'execute') as anon_list,
  has_function_privilege('anon', 'public.create_forum_topic(text, text, text)', 'execute') as anon_create;
