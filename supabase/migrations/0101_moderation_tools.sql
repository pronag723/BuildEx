-- =============================================================================
-- BuildEx — Moderation tools for the public directory (Stage 7)
--
-- NOTE ON THE FILE NUMBER: the Stage 7 brief called this file "0100". 0100 was
-- already taken by 0100_chat_abuse_controls.sql (which was itself the Stage 6
-- brief's "0099"), so it ships as 0101. Run it after 0100.
--
-- Why this exists
-- ---------------
-- /admin was built for a marketplace: orders, studios and payouts. All three
-- are decommissioned, and the console shell that survived them has nothing to
-- operate. What BuildEx is now is a public directory of user-submitted profiles
-- and images, and the one thing a directory always needs is a way to take
-- something down. Today there is none: a builder profile carrying spam, stolen
-- renders or NSFW images can only be dealt with by deleting the account.
--
-- This migration is that missing lever, plus the read paths the rebuilt console
-- needs:
--
--   1. builder_profiles.is_hidden (+ who hid it, when, and why).
--   2. RLS that makes hiding real — a hidden builder disappears from the
--      directory for everyone except the builder themselves and admins.
--   3. admin_set_builder_hidden / admin_remove_portfolio_image — the two write
--      actions, both SECURITY DEFINER and both is_admin-gated.
--   4. admin_list_builders — the moderation list, including hidden rows.
--   5. admin_list_conversation_reports / admin_resolve_conversation_report /
--      admin_get_conversation_messages — the write and read sides of the
--      report queue that 0100 started filling.
--
-- The access model is unchanged: public.profiles.is_admin, set by hand in SQL,
-- is the only flag, and every function below re-checks it server-side through
-- the existing _require_admin() helper (0026). The client-side gate on /admin
-- is cosmetic.
--
-- Nothing here deletes user data except admin_remove_portfolio_image, which is
-- the point of it. Hiding is reversible and lossless: the profile row, its
-- portfolio and its conversations are all left intact.
--
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. builder_profiles.is_hidden ──────────────────────────────────────────
-- hidden_by / hidden_at / hidden_reason are audit, not display: a moderator
-- taking something down should leave a note for the next moderator, and "who
-- hid this and why" is the first question anyone asks about a takedown.
alter table public.builder_profiles
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null,
  add column if not exists hidden_reason text;

-- Partial index: the interesting set is the small one.
create index if not exists builder_profiles_hidden_idx
  on public.builder_profiles (id)
  where is_hidden;

-- is_hidden is NOT client-writable. 0028 revoked table-wide INSERT/UPDATE on
-- builder_profiles and re-granted an explicit column list, so a column added
-- after it carries no write privilege at all — a builder cannot un-hide
-- themselves with a crafted PATCH. The REVOKE below is belt-and-braces: it
-- costs nothing and states the intent where someone editing the 0028 grant list
-- will see it. Do NOT add these columns to those grants.
revoke insert (is_hidden, hidden_at, hidden_by, hidden_reason)
  on public.builder_profiles from anon, authenticated;
revoke update (is_hidden, hidden_at, hidden_by, hidden_reason)
  on public.builder_profiles from anon, authenticated;


-- ─── 2. Making "hidden" actually hide ───────────────────────────────────────
-- Filtering in the browser is not moderation: PostgREST is a public API, and a
-- hidden profile that is merely absent from the feed query is still one curl
-- away. Enforcement belongs in the policy.
--
-- builder_profiles SELECT was `using (true)` and readable by anon. It stays
-- anon-readable — the directory depends on that — with exactly one carve-out.
-- Three principals still see a hidden row:
--
--   • the builder themselves (id = auth.uid()), so /account and the onboarding
--     gate keep working and they are not locked out of their own data;
--   • admins, so the moderation list is not blind to what it just hid;
--   • nobody else, anon included.
--
-- Consequences, all intended:
--   • fetchBuilders' `builder:builder_profiles!inner(...)` drops the row, so
--     the builder leaves /builders.
--   • fetchBuilderByUsername uses the same inner join, so
--     /builders/profile/<handle> stops resolving for a logged-out visitor and
--     renders <BuilderNotFound> — while the builder's own view of it survives.
--   • lib/chat/api.js isPublicBuilder() returns false, so their @handle in an
--     existing thread renders as plain text instead of a dead link.
--
-- Chat itself is deliberately untouched. can_direct_message (0064) does not
-- read builder_profiles, so threads that already exist keep working in both
-- directions. Hiding removes someone from the directory; it is not a ban.
drop policy if exists "builder profiles are viewable" on public.builder_profiles;
create policy "builder profiles are viewable"
  on public.builder_profiles for select
  using (
    is_hidden = false
    or id = auth.uid()
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

-- portfolio_images is a separate table with its own `using (true)`, so without
-- this a hidden builder's images stay enumerable through PostgREST even though
-- the profile that framed them is gone. For NSFW or stolen work that is the
-- whole problem, so the same carve-out applies here.
--
-- The hidden test has to go through a SECURITY DEFINER helper rather than an
-- inline subquery: an inline `exists (select 1 from builder_profiles ...)` is
-- itself filtered by the policy above, so the hidden row would be invisible to
-- the check, `not exists` would come back true, and the images would stay
-- public — the policy would silently do nothing.
create or replace function public.is_builder_hidden(p_builder uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select bp.is_hidden from public.builder_profiles bp where bp.id = p_builder),
    false
  );
$$;

revoke all on function public.is_builder_hidden(uuid) from public;
grant execute on function public.is_builder_hidden(uuid) to anon, authenticated;

drop policy if exists "portfolio images are viewable" on public.portfolio_images;
create policy "portfolio images are viewable"
  on public.portfolio_images for select
  using (
    builder_id = auth.uid()
    or not public.is_builder_hidden(builder_id)
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );


-- ─── 3. conversation_reports.resolution_note ────────────────────────────────
-- 0100 gave the table reviewed_by / reviewed_at but nowhere to record WHAT was
-- decided. A queue you can only clear is a queue nobody trusts.
alter table public.conversation_reports
  add column if not exists resolution_note text;


-- ─── 4. admin_set_builder_hidden ────────────────────────────────────────────
-- The only way is_hidden ever changes. Returns the new state so the client can
-- reconcile without a refetch.
create or replace function public.admin_set_builder_hidden(
  p_builder uuid,
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

  if p_builder is null then
    raise exception 'No builder given';
  end if;

  if not exists (select 1 from public.builder_profiles where id = p_builder) then
    raise exception 'That builder profile does not exist';
  end if;

  update public.builder_profiles
     set is_hidden     = v_hidden,
         -- Un-hiding clears the audit trail rather than leaving a stale
         -- "hidden by X" on a visible profile. The reason for a takedown is
         -- only meaningful while the takedown is in force.
         hidden_at     = case when v_hidden then now() else null end,
         hidden_by     = case when v_hidden then auth.uid() else null end,
         hidden_reason = case when v_hidden then left(v_reason, 2000) else null end
   where id = p_builder;

  return v_hidden;
end;
$$;

revoke all on function public.admin_set_builder_hidden(uuid, boolean, text) from public;
grant execute on function public.admin_set_builder_hidden(uuid, boolean, text) to authenticated;


-- ─── 5. admin_remove_portfolio_image ────────────────────────────────────────
-- Hiding a whole profile is the blunt instrument; one bad image in an otherwise
-- genuine portfolio should cost one image. Deletes the storage object first
-- (same pattern as _purge_user_storage in 0029 — a definer function writing to
-- storage.objects bypasses the storage RLS that would otherwise stop an admin
-- touching another user's folder), then the row.
--
-- This one IS destructive and has no undo, which is why it is per-image and
-- confirmed in the UI.
create or replace function public.admin_remove_portfolio_image(p_image uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
  v_builder uuid;
begin
  perform public._require_admin();

  if p_image is null then
    raise exception 'No image given';
  end if;

  select storage_path, builder_id
    into v_path, v_builder
    from public.portfolio_images
   where id = p_image;

  if v_builder is null then
    return false;  -- already gone; nothing to do
  end if;

  if v_path is not null and btrim(v_path) <> '' then
    delete from storage.objects
     where bucket_id = 'portfolios'
       and name = v_path;
  end if;

  delete from public.portfolio_images where id = p_image;

  return true;
end;
$$;

revoke all on function public.admin_remove_portfolio_image(uuid) from public;
grant execute on function public.admin_remove_portfolio_image(uuid) to authenticated;


-- ─── 6. admin_list_builders ─────────────────────────────────────────────────
-- Every builder profile, hidden ones included, with the handful of facts a
-- moderator triages on: who they are, when they joined, how much they uploaded,
-- and whether they are currently taken down.
--
-- p_search matches @handle or display name, case-insensitively; empty or null
-- returns everything. Hidden profiles sort first — an open takedown is the
-- thing you came back to look at.
create or replace function public.admin_list_builders(p_search text default null)
returns table (
  builder_id uuid,
  username text,
  display_name text,
  avatar_url text,
  tagline text,
  joined_at timestamptz,
  onboarding_completed_at timestamptz,
  last_seen_at timestamptz,
  portfolio_count int,
  is_hidden boolean,
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by_username text
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
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      bp.tagline,
      p.created_at,
      p.onboarding_completed_at,
      p.last_seen_at,
      (select count(*)::int from public.portfolio_images pi where pi.builder_id = p.id),
      bp.is_hidden,
      bp.hidden_at,
      bp.hidden_reason,
      hb.username
    from public.builder_profiles bp
    join public.profiles p on p.id = bp.id
    left join public.profiles hb on hb.id = bp.hidden_by
   where v_search is null
      or p.username ilike '%' || v_search || '%'
      or coalesce(p.display_name, '') ilike '%' || v_search || '%'
   order by bp.is_hidden desc, p.created_at desc;
end;
$$;

revoke all on function public.admin_list_builders(text) from public;
grant execute on function public.admin_list_builders(text) to authenticated;


-- ─── 7. admin_list_conversation_reports ─────────────────────────────────────
-- The queue 0100's report_conversation writes into. p_status is 'open'
-- (default), 'reviewed', 'dismissed' or 'all'.
--
-- "other_*" is the participant who is NOT the reporter — in practice the
-- account being complained about, and the one a moderator will want to look up
-- in the BUILDERS tab.
create or replace function public.admin_list_conversation_reports(p_status text default null)
returns table (
  report_id uuid,
  conversation_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  resolution_note text,
  reviewer_username text,
  reporter_id uuid,
  reporter_username text,
  reporter_display_name text,
  reporter_avatar_url text,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_is_builder boolean,
  other_is_hidden boolean,
  message_count int
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
      r.id,
      r.conversation_id,
      r.reason,
      r.status,
      r.created_at,
      r.reviewed_at,
      r.resolution_note,
      rv.username,
      rp.id, rp.username, rp.display_name, rp.avatar_url,
      op.id, op.username, op.display_name, op.avatar_url,
      (obp.id is not null),
      coalesce(obp.is_hidden, false),
      (select count(*)::int from public.messages m where m.conversation_id = r.conversation_id)
    from public.conversation_reports r
    join public.conversations c on c.id = r.conversation_id
    join public.profiles rp on rp.id = r.reporter_id
    -- The counterpart: whichever side of the pair the reporter is not.
    join public.profiles op
      on op.id = case when c.user_a = r.reporter_id then c.user_b else c.user_a end
    left join public.builder_profiles obp on obp.id = op.id
    left join public.profiles rv on rv.id = r.reviewed_by
   where v_status = 'all' or r.status = v_status
   order by r.created_at desc;
end;
$$;

revoke all on function public.admin_list_conversation_reports(text) from public;
grant execute on function public.admin_list_conversation_reports(text) to authenticated;


-- ─── 8. admin_resolve_conversation_report ───────────────────────────────────
-- Closes a report as reviewed (we looked, we acted) or dismissed (we looked,
-- nothing to do). Reopening is not offered: the partial unique index from 0100
-- allows only one OPEN report per (conversation, reporter), so moving a row
-- back to 'open' could collide with a report filed since — and a moderator who
-- changes their mind can act on the profile directly.
create or replace function public.admin_resolve_conversation_report(
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

  if not exists (select 1 from public.conversation_reports where id = p_report) then
    raise exception 'That report does not exist';
  end if;

  update public.conversation_reports
     set status          = v_status,
         resolution_note = left(v_note, 2000),
         reviewed_by     = auth.uid(),
         reviewed_at     = now()
   where id = p_report;
end;
$$;

revoke all on function public.admin_resolve_conversation_report(uuid, text, text) from public;
grant execute on function public.admin_resolve_conversation_report(uuid, text, text) to authenticated;


-- ─── 9. admin_get_conversation_messages ─────────────────────────────────────
-- Reading a reported thread. Same shape and same guarantees as
-- admin_get_messages (0023) — read-only, sender identity joined in — but keyed
-- on the conversation itself. admin_get_messages takes an ORDER id and is
-- unusable here: orders are decommissioned, and a reported thread never had one.
--
-- Image messages carry their URL in meta; the chat-media bucket is public-read
-- (0022), so the console renders them without signing anything.
create or replace function public.admin_get_conversation_messages(p_conversation uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text,
  body text,
  msg_type text,
  meta jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();

  return query
    select m.id, m.sender_id, s.username, s.display_name, s.avatar_url,
           m.body, m.msg_type, m.meta, m.created_at
      from public.messages m
      join public.profiles s on s.id = m.sender_id
     where m.conversation_id = p_conversation
     order by m.created_at asc;
end;
$$;

revoke all on function public.admin_get_conversation_messages(uuid) from public;
grant execute on function public.admin_get_conversation_messages(uuid) to authenticated;


notify pgrst, 'reload schema';
