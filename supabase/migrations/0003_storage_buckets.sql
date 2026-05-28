-- =============================================================================
-- BuildEx — Storage buckets for avatars, banners and portfolio images
-- Run after 0002. Idempotent.
--
-- Layout convention:
--   avatars/<user_id>/<filename>
--   banners/<user_id>/<filename>
--   portfolios/<user_id>/<filename>
--
-- The first path segment (user_id) is enforced by the policies below so a user
-- can only write to their own folder.
-- =============================================================================

-- ─── Create buckets (public read) ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('portfolios', 'portfolios', true)
on conflict (id) do update set public = excluded.public;

-- ─── Read policies (public) ─────────────────────────────────────────────────
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Banners are publicly readable" on storage.objects;
create policy "Banners are publicly readable"
  on storage.objects for select
  using (bucket_id = 'banners');

drop policy if exists "Portfolios are publicly readable" on storage.objects;
create policy "Portfolios are publicly readable"
  on storage.objects for select
  using (bucket_id = 'portfolios');

-- ─── Write policies (owner only — first folder = auth.uid()) ────────────────
drop policy if exists "Users write own avatars" on storage.objects;
create policy "Users write own avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own avatars" on storage.objects;
create policy "Users update own avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own avatars" on storage.objects;
create policy "Users delete own avatars"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users write own banners" on storage.objects;
create policy "Users write own banners"
  on storage.objects for insert
  with check (
    bucket_id = 'banners'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own banners" on storage.objects;
create policy "Users update own banners"
  on storage.objects for update
  using (
    bucket_id = 'banners'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own banners" on storage.objects;
create policy "Users delete own banners"
  on storage.objects for delete
  using (
    bucket_id = 'banners'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users write own portfolios" on storage.objects;
create policy "Users write own portfolios"
  on storage.objects for insert
  with check (
    bucket_id = 'portfolios'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own portfolios" on storage.objects;
create policy "Users update own portfolios"
  on storage.objects for update
  using (
    bucket_id = 'portfolios'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own portfolios" on storage.objects;
create policy "Users delete own portfolios"
  on storage.objects for delete
  using (
    bucket_id = 'portfolios'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
