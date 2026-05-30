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
| Portfolio image | `portfolio_images.url` | Public URL in `portfolios` bucket. |
| Portfolio order | `portfolio_images.position` | Lower position = shown first. |
