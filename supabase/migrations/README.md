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
| Role | `profiles.role` | `client`, `builder`, or `both`. |
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
| Payout method | `builder_profiles.payout_method` | `usdt_trc20`, `usdt_erc20`, or disabled `sepa_eur`. |
| Payout details | `builder_profiles.payout_details` | USDT wallet address. Bank/card details are not stored. |
| Portfolio image | `portfolio_images.url` | Public URL in `portfolios` bucket. |
| Portfolio order | `portfolio_images.position` | Lower position = shown first. |
