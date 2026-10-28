import { BUILDER_ONBOARDING_START } from "../../../lib/onboarding/state";

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
// `notBuilder: true` marks an item for everyone who isn't a builder yet,
// guests included: "Become a builder" is the way into onboarding now that
// signing in lands on the feed rather than /account. In the desktop bar it is
// guests-only — a signed-in visitor's bar already carries Messages plus the
// avatar and name, and at 1024px a sixth Russian label pushes the header off
// the screen — so AuthNavControls repeats it in the account menu instead.
//
// `key` names the item's label in the `nav` dictionary namespace
// (lib/i18n/messages/<lang>/nav.mjs); `label` is the English original.
export const catalogNavItems = [
  { path: "/", key: "builders", label: "Builders" },
  { path: "/chats", key: "messages", label: "Messages", auth: true },
  { path: "/about#how-it-works", key: "howItWorks", label: "How It Works" },
  { path: "/about#projects", key: "showcase", label: "Showcase" },
  { path: "/about", key: "about", label: "About" },
  { path: BUILDER_ONBOARDING_START, key: "becomeBuilder", label: "Become a builder", notBuilder: true },
];

/**
 * The nav a visitor should see. `signedIn` unlocks the account-only entries;
 * `isBuilder` (true / false / null while unknown, from useIsBuilder) shows the
 * builder opt-in only once we know they aren't one. `bar` is the desktop
 * header, where the opt-in is shown to guests only (see above).
 */
export function catalogNavItemsFor(signedIn, isBuilder = null, { bar = false } = {}) {
  return catalogNavItems.filter(
    (item) =>
      (!item.auth || signedIn) &&
      (!item.notBuilder || (isBuilder === false && !(bar && signedIn)))
  );
}

/** /about, with or without the trailing slash the static export adds. */
export const isAboutPath = (pathname) => (pathname || "").replace(/\/+$/, "") === "/about";

/**
 * Whether a nav item is the current one. `activeSection` is the /about section
 * in view ("projects" | "how-it-works" | null, from useActiveAboutSection), so
 * on /about exactly one of Showcase / How it works / About is marked: the
 * section being read, or "About" for the hero and the closing section.
 */
export function isNavActive(pathname, path, activeSection = null) {
  if (!pathname || !path) return false;
  const hash = path.indexOf("#");
  if (hash !== -1) {
    return isAboutPath(pathname) && path.slice(0, hash) === "/about" && path.slice(hash + 1) === activeSection;
  }
  if (path === "/about") return isAboutPath(pathname) && !activeSection;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
