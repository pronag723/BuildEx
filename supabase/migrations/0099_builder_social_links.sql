-- =============================================================================
-- BuildEx — Builder social links
--
-- Widens builder_profiles.contact_links (added in 0098) from three keys to
-- eight, so a builder can publish the accounts clients actually look for and
-- we can render them as buttons on their profile:
--
--   discord · telegram · youtube · twitch · tiktok · instagram · x · other
--
--   { "discord": "pixelforge", "youtube": "@pixelforge",
--     "other": "https://pixelforge.dev" }
--
-- SECURITY. Same contract as 0098, extended. Every value is a string of at
-- most 200 characters that is EITHER a bare handle in that platform's own
-- format OR a plain `https://` URL — and for the seven branded keys, only a
-- URL on that platform's own hosts. So a crafted PATCH straight to PostgREST
-- cannot store `javascript:`, `data:`, a scheme-relative `//host`, anything
-- containing whitespace or attribute-escaping characters, or point the
-- "YouTube" button at an unrelated site.
--
-- This mirrors PLATFORMS in lib/onboarding/contactLinks.js. Change both.
--
-- NOT TOUCHED: rates, tools, response_time_hours, availability_status,
-- project_types, build_types, years_experience — decommission, never delete.
--
-- Idempotent — safe to re-run. Requires 0098 (the column and its grants).
-- =============================================================================

-- The column and its grants come from 0098; repeated here so a project that
-- somehow skipped it still lands in the right state.
alter table public.builder_profiles
  add column if not exists contact_links jsonb not null default '{}'::jsonb;

comment on column public.builder_profiles.contact_links is
  'Public off-platform links, at most one per platform, keys limited to '
  '{discord, telegram, youtube, twitch, tiktok, instagram, x, other}. Values '
  'are a bare handle or a plain https:// URL on that platform''s own host — '
  'validated by builder_profiles_contact_links_valid and by '
  'lib/onboarding/contactLinks.js.';

-- ─── Replace 0098's three-key constraint ─────────────────────────────────────
alter table public.builder_profiles
  drop constraint if exists builder_profiles_contact_links_valid;

alter table public.builder_profiles
  add constraint builder_profiles_contact_links_valid check (
    jsonb_typeof(contact_links) = 'object'

    -- Only the eight known keys. Removing them must leave an empty object;
    -- anything left over is a key we do not render and will not store.
    and contact_links - array[
      'discord', 'telegram', 'youtube', 'twitch', 'tiktok', 'instagram', 'x', 'other']::text[] = '{}'::jsonb

    -- discord: a username (optionally with the legacy #1234 discriminator), or an
    -- invite URL on a Discord-owned host.
    and (
      not (contact_links ? 'discord')
      or (
        jsonb_typeof(contact_links -> 'discord') = 'string'
        and length(contact_links ->> 'discord') <= 200
        and (
          contact_links ->> 'discord' ~
             '^[A-Za-z0-9._]{2,32}(#[0-9]{4})?$'
          or contact_links ->> 'discord' ~
             '^https://(discord\.gg|discord\.com/invite|discordapp\.com/invite)/[A-Za-z0-9-]{1,64}$'
        )
      )
    )

    -- telegram: an @username, or the t.me / telegram.me link to it.
    and (
      not (contact_links ? 'telegram')
      or (
        jsonb_typeof(contact_links -> 'telegram') = 'string'
        and length(contact_links ->> 'telegram') <= 200
        and (
          contact_links ->> 'telegram' ~
             '^@[A-Za-z0-9_]{5,32}$'
          or contact_links ->> 'telegram' ~
             '^https://(t\.me|telegram\.me)/[A-Za-z0-9_]{5,32}$'
        )
      )
    )

    -- youtube: an @handle, or any youtube.com / youtu.be link.
    and (
      not (contact_links ? 'youtube')
      or (
        jsonb_typeof(contact_links -> 'youtube') = 'string'
        and length(contact_links ->> 'youtube') <= 200
        and (
          contact_links ->> 'youtube' ~
             '^@[A-Za-z0-9._-]{3,30}$'
          or contact_links ->> 'youtube' ~
             '^https://((www\.|m\.)?youtube\.com|youtu\.be)/[A-Za-z0-9@._/-]{1,80}$'
        )
      )
    )

    -- twitch: a channel name, or the twitch.tv link to it.
    and (
      not (contact_links ? 'twitch')
      or (
        jsonb_typeof(contact_links -> 'twitch') = 'string'
        and length(contact_links ->> 'twitch') <= 200
        and (
          contact_links ->> 'twitch' ~
             '^[A-Za-z0-9_]{4,25}$'
          or contact_links ->> 'twitch' ~
             '^https://(www\.)?twitch\.tv/[A-Za-z0-9_]{4,25}$'
        )
      )
    )

    -- tiktok: an @username, or the tiktok.com/@name link.
    and (
      not (contact_links ? 'tiktok')
      or (
        jsonb_typeof(contact_links -> 'tiktok') = 'string'
        and length(contact_links ->> 'tiktok') <= 200
        and (
          contact_links ->> 'tiktok' ~
             '^@[A-Za-z0-9._]{2,24}$'
          or contact_links ->> 'tiktok' ~
             '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._]{2,24}$'
        )
      )
    )

    -- instagram: an @username, or the instagram.com link to it.
    and (
      not (contact_links ? 'instagram')
      or (
        jsonb_typeof(contact_links -> 'instagram') = 'string'
        and length(contact_links ->> 'instagram') <= 200
        and (
          contact_links ->> 'instagram' ~
             '^@[A-Za-z0-9._]{1,30}$'
          or contact_links ->> 'instagram' ~
             '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$'
        )
      )
    )

    -- x: an @username, or the x.com / twitter.com link to it.
    and (
      not (contact_links ? 'x')
      or (
        jsonb_typeof(contact_links -> 'x') = 'string'
        and length(contact_links ->> 'x') <= 200
        and (
          contact_links ->> 'x' ~
             '^@[A-Za-z0-9_]{1,15}$'
          or contact_links ->> 'x' ~
             '^https://(www\.)?(x\.com|twitter\.com)/[A-Za-z0-9_]{1,15}$'
        )
      )
    )

    -- other: a plain https:// URL on ANY host — the deliberate exception, shown to the
    -- visitor in full. Host label, optional port, optional path with no
    -- whitespace and none of the characters that could escape an HTML
    -- attribute. (contactLinks.js is a shade stricter: it also rejects
    -- backslash and backtick. This is the backstop that cannot be bypassed.)
    and (
      not (contact_links ? 'other')
      or (
        jsonb_typeof(contact_links -> 'other') = 'string'
        and length(contact_links ->> 'other') <= 200
        and (
          contact_links ->> 'other' ~
             '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^[:space:]<>"'']*)?$'
        )
      )
    )
  );

-- ─── Column-level grants ─────────────────────────────────────────────────────
-- 0028_column_privilege_lockdown.sql revoked the blanket INSERT/UPDATE on
-- builder_profiles and granted back an explicit column list, so contact_links
-- has to be named. GRANT is additive; 0098 already did this, and repeating it
-- is a harmless no-op that keeps this file self-sufficient.
grant insert (contact_links) on public.builder_profiles to authenticated;
grant update (contact_links) on public.builder_profiles to authenticated;

notify pgrst, 'reload schema';
