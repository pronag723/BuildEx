"use client";

// ─────────────────────────────────────────────────────────────────────────────
// A builder's public links. Used on the public profile and on the owner's
// account page so both show the same thing.
//
//   variant="buttons" (default) — a grid of tiles (two columns on a phone):
//                                 the platform's tinted icon, its name and
//                                 the handle.
//   variant="list"              — one row per link: platform on the left, the
//                                 handle on the right (the profile's contact
//                                 panel), under an optional `title`.
//
// The owner's editor uses the tiles too: with `onItemClick` each tile is a
// button that opens that link's editor (`selectedType` rings the open one),
// and `addTile` is appended as the last cell. It renders even with no links,
// so the editor can offer "Add a contact link".
//
// SECURITY. These values are typed by the builder and shown to every visitor.
// `readContactLinks` (lib/onboarding/contactLinks.js) has already re-validated
// them and computed `href`, which is null unless the value can safely become a
// URL — a Discord username, for example, gets no anchor at all and renders as
// plain text. React escapes the label, and every anchor carries
// rel="noopener noreferrer nofollow" so it leaks no referrer, hands over no
// window reference and passes no ranking signal off the site.
// ─────────────────────────────────────────────────────────────────────────────

import { Icon } from "../../../lib/icons";
import { readContactLinks } from "../../../lib/onboarding/contactLinks";
import { useT } from "../../../lib/i18n/LanguageProvider";

const LINK_PROPS = { target: "_blank", rel: "noopener noreferrer nofollow" };

// Each platform's colour as an RGB triplet, tinting its tile's icon so the
// links read at a glance. Monochrome brands follow the ink colour.
export const PLATFORM_TINTS = {
  discord: "88 101 242",
  telegram: "42 171 238",
  youtube: "255 0 51",
  twitch: "145 70 255",
  tiktok: "var(--ink)",
  instagram: "225 48 108",
  x: "var(--ink)",
  other: "var(--accent-ink)",
};

export default function SocialLinks({
  contactLinks,
  className = "",
  variant = "buttons",
  title = null,
  onItemClick = null,
  selectedType = null,
  addTile = null,
}) {
  const links = readContactLinks(contactLinks);
  const t = useT();

  // A builder with no published links renders nothing at all.
  if (links.length === 0 && !addTile) return null;

  if (variant === "list") {
    return (
      <div className={className}>
        {title && <p className="mb-1.5 text-[13px] font-medium text-ink-3">{title}</p>}
        <ul>
          {links.map((link) => {
            const platform = t(`platforms.${link.type}.label`);
            const body = (
              <>
                <Icon name={link.icon} size={16} className="flex-shrink-0 text-ink-3" />
                <span className="flex-shrink-0 text-ink">{platform}</span>
                <span className="ml-auto min-w-0 truncate text-right text-ink-3">{link.text}</span>
                {link.href && <Icon name="external" size={13} className="flex-shrink-0 text-ink-3" />}
              </>
            );
            return (
              <li key={link.type}>
                {link.href ? (
                  <a href={link.href} {...LINK_PROPS} className="social-link-row" title={`${platform}: ${link.text}`}>
                    {body}
                  </a>
                ) : (
                  // Nothing safe to link to — shown as copyable text instead of
                  // inventing a destination.
                  <span className="social-link-row select-text" title={`${platform}: ${link.text}`}>
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <ul className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${className}`}>
      {links.map((link) => {
        const platform = t(`platforms.${link.type}.label`);
        const body = (
          <>
            <span className="social-tile-icon">
              <Icon name={link.icon} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] leading-tight text-ink-3">{platform}</span>
              <span className="mt-0.5 block truncate text-[13px] font-semibold leading-tight text-ink">{link.text}</span>
            </span>
          </>
        );
        const props = {
          className: "social-tile",
          title: `${platform}: ${link.text}`,
          style: { "--tint": PLATFORM_TINTS[link.type] || PLATFORM_TINTS.other },
        };
        return (
          // An odd last tile takes the whole row on a phone, so the grid never
          // ends on a half-empty line.
          <li key={link.type} className="min-w-0 last:odd:col-span-2 sm:last:odd:col-span-1">
            {onItemClick ? (
              <button
                type="button"
                onClick={() => onItemClick(link)}
                aria-label={t("account.editor.links.edit", { platform })}
                className={`${props.className} w-full text-left ${
                  selectedType === link.type ? "ring-2 ring-accent" : ""
                }`}
                style={props.style}
              >
                {body}
              </button>
            ) : link.href ? (
              <a href={link.href} {...LINK_PROPS} {...props}>
                {body}
              </a>
            ) : (
              <span {...props} className={`${props.className} select-text`}>
                {body}
              </span>
            )}
          </li>
        );
      })}
      {addTile && <li className="min-w-0 last:odd:col-span-2 sm:last:odd:col-span-1">{addTile}</li>}
    </ul>
  );
}
