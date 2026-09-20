// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Landing page content
//
// HONESTY RULE. BuildEx is a directory. It does not process payments, hold
// funds, vet or verify builders, or take any part in a deal. Nothing on this
// page may say or imply otherwise — see app/legal/documents.js, which is the
// promise this copy has to match.
// ─────────────────────────────────────────────────────────────────────────────

export const navItems = [
  { href: "/builders", label: "Browse Builders" },
  { href: "#projects", label: "Showcase" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#features", label: "What You Get" },
  { href: "#why-buildex", label: "What We Are" }
];

// Example Minecraft builds, shown to set the tone of the site. These are
// illustrations, NOT portfolio work by builders listed here — the section
// heading says so, and the cards deliberately carry no builder name, rating or
// price. Real work lives on the real profiles at /builders.
export const projects = [
  { image: "/projects/dark-fantasy-castle.jpg", alt: "Dark fantasy Minecraft castle build", title: "Dark Fantasy Castle" },
  { image: "/projects/spawn-anarchy-1.jpg", alt: "Minecraft anarchy spawn build", title: "Spawn" },
  { image: "/projects/spawn-anarchy-2.jpg", alt: "Minecraft anarchy spawn build design", title: "Spawn Courtyard" },
  { image: "/projects/throne-hall-1.jpg", alt: "Medieval throne hall interior Minecraft build", title: "Throne Hall" },
  { image: "/projects/japan-house.jpg", alt: "Traditional Japanese house Minecraft build", title: "Japan House" },
  { image: "/projects/gray-citadel.jpg", alt: "Gray stone citadel Minecraft build", title: "Gray Citadel" },
  { image: "/projects/throne-hall-2.jpg", alt: "Royal throne hall Minecraft interior", title: "Great Hall" }
];

export const steps = [
  {
    icon: "search",
    title: "1. Browse the profiles",
    body:
      "Open the directory and filter by style or build type. Every profile is a builder's own portfolio, uploaded and written by them."
  },
  {
    icon: "send",
    title: "2. Contact them directly",
    body:
      "Use the Discord, Telegram or other links a builder publishes on their profile — or message them here on BuildEx.",
    className: "relative md:-mt-4"
  },
  {
    icon: "handshake",
    title: "3. Arrange it between you",
    body:
      "Scope, price, deadline and payment are agreed directly with the builder. BuildEx introduces you and stays out of the rest."
  }
];

// The single sentence this whole site has to be able to stand behind. Shown
// under the hero CTA and again under the steps, so nobody can reach a builder
// without having read it.
export const DIRECTORY_DISCLAIMER =
  "BuildEx is a directory. All arrangements and payments happen directly between the client and the builder — BuildEx is not involved in them, does not hold or handle money, and does not vet, verify or guarantee anyone listed here.";
