"use client";

import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatRub, shortDate, sizeText } from "../../../lib/orders/brief.mjs";

// The open order, pinned under the thread header: what, how much, where it
// stands, by when. A tap scrolls to its card. Only shown while an order is
// open; finished ones live in the thread.
export default function OrderStrip({ order }) {
  const t = useT();
  if (!order) return null;
  const b = order.brief || {};
  const what = [b.build_type ? t(`buildTypes.${b.build_type}`) : null, sizeText(b)].filter(Boolean).join(" ");
  const price = order.price_rub ? formatRub(order.price_rub, t.lang) : null;
  const until = order.deadline ? t("orders.brief.until", { date: shortDate(order.deadline, t.lang) }) : null;

  return (
    <button
      type="button"
      onClick={() => document.getElementById(`order-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      className="flex h-10 w-full flex-shrink-0 items-center gap-2 border-b border-line/[0.08] px-3 text-left text-[13px] transition-colors hover:bg-line/[0.04] sm:px-4"
    >
      <span className="font-medium text-ink">{t("orders.strip.label")}</span>
      <span className="min-w-0 truncate text-ink-2">
        {[what || b.title, price].filter(Boolean).join(" · ")}
      </span>
      <span className="tag ml-auto flex-shrink-0 gap-1.5">
        {order.status === "in_progress" && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
        {t(`orders.status.${order.status}`)}
      </span>
      {until && <span className="hidden flex-shrink-0 text-xs text-ink-3 sm:inline">{until}</span>}
      <Icon name="chevronDown" size={14} className="flex-shrink-0 text-ink-3" />
    </button>
  );
}
