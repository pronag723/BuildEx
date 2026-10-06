"use client";

// ─────────────────────────────────────────────────────────────────────────────
// A builder's public links. Used on the public profile and on the owner's
// account page so both show the same thing.
//
//   variant="buttons" (default) — a wrapping row of small link buttons.
//   variant="list"              — one row per link: platform on the left, the
//                                 handle on the right (the profile's contact
//                                 panel), under an optional `title`.
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

export default function SocialLinks({ contactLinks, className = "", variant = "buttons", title = null }) {
  const links = readContactLinks(contactLinks);
  const t = useT();

  // A builder with no published links renders nothing at all.
  if (links.length === 0) return null;

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
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((link) => {
        const label = `${t(`platforms.${link.type}.label`)}: ${link.text}`;
        return link.href ? (
          <a key={link.type} href={link.href} {...LINK_PROPS} className="social-link-btn" title={label}>
            <Icon name={link.icon} size={14} />
            <span>{link.text}</span>
          </a>
        ) : (
          <span key={link.type} className="social-link-btn select-text" title={label}>
            <Icon name={link.icon} size={14} />
            <span>{link.text}</span>
          </span>
        );
      })}
    </div>
  );
}
