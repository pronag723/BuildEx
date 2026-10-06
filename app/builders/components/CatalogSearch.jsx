"use client";

import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

export default function CatalogSearch({ query, onQueryChange }) {
  const t = useT();

  return (
    <div className="relative min-w-0 flex-1">
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
      />

      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t("catalog.searchPlaceholder")}
        className="input h-11 bg-surface pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
        aria-label={t("catalog.searchAria")}
        enterKeyHint="search"
      />

      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-line/[0.08] hover:text-ink transition-colors"
          aria-label={t("catalog.clearSearch")}
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
