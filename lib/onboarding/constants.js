// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Onboarding option vocabularies and validators
//
// Builder signup is three steps: identity, styles, portfolio. Everything it
// needs lives here. The option lists that fed the retired steps (server types,
// experience brackets, tools, response times, availability, project types) are
// gone — their database columns keep whatever they already held, they are just
// no longer collected or shown.
// ─────────────────────────────────────────────────────────────────────────────

// Style and build-type vocabularies come from the catalog data file so the
// onboarding selections feed straight into the /builders feed filters.
export { STYLES, BUILD_TYPES } from "../../app/builders/data/offers";

// Validation helpers used by HandleInput and the identity step.
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9_]){2,23}$/;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 32;

export const BIO_MAX = 320;

// Portfolio upload limits
export const PORTFOLIO_MAX_IMAGES = 12;
export const PORTFOLIO_MAX_FILE_MB = 8;
export const PORTFOLIO_ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Storage buckets — match supabase/migrations/0003_storage_buckets.sql
export const BUCKETS = {
  avatars: "avatars",
  banners: "banners",
  portfolios: "portfolios",
  chatMedia: "chat-media",
};
