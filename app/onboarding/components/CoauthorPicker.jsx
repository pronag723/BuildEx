"use client";

import { useEffect, useState } from "react";
import Avatar from "../../../lib/ui/Avatar";
import { publicAsset } from "../../home/utils";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { searchBuilders } from "../../../lib/works/edit";
import { Icon } from "../../../lib/icons";

export const COAUTHORS_MAX = 8;

// The people who built a work with you: BuildEx builders found by @handle
// (their name links to their profile), or anyone else by name ("feat. …").
// items: [{ key, coauthorId?, profile?, name?, role }]
export default function CoauthorPicker({ items, onChange, selfId }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const full = items.length >= COAUTHORS_MAX;

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      searchBuilders(term, selfId).then(({ builders }) => {
        if (!cancelled) setResults(builders.filter((b) => !items.some((i) => i.coauthorId === b.id)));
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, selfId, items]);

  const add = (item) => {
    if (full) return;
    onChange([...items, { key: `${Date.now()}-${Math.random()}`, role: "", ...item }]);
    setQuery("");
    setResults([]);
  };

  const update = (key, patch) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key) => onChange(items.filter((i) => i.key !== key));

  return (
    <div className="space-y-2.5">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2.5 rounded-xl bg-raised p-2">
              <Avatar
                src={item.profile?.avatarUrl ? publicAsset(item.profile.avatarUrl) : null}
                name={item.profile?.displayName || item.name}
                size={32}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {item.profile ? item.profile.displayName : t("profile.viewer.feat", { name: item.name })}
                </p>
                {item.profile && <p className="truncate text-xs text-ink-3">@{item.profile.username}</p>}
              </div>
              <input
                value={item.role || ""}
                onChange={(event) => update(item.key, { role: event.target.value.slice(0, 40) })}
                placeholder={t("account.workEditor.coauthorRole")}
                aria-label={t("account.workEditor.coauthorRole")}
                className="onb-input h-9 w-32 text-[13px] sm:w-40"
              />
              <button type="button" onClick={() => remove(item.key)} className="btn btn-ghost btn-icon btn-sm" aria-label={t("account.workEditor.removeCoauthor")}>
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 40))}
            placeholder={t("account.workEditor.coauthorSearch")}
            aria-label={t("account.workEditor.coauthorSearch")}
            className="onb-input"
          />
          {query.trim().length >= 2 && (
            <div className="menu-panel absolute inset-x-0 top-full z-10 mt-1 overflow-hidden p-1">
              {results.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => add({ coauthorId: b.id, profile: b })}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-line/[0.06]"
                >
                  <Avatar src={b.avatarUrl ? publicAsset(b.avatarUrl) : null} name={b.displayName} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{b.displayName}</span>
                  <span className="truncate text-xs text-ink-3">@{b.username}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => add({ name: query.trim().replace(/^@/, "") })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink-2 hover:bg-line/[0.06]"
              >
                <Icon name="plus" size={15} />
                {t("account.workEditor.coauthorAsText", { name: query.trim().replace(/^@/, "") })}
              </button>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-ink-3">{t("account.workEditor.coauthorHint", { max: COAUTHORS_MAX })}</p>
    </div>
  );
}
