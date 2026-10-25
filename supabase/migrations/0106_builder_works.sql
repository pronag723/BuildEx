-- =============================================================================
-- BuildEx — Builder works, price tiers, co-authors (profile redesign, stage 1)
--
-- Why this exists
-- ---------------
-- A builder's portfolio is a flat list of portfolio_images rows: one picture,
-- captioned with its upload file name ("IMG_2597"), at most 12 of them. The
-- profile redesign is built around WORKS instead — one build, several photos,
-- a title and description, the people who built it with you, and optionally the
-- price tier it was made under. This migration is that data model, and nothing
-- user-visible changes when it runs.
--
--   1. Tunable limits (functions, same pattern as 0100).
--   2. public.builder_price_tiers — a builder's named price list.
--   3. public.works — one row per build. Counters (likes/views) and moderation
--      columns exist here but are written only by later SECURITY DEFINER code.
--   4. public.work_coauthors — a BuildEx builder OR a free-text name per row.
--   5. portfolio_images.work_id — the existing image table becomes the photos
--      of a work. Every existing image is backfilled into a one-photo work, so
--      the feed, the account page and the moderator console keep working.
--   6. Transitional triggers so today's one-image-at-a-time uploader keeps
--      producing works (removed once the work editor ships).
--   7. builder_profiles.building_since — "building since <year>", from which
--      the profile derives "N years building". A year never goes stale; the
--      dormant years_experience column would.
--   8. Fix: a hidden builder could delete and re-insert their builder_profiles
--      row to reset is_hidden. Deleting is now refused while hidden.
--   9. Server-side size and type limits on the portfolios bucket.
--
-- Rules carried over from earlier migrations:
--   • Column-level grants (0028): every new table starts with REVOKE ALL and
--     gets back only the columns the browser edits. likes_count, views_count
--     and removed_* are never client-writable.
--   • Hidden builders (0101): every new readable table hides a hidden builder's
--     rows from everyone but the builder and admins. Checks that must see rows
--     RLS hides go through SECURITY DEFINER helpers, never inline subqueries.
--   • Named FKs (0101 gotcha): works has exactly ONE foreign key to profiles on
--     purpose — no removed_by column — and every embed in lib/works names its
--     constraint anyway, because portfolio_images and work_coauthors both link
--     works and profiles.
--   • Storage paths stay flat (<uid>/<file>): the delete-account Edge Function
--     only clears the top level of each user's folder.
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";


-- ─── 1. TUNING ──────────────────────────────────────────────────────────────
-- The product promise is "no limit on works". These are abuse ceilings, set far
-- above what a real portfolio needs and far below what a script would want.

create or replace function public.works_per_builder_max()
returns int language sql immutable set search_path = public as $$ select 300; $$;

create or replace function public.work_photos_max()
returns int language sql immutable set search_path = public as $$ select 10; $$;

create or replace function public.price_tiers_per_builder_max()
returns int language sql immutable set search_path = public as $$ select 12; $$;

create or replace function public.work_coauthors_max()
returns int language sql immutable set search_path = public as $$ select 8; $$;


-- ─── Shared helpers ─────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "Is this account a builder?" means "has a builder_profiles row" (0097).
-- Definer so it also sees hidden rows; only the triggers below call it, so no
-- client gets EXECUTE.
create or replace function public._is_builder(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.builder_profiles bp where bp.id = p_user);
$$;

revoke all on function public._is_builder(uuid) from public;


-- ─── 2. builder_price_tiers ─────────────────────────────────────────────────
-- Deliberately NOT builder_profiles.rates: that jsonb still holds the old
-- marketplace tiers, and reading it would put stale prices back on profiles.
-- Prices are USD cents, like every *_kopecks column since the global pivot.
create table if not exists public.builder_price_tiers (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  days_min smallint,
  days_max smallint,
  price_from_cents integer not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint builder_price_tiers_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint builder_price_tiers_description_len
    check (description is null or char_length(description) <= 300),
  constraint builder_price_tiers_days check (
    (days_min is null or days_min between 1 and 365)
    and (days_max is null or days_max between 1 and 365)
    and (days_min is null or days_max is null or days_min <= days_max)
  ),
  constraint builder_price_tiers_price
    check (price_from_cents between 100 and 10000000)
);

