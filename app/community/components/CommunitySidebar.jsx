"use client";

// The desktop channel sidebar: the server name, categories that fold, one row
// per channel, and at the bottom the viewer (avatar, name, a link to their
// account) or a sign-in button.

import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { CHANNELS, categoriesFor, useCollapsedCategories } from "./channels";

export function ChannelRow({ channelKey, active, onGo, dense = false }) {
  const t = useT();
  const c = CHANNELS[channelKey];
  const label = t(`community.channels.${channelKey}.slug`);
  const base = `flex w-full items-center gap-2 rounded-lg px-2 text-left transition-colors ${dense ? "h-8 text-[13.5px]" : "h-11 text-sm"} ${
    active ? "bg-line/[0.08] font-medium text-ink" : "text-ink-2 hover:bg-line/[0.05] hover:text-ink"
  }`;
  const inner = (
    <>
      <Icon name={c.icon} size={dense ? 15 : 17} className={`flex-shrink-0 ${active ? "text-ink" : "text-ink-3"}`} />
      <span className="truncate">{label}</span>
      {c.href && <Icon name="external" size={12} className="ml-auto flex-shrink-0 text-ink-3" />}
    </>
  );
  if (c.href) {
    return (
      <Link href={c.href} className={base}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onGo(channelKey)} aria-current={active ? "page" : undefined} className={base}>
      {inner}
    </button>
  );
}

export function CategoryList({ space = "home", active, onGo, dense = false, filter = "" }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [collapsed, toggle] = useCollapsedCategories();
  const q = filter.trim().toLowerCase();
  const categories = categoriesFor(space, signedIn)
    .map((cat) => ({
      ...cat,
      channels: q
        ? cat.channels.filter((k) =>
            [t(`community.channels.${k}.slug`), t(`community.channels.${k}.name`), t(`community.channels.${k}.description`)]
              .join(" ")
              .toLowerCase()
              .includes(q)
          )
        : cat.channels,
    }))
    .filter((cat) => cat.channels.length > 0);

  if (categories.length === 0) {
    return <p className="px-2 py-6 text-center text-xs text-ink-3">{t("community.shell.noChannels")}</p>;
  }

  return (
    <div className={dense ? "space-y-3" : "space-y-4"}>
      {categories.map((cat) => {
        const folded = !q && collapsed.includes(cat.key);
        return (
          <div key={cat.key}>
            <button
              type="button"
              onClick={() => toggle(cat.key)}
              aria-expanded={!folded}
              className="flex h-7 w-full items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-2"
            >
              <Icon name="chevronDown" size={12} className={`transition-transform ${folded ? "-rotate-90" : ""}`} />
              {t(`community.categories.${cat.key}`)}
            </button>
            {!folded && (
              <div className="mt-0.5 space-y-0.5">
                {cat.channels.map((k) => (
                  <ChannelRow key={k} channelKey={k} active={active === k} onGo={onGo} dense={dense} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CommunitySidebar({ active, onGo }) {
  const t = useT();
  const { status, displayUser } = useAuth();
  const signedIn = status === "authenticated";

  return (
    <aside
      aria-label={t("community.navAria")}
      className="sticky top-[var(--header-h)] hidden h-[calc(100dvh-var(--header-h))] w-60 flex-shrink-0 flex-col border-r border-line/[0.08] lg:flex"
    >
      <div className="flex h-14 flex-shrink-0 items-center border-b border-line/[0.08] px-4">
        <p className="truncate text-[15px] font-semibold">{t("community.shell.title")}</p>
      </div>
      <nav className="bx-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <CategoryList space="home" active={active} onGo={onGo} dense />
      </nav>
      <div className="flex-shrink-0 border-t border-line/[0.08] p-2">
        {signedIn && displayUser ? (
          <Link href="/account" className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-line/[0.05]">
            <Avatar src={displayUser.avatarUrl} name={displayUser.displayName} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{displayUser.displayName}</span>
              <span className="block truncate text-[11px] text-ink-3">
                {displayUser.username ? `@${displayUser.username}` : t("community.shell.account")}
              </span>
            </span>
            <Icon name="chevronRight" size={14} className="flex-shrink-0 text-ink-3" />
          </Link>
        ) : status === "loading" ? (
          <div className="h-12 rounded-lg skeleton" />
        ) : (
          <Link href={`/login?redirect=${encodeURIComponent("/community")}`} className="btn btn-secondary btn-sm w-full">
            {t("community.shell.signIn")}
          </Link>
        )}
      </div>
    </aside>
  );
}
