-- ─────────────────────────────────────────────────────────────────────────────
-- 0095 — Decommission the payment, order, payout, dispute and ready-build layer
--
-- This migration DECOMMISSIONS a feature. It does not delete it.
--
-- Every table, column, type, policy, storage bucket and row belonging to orders,
-- payments, payouts, refunds, disputes and ready-made builds is RETAINED
-- DELIBERATELY, for record-keeping: these rows describe real money that real
-- people moved through the platform, and they must remain readable for
-- accounting, tax, support and legal purposes. Nothing here drops data.
--
-- What this migration does is close the door. The client code that called these
-- RPCs was removed in the same commit, so the only thing left to do is make sure
-- a crafted request from a signed-in (or anonymous) browser can no longer reach
-- them. Every statement below is a REVOKE EXECUTE from public, anon and
-- authenticated, using the full argument signature. Function bodies are left in
-- place, dormant; service_role (and the postgres owner) keep their access, so an
-- operator can still run them by hand if an old order ever needs settling.
--
-- Overloads: several of these functions exist under two live signatures because
-- a later migration added a parameter with `create or replace` instead of
-- replacing the original. Both signatures are revoked.
--
-- Deliberately NOT revoked:
--   • public.can_manage_ready_build(text) and
--     public.can_read_active_ready_build_preview(text) — granted to anon and
--     authenticated because storage RLS policies (0077 / 0082 / 0087 / 0090)
--     call them. Revoking either one breaks those policies.
--   • public.is_independent_builder(uuid), public.recompute_builder_rank(uuid),
--     public.recompute_builder_review_stats(uuid), public.recompute_all_ranks(),
--     public.rank_for_metrics(int, numeric),
--     public.commission_bps_for_rank(text) — never granted to a client role in
--     the first place; they are called internally or from policies.
--   • the chat, profile, storage and account helpers listed in the Stage 0
--     audit §3i — they carry order/studio names but are load-bearing for
--     features that survive.
--   • public.admin_get_messages(uuid) — kept for the Stage 7 moderation console.
--   • the studios RPCs and public.leave_review(uuid, int, text) — those belong
--     to later stages and are revoked there, not here.
--
-- Every REVOKE is wrapped in a DO block that swallows `undefined_function`, so
-- this file is safe to run more than once and safe to run against a database
-- that never had one of these overloads.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Orders ──────────────────────────────────────────────────────────────────

do $$ begin revoke execute on function public.place_order(uuid, text, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.place_studio_order(uuid, text, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.mark_order_paid(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.builder_start_work(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.builder_deliver(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.buyer_confirm_complete(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.cancel_order(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.builder_attach_delivery(uuid, text, text, bigint, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_delivery_info(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.assign_studio_order(uuid, uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Payments ────────────────────────────────────────────────────────────────
-- Already service_role-only (audit §3b). Re-revoking from the client roles is a
-- no-op; it is included so the closed surface is stated in one place.

do $$ begin revoke execute on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.record_pending_payment(uuid, text, int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.record_pending_payment(uuid, text, int, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.record_payment_event(uuid, text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.record_ready_build_payment(uuid, text, int, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.mark_ready_build_purchase_paid_internal(uuid, text, int, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.claim_payout_batch(uuid[], text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.finalize_payout_claim(text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.release_payout_claim(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.mark_payouts_processing(uuid[], text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.mark_payouts_sent(text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.mark_payouts_failed(text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Payouts and withdrawals ─────────────────────────────────────────────────

do $$ begin revoke execute on function public.get_my_payout_summary() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.request_withdrawal(int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.cancel_withdrawal(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_approve_withdrawal(uuid, int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_reject_withdrawal(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_mark_withdrawal_sent(uuid, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_mark_withdrawal_failed(uuid, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_requeue_payout(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_mark_fiat_payout_sent(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_my_studio_payout_summary() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.request_studio_withdrawal(int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.cancel_studio_withdrawal(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Disputes ────────────────────────────────────────────────────────────────

do $$ begin revoke execute on function public.open_dispute(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.resolve_dispute(uuid, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.resolve_dispute(uuid, text, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.list_open_disputes() from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Ready-made builds ───────────────────────────────────────────────────────
-- can_manage_ready_build(text) and can_read_active_ready_build_preview(text) are
-- intentionally absent — see the header.

do $$ begin revoke execute on function public.create_ready_build(text, text, text, int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.create_ready_build(text, text, text, int, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.update_ready_build(uuid, text, text, text, int, boolean) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.attach_ready_build_version(uuid, text, text, bigint, text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.attach_ready_build_media(uuid, text, text, text, int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.reorder_ready_build_media(uuid, uuid[]) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.prepare_ready_build_delete(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.delete_ready_build(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.create_ready_build_purchase(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_ready_build_download(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.set_ready_build_disclosures(uuid, text, text, text, text, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Admin order moderation ──────────────────────────────────────────────────
-- admin_get_messages(uuid) is intentionally absent — see the header.

do $$ begin revoke execute on function public.admin_list_orders(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_list_orders(text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_get_user_orders(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;


notify pgrst, 'reload schema';