create index if not exists builder_price_tiers_builder_idx
  on public.builder_price_tiers (builder_id, position);

drop trigger if exists builder_price_tiers_touch_updated_at on public.builder_price_tiers;
create trigger builder_price_tiers_touch_updated_at
  before update on public.builder_price_tiers
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_price_tier_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.builder_price_tiers where builder_id = new.builder_id)
     >= public.price_tiers_per_builder_max() then
    raise exception 'You can have up to % price tiers.', public.price_tiers_per_builder_max()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_price_tiers_limit on public.builder_price_tiers;
create trigger builder_price_tiers_limit
  before insert on public.builder_price_tiers
  for each row execute function public.enforce_price_tier_limit();


-- ─── 3. works ───────────────────────────────────────────────────────────────
-- title is nullable only for the works backfilled below (an image never had a
-- real title); the editor requires one for every work it creates.
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  description text,
  mc_version text,
  size_label text,
  duration_days smallint,
  price_tier_id uuid references public.builder_price_tiers(id) on delete set null,
  position int not null default 0,
  is_pinned boolean not null default false,
  likes_count int not null default 0,
  views_count int not null default 0,
  -- A moderator taking one work down. Written only by an admin RPC (0108);
  -- no removed_by column, so works keeps a single FK to profiles.
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint works_title_len
    check (title is null or char_length(btrim(title)) between 1 and 80),
  constraint works_description_len
    check (description is null or char_length(description) <= 2000),
  constraint works_mc_version_len
    check (mc_version is null or char_length(mc_version) <= 24),
  constraint works_size_label_len
    check (size_label is null or char_length(size_label) <= 24),
  constraint works_duration
    check (duration_days is null or duration_days between 1 and 365),
  constraint works_counts_nonneg
    check (likes_count >= 0 and views_count >= 0)
);

create index if not exists works_builder_idx
  on public.works (builder_id, position);

-- "Best work": at most one pinned work per builder.
create unique index if not exists works_one_pinned_idx
  on public.works (builder_id)
  where is_pinned;

drop trigger if exists works_touch_updated_at on public.works;
create trigger works_touch_updated_at
  before update on public.works
  for each row execute function public.touch_updated_at();

-- The work cap, and a price tier must be the work's own builder's tier —
-- otherwise "Discuss a similar build · from $X" could quote someone else.
create or replace function public.enforce_work_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     and (select count(*) from public.works where builder_id = new.builder_id)
         >= public.works_per_builder_max() then
    raise exception 'You can have up to % works.', public.works_per_builder_max()
      using errcode = 'check_violation';
  end if;

  if new.price_tier_id is not null
     and not exists (
       select 1 from public.builder_price_tiers t
        where t.id = new.price_tier_id and t.builder_id = new.builder_id
     ) then
    raise exception 'That price tier belongs to another builder.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists works_rules on public.works;
create trigger works_rules
  before insert or update of price_tier_id on public.works
  for each row execute function public.enforce_work_rules();


-- ─── 4. work_coauthors ──────────────────────────────────────────────────────
-- Each row credits either a BuildEx builder (coauthor_id, rendered as a link to
-- their profile) or someone who is not on the site (name, rendered as
-- "feat. <name>"). No acceptance step: the credit shows only on the author's
-- work, and the credited builder can remove themselves (remove_me_from_work).
create table if not exists public.work_coauthors (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  coauthor_id uuid references public.profiles(id) on delete cascade,
  name text,
  role text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint work_coauthors_one_target
    check ((coauthor_id is null) <> (name is null)),
  constraint work_coauthors_name_len
    check (name is null or char_length(btrim(name)) between 1 and 40),
  constraint work_coauthors_role_len
    check (role is null or char_length(role) <= 40),
  constraint work_coauthors_unique_profile unique (work_id, coauthor_id)
);

create index if not exists work_coauthors_work_idx
  on public.work_coauthors (work_id, position);
create index if not exists work_coauthors_coauthor_idx
  on public.work_coauthors (coauthor_id)
  where coauthor_id is not null;

