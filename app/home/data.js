// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Landing page content
//
// HONESTY RULE. BuildEx is a directory. It does not process payments, hold
// funds, vet or verify builders, or take any part in a deal. Nothing on this
// page may say or imply otherwise — see app/legal/documents.js, which is the
// promise this copy has to match.
// ─────────────────────────────────────────────────────────────────────────────

// The nav for /about. The feed is the site root now, so "Builders" is a route
// and everything else is an in-page anchor on this one page. `key` names the
// label in the `nav` dictionary namespace; `label` is the English original.
export const navItems = [
  { href: "/", key: "builders", label: "Builders" },
  { href: "#projects", key: "showcase", label: "Showcase" },
  { href: "#how-it-works", key: "howItWorks", label: "How It Works" },
  { href: "#features", key: "whatYouGet", label: "What You Get" },
  { href: "#why-buildex", key: "whatWeAre", label: "What We Are" }
];

// Example Minecraft builds, shown to set the tone of the site. These are
// illustrations, NOT portfolio work by builders listed here — the section
// heading says so, and the cards deliberately carry no builder name, rating or
// price. Real work lives on the real profiles at /builders.
//
// The words on this page — card titles and alt text, the steps, the hero, the
// lists, and the directory disclaimer the footer shows on every page — live in
// lib/i18n/messages/<lang>/about.mjs and footer.mjs, keyed by `key` below.
export const projects = [
  { key: "castle", image: "/projects/dark-fantasy-castle.jpg" },
  { key: "spawn", image: "/projects/spawn-anarchy-1.jpg" },
  { key: "courtyard", image: "/projects/spawn-anarchy-2.jpg" },
  { key: "throneHall", image: "/projects/throne-hall-1.jpg" },
  { key: "japanHouse", image: "/projects/japan-house.jpg" },
  { key: "citadel", image: "/projects/gray-citadel.jpg" },
  { key: "greatHall", image: "/projects/throne-hall-2.jpg" }
];

export const steps = [
  { key: "browse", icon: "search" },
  { key: "contact", icon: "send", className: "relative md:-mt-4" },
  { key: "arrange", icon: "handshake" }
];
