-- =============================================================================
-- BuildEx — Presence (real online/offline indicator)
--
-- Until now the "Online" dot was faked off the availability slider: a builder
-- set to "Available" always rendered as online, which says nothing about whether
-- they're actually at their keyboard. This adds a real, lightweight presence
-- signal: profiles.last_seen_at, stamped by a heartbeat while the user has the
-- tab open (lib/presence/api.js, driven from AuthContext). A viewer counts a
-- builder as "online" when their last_seen_at is within the window defined in
-- lib/presence/api.js (5 minutes).
--
-- No RPC or new table is needed. profiles already carries an owner-scoped UPDATE
-- policy ("users update own profile" → auth.uid() = id) and a public SELECT
-- policy, so the client can stamp its own row directly (same direct-write
-- pattern as favorites in 0018) and any viewer can read it.
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

-- ─── last_seen_at column ────────────────────────────────────────────────────
-- Null until the user's first heartbeat; a null/absent value reads as "offline".
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Force PostgREST to reload its schema cache so the new column is selectable /
-- updatable immediately (same pattern as the other migrations).
notify pgrst, 'reload schema';