create or replace function public.enforce_work_coauthor_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select builder_id into v_owner from public.works where id = new.work_id;

  if new.coauthor_id is not null
     and (tg_op = 'INSERT' or new.coauthor_id is distinct from old.coauthor_id) then
    if new.coauthor_id = v_owner then
      raise exception 'You cannot credit yourself as a co-author.'
        using errcode = 'check_violation';
    end if;
    -- Only visible builders can be linked. A builder hidden later keeps their
    -- existing credits; the profile simply stops resolving for visitors.
    if not public._is_builder(new.coauthor_id) or public.is_builder_hidden(new.coauthor_id) then
      raise exception 'That builder is not on BuildEx.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.work_coauthors where work_id = new.work_id)
         >= public.work_coauthors_max() then
    raise exception 'A work can credit up to % co-authors.', public.work_coauthors_max()
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists work_coauthors_rules on public.work_coauthors;
create trigger work_coauthors_rules
  before insert or update on public.work_coauthors
  for each row execute function public.enforce_work_coauthor_rules();


-- ─── 5. portfolio_images → photos of a work ─────────────────────────────────
alter table public.portfolio_images
  add column if not exists work_id uuid references public.works(id) on delete cascade;

create index if not exists portfolio_images_work_idx
  on public.portfolio_images (work_id, position);

-- A photo may only be attached to its own builder's work, and a work holds at
-- most work_photos_max() photos.
create or replace function public.enforce_work_photo_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.work_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.works w
     where w.id = new.work_id and w.builder_id = new.builder_id
  ) then
    raise exception 'That work belongs to another builder.'
      using errcode = 'check_violation';
  end if;

  if (tg_op = 'INSERT' or new.work_id is distinct from old.work_id)
     and (select count(*) from public.portfolio_images where work_id = new.work_id)
         >= public.work_photos_max() then
    raise exception 'A work can have up to % photos.', public.work_photos_max()
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Named so it sorts after portfolio_images_autowork (section 6): triggers fire
-- in name order, and the work must exist before it is checked.
drop trigger if exists portfolio_images_work_rules on public.portfolio_images;
create trigger portfolio_images_work_rules
  before insert or update of work_id, builder_id on public.portfolio_images
  for each row execute function public.enforce_work_photo_rules();

-- Hiding a work (removed_at) must hide its photos too, or the feed card — which
-- embeds portfolio_images directly — would keep showing a taken-down build.
-- Same trap as 0101: works RLS hides a removed work from visitors, so an inline
-- `exists (... removed_at is not null)` would see nothing and pass. Definer.
create or replace function public.is_work_removed(p_work uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select w.removed_at is not null from public.works w where w.id = p_work),
    false
  );
$$;

revoke all on function public.is_work_removed(uuid) from public;
grant execute on function public.is_work_removed(uuid) to anon, authenticated;

