-- ─────────────────────────────────────────────────────────────────────────────
-- 0102 — Revoke execute on the RPCs of decommissioned features
--
-- The payment, order, dispute, review, rank and studio features were removed in
-- 0095–0097, and Stage 8 removed the last client caller of
-- record_checkout_acceptance. The FUNCTIONS were kept (decommission, never
-- delete) — but keeping them left them EXECUTABLE. Postgres grants EXECUTE to
-- PUBLIC by default, so every one of these was callable by `anon`: by anyone
-- holding the publishable anon key, which is in the site's JavaScript bundle.
--
-- The live one was record_checkout_acceptance. It is SECURITY DEFINER and
-- INSERTs into legal_checkout_acceptances — the table we deliberately keep as a
-- record of what people accepted. Anyone could have forged rows into it. That
-- is the opposite of evidence.
--
-- The rest are latent rather than exploitable today: orders, disputes, studios
-- and reviews are all empty, and nothing creates them any more. They are closed
-- here anyway, because "empty right now" is not an access control.
--
-- DELIBERATELY NOT TOUCHED. These are referenced by RLS policies, several on
-- storage.objects, which the live site reads for every avatar, banner and
-- portfolio image. Revoking EXECUTE would make policy evaluation raise a
-- permission error and could take the site's images down:
--   can_read_active_ready_build_preview, can_manage_ready_build,
--   is_studio_moderator, is_studio_order_moderator, is_invited_builder_for_studio
-- Verified against pg_policies before writing this file: 0 policies reference
-- any function revoked below.
--
-- Reversible: re-grant execute to the role if a feature ever comes back.
-- Idempotent: revoke is a no-op when the grant is already gone.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  fn record;
  -- Signatures are resolved from the catalog so an argument-list drift between
  -- environments cannot make this file silently revoke nothing.
  targets text[] := array[
    -- Legal: the checkout-acceptance writer, whose client caller is gone.
    'record_checkout_acceptance',
    -- Disputes.
    'open_dispute_pre_legal',
    'resolve_dispute_pre_legal',
    -- Order plumbing.
    '_post_order_event',
    '_ensure_order_conversation',
    -- Studios.
    '_ensure_studio_conversation',
    '_require_studio_moderator',
    'is_active_studio_employee',
    -- Ranks and review aggregates.
    'recompute_all_ranks',
    'recompute_builder_rank',
    'recompute_builder_review_stats'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (targets)
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    raise notice 'revoked: %', fn.sig;
  end loop;
end
$$;

-- Verification. Expect zero rows.
select p.oid::regprocedure as still_callable_by_anon
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'record_checkout_acceptance', 'open_dispute_pre_legal', 'resolve_dispute_pre_legal',
    '_post_order_event', '_ensure_order_conversation', '_ensure_studio_conversation',
    '_require_studio_moderator', 'is_active_studio_employee',
    'recompute_all_ranks', 'recompute_builder_rank', 'recompute_builder_review_stats'
  )
  and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
