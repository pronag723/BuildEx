-- =============================================================================
-- BuildEx — Onboarding & profile customization schema
-- Adds:
--   1. New columns on public.profiles (banner, interests, server type, onboarding flag)
--   2. public.builder_profiles  — builder-specific extended profile
--   3. public.portfolio_images  — builder portfolio images
-- All tables have RLS enabled; policies enforce owner-only writes and public reads.
-- Idempotent — safe to re-run during development.
-- =============================================================================

-- ─── 1. Extend profiles ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists banner_url text,
  add column if not exists interests text[] default '{}',
  add column if not exists preferred_server_type text,
  add column if not exists onboarding_completed_at timestamptz;

-- ─── 2. builder_profiles ────────────────────────────────────────────────────
create table if not exists public.builder_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  rank text not null default 'rookie',
  years_experience int,
  specialties text[] default '{}',     -- styles (medieval, fantasy, ...)
  build_types text[] default '{}',     -- spawn, hub, lobby, arena, ...
  project_types text[] default '{}',   -- commissions, collaborations, contests, ...
  response_time_hours int default 24,
  availability_status text default 'available', -- available | busy | away
  is_available boolean default true,
  tagline text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.builder_profiles enable row level security;

drop policy if exists "builder profiles are viewable" on public.builder_profiles;
create policy "builder profiles are viewable"
  on public.builder_profiles for select
  using (true);

drop policy if exists "users insert own builder profile" on public.builder_profiles;
create policy "users insert own builder profile"
  on public.builder_profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update own builder profile" on public.builder_profiles;
create policy "users update own builder profile"
  on public.builder_profiles for update
  using (auth.uid() = id);

drop policy if exists "users delete own builder profile" on public.builder_profiles;
create policy "users delete own builder profile"
  on public.builder_profiles for delete
  using (auth.uid() = id);

-- Update trigger
create or replace function public.touch_builder_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists builder_profiles_touch_updated_at on public.builder_profiles;
create trigger builder_profiles_touch_updated_at
  before update on public.builder_profiles
  for each row execute function public.touch_builder_profile_updated_at();

-- ─── 3. portfolio_images ────────────────────────────────────────────────────
create table if not exists public.portfolio_images (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  storage_path text,
  position int not null default 0,
  alt text,
  width int,
  height int,
  created_at timestamptz default now()
);

create index if not exists portfolio_images_builder_idx
  on public.portfolio_images (builder_id, position);

alter table public.portfolio_images enable row level security;

drop policy if exists "portfolio images are viewable" on public.portfolio_images;
create policy "portfolio images are viewable"
  on public.portfolio_images for select
  using (true);

drop policy if exists "builders manage own portfolio images" on public.portfolio_images;
create policy "builders manage own portfolio images"
  on public.portfolio_images for all
  using (auth.uid() = builder_id)
  with check (auth.uid() = builder_id);
