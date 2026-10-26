"use client";

import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { daysRange, formatPrice } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";

/** "2–4 days" for a tier's duration, or null when it has none. */
export function tierDuration(tier, t) {
  const range = daysRange(tier.daysMin, tier.daysMax);
  return range ? t("profile.prices.days", { count: range.count, range: range.text }) : null;
}

// The builder's own price list. Prices are "from" figures the builder set;
// the real price is agreed with them in chat and paid to them directly.
export default function PriceList({ tiers }) {
  const t = useT();

  if (tiers.length === 0) {
    return (
      <div className="block-grid flex min-h-[10rem] items-center justify-center rounded-xl px-6 text-center text-sm text-ink-3">
        {t("profile.prices.empty")}
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
        {tiers.map((tier) => {
          const duration = tierDuration(tier, t);
          return (
            <div key={tier.id} className="card flex items-start gap-3 p-4 lg:p-[18px]">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{tier.name}</p>
                {tier.description && (
                  <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-ink-2">
                    {tier.description}
                  </p>
                )}
                {duration && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-3">
                    <Icon name="clock" size={13} /> {duration}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-[11px] text-ink-3">{t("profile.prices.from")}</p>
                <p className="font-mark text-xl font-bold text-accent-ink">
                  {formatPrice(tier.priceFromCents, t.lang)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{t("profile.prices.note")}</p>
    </div>
  );
}
