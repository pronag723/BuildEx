// Shared catalog nav definition + active-state logic for the desktop navbar and
// the mobile burger menu. Paths are stored WITHOUT the deployment basePath;
// callers wrap them with withBase() for hrefs, and compare against
// usePathname() (which Next already returns without the basePath) for active
// state. This replaces the old hardcoded `active: true` on "Browse Builders",
// which incorrectly stayed highlighted on every page (e.g. /account).

// The feed is the site root; the explanatory page it replaced now lives at
// /about, and its sections are anchors on that page.
//
// `auth: true` marks an item that only exists for a signed-in visitor — see
// catalogNavItemsFor() below. Without it the bar held three links and looked
// half-empty next to the controls on the right.
//
// `key` names the item's label in the `nav` dictionary namespace
// (lib/i18n/messages/<lang>/nav.mjs); `label` is the English original.
export const catalogNavItems = [
  { path: "/", key: "builders", label: "Builders" },
  { path: "/chats", key: "messages", label: "Messages", auth: true },
  { path: "/about#projects", key: "showcase", label: "Showcase" },
  { path: "/about#how-it-works", key: "howItWorks", label: "How It Works" },
  { path: "/about", key: "about", label: "About" },
];

/** The nav a visitor should see. `signedIn` unlocks the account-only entries. */
export function catalogNavItemsFor(signedIn) {
  return catalogNavItems.filter((item) => !item.auth || signedIn);
}

export function isNavActive(pathname, path) {
  if (!pathname || !path) return false;
  // Anchor links into the landing page are never a "current page".
  if (path.includes("#")) return false;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
