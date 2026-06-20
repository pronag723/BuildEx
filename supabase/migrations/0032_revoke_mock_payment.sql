-- =============================================================================
-- BuildEx — Revoke client-callable mock payment RPC   [post Stage 12]
--
-- Now that real NOWPayments invoices are verified working end-to-end, the
-- client-callable mark_order_paid(uuid) mock is no longer needed as a fallback
-- and should not be callable by signed-in users (an authenticated user could
-- mark any order they're a party to as "paid" without actually paying).
--
-- The function itself is kept so the DB schema stays consistent and to avoid
-- breaking any future admin tooling. Only the EXECUTE grant to `authenticated`
-- is revoked; `service_role` (used by internal RPCs) is unaffected.
--
-- Safe to run multiple times (REVOKE is idempotent when the grant is absent).
-- =============================================================================

revoke execute on function public.mark_order_paid(uuid) from authenticated;

notify pgrst, 'reload schema';
