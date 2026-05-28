-- =============================================================================
-- BuildEx — Base profiles table (idempotent baseline)
-- Run this first if your project does not already have the profiles table
-- from the README's minimum SQL. Safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  discord_id text unique,
  role text,
  bio text,
  minecraft_username text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable" on public.profiles;
create policy "profiles are viewable"
  on public.profiles for select
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Case-insensitive uniqueness for the @handle (stored in profiles.username).
-- The app already lowercases the handle on save; this index guarantees uniqueness
-- even if a future caller forgets, and makes lookups during availability checks fast.
create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username))
  where username is not null;
