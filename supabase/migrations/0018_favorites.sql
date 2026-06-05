-- =============================================================================
-- BuildEx — Builder favorites (UX follow-up)
--
-- Lets a signed-in user bookmark builders so they can find them again and
-- filter the catalog down to just their saved creators.
--
-- Like notifications "Clear all" (0017), this is a plain owner-scoped table: the
-- only rows a user can ever touch are their own, so RLS policies are enough and
-- no SECURITY DEFINER RPC is needed. The client adds/removes/lists its own rows
-- directly (lib/favorites/api.js), exactly how the chat/notification UIs already
-- read and mutate their own rows.
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── favorites table ────────────────────────────────────────────────────────
-- One row per (user, builder) pair. Both sides reference profiles(id) and cascade
-- on delete so a removed account / builder cleans up its favorites automatically.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, builder_id)
);

-- Fast "list everything I favorited, newest first".
create index if not exists favorites_user_idx
  on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

-- A user may only ever see / create / delete their own favorites.
drop policy if exists "owner reads own favorites" on public.favorites;
create policy "owner reads own favorites"
  on public.favorites for select
  using (user_id = auth.uid());

drop policy if exists "owner adds own favorites" on public.favorites;
create policy "owner adds own favorites"
  on public.favorites for insert
  with check (user_id = auth.uid());

drop policy if exists "owner deletes own favorites" on public.favorites;
create policy "owner deletes own favorites"
  on public.favorites for delete
  using (user_id = auth.uid());

-- Force PostgREST to reload its schema cache so the new table + policies are
-- visible immediately (same pattern as the other migrations).
notify pgrst, 'reload schema';
