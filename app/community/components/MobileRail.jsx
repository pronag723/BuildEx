"use client";

// The phone's navigation screen, like mobile Discord: a narrow column of
// rounded "space" tiles on the left (home, Showcase, Looking for a builder,
// Discussions, Mine), and on the right the space's title, a search field and
// its channels by category. The active tile gets a bar on its left edge and
// squarer corners.

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import { SPACES } from "./channels";
import { CategoryList } from "./CommunitySidebar";
import { spaceHasUnread, useUnread } from "./unread";

// The left bar is Discord's: tall on the active space, a short pill on one
// with something new. A dot on the tile's corner says the same at a glance.
function RailTile({ space, active, onPick }) {
  const t = useT();
  const { status } = useAuth();
  const isNew = spaceHasUnread(space.key, status === "authenticated", useUnread());
  const label = t(`community.spaces.${space.key}`);
  return (
    <div className="relative flex w-full justify-center py-1">
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-ink transition-all motion-reduce:transition-none ${
          active ? "h-9 opacity-100" : isNew ? "h-2 opacity-100" : "h-2 opacity-0"
        }`}
      />
      <button
        type="button"
        onClick={() => onPick(space.key)}
        aria-pressed={active}
        aria-label={isNew ? `${label}, ${t("community.shell.unread")}` : label}
        title={label}
        className={`relative flex h-12 w-12 items-center justify-center transition-[border-radius,background-color,color] duration-150 motion-reduce:transition-none ${
          active ? "rounded-2xl bg-accent text-accent-fg" : "rounded-[1.5rem] bg-raised text-ink-2 hover:rounded-2xl hover:bg-line/[0.12] hover:text-ink"
        }`}
      >
        <Icon name={space.icon} size={22} />
        {isNew && !active && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-canvas" />}
      </button>
    </div>
  );
}

export function MobileChannelList({ space, active, onGo }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [filter, setFilter] = useState("");
  const spec = SPACES.find((s) => s.key === space) || SPACES[0];

  return (
    <div className="min-w-0 flex-1 rounded-tl-2xl border-l border-t border-line/[0.08] bg-surface px-3 pb-8 pt-4">
      <h1 className="px-1 text-lg font-semibold">{t(`community.spaces.${spec.key}`)}</h1>
      <p className="mt-0.5 px-1 text-[13px] text-ink-3">{t(`community.spaceAbout.${spec.key}`)}</p>
      {spec.auth && !signedIn ? (
        <div className="mt-6 rounded-xl border border-dashed border-line/15 px-4 py-8 text-center">
          <p className="text-sm font-medium">{t("community.shell.mineGuestTitle")}</p>
          <p className="mt-1 text-xs text-ink-3">{t("community.shell.mineGuestBody")}</p>
          <Link href={`/login?redirect=${encodeURIComponent("/community")}`} className="btn btn-primary btn-sm mt-4">
            {t("community.shell.signIn")}
          </Link>
        </div>
      ) : (
        <>
          <label className="relative mt-3 block">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("community.shell.findChannel")}
              aria-label={t("community.shell.findChannel")}
              className="input h-10 pl-9"
            />
          </label>
          <div className="mt-4">
            <CategoryList space={spec.key} active={active} onGo={onGo} filter={filter} />
          </div>
        </>
      )}
    </div>
  );
}

export default function MobileRail({ space, onPickSpace, active, onGo }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const spaces = SPACES.filter((s) => !s.auth || signedIn);

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] lg:hidden">
      <nav aria-label={t("community.shell.spacesAria")} className="flex w-[68px] flex-shrink-0 flex-col items-stretch pt-3">
        {spaces.map((s, i) => (
          <div key={s.key}>
            {i === 1 && <div className="mx-auto my-1 h-px w-8 bg-line/10" aria-hidden="true" />}
            <RailTile space={s} active={space === s.key} onPick={onPickSpace} />
          </div>
        ))}
      </nav>
      <MobileChannelList space={space} active={active} onGo={onGo} />
    </div>
  );
}
