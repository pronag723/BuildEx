-- =============================================================================
-- BuildEx — Builder reviews, review reports, work takedown (redesign, stage 3)
--
-- Why this exists
-- ---------------
-- Reviews died with the money layer (0096): they were gated on a completed
-- order, and there are no orders any more. The redesigned profile brings them
-- back on the one signal a directory can actually verify — that two people
-- really talked. A review can be left only by someone with a real chat with
-- the builder: both sides have written at least review_min_messages_each_side()
-- messages, and the thread is at least review_min_thread_age_hours() old.
-- One review per person per builder, editable; reviews_per_day() new ones a
-- day. A builder cannot delete a review about them — they report it, and a
-- moderator decides.
--
--   1. Tunable limits (functions, same pattern as 0100).
--   2. public.builder_reviews — written only through the RPCs below. The old
--      public.reviews table stays as it is (decommission, never delete); its
--      order_id NOT NULL makes it unusable for reviews without orders.
--   3. can_review_builder / upsert_builder_review / delete_my_review.
--   4. public.review_reports + report_review — the queue a moderator works.
--   5. Admin RPCs: list reports, list latest reviews, hide/unhide a review,
--      resolve a report, take a single work down (works.removed_at from 0106).
--   6. get_builder_public_stats gains reviews_count and rating_avg.
--
-- builder_reviews has TWO foreign keys to profiles (builder_id, reviewer_id),
-- so every embed names its constraint — the 0101 PGRST201 lesson.
-- Every function names anon/authenticated in its revoke: Supabase grants new
-- functions to both roles directly, so revoking from PUBLIC is not enough.
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. TUNING ──────────────────────────────────────────────────────────────
create or replace function public.review_min_messages_each_side()
returns int language sql immutable set search_path = public as $$ select 3; $$;

create or replace function public.review_min_thread_age_hours()
returns int language sql immutable set search_path = public as $$ select 24; $$;

create or replace function public.reviews_per_day()
returns int language sql immutable set search_path = public as $$ select 5; $$;

create or replace function public.review_reports_per_day()
returns int language sql immutable set search_path = public as $$ select 20; $$;


-- ─── 2. builder_reviews ─────────────────────────────────────────────────────
create table if not exists public.builder_reviews (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  -- Optional "what I ordered" — one of the builder's own price tiers.
  price_tier_id uuid references public.builder_price_tiers(id) on delete set null,
  rating smallint not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A moderator's takedown. Editing a review never clears it.
  hidden_at timestamptz,
  hidden_reason text,
  constraint builder_reviews_rating check (rating between 1 and 5),
  constraint builder_reviews_body_len check (char_length(btrim(body)) between 20 and 1500),
  constraint builder_reviews_not_self check (builder_id <> reviewer_id),
  constraint builder_reviews_one_per_reviewer unique (builder_id, reviewer_id)
);

create index if not exists builder_reviews_builder_idx
  on public.builder_reviews (builder_id, created_at desc);
create index if not exists builder_reviews_reviewer_idx
  on public.builder_reviews (reviewer_id, created_at desc);

alter table public.builder_reviews enable row level security;

-- Readable by everyone, minus the moderator's note: hidden_reason is for
-- moderators, and admins read it through the admin RPCs below. No write
-- privileges at all — every write is an RPC.
revoke all on public.builder_reviews from anon, authenticated;
grant select (
  id, builder_id, reviewer_id, price_tier_id, rating, body,
  created_at, updated_at, hidden_at
) on public.builder_reviews to anon, authenticated;

-- Visitors see reviews that are not taken down, about builders who are not
-- hidden. The author always sees their own review (so the form can say it was
-- hidden instead of silently offering to write a new one), and admins see all.
drop policy if exists "reviews are viewable" on public.builder_reviews;
create policy "reviews are viewable"
  on public.builder_reviews for select
  using (
    (hidden_at is null and not public.is_builder_hidden(builder_id))
    or reviewer_id = auth.uid()
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );


