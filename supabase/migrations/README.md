# BuildEx — Supabase migrations

Paste each file into the Supabase SQL editor in order, then run. All
migrations are idempotent (safe to re-run during development).

| # | File | What it does |
|---|---|---|
| 0001 | `0001_profiles_base.sql` | Baseline `profiles` table from the README, plus a case-insensitive uniqueness index on the `@handle`. Skip if you already created this table per the README. |
| 0002 | `0002_onboarding_schema.sql` | New profile columns (banner, interests, server type, onboarding flag) + `builder_profiles` + `portfolio_images` tables with RLS. |
| 0003 | `0003_storage_buckets.sql` | Creates `avatars`, `banners`, and `portfolios` Storage buckets (public read, owner-only write to their `<user_id>/...` subfolder). |
| 0004 | `0004_builder_tools.sql` | Adds `builder_profiles.tools` (the builder's toolset), replacing the legacy years-of-experience question. |
| 0005 | `0005_builder_rates.sql` | Adds `builder_profiles.rates` (jsonb) — the builder's self-set pricing tiers (block area → price range per build scale). |
| 0006 | `0006_delete_account.sql` | Adds the `delete_own_account()` SECURITY DEFINER function so a signed-in user can permanently delete their own account (cascades to profiles + builder data). |
| 0007 | `0007_chat.sql` | User-to-user chat: `conversations` + `messages` tables with RLS, the `get_or_create_conversation()`, `list_my_conversations()`, and `mark_conversation_read()` RPCs, and adds `messages` to the `supabase_realtime` publication for live delivery. |
| 0008–0027 | _(various)_ | Orders, deliveries, 3D preview, reviews, ranks, disputes, notifications, favorites, presence, custom rate tiers, admin moderation, and the Studios partner program. See each file's header comment. |
| 0028 | `0028_column_privilege_lockdown.sql` | **Security fix.** Replaces the column-blind self-update grants on `profiles`/`builder_profiles` with column-level INSERT/UPDATE grants, so `is_admin`, `rank`, the cached review aggregates, and the studio promo fields can no longer be self-set via PostgREST — only the SECURITY DEFINER RPCs may change them. Also hides `profiles.discord_id` from client reads. **Run this on every existing project.** |
| 0029 | `0029_account_deletion_storage_cleanup.sql` | **Privacy fix.** `delete_own_account()` / `delete_incomplete_registration()` now purge the user's Storage objects (avatars/banners/portfolios + their orders' deliverables/previews) before deleting the auth user, instead of orphaning them in public buckets. |
| 0030 | `0030_chat_flood_guard.sql` | **Abuse fix.** Adds a per-sender message rate limit (20 / 10s) as a `before insert` trigger on `messages`. Generous enough that normal chat never trips it; stops automated flooding. |
| 0031 | `0031_payments.sql` | **Real payments (Stage 12).** Adds the `payments` table (one row per order, RLS to the order's parties), builder `payout_method`/`payout_details` columns (granted to `authenticated`), and the service-role RPCs `mark_order_paid_internal` / `record_pending_payment` the NOWPayments Edge Functions call (see `supabase/functions/`). The client mock `mark_order_paid` is left in place — it's gated off by `NEXT_PUBLIC_PAYMENTS_ENABLED` until keys exist. |
| 0032 | `0032_revoke_mock_payment.sql` | **Post-payments cleanup.** Revokes `execute` on `mark_order_paid(uuid)` from `authenticated` now that real NOWPayments payments are verified working. Prevents a signed-in user from marking an order paid without actually paying. The function itself is kept; only the client grant is removed. |
| 0033 | `0033_payouts.sql` | **Builder payouts (Stage 12, outgoing).** Adds the `payouts` queue table (one row per completed order, RLS to the builder + admins), `_enqueue_payout()` wired into `buyer_confirm_complete` + the `resolve_dispute` release leg, the service-role `mark_payouts_*` RPCs the payout Edge Functions call, and `admin_requeue_payout()`. Builders are paid in USDT via the NOWPayments Mass Payout Edge Functions (`create-payout` / `verify-payout`, see `supabase/functions/`), driven from the admin Payouts console. |
| 0034 | `0034_payment_reconciliation_and_fiat_payouts.sql` | **Payment hardening + fiat/card payouts.** Aligns `builder_profiles.payout_method` with the account UI (`usdt_trc20`, `usdt_erc20`, `fiat_card`), blocks raw card-number storage, queues fiat/card withdrawal rows as admin-reviewed off-ramp payouts, and makes `mark_order_paid_internal()` reject webhook amount/currency mismatches before marking an order paid. |
| 0035 | `0035_builder_withdrawals.sql` | **Builder balances and withdrawals.** Stops automatic per-order payouts, derives available balance from completed earnings, adds atomic partial withdrawal requests, admin approval/rejection, terminal provider reconciliation, and releases legacy blocked/card rows back to builder balances. |
| 0036 | `0036_manual_payout_settlement.sql` | **Manual withdrawal settlement.** Adds optional admin reference/note fields on `payouts` plus `admin_mark_withdrawal_sent()` and `admin_mark_withdrawal_failed()`, so admins can send USDT manually and then record the outcome without any fixed-IP relay. |
| 0069 | `0069_admin_order_search_and_payout_history.sql` | Makes the moderator order feed searchable and default to all orders, and adds an admin-only builder order-history RPC for payout review. |
| 0070 | `0070_fix_admin_orders_for_studio_providers.sql` | Ensures moderator search and history include orders placed with studios, whose provider is stored separately from `orders.builder_id`. |
| 0071 | `0071_manual_studio_builder_availability.sql` | **Manual studio builder availability.** Stops assignments and releases from changing or locking employee availability, permits overlapping active assignments, and repairs statuses previously marked busy by an order. |
| 0072 | `0072_low_fee_stablecoin_payments.sql` | **Low-fee stablecoins.** Lowers independent and studio orders to $5, records multi-network payment reconciliation data, restricts withdrawals to USDT-BSC, and makes BuildEx absorb payout fees. |
| 0089 | `0089_legal_launch_controls.sql` | **Legal launch controls.** Stores versioned account and transaction consent, requires ready-build compatibility/content/license disclosures, enforces the seven-day custom-delivery dispute window, and prevents a refund resolution until an admin records a confirmed provider or transaction reference. |
| 0090 | `0090_studio_ready_builds_and_lifecycle.sql` | **Studio marketplace and lifecycle.** Adds studio-owned ready builds and proceeds, 0–100% studio fees, employee self-departure, invitation listing cleanup, and safe studio deletion that privatizes members as rookies. Deploy `cleanup-ready-build-assets` with this migration. |
| 0091 | `0091_ready_build_publish_and_studio_bio_fix.sql` | **Ready-build publish and studio bio fix.** Corrects the ready-build media reorder alias/unique-position staging and reasserts public access to normalized studio About fields. |
| 0092 | `0092_ready_build_studio_rls_permissions.sql` | **Studio ready-build RLS fix.** Replaces direct reads of protected studio ownership columns inside purchase/payment/payout policies with a narrow security-definer moderator check. |
| 0037 | `0037_payment_webhook_fail_closed.sql` | **Payment integrity fix.** Requires a verified NOWPayments settlement callback to include a valid USD amount matching the order before the order can be marked paid. |
| 0038 | `0038_enforce_payment_floor_on_orders.sql` | **Order integrity fix.** Enforces the same $20 marketplace floor inside `place_order`, preventing direct RPC calls from bypassing the rate-editor validation. |
| 0039 | `0039_lower_payment_floor_to_10_and_pin_usdttrc20.sql` | **Pricing + checkout update.** Lowers the marketplace order floor to $10 inside `place_order` and aligns production checkout around `USDTTRC20`, with the Edge Function enforcing NOWPayments' live `min-amount` response before invoice creation. |
| 0040 | `0040_raise_payment_floor_to_20.sql` | **Pricing + checkout update.** Raises the marketplace order floor back to $20 inside `place_order`, matching the conservative buyer checkout threshold and the current NOWPayments minimum observed for USDT TRC-20. |
| 0041 | `0041_managed_studios_core.sql` | **Managed studios core.** Adds studio moderator invitations, storefront ownership, private memberships and employee code batches, studio order/provider targets, assignment history, informational employee earnings, studio reviews/favorites, and studio withdrawals. Retires client execution of referral-era RPCs. |
| 0042 | `0042_managed_studios_access_and_orders.sql` | **Managed studios access and orders.** Adds atomic moderator/employee registration, studio settings and team RPCs, permanent buyer–studio conversations, assignment/reassignment, studio order placement, snapshot economics, and participant RLS. |
| 0043 | `0043_managed_studios_lifecycle_and_finance.sql` | **Managed studios lifecycle.** Adds availability automation, payment notifications, assigned-employee start/delivery enforcement, completion earnings, studio reviews, cutoff chat archives, balances, and withdrawal requests. |
| 0044 | `0044_managed_studios_hardening.sql` | **Managed studios hardening.** Extends delivery and dispute authorization, closes preview mutation gaps, supports dispute release/refund accounting, exposes admin balance inspection, and adds admin ownership recovery. |
| 0045 | `0045_studio_registration_definer_access.sql` | **Studio registration fix.** Pins moderator-invite validation and storefront creation RPCs to an owner with explicit table access, so a new studio can be created atomically without browser-level table writes. |
| 0046 | `0046_storage_policy_private_studio_fix.sql` | **Studio logo upload fix.** Moves private studio-moderator checks out of Storage RLS expressions, preventing delivery-policy evaluation from blocking avatar uploads. |
| 0047 | `0047_storage_policy_helper_execution.sql` | **Storage policy follow-up.** Grants authenticated users execution of the safe boolean helper used by Storage RLS. |
| 0048 | `0048_payouts_private_studio_policy_fix.sql` | **Managed-studio RLS fix.** Moves private studio-moderator checks out of browser-evaluated policies for portfolio metadata, team data, orders, payments, disputes, and payouts, restoring managed-studio reads without exposing ownership or payout columns. |
| 0049 | `0049_studio_account_deletion.sql` | **Studio account deletion fix.** Suspends and releases a moderator-owned studio before deleting the moderator login, preserving financial and order history for administrative recovery while allowing the account deletion to complete. |
| 0050 | `0050_studio_payout_address_validation.sql` | **Studio payout validation.** Enforces network-specific TRON and Ethereum wallet formats for every new or updated studio payout destination while preserving legacy rows for review. |
| 0051 | `0051_studio_about_and_profile_controls.sql` | **Studio profile parity.** Adds the public studio About field plus narrow moderator RPCs for registration, About editing, and instant availability saving. |
| 0052 | `0052_delete_studio_employee_codes.sql` | **Studio invite management.** Adds a moderator-only RPC for permanently deleting employee invite codes from the Team settings UI. |
| 0053 | `0053_studio_payout_and_account_reliability.sql` | **Studio settings reliability.** Preserves malformed legacy payout destinations for review while allowing unrelated profile edits, and adds friendly server-side validation whenever a studio changes its payout destination. |
| 0054 | `0054_managed_account_deletion.sql` | **Managed account deletion.** Detaches managed-studio `RESTRICT` references so moderators and employees can permanently delete their login without deleting studio order history. |
| 0055 | `0055_storage_api_account_deletion.sql` | **Storage-safe account deletion.** Stops the deletion RPC from writing directly to protected Storage tables; the Edge Function removes files through the supported Storage API before the database transaction deletes the account. |
| 0056 | `0056_public_studio_about_access.sql` | **Public studio feed fix.** Grants browser roles read access to the public studio About column so active storefronts can load in the builders feed. |
| 0057 | `0057_studio_builder_invitations.sql` | **Studio builder lifecycle.** Adds moderator invitations, builder acceptance/decline, complete code-based employee onboarding without portfolio requirements, and safe employee removal back to an independent busy profile. |
| 0058 | `0058_invited_builder_studio_access.sql` | **Invitation RLS fix.** Lets a builder with a pending invitation read the invited studio’s public identity details without granting access to private studio data. |
| 0059 | `0059_fix_invited_studio_policy_recursion.sql` | **Invitation policy recursion fix.** Moves the pending-invitation check behind a row-security-safe helper so embedded studio details load without an RLS cycle. |
| 0060 | `0060_fix_invitation_studio_grant_policy.sql` | **Invitation grant fix.** Uses the existing moderator helper instead of directly querying private studio columns from invitation RLS. |
| 0061–0062 | _(studio invitation follow-ups)_ | Adds invitation discovery/details, then the now-superseded abbreviated employee onboarding flow. |
| 0063 | `0063_restore_studio_employee_builder_details.sql` | **Studio employee profile fix.** Restores the normal builder-details stages for employee-code registration (portfolio remains optional) and prevents an incomplete removed employee from setting an independent profile to available. |
| 0065 | `0065_restore_removed_builder_availability.sql` | **Removed employee recovery.** Returns removed employees to an independent, completed account while keeping them unavailable until their independent profile is ready. |
| 0066 | `0066_rejoin_availability_and_employee_removal_confirmation.sql` | **Studio rejoin and removal safety.** Rejoined employees start available instead of inheriting removal's busy fallback; its confirmation wording is superseded by 0067. |
| 0067 | `0067_fix_employee_availability_lock_and_remove_confirmation.sql` | **Employee availability repair.** Releases legacy closed-order assignment locks, limits availability locking to real active orders, and requires `REMOVE` confirmation before removal. |
| 0068 | `0068_restore_delivery_preview_chat_action.sql` | **Chat 3D preview fix.** Restores the `has_preview` delivery-event metadata lost in the managed-studio lifecycle rewrite so future chat delivery cards expose the inline viewer. |
| 0075 | `0075_ready_builds_marketplace.sql` | **Ready-made builds marketplace.** Adds independent-builder listings, public media/3D previews, immutable world versions, immediate paid downloads, and a separate purchase/payment/payout ledger. |
| 0081 | `0081_fix_ready_build_publish_rls.sql` | **Ready-made build publishing fix.** Pins the listing and version RPCs to a privileged owner and disables internal RLS evaluation after they verify the authenticated builder, so builders can publish their finished builds. |
| 0082 | `0082_fix_ready_build_storage_upload_rls.sql` | **Ready-made upload fix.** Runs the Storage ownership helper with a privileged read and recreates the owner-only Storage policies, allowing builders to upload listing images, worlds, and previews. |
| 0083 | `0083_ready_build_owner_asset_reads.sql` | **Ready-made asset access.** Lets authenticated builders read files belonging to their own listings, completing the Storage permissions required by legacy upsert uploads. |
| 0084 | `0084_fix_ready_build_zip_validation.sql` | **Ready-made ZIP validation fix.** Replaces the fragile escaped regex with a normalized `.zip` suffix check so valid world archives are accepted consistently. |
| 0086 | `0086_restore_ready_build_delete_rpcs.sql` | **Ready-made deletion recovery.** Idempotently restores the owner-checked deletion RPCs and refreshes the PostgREST schema cache. |
| 0087 | `0087_public_ready_build_preview_reads.sql` | **Ready-made preview access fix.** Lets every visitor mint a signed URL for previews attached to active listings while keeping world files private. |
| 0088 | `0088_ready_build_favorites.sql` | **Ready-made build favorites.** Extends the owner-scoped favorites store so signed-in users can save individual marketplace listings. |
| 0072 | `0072_low_fee_stablecoin_payments.sql` | **Low-fee custody checkout and payouts.** Lowers both order floors to $5, adds payment reconciliation metadata, and switches builder withdrawals to batched USDT-BSC with no separate builder fee. |
| 0073 | `0073_trc20_bsc_checkout_policy.sql` | **Two-rail custody correction.** Restricts buyer checkout to same-asset USDT-BSC and USDT-TRC20 custody balances while retaining BSC-only payouts and enforcing a 9% managed-studio commission floor. |

## Field mapping (matches the app code)

| App-facing field | DB column | Notes |
|---|---|---|
| Display name (human-readable) | `profiles.display_name` | Shown everywhere in UI. |
| `@handle` (unique, for URLs/mentions) | `profiles.username` | Stored lowercased; `lower(username)` is the unique index. The `@` is not stored. |
| Avatar | `profiles.avatar_url` | Public URL from the `avatars` bucket. |
| Banner | `profiles.banner_url` | Public URL from the `banners` bucket. |
| Bio | `profiles.bio` | Free text. |
| Client interests | `profiles.interests` | `text[]` of style keys. |
| Preferred server type | `profiles.preferred_server_type` | One of: `survival`, `smp`, `creative`, `minigames`, `roleplay`, `network`, `other`. |
| Role | `profiles.role` | `client`, `builder`, `both`, or exclusive studio moderator `studio`. |
| Onboarding completed | `profiles.onboarding_completed_at` | Set when the user finishes the flow. |
| Builder rank | `builder_profiles.rank` | Defaults to `rookie`. |
| Years of experience | `builder_profiles.years_experience` | Integer. |
| Specialties (styles) | `builder_profiles.specialties` | `text[]` of style keys — same vocabulary as the catalog filter. |
| Build types | `builder_profiles.build_types` | `text[]` — same vocabulary as the catalog filter. |
| Project types | `builder_profiles.project_types` | `text[]` — commissions, collaborations, etc. |
| Response time (hours) | `builder_profiles.response_time_hours` | Integer; used by future SLA logic. |
| Availability | `builder_profiles.availability_status` / `is_available` | Display + filter flag. |
| Tools | `builder_profiles.tools` | `text[]` of tool keys (WorldEdit, VoxelSniper, ...). |
| Rates | `builder_profiles.rates` | `jsonb` — per-scale `{ blocks, from, to }` pricing tiers the builder sets themselves. |
| Payout method | `builder_profiles.payout_method` | `usdt_bsc` (USDT on BSC/BEP-20). |
| Payout details | `builder_profiles.payout_details` | USDT wallet address. Bank/card details are not stored. |
| Portfolio image | `portfolio_images.url` | Public URL in `portfolios` bucket. |
| Portfolio order | `portfolio_images.position` | Lower position = shown first. |
