-- =============================================================================
-- BuildEx — Community: team search, contests, the Library of free materials
--
-- Three new kinds of forum topic, so replies, likes ("helpful"), saves,
-- reports, hiding and pinning keep working exactly as for the others:
--
--   team     a plain discussion ("looking for a team / recruiting builders").
--   contest  a contest anyone may announce: optional photos (community-media,
--            same rules as a Showcase post), a prize line and an end date.
--            A contest a moderator pins is shown as official.
--   library  a free downloadable file (schematic, structure or an archive of
--            them) in the new public bucket community-files, with 1–10 cover
--            photos and a download counter (one count per signed-in user).
--
-- The «Ideas» channel keeps kind 'idea'; only its name changes in the UI.
--
--   1. forum_topics: kind gains team/contest/library; new columns
--      contest_ends_at, contest_prize, file_path, file_name, file_size,
--      download_count, each with a CHECK that ties it to its kind.
--   2. Bucket community-files: public read, 20 MB, a user writes only
--      <uid>/<uuid>.<ext> with a schematic/structure/archive extension.
--   3. forum_downloads + register_library_download().
--   4. RPCs: create_forum_topic accepts 'team'; create_contest;
--      create_library_item / list_library_items.
--      list_forum_topics returns the contest fields and a cover, leaves
--      Library items out of "all discussions", and puts running contests
--      first. get_forum_topic returns the new fields. _forum_channel and
--      community_rail know the new kinds.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated, then
-- grants back exactly what the app calls. Nothing here deletes user data.
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 0. TUNING ──────────────────────────────────────────────────────────────

create or replace function public.forum_library_per_day()
returns int language sql immutable set search_path = public as $$ select 5; $$;
revoke all on function public.forum_library_per_day() from public, anon, authenticated;

create or replace function public.library_max_bytes()
returns int language sql immutable set search_path = public as $$ select 20 * 1024 * 1024; $$;
revoke all on function public.library_max_bytes() from public, anon, authenticated;

-- Kinds that are not discussions: they have their own channels and caps.
create or replace function public._forum_is_gallery(p_kind text)
returns boolean language sql immutable set search_path = public as $$
  select p_kind in ('showcase', 'library');
$$;
revoke all on function public._forum_is_gallery(text) from public, anon, authenticated;


-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

alter table public.forum_topics add column if not exists contest_ends_at timestamptz;
alter table public.forum_topics add column if not exists contest_prize text;
alter table public.forum_topics add column if not exists file_path text;
alter table public.forum_topics add column if not exists file_name text;
alter table public.forum_topics add column if not exists file_size int;
alter table public.forum_topics add column if not exists download_count int not null default 0;

alter table public.forum_topics drop constraint if exists forum_topics_kind;
alter table public.forum_topics
  add constraint forum_topics_kind
  check (kind in ('question', 'guide', 'idea', 'showcase', 'team', 'contest', 'library'));

alter table public.forum_topics drop constraint if exists forum_topics_images_shape;
alter table public.forum_topics
  add constraint forum_topics_images_shape check (
    jsonb_typeof(images) = 'array'
    and ((kind in ('showcase', 'library') and jsonb_array_length(images) between 1 and public.showcase_max_images())
         or (kind = 'contest' and jsonb_array_length(images) between 0 and public.showcase_max_images())
         or (kind not in ('showcase', 'library', 'contest') and jsonb_array_length(images) = 0))
  );

alter table public.forum_topics drop constraint if exists forum_topics_contest_fields;
alter table public.forum_topics
  add constraint forum_topics_contest_fields check (
    (kind = 'contest' and (contest_prize is null or char_length(contest_prize) between 1 and 120))
    or (kind <> 'contest' and contest_ends_at is null and contest_prize is null)
  );

alter table public.forum_topics drop constraint if exists forum_topics_library_file;
alter table public.forum_topics
  add constraint forum_topics_library_file check (
    (kind = 'library' and file_path is not null
       and char_length(file_name) between 1 and 120
       and file_size between 1 and public.library_max_bytes())
    or (kind <> 'library' and file_path is null and file_name is null and file_size is null)
  );

alter table public.forum_topics drop constraint if exists forum_topics_downloads_nonneg;
alter table public.forum_topics
  add constraint forum_topics_downloads_nonneg check (download_count >= 0);

