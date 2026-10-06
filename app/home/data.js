// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — /about page content
//
// HONESTY RULE. BuildEx is a directory. It does not process payments, hold
// funds, vet or verify builders, or take any part in a deal. Nothing on this
// page may say or imply otherwise — see app/legal/documents.js, which is the
// promise this copy has to match.
//
// The page uses the product header (app/builders/components/navItems.js), so
// it no longer keeps a nav list of its own.
// ─────────────────────────────────────────────────────────────────────────────

// Example Minecraft builds, shown to set the tone of the page. These are
// illustrations, NOT portfolio work by builders listed here — the section says
// so, and the tiles deliberately carry no builder name, rating or price. Real
// work lives on the real profiles.
//
// The words on this page — tile titles and alt text, the steps, the hero, the
// lists, and the directory disclaimer the footer shows on every page — live in
// lib/i18n/messages/<lang>/about.mjs and footer.mjs, keyed by `key` below.
export const projects = [
  { key: "castle", image: "/projects/dark-fantasy-castle.jpg" },
  { key: "japanHouse", image: "/projects/japan-house.jpg" },
  { key: "throneHall", image: "/projects/throne-hall-1.jpg" },
  { key: "spawn", image: "/projects/spawn-anarchy-1.jpg" },
  { key: "citadel", image: "/projects/gray-citadel.jpg" },
  { key: "courtyard", image: "/projects/spawn-anarchy-2.jpg" },
  { key: "greatHall", image: "/projects/throne-hall-2.jpg" }
];

export const steps = [
  { key: "browse" },
  { key: "contact" },
  { key: "arrange" }
];
