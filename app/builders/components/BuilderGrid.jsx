"use client";

import BuilderCard from "./BuilderCard";
import { useT } from "../../../lib/i18n/LanguageProvider";

const GRID = "grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3";

// Placeholder card with the real card's proportions, so the page doesn't
// jump when the feed arrives.
function CardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="aspect-[4/3] skeleton" />
      <div className="space-y-2.5 p-3 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg skeleton sm:h-9 sm:w-9" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded skeleton" />
            <div className="h-2.5 w-1/3 rounded skeleton" />
          </div>
        </div>
        <div className="h-2.5 w-full rounded skeleton" />
      </div>
    </div>
  );
}

export default function BuilderGrid({ builders, loading = false, hasNarrowing = false, onClearAll }) {
  const t = useT();

  if (loading) {
    return (
      <div className={GRID} role="status" aria-label={t("catalog.loading")}>
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (builders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line/15 px-6 py-14 text-center sm:py-20">
        <h3 className="text-base font-semibold">
          {hasNarrowing ? t("catalog.emptyTitle") : t("catalog.emptyDirectory")}
        </h3>
        {hasNarrowing && (
          <>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-2">{t("catalog.emptyBody")}</p>
            <button type="button" onClick={onClearAll} className="btn btn-secondary btn-sm mt-5">
              {t("catalog.clearFilters")}
            </button>
          </>
        )}
      </div>
    );
  }

  // Two per row on every width: a phone used to show one card at a time, which
  // turned browsing into scrolling past one builder per screen.
  return (
    <div className={GRID}>
      {builders.map((builder) => (
        <BuilderCard key={builder.username} builder={builder} />
      ))}
    </div>
  );
}
