"use client";

import { ITEMS_PER_PAGE } from "../data/builders";
import { useT } from "../../../lib/i18n/LanguageProvider";

export default function PaginationControls({ total, shown, onLoadMore }) {
  const t = useT();
  if (total === 0) return null;

  const hasMore = shown < total;
  const remaining = total - shown;

  return (
    <div className="mt-10 flex flex-col items-center gap-3 sm:mt-14">
      {hasMore ? (
        <>
          <button type="button" onClick={onLoadMore} className="btn btn-secondary btn-lg px-6">
            {t("catalog.loadMore", { n: Math.min(remaining, ITEMS_PER_PAGE) })}
          </button>
          <p className="text-xs text-ink-3 tabular-nums">
            {t("catalog.showing", { count: total, shown, total })}
          </p>
        </>
      ) : (
        <p className="text-xs text-ink-3">{t("catalog.seenAll")}</p>
      )}
    </div>
  );
}