drop policy if exists "portfolio images are viewable" on public.portfolio_images;
create policy "portfolio images are viewable"
  on public.portfolio_images for select
  using (
    builder_id = auth.uid()
    or (
      not public.is_builder_hidden(builder_id)
      and not public.is_work_removed(work_id)
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );


-- ─── 6. Transitional: today's uploader still makes one image at a time ──────
-- Until the work editor ships, onboarding and /account insert bare images. These
-- three triggers turn each bare image into its own untitled one-photo work, keep
-- that work's position in step with the image, and drop the empty shell when its
-- only photo is deleted. A "shell" is a work with no title and no description,
-- so nothing a builder has written is ever deleted here.
--
-- They also make deploy order irrelevant: a browser still running the old code
-- keeps producing works after this file runs. 0109 drops them.
create or replace function public.portfolio_image_autowork()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work uuid;
begin
  if new.work_id is null then
    insert into public.works (builder_id, position)
    values (new.builder_id, coalesce(new.position, 0))
    returning id into v_work;
    new.work_id := v_work;
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_images_autowork on public.portfolio_images;
create trigger portfolio_images_autowork
  before insert on public.portfolio_images
  for each row execute function public.portfolio_image_autowork();

create or replace function public.portfolio_image_sync_shell_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.works w
     set position = new.position
   where w.id = new.work_id
     and w.title is null
     and w.description is null
     and (select count(*) from public.portfolio_images p where p.work_id = w.id) = 1;
  return new;
end;
$$;

drop trigger if exists portfolio_images_sync_shell_position on public.portfolio_images;
create trigger portfolio_images_sync_shell_position
  after update of position on public.portfolio_images
  for each row
  when (new.work_id is not null)
  execute function public.portfolio_image_sync_shell_position();

create or replace function public.portfolio_image_drop_empty_shell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.works w
   where w.id = old.work_id
     and w.title is null
     and w.description is null
     and not exists (select 1 from public.portfolio_images p where p.work_id = w.id);
  return old;
end;
$$;

drop trigger if exists portfolio_images_drop_empty_shell on public.portfolio_images;
create trigger portfolio_images_drop_empty_shell
  after delete on public.portfolio_images
  for each row
  when (old.work_id is not null)
  execute function public.portfolio_image_drop_empty_shell();

-- Backfill: every image that predates works becomes its own untitled work, in
-- the same order. Re-running only touches images still without a work.
do $$
declare
  r record;
  v_work uuid;
begin
  for r in
    select id, builder_id, position, created_at
      from public.portfolio_images
     where work_id is null
     order by builder_id, position, created_at
  loop
    insert into public.works (builder_id, position, created_at, updated_at)
    values (r.builder_id, r.position, coalesce(r.created_at, now()), coalesce(r.created_at, now()))
    returning id into v_work;

    update public.portfolio_images set work_id = v_work where id = r.id;
  end loop;
end;
$$;


-- ─── RLS + grants: works, builder_price_tiers, work_coauthors ───────────────
alter table public.works enable row level security;
alter table public.builder_price_tiers enable row level security;
alter table public.work_coauthors enable row level security;

-- Supabase's default privileges grant ALL on every new public table to anon and
-- authenticated. Take that back and grant only what the browser needs.
revoke all on public.works from anon, authenticated;
revoke all on public.builder_price_tiers from anon, authenticated;
revoke all on public.work_coauthors from anon, authenticated;

grant select on public.works to anon, authenticated;
grant insert (
  builder_id, title, description, mc_version, size_label, duration_days,
  price_tier_id, position, is_pinned
) on public.works to authenticated;
grant update (
  title, description, mc_version, size_label, duration_days,
  price_tier_id, position, is_pinned
) on public.works to authenticated;
grant delete on public.works to authenticated;

grant select on public.builder_price_tiers to anon, authenticated;
grant insert (builder_id, name, description, days_min, days_max, price_from_cents, position)
  on public.builder_price_tiers to authenticated;
grant update (name, description, days_min, days_max, price_from_cents, position)
  on public.builder_price_tiers to authenticated;
grant delete on public.builder_price_tiers to authenticated;

grant select on public.work_coauthors to anon, authenticated;
grant insert (work_id, coauthor_id, name, role, position)
  on public.work_coauthors to authenticated;
grant update (coauthor_id, name, role, position)
  on public.work_coauthors to authenticated;
grant delete on public.work_coauthors to authenticated;

-- works: the builder sees all of their own, admins see everything, everyone
-- else sees works that are neither taken down nor owned by a hidden builder.
drop policy if exists "works are viewable" on public.works;
create policy "works are viewable"
  on public.works for select
  using (
    builder_id = auth.uid()
    or (removed_at is null and not public.is_builder_hidden(builder_id))
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

-- Inline builder_profiles check is safe here: the builder can always read their
-- own row (0101), so a positive `exists` sees it even while they are hidden.
drop policy if exists "builders insert own works" on public.works;
create policy "builders insert own works"
  on public.works for insert
  with check (
    builder_id = auth.uid()
    and exists (select 1 from public.builder_profiles bp where bp.id = auth.uid())
  );

drop policy if exists "builders update own works" on public.works;
create policy "builders update own works"
  on public.works for update
  using (builder_id = auth.uid())
  with check (builder_id = auth.uid());

drop policy if exists "builders delete own works" on public.works;
create policy "builders delete own works"
  on public.works for delete
  using (builder_id = auth.uid());

drop policy if exists "price tiers are viewable" on public.builder_price_tiers;
create policy "price tiers are viewable"
  on public.builder_price_tiers for select
  using (
    builder_id = auth.uid()
    or not public.is_builder_hidden(builder_id)
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "builders insert own price tiers" on public.builder_price_tiers;
create policy "builders insert own price tiers"
  on public.builder_price_tiers for insert
  with check (
    builder_id = auth.uid()
    and exists (select 1 from public.builder_profiles bp where bp.id = auth.uid())
  );

drop policy if exists "builders update own price tiers" on public.builder_price_tiers;
create policy "builders update own price tiers"
  on public.builder_price_tiers for update
  using (builder_id = auth.uid())
  with check (builder_id = auth.uid());

drop policy if exists "builders delete own price tiers" on public.builder_price_tiers;
create policy "builders delete own price tiers"
  on public.builder_price_tiers for delete
  using (builder_id = auth.uid());

-- Co-author credits are visible exactly when their work is: the inline `exists`
-- runs under the works policy above, which is the behaviour we want (a positive
-- test, so RLS hiding the work hides the credit — not the 0101 trap).
drop policy if exists "work coauthors are viewable" on public.work_coauthors;
create policy "work coauthors are viewable"
  on public.work_coauthors for select
  using (exists (select 1 from public.works w where w.id = work_id));

drop policy if exists "builders manage own work coauthors" on public.work_coauthors;
create policy "builders manage own work coauthors"
  on public.work_coauthors for all
  using (exists (select 1 from public.works w where w.id = work_id and w.builder_id = auth.uid()))
  with check (exists (select 1 from public.works w where w.id = work_id and w.builder_id = auth.uid()));

-- A credited builder can take their name off someone else's work.
create or replace function public.remove_me_from_work(p_work uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.work_coauthors
   where work_id = p_work and coauthor_id = auth.uid();
end;
$$;

revoke all on function public.remove_me_from_work(uuid) from public;
grant execute on function public.remove_me_from_work(uuid) to authenticated;


-- ─── 7. builder_profiles.building_since ─────────────────────────────────────
-- 2009 is Minecraft's first public release. The client also caps it at the
-- current year; a CHECK cannot use now().
alter table public.builder_profiles
  add column if not exists building_since smallint;

do $$
begin
  alter table public.builder_profiles
    add constraint builder_profiles_building_since_range
    check (building_since is null or building_since between 2009 and 2100);
exception when duplicate_object then null;
end;
$$;

-- 0028 lists builder_profiles' writable columns explicitly; a new column has no
-- write privilege until granted. upsertBuilderProfile is INSERT … ON CONFLICT
-- DO UPDATE, so it needs both.
grant insert (building_since) on public.builder_profiles to authenticated;
grant update (building_since) on public.builder_profiles to authenticated;


-- ─── 8. A hidden builder cannot reset is_hidden by re-creating their row ────
-- 0028 removed client INSERT/UPDATE of is_hidden, but DELETE stayed: deleting
-- builder_profiles and inserting it again brought is_hidden back to its default,
-- false. cancelOnboarding still needs the delete, so it stays — just not while
-- hidden.
drop policy if exists "users delete own builder profile" on public.builder_profiles;
create policy "users delete own builder profile"
  on public.builder_profiles for delete
  using (auth.uid() = id and is_hidden = false);


-- ─── 9. portfolios bucket: server-side limits ───────────────────────────────
-- The 8 MB / image-only rules lived only in the browser (lib/onboarding/
-- constants.js). Uploads are compressed to WebP first, so real files are far
-- smaller. Wrapped so a project that refuses bucket updates from SQL still gets
-- everything above.
do $$
begin
  update storage.buckets
     set file_size_limit = 8388608,
         allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
   where id = 'portfolios';
exception when insufficient_privilege then
  raise notice 'Could not update the portfolios bucket limits — set them in the dashboard.';
end;
$$;


notify pgrst, 'reload schema';


-- ─── Checks (run by hand after applying) ────────────────────────────────────
-- Every image belongs to a work:
--   select count(*) from public.portfolio_images where work_id is null;        -- 0
--   select count(*) from public.works;                                          -- = images
--
-- Visitors cannot see a hidden builder's works:
--   set role anon;
--   select count(*) from public.works w
--     join public.builder_profiles bp on bp.id = w.builder_id where bp.is_hidden; -- 0
--   reset role;
--
-- Counters are not client-writable (expect "permission denied for table works"):
--   set role authenticated;
--   update public.works set likes_count = 999;
--   reset role;
--
-- Bucket limits:
--   select file_size_limit, allowed_mime_types from storage.buckets where id = 'portfolios';
