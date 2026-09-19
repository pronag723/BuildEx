-- ─────────────────────────────────────────────────────────────────────────────
-- 0097 — Decommission BuildEx Studios
--
-- This migration DECOMMISSIONS a feature. It does not delete it.
--
-- The studios program — studio storefronts, moderator consoles, employee codes,
-- builder invitations and the commission overrides that paid for all of it —
-- was removed from the client in the same commit as this file. Its data stays:
--
--   • Every studios table keeps its rows, columns, indexes and RLS policies
--     exactly as they are: studios, studio_memberships, studio_codes,
--     studio_overrides, studio_employee_codes, studio_employee_earnings,
--     studio_moderator_invites, studio_builder_invitations,
--     studio_order_assignments, studio_portfolio_images.
--   • builder_profiles.studio_id, .profile_type, .pending_studio_code,
--     .pending_employee_code, .studio_promo_bps and .studio_promo_ends_at keep
--     their values. They are simply no longer read.
--   • conversations rows with conversation_type = 'studio_client' and their
--     messages stay, still covered by the surviving chat policies. The inbox
--     skips what it cannot render rather than dropping anything.
--   • The 0064 triggers (builder_profiles_block_employee_rate_edits,
--     builder_profiles_keep_active_employees_private) stay in place. Production
--     has zero rows with profile_type = 'studio_employee' and zero with a
--     non-null studio_id, so they gate nothing today — see REVAMP_AUDIT.md §5.
--
-- What this file does is close the client-callable doors. Every RPC below was
-- reachable from a signed-in browser; the UI that called them is gone, so this
-- stops a crafted request from creating a studio, redeeming a code, inviting a
-- builder or moving a membership. Function bodies are left in place;
-- service_role and the postgres owner keep their access.
--
-- ⚠ DELIBERATELY NOT REVOKED — audit §3i. These carry studio names but are
-- load-bearing for features that survive. Revoking any of them breaks chat,
-- storage or account deletion:
--
--     public.is_active_studio_employee(uuid)   -- called by can_direct_message
--     public.is_studio_moderator(uuid)         -- payouts/studio RLS (0048, 0092)
--     public.is_studio_order_moderator(uuid)   -- storage RLS (0046)
--     public.is_invited_builder_for_studio(uuid) -- studios SELECT policy (0059)
--
-- The shape of that dependency, for whoever reads this next:
--     messages RLS → _can_write_conversation → can_direct_message
--                  → is_active_studio_employee → studio_memberships
-- The studio tables stay, so chat keeps working untouched. Do not "simplify"
-- these helpers without replacing the policies in the same migration.
--
-- place_studio_order, assign_studio_order and the three studio payout RPCs were
-- already revoked by 0095.
--
-- Every REVOKE is wrapped in a DO block that swallows `undefined_function`, so
-- this file is safe to re-run and safe against a database where a given
-- overload was never created. Several functions exist under TWO live signatures
-- because a later migration added a parameter with `create or replace` rather
-- than replacing the old one — both are listed.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Admin / moderator console ───────────────────────────────────────────────

do $$ begin revoke execute on function public.admin_create_studio(text, text, text, text, int, int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_update_studio(uuid, text, text, text, int, int) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_set_studio_status(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_create_studio_code(uuid, text, int, timestamptz) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_set_code_status(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_mark_override_paid(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_create_studio_moderator_invite(text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_set_studio_moderator_invite_status(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_configure_managed_studio(uuid, int, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_list_managed_studios() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_list_studio_balances() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.admin_recover_studio_owner(uuid, uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Registration / codes ────────────────────────────────────────────────────
-- redeem_studio_code and validate_studio_code were already revoked in 0041;
-- repeating the revoke is a harmless no-op and keeps this list complete.

do $$ begin revoke execute on function public.redeem_studio_code(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.validate_studio_code(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.finalize_studio_code() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.create_studio_employee_code(text, int, timestamptz) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.set_studio_employee_code_status(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.delete_studio_employee_code(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.validate_studio_employee_code(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.validate_studio_moderator_invite(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.complete_studio_registration(text, text, text, text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.complete_studio_registration_with_about(text, text, text, text, text, jsonb) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.complete_studio_employee_registration(text, text, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.complete_pending_studio_employee_registration() from public, anon, authenticated; exception when undefined_function then null; end $$;


-- ─── Studio management ───────────────────────────────────────────────────────

do $$ begin revoke execute on function public.update_my_studio(text, text, text, jsonb, int, boolean, text, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.update_my_studio_about(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.set_my_studio_accepting_orders(boolean) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.set_my_studio_availability(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_my_managed_studio() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_my_studio_leave_eligibility() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.leave_my_studio() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_my_studio_delete_eligibility() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.remove_studio_employee(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.remove_studio_employee(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.search_independent_builders(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.search_independent_builders_v2(text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.create_studio_builder_invitation(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.create_studio_builder_invitation_v2(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.respond_to_studio_builder_invitation(uuid, text) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.cancel_studio_builder_invitation(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.list_my_studio_builder_invitations() from public, anon, authenticated; exception when undefined_function then null; end $$;
do $$ begin revoke execute on function public.get_or_create_studio_conversation(uuid) from public, anon, authenticated; exception when undefined_function then null; end $$;


notify pgrst, 'reload schema';