-- ─── 3. Who may review, and the write RPCs ──────────────────────────────────
-- 'ok' | 'not_signed_in' | 'self' | 'not_builder' | 'no_conversation' | 'too_soon'.
-- "A real chat" = one thread between the two in which BOTH have sent at least
-- review_min_messages_each_side() real messages (text or image — not the old
-- order-event rows), and whose first message is older than
-- review_min_thread_age_hours(). messages.created_at is server time since 0107,
-- so neither number can be backdated.
create or replace function public._review_eligibility(p_reviewer uuid, p_builder uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_conversation uuid;
  v_mine int;
  v_theirs int;
  v_first timestamptz;
begin
  if p_reviewer is null then
    return 'not_signed_in';
  end if;
  if p_reviewer = p_builder then
    return 'self';
  end if;
  if not public._is_builder(p_builder) or public.is_builder_hidden(p_builder) then
    return 'not_builder';
  end if;

  select c.id into v_conversation
    from public.conversations c
   where c.user_a = least(p_reviewer, p_builder)
     and c.user_b = greatest(p_reviewer, p_builder);
  if v_conversation is null then
    return 'no_conversation';
  end if;

  select count(*) filter (where m.sender_id = p_reviewer),
         count(*) filter (where m.sender_id = p_builder),
         min(m.created_at)
    into v_mine, v_theirs, v_first
    from public.messages m
   where m.conversation_id = v_conversation
     and coalesce(m.msg_type, 'text') in ('text', 'image');

  if v_mine < public.review_min_messages_each_side()
     or v_theirs < public.review_min_messages_each_side() then
    return 'no_conversation';
  end if;
  if v_first > now() - make_interval(hours => public.review_min_thread_age_hours()) then
    return 'too_soon';
  end if;
  return 'ok';
end;
$$;

revoke all on function public._review_eligibility(uuid, uuid) from public, anon, authenticated;

-- What the review form needs: may I review, and my existing review if any.
create or replace function public.can_review_builder(p_builder uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_review public.builder_reviews%rowtype;
begin
  select * into v_review
    from public.builder_reviews
   where builder_id = p_builder and reviewer_id = v_uid;

  return jsonb_build_object(
    'status', public._review_eligibility(v_uid, p_builder),
    'review', case when v_review.id is null then null else jsonb_build_object(
      'id', v_review.id,
      'rating', v_review.rating,
      'body', v_review.body,
      'price_tier_id', v_review.price_tier_id,
      'created_at', v_review.created_at,
      'updated_at', v_review.updated_at,
      'hidden', v_review.hidden_at is not null
    ) end
  );
end;
$$;

revoke all on function public.can_review_builder(uuid) from public, anon;
grant execute on function public.can_review_builder(uuid) to authenticated;

-- Writes or rewrites the caller's review of a builder. Returns its id.
create or replace function public.upsert_builder_review(
  p_builder uuid,
  p_rating int,
  p_body text,
  p_tier uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  v_status := public._review_eligibility(v_uid, p_builder);
  if v_status = 'not_signed_in' then
    raise exception 'Sign in to leave a review.' using errcode = 'insufficient_privilege';
  elsif v_status = 'self' then
    raise exception 'You cannot review yourself.' using errcode = 'check_violation';
  elsif v_status = 'not_builder' then
    raise exception 'That builder is not on BuildEx.' using errcode = 'check_violation';
  elsif v_status = 'no_conversation' then
    raise exception 'You can review a builder after you have both written in a chat.'
      using errcode = 'check_violation';
  elsif v_status = 'too_soon' then
    raise exception 'You can review this builder a day after your chat started.'
      using errcode = 'check_violation';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 20 then
    raise exception 'Write at least 20 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) > 1500 then
    raise exception 'A review can be up to 1500 characters.' using errcode = 'check_violation';
  end if;
  if p_tier is not null and not exists (
    select 1 from public.builder_price_tiers t where t.id = p_tier and t.builder_id = p_builder
  ) then
    raise exception 'That price tier belongs to another builder.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.builder_reviews where builder_id = p_builder and reviewer_id = v_uid
  ) and (
    select count(*) from public.builder_reviews
     where reviewer_id = v_uid and created_at > now() - interval '1 day'
  ) >= public.reviews_per_day() then
    raise exception 'You have written too many reviews today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  insert into public.builder_reviews (builder_id, reviewer_id, price_tier_id, rating, body)
  values (p_builder, v_uid, p_tier, p_rating, v_body)
  on conflict on constraint builder_reviews_one_per_reviewer do update
     set price_tier_id = excluded.price_tier_id,
         rating        = excluded.rating,
         body          = excluded.body,
         updated_at    = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_builder_review(uuid, int, text, uuid) from public, anon;
grant execute on function public.upsert_builder_review(uuid, int, text, uuid) to authenticated;

create or replace function public.delete_my_review(p_builder uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to leave a review.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.builder_reviews
   where builder_id = p_builder and reviewer_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.delete_my_review(uuid) from public, anon;
grant execute on function public.delete_my_review(uuid) to authenticated;


-- ─── 4. review_reports ──────────────────────────────────────────────────────
-- Same shape and rules as conversation_reports (0100/0101): one OPEN report
-- per (review, reporter), a daily cap, writes only through RPCs.
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.builder_reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text
);

create index if not exists review_reports_status_idx
  on public.review_reports (status, created_at desc);
create index if not exists review_reports_reporter_idx
  on public.review_reports (reporter_id, created_at desc);
create unique index if not exists review_reports_one_open_idx
  on public.review_reports (review_id, reporter_id)
  where status = 'open';

alter table public.review_reports enable row level security;
revoke all on public.review_reports from anon, authenticated;
grant select on public.review_reports to authenticated;

drop policy if exists "reporter reads own review reports" on public.review_reports;
create policy "reporter reads own review reports"
  on public.review_reports for select
  using (reporter_id = auth.uid());

drop policy if exists "admins read all review reports" on public.review_reports;
create policy "admins read all review reports"
  on public.review_reports for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Anyone signed in can report a review they can see — the reviewed builder
-- first of all, since this is their only recourse. Not your own review.
create or replace function public.report_review(p_review uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_author uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select r.reviewer_id into v_author
    from public.builder_reviews r
   where r.id = p_review
     and r.hidden_at is null
     and not public.is_builder_hidden(r.builder_id);
  if v_author is null then
    raise exception 'That review is not available.' using errcode = 'no_data_found';
  end if;
  if v_author = v_uid then
    raise exception 'You cannot report your own review.' using errcode = 'check_violation';
  end if;

  if v_reason = '' then
    raise exception 'Please describe what is wrong with this review.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.review_reports
     where review_id = p_review and reporter_id = v_uid and status = 'open'
  ) then
    raise exception 'You have already reported this review. Our team is reviewing it.'
      using errcode = 'check_violation';
  end if;

  if (select count(*) from public.review_reports
       where reporter_id = v_uid and created_at > now() - interval '1 day')
     >= public.review_reports_per_day() then
    raise exception 'You have submitted too many reports today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  insert into public.review_reports (review_id, reporter_id, reason)
  values (p_review, v_uid, left(v_reason, 2000))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.report_review(uuid, text) from public, anon;
grant execute on function public.report_review(uuid, text) to authenticated;


-- ─── 5. Moderator RPCs ──────────────────────────────────────────────────────
-- All gated by _require_admin() (0026). "author" is who wrote the review,
-- "builder" who it is about, "moderator" who closed the report.

create or replace function public.admin_list_review_reports(p_status text default null)
returns table (
  report_id uuid,
  review_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  resolution_note text,
  moderator_username text,
  reporter_id uuid,
  reporter_username text,
  reporter_display_name text,
  reporter_avatar_url text,
  review_rating smallint,
  review_body text,
  review_created_at timestamptz,
  review_hidden_at timestamptz,
  review_hidden_reason text,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  builder_id uuid,
  builder_username text,
  builder_display_name text,
  builder_avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'open');
begin
  perform public._require_admin();

  return query
    select
      rr.id, rr.review_id, rr.reason, rr.status, rr.created_at, rr.reviewed_at,
      rr.resolution_note, mv.username,
      rp.id, rp.username, rp.display_name, rp.avatar_url,
      rv.rating, rv.body, rv.created_at, rv.hidden_at, rv.hidden_reason,
      au.id, au.username, au.display_name, au.avatar_url,
      bu.id, bu.username, bu.display_name, bu.avatar_url
    from public.review_reports rr
    join public.builder_reviews rv on rv.id = rr.review_id
    join public.profiles rp on rp.id = rr.reporter_id
    join public.profiles au on au.id = rv.reviewer_id
    join public.profiles bu on bu.id = rv.builder_id
    left join public.profiles mv on mv.id = rr.reviewed_by
   where v_status = 'all' or rr.status = v_status
   order by rr.created_at desc;
end;
$$;

revoke all on function public.admin_list_review_reports(text) from public, anon;
grant execute on function public.admin_list_review_reports(text) to authenticated;

-- The newest reviews, hidden ones included, so a moderator can act without
-- waiting for a report.
create or replace function public.admin_list_reviews(p_search text default null)
returns table (
  review_id uuid,
  rating smallint,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  open_reports int,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  builder_id uuid,
  builder_username text,
  builder_display_name text,
  builder_avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public._require_admin();

  return query
    select
      rv.id, rv.rating, rv.body, rv.created_at, rv.updated_at, rv.hidden_at, rv.hidden_reason,
      (select count(*)::int from public.review_reports rr
        where rr.review_id = rv.id and rr.status = 'open'),
      au.id, au.username, au.display_name, au.avatar_url,
      bu.id, bu.username, bu.display_name, bu.avatar_url
    from public.builder_reviews rv
    join public.profiles au on au.id = rv.reviewer_id
    join public.profiles bu on bu.id = rv.builder_id
   where v_search is null
      or au.username ilike '%' || v_search || '%'
      or bu.username ilike '%' || v_search || '%'
      or coalesce(au.display_name, '') ilike '%' || v_search || '%'
      or coalesce(bu.display_name, '') ilike '%' || v_search || '%'
   order by rv.created_at desc
   limit 200;
end;
$$;

revoke all on function public.admin_list_reviews(text) from public, anon;
grant execute on function public.admin_list_reviews(text) to authenticated;

create or replace function public.admin_set_review_hidden(
  p_review uuid,
  p_hidden boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hidden boolean := coalesce(p_hidden, false);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public._require_admin();

  update public.builder_reviews
     set hidden_at     = case when v_hidden then now() else null end,
         hidden_reason = case when v_hidden then left(v_reason, 2000) else null end
   where id = p_review;
  if not found then
    raise exception 'That review does not exist';
  end if;

  return v_hidden;
end;
$$;

revoke all on function public.admin_set_review_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_review_hidden(uuid, boolean, text) to authenticated;

create or replace function public.admin_resolve_review_report(
  p_report uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public._require_admin();

  if v_status not in ('reviewed', 'dismissed') then
    raise exception 'A report is closed as either reviewed or dismissed';
  end if;

  update public.review_reports
     set status          = v_status,
         resolution_note = left(v_note, 2000),
         reviewed_by     = auth.uid(),
         reviewed_at     = now()
   where id = p_report;
  if not found then
    raise exception 'That report does not exist';
  end if;
end;
$$;

revoke all on function public.admin_resolve_review_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_review_report(uuid, text, text) to authenticated;

-- One bad work in an otherwise genuine portfolio. Reversible and lossless: the
-- work, its photos and its counters stay; works and portfolio_images RLS (0106)
-- hide it from everyone but its builder and admins. The files stay in Storage
-- — a definer function can no longer delete storage objects on current
-- Supabase projects, which is also why 0101's admin_remove_portfolio_image is
-- not used for works.
create or replace function public.admin_set_work_removed(
  p_work uuid,
  p_removed boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed boolean := coalesce(p_removed, false);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public._require_admin();

  update public.works
     set removed_at     = case when v_removed then now() else null end,
         removed_reason = case when v_removed then left(v_reason, 2000) else null end
   where id = p_work;
  if not found then
    raise exception 'That work does not exist';
  end if;

  return v_removed;
end;
$$;

revoke all on function public.admin_set_work_removed(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_work_removed(uuid, boolean, text) to authenticated;


-- ─── 6. get_builder_public_stats + reviews ──────────────────────────────────
-- Same function as 0107, plus the review summary. Only visible reviews count.
create or replace function public.get_builder_public_stats(p_builder uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_works int;
  v_likes bigint;
  v_views bigint;
  v_reviews int;
  v_rating numeric;
  v_resp public.builder_response_stats%rowtype;
begin
  if not public._is_builder(p_builder) then
    return null;
  end if;
  if public.is_builder_hidden(p_builder)
     and v_uid is distinct from p_builder
     and not exists (select 1 from public.profiles p where p.id = v_uid and p.is_admin) then
    return null;
  end if;

  select count(*), coalesce(sum(w.likes_count), 0), coalesce(sum(w.views_count), 0)
    into v_works, v_likes, v_views
    from public.works w
   where w.builder_id = p_builder
     and w.removed_at is null
     and exists (select 1 from public.portfolio_images pi where pi.work_id = w.id);

  select count(*), round(avg(r.rating)::numeric, 1)
    into v_reviews, v_rating
    from public.builder_reviews r
   where r.builder_id = p_builder
     and r.hidden_at is null;

  select * into v_resp from public.builder_response_stats where builder_id = p_builder;

  return jsonb_build_object(
    'works_count', v_works,
    'likes_total', v_likes,
    'views_total', v_views,
    'reviews_count', v_reviews,
    'rating_avg', v_rating,
    'response_median_minutes',
      case when v_resp.samples >= public.response_stats_min_samples()
           then v_resp.median_minutes end,
    'response_samples', coalesce(v_resp.samples, 0)
  );
end;
$$;

revoke all on function public.get_builder_public_stats(uuid) from public;
grant execute on function public.get_builder_public_stats(uuid) to anon, authenticated;


notify pgrst, 'reload schema';


-- ─── Checks (run by hand after applying) ────────────────────────────────────
-- Eligibility for a pair with no chat is 'no_conversation':
--   select public._review_eligibility('<user uuid>', '<builder uuid>');
--
-- Reviews are not client-writable, and the moderator note is not readable
-- (both expect "permission denied"):
--   set role authenticated;
--   insert into public.builder_reviews (builder_id, reviewer_id, rating, body)
--     values (gen_random_uuid(), gen_random_uuid(), 5, 'xxxxxxxxxxxxxxxxxxxxxxxx');
--   select hidden_reason from public.builder_reviews;
--   reset role;
