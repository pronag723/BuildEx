"use client";

// ─────────────────────────────────────────────────────────────────────────────
// A builder's public links, rendered as buttons. Used on the public profile
// and on the owner's account page so both show the same thing.
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

export default function SocialLinks({ contactLinks, className = "" }) {
  const links = readContactLinks(contactLinks);

  // A builder with no published links renders nothing at all. The `emptyHint`
  // prop that used to print an apology here went with the rest of the
  // explanatory copy — an absent row of buttons needs no caption.
  if (links.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((link) =>
        link.href ? (
          <a
            key={link.type}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="social-link-btn"
            title={`${link.label}: ${link.text}`}
          >
            <Icon name={link.icon} size={14} />
            <span>{link.text}</span>
          </a>
        ) : (
          // Nothing safe to link to — show it as copyable text instead of
          // inventing a destination.
          <span
            key={link.type}
            className="social-link-btn"
            title={`${link.label}: ${link.text}`}
          >
            <Icon name={link.icon} size={14} />
            <span>{link.text}</span>
          </span>
        )
      )}
    </div>
  );
}
