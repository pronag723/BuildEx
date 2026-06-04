-- =============================================================================
-- BuildEx — Notifications "Clear all" (UX follow-up to Stage 11)
--
-- The navbar bell can already mark notifications read (UPDATE read_at, policy in
-- 0016_notifications.sql). This migration adds a "Clear all" action that lets a
-- user permanently DELETE their own notifications.
--
-- Least-invasive: a single owner-scoped DELETE policy. The client issues a plain
-- DELETE (lib/notifications/api.js → clearNotifications); RLS guarantees it can
-- only ever remove the caller's own rows. No RPC needed — this mirrors how the
-- chat/notification UIs already SELECT and UPDATE their own rows directly.
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

-- Owner may delete their own notifications. INSERTs still go exclusively through
-- the _notify SECURITY DEFINER helper (no INSERT policy), so this opens up
-- removal only, scoped to the caller.
drop policy if exists "owner deletes own notifications" on public.notifications;
create policy "owner deletes own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

-- Force PostgREST to reload its schema cache so the new policy is visible
-- immediately (same pattern as the other migrations).
notify pgrst, 'reload schema';
