"use client";

// The top of a channel. On a desktop: `# name`, the description, and on the
// right the channel search, the sort and the channel's one primary action. On
// a phone: a compact `← # name` bar, the search and sort on a second line, and
// the primary action as a floating button at the bottom right.
//
// With `thread` set (a topic is open) the header shows the channel on a
// desktop and `← <topic title>` on a phone, without tools or action.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import { withBase } from "../../home/utils";
import { CHANNELS, pushCommunity, ruleHref } from "./channels";

const BAR_TOP = "sticky top-[var(--header-h)] z-20 border-b border-line/[0.08] bg-canvas";

function SortControl({ sort }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("community.shell.sortAria")} className="segmented">
      {sort.options.map((key) => {
        const on = sort.value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => sort.onChange(key)}
          >
            {sort.labels[key]}
          </button>
        );
      })}
    </div>
  );
}

// `/` focuses it (CommunityPage); Esc inside it clears it. The desktop field
// shows the shortcut as a key cap while it is empty.
function SearchField({ search, className = "", showKey = false }) {
  const t = useT();
  return (
    <label className={`relative block ${className}`}>
      <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        data-channel-search=""
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && search.value) {
            e.preventDefault();
            search.onChange("");
          }
        }}
        placeholder={search.placeholder || t("community.shell.searchPlaceholder")}
        aria-label={t("community.shell.searchAria")}
        aria-keyshortcuts="/"
        className={`input h-9 pl-8 text-[13px] ${showKey ? "pr-8" : "pr-3"}`}
      />
      {showKey && !search.value && (
        <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 flex h-5 min-w-[1.25rem] -translate-y-1/2 items-center justify-center rounded border border-line/15 px-1 font-sans text-[11px] text-ink-3">
          /
        </kbd>
      )}
    </label>
  );
}

function ActionButton({ action, className = "" }) {
  if (!action) return null;
  const inner = (
    <>
      <Icon name={action.icon || "plus"} size={15} />
      {action.label}
    </>
  );
  return action.href ? (
    <Link href={action.href} className={`btn btn-primary btn-sm ${className}`}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={action.onClick} className={`btn btn-primary btn-sm ${className}`}>
      {inner}
    </button>
  );
}

// The phone's floating action button, rendered on body so it is never caught
// in a transformed or clipped ancestor.
function Fab({ action }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !action) return null;
  const cls =
    "fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-pop transition-transform active:scale-95 lg:hidden";
  const style = { bottom: "max(1rem, env(safe-area-inset-bottom))" };
  return createPortal(
    action.href ? (
      <Link href={action.href} aria-label={action.label} title={action.label} style={style} className={cls}>
        <Icon name={action.icon || "plus"} size={24} />
      </Link>
    ) : (
      <button type="button" onClick={action.onClick} aria-label={action.label} title={action.label} style={style} className={cls}>
        <Icon name={action.icon || "plus"} size={24} />
      </button>
    ),
    document.body
  );
}

// The phone's compact bar: a 44px back target and a title.
export function MobileBar({ onBack, children, right }) {
  const t = useT();
  return (
    <div className={`${BAR_TOP} flex h-12 items-center gap-1 px-2 lg:hidden`}>
      <button type="button" onClick={onBack} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-line/[0.06] hover:text-ink" aria-label={t("community.shell.back")}>
        <Icon name="arrowLeft" size={20} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold">{children}</div>
      {right}
    </div>
  );
}

// "Channel rules": opens the rules channel at this channel's own section.
function RulesLink({ rule, compact = false }) {
  const t = useT();
  const href = ruleHref(rule);
  return (
    <a
      href={withBase(href)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        pushCommunity(href);
      }}
      title={t("community.rules.channelRules")}
      aria-label={t("community.rules.channelRules")}
      className={
        compact
          ? "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-line/[0.06] hover:text-ink"
          : "inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-3 transition-colors hover:bg-line/[0.06] hover:text-ink"
      }
    >
      <Icon name="shield" size={compact ? 18 : 15} />
      {!compact && <span className="hidden xl:inline">{t("community.rules.channelRulesShort")}</span>}
    </a>
  );
}

/**
 * @param {object} p
 * @param {string} p.channel  a key of CHANNELS
 * @param {() => void} p.onBack  the phone's back
 * @param {{ value, onChange, placeholder? }} [p.search]
 * @param {{ value, options: string[], labels: Record<string,string>, onChange }} [p.sort]
 * @param {{ label, icon?, href?, onClick? }} [p.action]
 * @param {string} [p.thread]  an open topic's title
 */
export default function ChannelHeader({ channel, onBack, search, sort, action, thread = null }) {
  const t = useT();
  const c = CHANNELS[channel];
  const name = t(`community.channels.${channel}.slug`);
  const description = t(`community.channels.${channel}.description`);
  const tools = !thread && (search || sort);

  return (
    <>
      {/* Desktop */}
      <header className={`${BAR_TOP} hidden lg:block`}>
        <div className="flex min-h-[3.5rem] items-center gap-3 px-6">
          <h1 className="flex min-w-0 flex-shrink-0 items-center gap-1 text-[15px] font-semibold">
            <Icon name="hash" size={18} className="text-ink-3" />
            <span className="truncate">{name}</span>
          </h1>
          <span className="h-5 w-px flex-shrink-0 bg-line/10" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[13px] text-ink-3" title={description}>
            {description}
          </p>
          {!thread && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {c?.rule && <RulesLink rule={c.rule} />}
              {search && <SearchField search={search} className="w-44 xl:w-56" showKey />}
              {sort && <SortControl sort={sort} />}
              <ActionButton action={action} />
            </div>
          )}
        </div>
      </header>

      {/* Phone */}
      {thread ? (
        <MobileBar onBack={onBack}>
          <span className="truncate">{thread}</span>
        </MobileBar>
      ) : (
        <div className={`${BAR_TOP} lg:hidden`}>
          <div className="flex h-12 items-center gap-1 px-2">
            <button type="button" onClick={onBack} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-line/[0.06] hover:text-ink" aria-label={t("community.shell.back")}>
              <Icon name="arrowLeft" size={20} />
            </button>
            <h1 className="flex min-w-0 flex-1 items-center gap-1 text-[15px] font-semibold">
              <Icon name={c?.icon || "hash"} size={17} className="flex-shrink-0 text-ink-3" />
              <span className="truncate">{name}</span>
            </h1>
            {c?.rule && <RulesLink rule={c.rule} compact />}
          </div>
          {tools && (
            <div className="flex items-center gap-2 px-4 pb-2.5">
              {search && <SearchField search={search} className="min-w-0 flex-1" />}
              {sort && <SortControl sort={sort} />}
            </div>
          )}
        </div>
      )}
      {!thread && <Fab action={action} />}
    </>
  );
}
