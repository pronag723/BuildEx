-- =============================================================================
-- BuildEx — Community redesign, stage 2: the Showcase holds community posts
--
-- Until now the Showcase listed every work from every builder profile
-- (0116's list_showcase). From here it holds only what people chose to
-- publish to the community. list_showcase and list_saved_works stay in place
-- (decommissioned, not dropped); the UI simply stops calling the first.
--
-- A Showcase post is a forum topic of kind 'showcase' (0117's forum_topics),
-- so replies, "helpful" (= like), saves, reports, hiding and pinning all work
-- as they do for topics:
--
--   1. forum_topics.kind gains 'showcase'; new columns images (1–10 paths in
--      the new public bucket community-media, path <uid>/<uuid>.<ext>) and
--      styles (values from the site's STYLES list). The title of a post is
--      the first 120 characters of its caption, so the title-length check is
--      relaxed for this kind only.
--   2. Bucket community-media: public read, a user writes only under their
--      own folder, and only paths shaped <uid>/<uuid>.<ext>.
--   3. RPCs: create_showcase_post / edit_showcase_post / list_showcase_posts;
--      get_forum_topic now returns images and styles; list_forum_topics
--      leaves posts out unless asked for them; create_forum_topic's daily
--      cap no longer counts posts (posts have their own: 5 a day).
--   4. community_rail(): one call for the right column — pinned topics in a
--      channel, the most helpful posts and topics of the last 7 days, and
--      the most active members of the last 7 days. Public fields only;
--      hidden content and hidden builders are left out.
--   5. admin_list_community_reports gains target_kind so the console can tell
--      a Showcase post from a topic.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated, then
-- grants back exactly what the app calls. Nothing here deletes user data.
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 0. TUNING ──────────────────────────────────────────────────────────────

create or replace function public.forum_showcase_per_day()
returns int language sql immutable set search_path = public as $$ select 5; $$;
revoke all on function public.forum_showcase_per_day() from public, anon, authenticated;

create or replace function public.showcase_max_images()
returns int language sql immutable set search_path = public as $$ select 10; $$;
revoke all on function public.showcase_max_images() from public, anon, authenticated;

-- The style keys of app/builders/data/offers.js (STYLES).
create or replace function public.showcase_styles()
returns text[] language sql immutable set search_path = public as $$
  select array['medieval', 'fantasy', 'sci-fi', 'cyberpunk', 'modern', 'realistic', 'organic', 'terrain', 'pvp', 'other'];
$$;
revoke all on function public.showcase_styles() from public, anon, authenticated;

-- A moderator-hidden builder: their public content goes with the profile.
create or replace function public._author_hidden(p_user uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.builder_profiles bp where bp.id = p_user and bp.is_hidden);
$$;
revoke all on function public._author_hidden(uuid) from public, anon, authenticated;


-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

alter table public.forum_topics add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.forum_topics add column if not exists styles text[] not null default '{}'::text[];

alter table public.forum_topics drop constraint if exists forum_topics_kind;
alter table public.forum_topics
  add constraint forum_topics_kind check (kind in ('question', 'guide', 'idea', 'showcase'));

alter table public.forum_topics drop constraint if exists forum_topics_title_len;
alter table public.forum_topics
  add constraint forum_topics_title_len check (
    (kind = 'showcase' and char_length(btrim(title)) between 1 and 120)
    or char_length(btrim(title)) between 3 and 120
  );

alter table public.forum_topics drop constraint if exists forum_topics_images_shape;
alter table public.forum_topics
  add constraint forum_topics_images_shape check (
    jsonb_typeof(images) = 'array'
    and ((kind = 'showcase' and jsonb_array_length(images) between 1 and public.showcase_max_images())
         or (kind <> 'showcase' and jsonb_array_length(images) = 0))
  );

alter table public.forum_topics drop constraint if exists forum_topics_styles_known;
alter table public.forum_topics
  add constraint forum_topics_styles_known check (styles <@ public.showcase_styles() and coalesce(array_length(styles, 1), 0) <= 5);

create index if not exists forum_topics_showcase_new_idx
  on public.forum_topics (created_at desc) where kind = 'showcase' and hidden_at is null;
create index if not exists forum_topics_showcase_top_idx
  on public.forum_topics (helpful_count desc, created_at desc) where kind = 'showcase' and hidden_at is null;


-- ─── 2. BUCKET ──────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Community media is publicly readable" on storage.objects;
create policy "Community media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'community-media');

-- Only <uid>/<uuid>.<ext> under the uploader's own folder (chat-media allows
-- any file name; here the post RPC checks the same shape, so both agree).
drop policy if exists "Users write own community media" on storage.objects;
create policy "Users write own community media"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$')
  );

drop policy if exists "Users delete own community media" on storage.objects;
create policy "Users delete own community media"
  on storage.objects for delete
  using (
    bucket_id = 'community-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─── 3. POSTS ───────────────────────────────────────────────────────────────

-- The shape a stored image path must have: this user's folder, a uuid name.
create or replace function public._showcase_path_ok(p_user uuid, p_path text)
returns boolean language sql immutable set search_path = public as $$
  select p_path ~ ('^' || p_user::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$');
$$;
revoke all on function public._showcase_path_ok(uuid, text) from public, anon, authenticated;

create or replace function public.create_showcase_post(p_caption text, p_images text[], p_styles text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_caption text := btrim(coalesce(p_caption, ''));
  v_images text[] := coalesce(p_images, '{}');
  v_styles text[] := coalesce(p_styles, '{}');
  v_path text;
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(v_caption) < 1 or char_length(v_caption) > 2000 then
    raise exception 'Write a caption, up to 2000 characters.' using errcode = 'check_violation';
  end if;
  if array_length(v_images, 1) is null or array_length(v_images, 1) > public.showcase_max_images() then
    raise exception 'A post needs 1 to 10 photos.' using errcode = 'check_violation';
  end if;
  if (select count(distinct x) from unnest(v_images) x) <> array_length(v_images, 1) then
    raise exception 'The same photo is attached twice.' using errcode = 'check_violation';
  end if;
  foreach v_path in array v_images loop
    if not public._showcase_path_ok(me, v_path) then
      raise exception 'A photo did not upload correctly. Please try again.' using errcode = 'check_violation';
    end if;
  end loop;
  if coalesce(array_length(v_styles, 1), 0) > 5 or not (v_styles <@ public.showcase_styles()) then
    raise exception 'Pick up to five styles from the list.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.forum_topics t
       where t.author_id = me and t.kind = 'showcase' and t.created_at > now() - interval '1 day') >= public.forum_showcase_per_day() then
    raise exception 'You have posted enough builds for today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;

  insert into public.forum_topics (author_id, kind, title, body, images, styles)
  values (me, 'showcase', left(v_caption, 120), v_caption, to_jsonb(v_images), v_styles)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_showcase_post(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.create_showcase_post(text, text[], text[]) to authenticated;

create or replace function public.edit_showcase_post(p_topic uuid, p_caption text, p_styles text[] default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caption text := btrim(coalesce(p_caption, ''));
  v_styles text[] := coalesce(p_styles, '{}');
begin
  if char_length(v_caption) < 1 or char_length(v_caption) > 2000 then
    raise exception 'Write a caption, up to 2000 characters.' using errcode = 'check_violation';
  end if;
  if coalesce(array_length(v_styles, 1), 0) > 5 or not (v_styles <@ public.showcase_styles()) then
    raise exception 'Pick up to five styles from the list.' using errcode = 'check_violation';
  end if;
  update public.forum_topics
     set title = left(v_caption, 120), body = v_caption, styles = v_styles, edited_at = now()
   where id = p_topic and author_id = auth.uid() and kind = 'showcase';
  if not found then raise exception 'Post not found'; end if;
end;
$$;

revoke all on function public.edit_showcase_post(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.edit_showcase_post(uuid, text, text[]) to authenticated;

-- p_sort: 'new' | 'popular'. p_style: a style key or null. p_scope: 'all' |
-- 'saved' (posts I saved) | 'mine' (posts I published).
create or replace function public.list_showcase_posts(
  p_sort text default 'new',
  p_style text default null,
  p_scope text default 'all',
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  caption text,
  images jsonb,
  styles text[],
  helpful_count int,
  reply_count int,
  created_at timestamptz,
  pinned boolean,
  hidden boolean,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_is_builder boolean,
  helpful_by_me boolean,
  saved_by_me boolean
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
  select t.id, t.body, t.images, t.styles, t.helpful_count, t.reply_count, t.created_at,
         t.pinned_at is not null, t.hidden_at is not null,
         t.author_id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.builder_profiles bp where bp.id = t.author_id and not bp.is_hidden),
         exists (select 1 from public.forum_helpful h where h.user_id = auth.uid() and h.target_type = 'topic' and h.target_id = t.id),
         exists (select 1 from public.forum_saves s where s.user_id = auth.uid() and s.topic_id = t.id)
    from public.forum_topics t
    join public.profiles p on p.id = t.author_id
   where t.kind = 'showcase'
     and (t.hidden_at is null or v_admin or t.author_id = auth.uid())
     and (not public._author_hidden(t.author_id) or v_admin or t.author_id = auth.uid())
     and (p_style is null or t.styles @> array[p_style])
     and (coalesce(p_scope, 'all') = 'all'
          or (p_scope = 'mine' and t.author_id = auth.uid())
          or (p_scope = 'saved' and exists (
                select 1 from public.forum_saves s where s.topic_id = t.id and s.user_id = auth.uid())))
   order by (coalesce(p_scope, 'all') = 'all' and t.pinned_at is not null) desc,
            case when p_sort = 'popular' then t.helpful_count end desc nulls last,
            t.created_at desc
   limit least(greatest(coalesce(p_limit, 24), 1), 100)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_showcase_posts(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.list_showcase_posts(text, text, text, int, int) to anon, authenticated;


-- ─── 4. TOPICS: leave posts out, return images, link replies to the post ───

-- 0117's list, unchanged except that posts only appear when asked for by
-- kind (so "all discussions", "my topics" and "saved topics" stay topics).
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
     and (case when p_kind is null then t.kind <> 'showcase' else t.kind = p_kind end)
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

-- 0117's create_forum_topic: the daily cap counts topics, not posts.
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
       where t.author_id = auth.uid() and t.kind <> 'showcase' and t.created_at > now() - interval '1 day') >= public.forum_topics_per_day() then
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

-- 0117's edit_forum_topic is for topics; a post is edited with edit_showcase_post.
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
   where id = p_topic and author_id = auth.uid() and kind <> 'showcase';
  if not found then raise exception 'Topic not found'; end if;
end;
$$;

revoke all on function public.edit_forum_topic(uuid, text, text) from public, anon, authenticated;
grant execute on function public.edit_forum_topic(uuid, text, text) to authenticated;

-- 0117's get_forum_topic, now carrying images and styles, and hiding a
-- hidden builder's post along with their profile.
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
  if t.kind = 'showcase' and public._author_hidden(t.author_id) and not v_admin and t.author_id is distinct from auth.uid() then
    return null;
  end if;

  select jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'body', t.body,
    'images', t.images, 'styles', to_jsonb(t.styles),
    'solved_reply_id', t.solved_reply_id, 'reply_count', t.reply_count,
    'helpful_count', t.helpful_count, 'created_at', t.created_at, 'edited_at', t.edited_at,
    'pinned', t.pinned_at is not null, 'hidden', t.hidden_at is not null,
    'author_id', t.author_id, 'author_username', p.username,
    'author_display_name', p.display_name, 'author_avatar_url', p.avatar_url,
    'author_is_builder', exists (select 1 from public.builder_profiles bp where bp.id = t.author_id and not bp.is_hidden),
    'author_topics', (select count(*) from public.forum_topics x where x.author_id = t.author_id and x.hidden_at is null and x.kind <> 'showcase'),
    'author_posts', (select count(*) from public.forum_topics x where x.author_id = t.author_id and x.hidden_at is null and x.kind = 'showcase'),
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

-- The channel a topic lives in, for links in notifications.
create or replace function public._forum_channel(p_kind text)
returns text language sql immutable set search_path = public as $$
  select case p_kind when 'question' then 'questions' when 'guide' then 'guides'
                     when 'idea' then 'ideas' when 'showcase' then 'showcase' else 'discussions' end;
$$;
revoke all on function public._forum_channel(text) from public, anon, authenticated;

-- 0117's reply_to_forum_topic: the bell now links to the topic's own channel
-- (a post opens in the Showcase).
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

  if t.author_id <> me then
    select coalesce(nullif(btrim(p.display_name), ''), '@' || p.username, 'Someone') into v_name
      from public.profiles p where p.id = me;
    v_link := '/community?s=' || public._forum_channel(t.kind) || '&t=' || p_topic::text;
    perform public._upsert_thread_notification(
      t.author_id, 'forum', 'Reply · ' || left(t.title, 80), coalesce(v_name, 'Someone') || ': ' || left(v_body, 100),
      v_link, now());
  end if;
  return v_id;
end;
$$;

revoke all on function public.reply_to_forum_topic(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reply_to_forum_topic(uuid, text, uuid) to authenticated;


-- ─── 5. THE RIGHT COLUMN ────────────────────────────────────────────────────

-- p_kind: the channel's kind (null = all discussions). Returns
-- { pinned: [...], popular: [...], active: [...] } with public fields only.
create or replace function public.community_rail(p_kind text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_pinned jsonb;
  v_popular jsonb;
  v_active jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'kind', t.kind, 'title', t.title, 'reply_count', t.reply_count,
           'helpful_count', t.helpful_count, 'created_at', t.created_at) order by t.pinned_at desc), '[]'::jsonb)
    into v_pinned
    from (
      select * from public.forum_topics t
       where t.pinned_at is not null and t.hidden_at is null
         and (case when p_kind is null then t.kind <> 'showcase' else t.kind = p_kind end)
         and not public._author_hidden(t.author_id)
       order by t.pinned_at desc limit 5
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'kind', t.kind, 'title', t.title, 'reply_count', t.reply_count,
           'helpful_count', t.helpful_count, 'created_at', t.created_at) order by t.helpful_count desc, t.created_at desc), '[]'::jsonb)
    into v_popular
    from (
      select * from public.forum_topics t
       where t.hidden_at is null and t.helpful_count > 0
         and t.created_at > now() - interval '7 days'
         and not public._author_hidden(t.author_id)
       order by t.helpful_count desc, t.created_at desc limit 5
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'username', a.username, 'display_name', a.display_name, 'avatar_url', a.avatar_url,
           'is_builder', a.is_builder, 'count', a.n) order by a.n desc, a.username), '[]'::jsonb)
    into v_active
    from (
      select p.username, p.display_name, p.avatar_url,
             exists (select 1 from public.builder_profiles bp where bp.id = p.id and not bp.is_hidden) as is_builder,
             x.n
        from (
          select author_id, count(*) as n from (
            select t.author_id from public.forum_topics t
             where t.hidden_at is null and t.created_at > now() - interval '7 days'
            union all
            select r.author_id from public.forum_replies r
             where r.hidden_at is null and r.created_at > now() - interval '7 days'
          ) u group by author_id
        ) x
        join public.profiles p on p.id = x.author_id
       where not public._author_hidden(p.id)
       order by x.n desc, p.username limit 5
    ) a;

  return jsonb_build_object('pinned', v_pinned, 'popular', v_popular, 'active', v_active);
end;
$$;

revoke all on function public.community_rail(text) from public, anon, authenticated;
grant execute on function public.community_rail(text) to anon, authenticated;


-- ─── 6. MODERATION ──────────────────────────────────────────────────────────

-- 0117's queue, now saying what kind of topic was reported. The return type
-- gains target_kind, so the old function is dropped first.
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

-- Moderators see every post, hidden ones included, newest first.
create or replace function public.admin_list_showcase_posts(p_limit int default 100)
returns table (
  id uuid,
  caption text,
  images jsonb,
  created_at timestamptz,
  hidden boolean,
  pinned boolean,
  reply_count int,
  helpful_count int,
  author_username text
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
  select t.id, t.body, t.images, t.created_at, t.hidden_at is not null, t.pinned_at is not null,
         t.reply_count, t.helpful_count, p.username
    from public.forum_topics t
    join public.profiles p on p.id = t.author_id
   where t.kind = 'showcase'
   order by t.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.admin_list_showcase_posts(int) from public, anon, authenticated;
grant execute on function public.admin_list_showcase_posts(int) to authenticated;


notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns where table_name = 'forum_topics' and column_name in ('images', 'styles')) as new_columns,
  exists (select 1 from storage.buckets where id = 'community-media') as bucket,
  has_function_privilege('anon', 'public.list_showcase_posts(text, text, text, int, int)', 'execute') as anon_list,
  has_function_privilege('anon', 'public.create_showcase_post(text, text[], text[])', 'execute') as anon_create,
  has_function_privilege('anon', 'public.community_rail(text)', 'execute') as anon_rail;
