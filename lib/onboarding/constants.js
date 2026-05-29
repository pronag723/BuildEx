// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Onboarding option vocabularies
// Static lists used by the multi-step onboarding flow. Builder-facing style
// and build-type vocabularies are re-exported from the catalog data file so the
// onboarding selections feed directly into the existing /builders feed filters.
// ─────────────────────────────────────────────────────────────────────────────

export { STYLES, BUILD_TYPES } from "../../app/builders/data/offers";

// Clients answer "what kind of build are you most into?" — same style vocab.
export { STYLES as CLIENT_INTEREST_STYLES } from "../../app/builders/data/offers";

// Preferred server type — informs future matching / recommendations.
export const SERVER_TYPES = [
  { key: "survival",  label: "Survival",        emoji: "🌍" },
  { key: "smp",       label: "SMP / Community", emoji: "🤝" },
  { key: "creative",  label: "Creative",        emoji: "🎨" },
  { key: "minigames", label: "Minigames",       emoji: "🎮" },
  { key: "roleplay",  label: "Roleplay",        emoji: "🎭" },
  { key: "network",   label: "Network / Hub",   emoji: "🌐" },
  { key: "other",     label: "Something else",  emoji: "✨" },
];

// Builder — years of experience brackets
// Retained for backwards compatibility with older profiles that stored
// `years_experience`. No longer collected during onboarding (replaced by the
// builder's toolset below).
export const EXPERIENCE_LEVELS = [
  { key: "lt1",  label: "< 1 year",    years: 0 },
  { key: "1-2",  label: "1–2 years",   years: 1 },
  { key: "3-5",  label: "3–5 years",   years: 3 },
  { key: "6-9",  label: "6–9 years",   years: 6 },
  { key: "10+",  label: "10+ years",   years: 10 },
];

// Builder — tools / software the builder works with. Multi-select; feeds the
// "Tools used" section on the builder profile.
export const BUILDER_TOOLS = [
  { key: "worldedit",    label: "WorldEdit",    emoji: "🪄" },
  { key: "voxelsniper",  label: "VoxelSniper",  emoji: "🖌️" },
  { key: "axiom",        label: "Axiom",        emoji: "🪓" },
  { key: "arceon",       label: "Arceon",       emoji: "🌿" },
  { key: "goblintools",  label: "Goblin Tools", emoji: "🧰" },
  { key: "worldpainter", label: "WorldPainter", emoji: "🗺️" },
  { key: "litematica",   label: "Litematica",   emoji: "📐" },
  { key: "blockbench",   label: "BlockBench",   emoji: "🧊" },
  { key: "blender",      label: "Blender",      emoji: "🎬" },
  { key: "photoshop",    label: "Photoshop",    emoji: "🖼️" },
  { key: "vanilla",      label: "Vanilla only", emoji: "⛏️" },
];

// Builder — typical response time
export const RESPONSE_TIMES = [
  { key: "instant", label: "Within an hour", hours: 1 },
  { key: "fast",    label: "Within 3 hours", hours: 3 },
  { key: "same",    label: "Same day",        hours: 12 },
  { key: "next",    label: "Next day",        hours: 24 },
  { key: "few",     label: "A few days",      hours: 72 },
];

// Builder — availability state shown publicly
export const AVAILABILITY_STATES = [
  { key: "available", label: "Available for new projects", short: "Available", dot: "#4ade80" },
  { key: "limited",   label: "Limited capacity",           short: "Limited",   dot: "#fbbf24" },
  { key: "busy",      label: "Not taking new work",        short: "Busy",      dot: "#f87171" },
];

// Builder — types of projects they want to take
export const PROJECT_TYPES = [
  { key: "commissions",    label: "Paid commissions",       emoji: "💼" },
  { key: "collaborations", label: "Collaborations",         emoji: "🤝" },
  { key: "contests",       label: "Contests & events",      emoji: "🏆" },
  { key: "longterm",       label: "Long-term partnerships", emoji: "🔗" },
  { key: "quickjobs",      label: "Quick one-off jobs",     emoji: "⚡" },
];

// Validation helpers used by HandleInput and identity step.
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
};