create index if not exists forum_topics_library_new_idx
  on public.forum_topics (created_at desc) where kind = 'library' and hidden_at is null;
create index if not exists forum_topics_library_top_idx
  on public.forum_topics (download_count desc, created_at desc) where kind = 'library' and hidden_at is null;


-- ─── 2. BUCKET ──────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('community-files', 'community-files', true, 20 * 1024 * 1024)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "Community files are publicly readable" on storage.objects;
create policy "Community files are publicly readable"
  on storage.objects for select
  using (bucket_id = 'community-files');

drop policy if exists "Users write own community files" on storage.objects;
create policy "Users write own community files"
  on storage.objects for insert
  with check (
    bucket_id = 'community-files'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(schem|schematic|litematic|nbt|mcstructure|zip)$')
  );

drop policy if exists "Users delete own community files" on storage.objects;
create policy "Users delete own community files"
  on storage.objects for delete
  using (
    bucket_id = 'community-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public._library_path_ok(p_user uuid, p_path text)
returns boolean language sql immutable set search_path = public as $$
  select p_path ~ ('^' || p_user::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(schem|schematic|litematic|nbt|mcstructure|zip)$');
$$;
revoke all on function public._library_path_ok(uuid, text) from public, anon, authenticated;


-- ─── 3. DOWNLOADS ───────────────────────────────────────────────────────────

create table if not exists public.forum_downloads (
  user_id uuid not null
    constraint forum_downloads_user_id_fkey references public.profiles(id) on delete cascade,
  topic_id uuid not null
    constraint forum_downloads_topic_id_fkey references public.forum_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
alter table public.forum_downloads enable row level security;
revoke all on public.forum_downloads from anon, authenticated;

-- Counts a signed-in user's first download of an item; returns the count.
create or replace function public.register_library_download(p_topic uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_count int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.forum_topics t where t.id = p_topic and t.kind = 'library' and t.hidden_at is null) then
    raise exception 'File not found';
  end if;
  insert into public.forum_downloads (user_id, topic_id) values (me, p_topic)
  on conflict do nothing;
  if found then
    update public.forum_topics set download_count = download_count + 1 where id = p_topic
    returning download_count into v_count;
  else
    select download_count into v_count from public.forum_topics where id = p_topic;
  end if;
  return v_count;
end;
$$;

revoke all on function public.register_library_download(uuid) from public, anon, authenticated;
grant execute on function public.register_library_download(uuid) to authenticated;


-- ─── 4. TOPICS ──────────────────────────────────────────────────────────────

-- 0118's create_forum_topic, now also for team search. Contests and Library
-- items have their own RPCs. The daily cap counts discussions and contests.
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
  if p_kind not in ('question', 'guide', 'idea', 'team') then
    raise exception 'Pick what kind of topic this is.' using errcode = 'check_violation';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'The title is 3 to 120 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 10000 then
    raise exception 'The text can be up to 10000 characters.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.forum_topics t
       where t.author_id = auth.uid() and not public._forum_is_gallery(t.kind)
         and t.created_at > now() - interval '1 day') >= public.forum_topics_per_day() then
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

-- A contest: title, rules (body), optional photos, optional prize, an end date
-- between one hour and one year from now.
create or replace function public.create_contest(
  p_title text, p_body text, p_images text[] default '{}', p_ends_at timestamptz default null, p_prize text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_prize text := nullif(btrim(coalesce(p_prize, '')), '');
  v_images text[] := coalesce(p_images, '{}');
  v_path text;
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'The title is 3 to 120 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 10000 then
    raise exception 'The text can be up to 10000 characters.' using errcode = 'check_violation';
  end if;
  if v_prize is not null and char_length(v_prize) > 120 then
    raise exception 'The prize is up to 120 characters.' using errcode = 'check_violation';
  end if;
  if p_ends_at is null or p_ends_at < now() + interval '1 hour' or p_ends_at > now() + interval '1 year' then
    raise exception 'Pick an end date between one hour and one year from now.' using errcode = 'check_violation';
  end if;
  if coalesce(array_length(v_images, 1), 0) > public.showcase_max_images() then
    raise exception 'Up to 10 photos.' using errcode = 'check_violation';
  end if;
  if (select count(distinct x) from unnest(v_images) x) <> coalesce(array_length(v_images, 1), 0) then
    raise exception 'The same photo is attached twice.' using errcode = 'check_violation';
  end if;
  foreach v_path in array v_images loop
    if not public._showcase_path_ok(me, v_path) then
      raise exception 'A photo did not upload correctly. Please try again.' using errcode = 'check_violation';
    end if;
  end loop;
  if (select count(*) from public.forum_topics t
       where t.author_id = me and not public._forum_is_gallery(t.kind)
         and t.created_at > now() - interval '1 day') >= public.forum_topics_per_day() then
    raise exception 'You have started too many topics today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;

  insert into public.forum_topics (author_id, kind, title, body, images, contest_ends_at, contest_prize)
  values (me, 'contest', v_title, v_body, to_jsonb(v_images), p_ends_at, v_prize)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_contest(text, text, text[], timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_contest(text, text, text[], timestamptz, text) to authenticated;

-- A Library item: title, description, 1–10 cover photos, one file.
create or replace function public.create_library_item(
  p_title text, p_body text, p_images text[], p_file_path text, p_file_name text, p_file_size int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_name text := btrim(coalesce(p_file_name, ''));
  v_images text[] := coalesce(p_images, '{}');
  v_path text;
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'The title is 3 to 120 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 10000 then
    raise exception 'The text can be up to 10000 characters.' using errcode = 'check_violation';
  end if;
  if array_length(v_images, 1) is null or array_length(v_images, 1) > public.showcase_max_images() then
    raise exception 'Add 1 to 10 photos of the build.' using errcode = 'check_violation';
  end if;
  if (select count(distinct x) from unnest(v_images) x) <> array_length(v_images, 1) then
    raise exception 'The same photo is attached twice.' using errcode = 'check_violation';
  end if;
  foreach v_path in array v_images loop
    if not public._showcase_path_ok(me, v_path) then
      raise exception 'A photo did not upload correctly. Please try again.' using errcode = 'check_violation';
    end if;
  end loop;
  if p_file_path is null or not public._library_path_ok(me, p_file_path) then
    raise exception 'The file did not upload correctly. Please try again.' using errcode = 'check_violation';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'The file name is up to 120 characters.' using errcode = 'check_violation';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > public.library_max_bytes() then
    raise exception 'The file can be up to 20 MB.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.forum_topics t
       where t.author_id = me and t.kind = 'library' and t.created_at > now() - interval '1 day') >= public.forum_library_per_day() then
    raise exception 'You have shared enough files for today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;

  insert into public.forum_topics (author_id, kind, title, body, images, file_path, file_name, file_size)
  values (me, 'library', v_title, v_body, to_jsonb(v_images), p_file_path, v_name, p_file_size)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_library_item(text, text, text[], text, text, int) from public, anon, authenticated;
grant execute on function public.create_library_item(text, text, text[], text, text, int) to authenticated;

-- p_sort: 'new' | 'popular' (most downloaded). p_scope: 'all' | 'mine' | 'saved'.
create or replace function public.list_library_items(
  p_sort text default 'new',
  p_scope text default 'all',
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  title text,
  excerpt text,
  images jsonb,
  file_name text,
  file_size int,
  download_count int,
  helpful_count int,
  reply_count int,
  created_at timestamptz,
  pinned boolean,
  hidden boolean,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
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
  select t.id, t.title, left(regexp_replace(t.body, '\s+', ' ', 'g'), 180), t.images,
         t.file_name, t.file_size, t.download_count, t.helpful_count, t.reply_count, t.created_at,
         t.pinned_at is not null, t.hidden_at is not null,
         t.author_id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.forum_saves s where s.user_id = auth.uid() and s.topic_id = t.id)
    from public.forum_topics t
    join public.profiles p on p.id = t.author_id
   where t.kind = 'library'
     and (t.hidden_at is null or v_admin or t.author_id = auth.uid())
     and (not public._author_hidden(t.author_id) or v_admin or t.author_id = auth.uid())
     and (coalesce(p_scope, 'all') = 'all'
          or (p_scope = 'mine' and t.author_id = auth.uid())
          or (p_scope = 'saved' and exists (
                select 1 from public.forum_saves s where s.topic_id = t.id and s.user_id = auth.uid())))
   order by (coalesce(p_scope, 'all') = 'all' and t.pinned_at is not null) desc,
            case when p_sort = 'popular' then t.download_count end desc nulls last,
            t.created_at desc
   limit least(greatest(coalesce(p_limit, 24), 1), 100)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_library_items(text, text, int, int) from public, anon, authenticated;
grant execute on function public.list_library_items(text, text, int, int) to anon, authenticated;

-- 0118's list, now returning a contest's end date, prize and cover photo.
-- "All discussions" (p_kind null) leaves out the Showcase and the Library.
-- In the contests channel, running contests come first. The return type
-- changes, so the old function is dropped first.
drop function if exists public.list_forum_topics(text, text, text, int, int);
create function public.list_forum_topics(
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
  author_avatar_url text,
  cover text,
  contest_ends_at timestamptz,
  contest_prize text
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
         t.author_id, p.username, p.display_name, p.avatar_url,
         t.images ->> 0, t.contest_ends_at, t.contest_prize
    from public.forum_topics t
    join public.profiles p on p.id = t.author_id
   where (t.hidden_at is null or v_admin or t.author_id = auth.uid())
     and (case when p_kind is null then not public._forum_is_gallery(t.kind) else t.kind = p_kind end)
     and (coalesce(p_scope, 'all') = 'all'
          or (p_scope = 'mine' and t.author_id = auth.uid())
          or (p_scope = 'saved' and exists (
                select 1 from public.forum_saves s where s.topic_id = t.id and s.user_id = auth.uid())))
   order by (coalesce(p_scope, 'all') = 'all' and t.pinned_at is not null) desc,
            (p_kind = 'contest' and t.contest_ends_at > now()) desc,
            case when p_sort = 'top' then t.helpful_count end desc nulls last,
            case when p_sort = 'new' then t.created_at end desc nulls last,
            t.last_activity_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_forum_topics(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.list_forum_topics(text, text, text, int, int) to anon, authenticated;

-- 0118's get_forum_topic, now carrying the contest and file fields, and
-- hiding a hidden builder's gallery items (posts, files) with their profile.
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
  if public._forum_is_gallery(t.kind) and public._author_hidden(t.author_id) and not v_admin and t.author_id is distinct from auth.uid() then
    return null;
  end if;

  select jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'body', t.body,
    'images', t.images, 'styles', to_jsonb(t.styles),
    'contest_ends_at', t.contest_ends_at, 'contest_prize', t.contest_prize,
    'file_path', t.file_path, 'file_name', t.file_name, 'file_size', t.file_size,
    'download_count', t.download_count,
    'downloaded_by_me', exists (select 1 from public.forum_downloads d where d.user_id = auth.uid() and d.topic_id = t.id),
    'solved_reply_id', t.solved_reply_id, 'reply_count', t.reply_count,
    'helpful_count', t.helpful_count, 'created_at', t.created_at, 'edited_at', t.edited_at,
    'pinned', t.pinned_at is not null, 'hidden', t.hidden_at is not null,
    'author_id', t.author_id, 'author_username', p.username,
    'author_display_name', p.display_name, 'author_avatar_url', p.avatar_url,
    'author_is_builder', exists (select 1 from public.builder_profiles bp where bp.id = t.author_id and not bp.is_hidden),
    'author_topics', (select count(*) from public.forum_topics x where x.author_id = t.author_id and x.hidden_at is null and not public._forum_is_gallery(x.kind)),
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

-- 0117's edit_forum_topic: title and text of any topic but a Showcase post
-- (a contest keeps its end date and prize, a Library item its file).
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

-- The channel a topic lives in, for links in notifications.
create or replace function public._forum_channel(p_kind text)
returns text language sql immutable set search_path = public as $$
  select case p_kind when 'question' then 'questions' when 'guide' then 'guides'
                     when 'idea' then 'ideas' when 'showcase' then 'showcase'
                     when 'team' then 'team' when 'contest' then 'contests'
                     when 'library' then 'library' else 'discussions' end;
$$;
revoke all on function public._forum_channel(text) from public, anon, authenticated;


-- ─── 5. THE RIGHT COLUMN ────────────────────────────────────────────────────

-- 0118's community_rail: "all discussions" pinned topics leave out the
-- Library as well as the Showcase.
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
         and (case when p_kind is null then not public._forum_is_gallery(t.kind) else t.kind = p_kind end)
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
