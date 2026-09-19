-- =============================================================================
-- BuildEx — Builder contact links
--
-- Builder onboarding is now three steps (identity, styles, portfolio) and the
-- only new field it collects is ONE optional way to reach the builder outside
-- BuildEx: a Discord username or invite, a Telegram @handle or t.me link, or a
-- single generic https:// link.
--
--   { "discord": "pixelforge" }
--   { "telegram": "@pixelforge" }
--   { "other": "https://pixelforge.dev" }
--
-- SECURITY. This value is typed by one user and rendered on a public profile,
-- which makes it a phishing surface. It is validated twice: on the client in
-- lib/onboarding/contactLinks.js, and here by a CHECK constraint so a crafted
-- PATCH straight to PostgREST cannot store anything else. Only the three keys
-- below are allowed, only string values, and a value must be either a bare
-- handle or a plain `https://` URL — never javascript:, data:, mailto:, a
-- scheme-relative `//host`, or anything containing whitespace or the quote and
-- angle characters that break out of an HTML attribute.
--
-- NOT TOUCHED: rates, tools, response_time_hours, availability_status,
-- project_types, build_types, years_experience. Those columns keep every value
-- they already hold — the app has simply stopped reading and writing them.
-- Decommission, never delete.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── 1. The column ───────────────────────────────────────────────────────────
alter table public.builder_profiles
  add column if not exists contact_links jsonb not null default '{}'::jsonb;

comment on column public.builder_profiles.contact_links is
  'Optional off-platform contact, at most one of {discord, telegram, other}. '
  'Values are a bare handle or a plain https:// URL — validated by '
  'builder_profiles_contact_links_valid and by lib/onboarding/contactLinks.js.';

-- ─── 2. Shape + safety CHECK ─────────────────────────────────────────────────
-- Dropped first so re-running this file picks up an edited expression.
alter table public.builder_profiles
  drop constraint if exists builder_profiles_contact_links_valid;

alter table public.builder_profiles
  add constraint builder_profiles_contact_links_valid check (
    jsonb_typeof(contact_links) = 'object'

    -- Only the three known keys. Removing them must leave an empty object;
    -- anything left over is a key we do not render and will not store.
    and contact_links - array['discord', 'telegram', 'other']::text[] = '{}'::jsonb

    -- Discord: a username (optionally with the legacy #1234 discriminator),
    -- or an invite URL on a Discord-owned host.
    and (
      not (contact_links ? 'discord')
      or (
        jsonb_typeof(contact_links -> 'discord') = 'string'
        and length(contact_links ->> 'discord') <= 200
        and (
          contact_links ->> 'discord' ~ '^[A-Za-z0-9._]{2,32}(#[0-9]{4})?$'
          or contact_links ->> 'discord' ~
             '^https://(discord\.gg|discord\.com/invite|discordapp\.com/invite)/[A-Za-z0-9-]{1,64}$'
        )
      )
    )

    -- Telegram: an @username, or the t.me / telegram.me link to it.
    and (
      not (contact_links ? 'telegram')
      or (
        jsonb_typeof(contact_links -> 'telegram') = 'string'
        and length(contact_links ->> 'telegram') <= 200
        and (
          contact_links ->> 'telegram' ~ '^@?[A-Za-z0-9_]{5,32}$'
          or contact_links ->> 'telegram' ~
             '^https://(t\.me|telegram\.me)/[A-Za-z0-9_]{5,32}$'
        )
      )
    )

    -- Other: a plain https:// URL. Host label, optional port, optional path
    -- with no whitespace and none of the characters that could escape an HTML
    -- attribute. (The client regex in contactLinks.js is a shade stricter — it
    -- also rejects backslash and backtick. This is the backstop, and it is the
    -- one that cannot be bypassed.)
    and (
      not (contact_links ? 'other')
      or (
        jsonb_typeof(contact_links -> 'other') = 'string'
        and length(contact_links ->> 'other') <= 200
        and contact_links ->> 'other' ~
            '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^[:space:]<>"'']*)?$'
      )
    )
  );

-- ─── 3. Column-level grants ──────────────────────────────────────────────────
-- CRITICAL. 0028_column_privilege_lockdown.sql revoked the blanket
-- INSERT/UPDATE on builder_profiles and granted back an explicit column list.
-- A new column is NOT covered by that list, so without this every write from
-- saveBuilderIdentity would fail with "permission denied for table
-- builder_profiles". GRANT is additive — this adds contact_links to what 0028
-- already allowed and changes nothing else.
--
-- upsertBuilderProfile issues INSERT … ON CONFLICT DO UPDATE, so the column
-- needs both privileges.
grant insert (contact_links) on public.builder_profiles to authenticated;
grant update (contact_links) on public.builder_profiles to authenticated;

-- SELECT on builder_profiles is table-wide (see 0028), so the public feed can
-- already read the new column; no read grant is needed.

-- PostgREST caches the schema and column privileges — reload so the new column
-- and grants take effect immediately.
notify pgrst, 'reload schema';
