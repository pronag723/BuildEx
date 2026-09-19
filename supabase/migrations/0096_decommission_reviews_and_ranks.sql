-- ─────────────────────────────────────────────────────────────────────────────
-- 0096 — Decommission reviews, ranks and ratings
--
-- This migration DECOMMISSIONS a feature. It does not delete it.
--
-- Ranks only ever existed to set a builder's commission rate, and reviews were
-- gated on completed orders. Migration 0095 closed the order and payment layer,
-- so both are now meaningless — but nothing here drops data:
--
--   • public.reviews keeps its rows, its columns and its public SELECT policy
--     exactly as they are. A review is something a real person wrote about a
--     real order; it stays readable.
--   • builder_profiles.rank, .avg_rating, .reviews_count and .completed_orders
--     keep their values. They are simply no longer read by the client. The same
--     goes for the matching studios columns.
--   • The recompute helpers (recompute_builder_rank, recompute_all_ranks,
--     recompute_builder_review_stats, rank_for_metrics, commission_bps_for_rank)
--     stay in place, dormant. They were never granted to a client role — they
--     are called internally, from the order/review RPCs that 0095 already closed
--     — so there is nothing to revoke and nothing a browser can reach.
--
-- The one client-callable entry point left is leave_review, deferred from 0095
-- ("those belong to later stages and are revoked there, not here"). The UI that
-- called it was removed in the same commit as this file; this closes the door so
-- a crafted request from a signed-in (or anonymous) browser cannot write a new
-- review. The function body is left in place; service_role and the postgres
-- owner keep their access.
--
-- The REVOKE is wrapped in a DO block that swallows `undefined_function`, so
-- this file is safe to run more than once and safe against a database where
-- leave_review was never created.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Reviews ─────────────────────────────────────────────────────────────────

do $$ begin revoke execute on function public.leave_review(uuid, int, text) from public, anon, authenticated; exception when undefined_function then null; end $$;


notify pgrst, 'reload schema';
