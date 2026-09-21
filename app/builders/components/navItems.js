// Shared catalog nav definition + active-state logic for the desktop navbar and
// the mobile burger menu. Paths are stored WITHOUT the deployment basePath;
// callers wrap them with withBase() for hrefs, and compare against
// usePathname() (which Next already returns without the basePath) for active
// state. This replaces the old hardcoded `active: true` on "Browse Builders",
// which incorrectly stayed highlighted on every page (e.g. /account).

// The feed is the site root; the explanatory page it replaced now lives at
// /about, and its sections are anchors on that page.
export const catalogNavItems = [
  { path: "/", label: "Builders" },
  { path: "/about", label: "About" },
  { path: "/about#how-it-works", label: "How It Works" },
];

export function isNavActive(pathname, path) {
  if (!pathname || !path) return false;
  // Anchor links into the landing page are never a "current page".
  if (path.includes("#")) return false;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
