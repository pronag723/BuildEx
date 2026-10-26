"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../../lib/icons";
import { CONTACT_LINKS_MAX } from "../../../../lib/onboarding/contactLinks";
import { PLATFORM_TINTS } from "../../../builders/components/SocialLinks";
import { withBase } from "../../../home/utils";
import { PenGlyph } from "./EditZone";

const COPIED_MS = 1600;

// The owner's desktop sidebar: their contact links, each row opening its
// editor in place, and the public link to their profile with a Copy button.
// Where the visitor's sidebar has "Message builder", the owner has these.
export default function OwnerSidebar({ links, editingType, linkEditor, onEditLink, onAddLink, username }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => window.clearTimeout(timer.current);
  }, []);

  const url = `${origin}${withBase(`/builders/profile/?u=${encodeURIComponent(username || "")}`)}`;
  const shownUrl = url.replace(/^https?:\/\//, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const adding = editingType === "new";

  return (
    <div className="builder-sidebar-sticky space-y-3.5">
      <div className="card p-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">{t("account.editor.links.title")}</span>
          <span className="text-xs text-ink-3">{t("account.editor.links.count", { n: links.length, max: CONTACT_LINKS_MAX })}</span>
        </div>

        {links.length > 0 && (
          <ul className="mt-2.5 flex flex-col gap-0.5">
            {links.map((link) => {
              const platform = t(`platforms.${link.type}.label`);
              const open = editingType === link.type;
              return (
                <li key={link.type}>
                  <button
                    type="button"
                    onClick={() => onEditLink(link)}
                    aria-label={t("account.editor.links.edit", { platform })}
                    aria-expanded={open}
                    className={`edit-row flex w-full items-center gap-3 rounded-xl p-2 text-left ${open ? "ring-2 ring-accent" : ""}`}
                    style={{ "--tint": PLATFORM_TINTS[link.type] || PLATFORM_TINTS.other }}
                  >
                    <span className="social-tile-icon h-[38px] w-[38px] rounded-[11px]">
                      <Icon name={link.icon} size={18} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs text-ink-3">{platform}</span>
                      <span className="truncate text-[14.5px] font-semibold text-ink">{link.text}</span>
                    </span>
                    <PenGlyph size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {linkEditor}

        {!adding && links.length < CONTACT_LINKS_MAX && (
          <button
            type="button"
            onClick={onAddLink}
            className="mt-2 flex h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/20 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-line/[0.05] hover:text-ink"
          >
            <Icon name="plus" size={15} strokeWidth={2.5} />
            {t("account.editor.links.add")}
          </button>
        )}
      </div>

      <div className="card p-[18px]">
        <span className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">{t("account.editor.profileLink.title")}</span>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex h-10 min-w-0 flex-1 items-center truncate rounded-[10px] border border-line/[0.08] bg-line/[0.04] px-3 text-[13.5px] text-ink-2">
            <span className="truncate">{shownUrl}</span>
          </span>
          <button type="button" onClick={copy} className="btn btn-secondary h-10 flex-shrink-0 px-3" aria-live="polite">
            <Icon name={copied ? "check" : "copy"} size={15} strokeWidth={copied ? 2.6 : 2} className={copied ? "text-accent-ink" : ""} />
            {copied ? t("account.editor.profileLink.copied") : t("account.editor.profileLink.copy")}
          </button>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">{t("account.editor.profileLink.hint")}</p>
      </div>
    </div>
  );
}
