"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { styleChipLabel } from "../../../lib/i18n/labels.mjs";
import { formatTime } from "../../../lib/i18n/format.mjs";
import { chatImageUrl } from "../../../lib/chat/api";
import { fetchWork } from "../../../lib/works/api";
import { budgetText, DECLINE_REASONS, formatRub, shortDate, sizeText } from "../../../lib/orders/brief.mjs";

// ─── The brief itself ────────────────────────────────────────────────────────
// Shared by the card in the thread and the live preview in the brief builder,
// so the builder sees exactly what the client is about to send.

function RefThumb({ item }) {
  const t = useT();
  const [workCover, setWorkCover] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (item.kind === "work" && item.work_id) {
      fetchWork(item.work_id).then(({ work }) => {
        if (!cancelled) setWorkCover(work?.photos?.[0]?.url || null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [item.kind, item.work_id]);

  if (item.kind === "link") {
    let host = item.url;
    try {
      host = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      // keep the raw value
    }
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex h-14 max-w-[9rem] items-center gap-1.5 rounded-lg border border-line/[0.09] bg-raised px-2.5 text-xs text-ink-2 hover:text-ink"
        title={item.url}
      >
        <Icon name="link" size={13} className="flex-shrink-0" />
        <span className="truncate">{host}</span>
      </a>
    );
  }
  const src = item.kind === "photo" ? chatImageUrl({ path: item.path }) : workCover;
  return (
    <span className="relative block h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-line/[0.09] bg-raised">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={t("orders.brief.reference")} className="h-full w-full object-cover" loading="lazy" />
      )}
    </span>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="truncate text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

export function BriefSummary({ brief, order = null }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (!brief) return null;
  const type = brief.build_type ? t(`buildTypes.${brief.build_type}`) : null;
  const size = sizeText(brief);
  const version = [brief.edition === "bedrock" ? "Bedrock" : brief.edition ? "Java" : null, brief.mc_version]
    .filter(Boolean)
    .join(" ");
  const budget = budgetText(brief, t.lang, t);
  const agreed = order?.price_rub && ["in_progress", "delivered", "completed"].includes(order.status);
  const refs = Array.isArray(brief.refs) ? brief.refs : [];
  const desc = (brief.description || "").trim();
  const long = desc.length > 220;

  return (
    <div className="min-w-0">
      <h3 className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">
        {brief.title || type || t("orders.brief.untitled")}
      </h3>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {type && <span className="tag">{type}</span>}
        {(brief.styles || []).map((s) => (
          <span key={s} className="tag">
            {styleChipLabel(s, t.lang)}
          </span>
        ))}
        {size && <span className="tag">{size}</span>}
        {version && <span className="tag">{version}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {agreed ? (
          <Field label={t("orders.brief.price")} value={formatRub(order.price_rub, t.lang)} />
        ) : (
          <Field label={t("orders.brief.budget")} value={budget || t("orders.brief.noBudget")} />
        )}
        <Field
          label={t("orders.brief.deadline")}
          value={
            agreed && order.deadline
              ? t("orders.brief.until", { date: shortDate(order.deadline, t.lang) })
              : brief.deadline
                ? t("orders.brief.until", { date: shortDate(brief.deadline, t.lang) })
                : t("orders.brief.noRush")
          }
        />
        <Field label={t("orders.brief.delivery")} value={brief.delivery ? t(`orders.delivery.${brief.delivery}`) : null} />
      </dl>
      {refs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {refs.slice(0, 5).map((item, i) => (
            <RefThumb key={`${item.kind}-${item.path || item.work_id || item.url}-${i}`} item={item} />
          ))}
          {refs.length > 5 && (
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-raised text-xs text-ink-2">
              +{refs.length - 5}
            </span>
          )}
        </div>
      )}
      {desc && (
        <p
          className={`mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2 ${
            long && !expanded ? "line-clamp-3" : ""
          }`}
        >
          {desc}
        </p>
      )}
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-ink-2 hover:text-ink"
        >
          {expanded ? t("orders.brief.collapse") : t("orders.brief.expand")}
        </button>
      )}
      {expanded && brief.extra && (
        <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-3">{brief.extra}</p>
      )}
    </div>
  );
}

// ─── Review after a completed order ──────────────────────────────────────────

const BODY_MIN = 20;
const BODY_MAX = 1500;

function StarPicker({ value, onChange }) {
  const t = useT();
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label={t("profile.reviews.rating")}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("profile.reviews.ratingValue", { n })}
          onClick={() => onChange(n)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-line/[0.06] ${
            n <= value ? "text-warn" : "text-line/35"
          }`}
        >
          <Icon name="star" size={20} filled={n <= value} />
        </button>
      ))}
    </div>
  );
}

function ReviewBlock({ order, peerName, review, onReview }) {
  const t = useT();
  const [rating, setRating] = useState(review?.rating || 0);
  const [body, setBody] = useState(review?.body || "");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!review || review.order_id !== order.id);

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <Icon name="check" size={15} className="text-accent-ink" />
        <span className="flex-1">{t("orders.review.thanks")}</span>
        <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
          {t("orders.review.edit")}
        </button>
      </div>
    );
  }

  const trimmed = body.trim();
  const ok = rating > 0 && trimmed.length >= BODY_MIN && trimmed.length <= BODY_MAX;
  return (
    <div>
      <p className="text-sm font-semibold">{t("orders.review.title", { name: peerName })}</p>
      <div className="mt-1.5">
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
        rows={3}
        placeholder={t("orders.review.placeholder")}
        className="input mt-2 h-auto resize-none py-2.5 text-[13px]"
      />
      <div className="mt-2 flex items-center gap-3">
        <p className="flex-1 text-[11px] text-ink-3">
          {trimmed.length < BODY_MIN ? t("orders.review.min", { n: BODY_MIN - trimmed.length }) : t("orders.review.where")}
        </p>
        <button
          type="button"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            const { error } = (await onReview(rating, trimmed)) || {};
            setBusy(false);
            if (!error) setEditing(false);
          }}
          className="btn btn-primary btn-sm"
        >
          {t("orders.review.send")}
        </button>
      </div>
    </div>
  );
}

// ─── The card in the thread ──────────────────────────────────────────────────

// Labels: `orders.status.<status>`.
function StatusTag({ status }) {
  const t = useT();
  const live = status === "in_progress";
  return (
    <span
      className={`tag gap-1.5 ${status === "cancelled" || status === "declined" ? "text-ink-3" : ""}`}
    >
      {live && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
      {status === "completed" && <Icon name="check" size={12} />}
      {t(`orders.status.${status}`)}
    </span>
  );
}

/**
 * The brief card with the order's current state and the actions open to the
 * viewer. `role` is "client" or "builder". Handlers come from the page; each
 * resolves to { error } and the page shows the toast and refreshes orders.
 */
export default function BriefCard({ order, message, role, peerName, review, actions }) {
  const t = useT();
  const brief = order?.brief;
  if (!order || !brief) {
    // The card arrived before its order did (realtime outran the fetch).
    return (
      <div className="card my-2 max-w-md p-4">
        <div className="h-4 w-1/2 rounded skeleton" />
        <div className="mt-3 h-3 w-3/4 rounded skeleton" />
      </div>
    );
  }
  const s = order.status;
  const closed = s === "cancelled" || s === "declined";
  const mineAsClient = role === "client";
  const remindedRecently =
    order.last_reminded_at && Date.now() - new Date(order.last_reminded_at).getTime() < 24 * 3600 * 1000;

  let footer = null;
  if (s === "pending" && role === "builder") {
    footer = (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => actions.take(order)} className="btn btn-primary btn-sm">
          {t("orders.actions.take")}
        </button>
        <button type="button" onClick={actions.ask} className="btn btn-secondary btn-sm">
          {t("orders.actions.ask")}
        </button>
        <button type="button" onClick={() => actions.decline(order)} className="btn btn-ghost btn-sm">
          {t("orders.actions.decline")}
        </button>
      </div>
    );
  } else if (s === "pending") {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-3">{t("orders.hints.waitingBuilder")}</p>
        <button type="button" onClick={() => actions.edit(order)} className="btn btn-secondary btn-sm">
          {t("orders.actions.edit")}
        </button>
        <button type="button" onClick={() => actions.cancel(order)} className="btn btn-ghost btn-sm">
          {t("orders.actions.cancel")}
        </button>
      </div>
    );
  } else if (s === "offered" && mineAsClient) {
    footer = (
      <div>
        <p className="text-[13px] text-ink">
          {t("orders.hints.offer", {
            name: peerName,
            price: formatRub(order.price_rub, t.lang),
            date: shortDate(order.deadline, t.lang),
          })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => actions.answer(order, true)} className="btn btn-primary btn-sm">
            {t("orders.actions.accept")}
          </button>
          <button type="button" onClick={() => actions.answer(order, false)} className="btn btn-secondary btn-sm">
            {t("orders.actions.reject")}
          </button>
        </div>
      </div>
    );
  } else if (s === "offered") {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-3">
          {t("orders.hints.offerSent", {
            price: formatRub(order.price_rub, t.lang),
            date: shortDate(order.deadline, t.lang),
          })}
        </p>
        <button type="button" onClick={() => actions.cancel(order)} className="btn btn-ghost btn-sm">
          {t("orders.actions.cancel")}
        </button>
      </div>
    );
  } else if (s === "in_progress") {
    footer = (
      <div className="flex flex-wrap gap-2">
        {mineAsClient ? (
          <button type="button" onClick={() => actions.complete(order)} className="btn btn-primary btn-sm">
            {t("orders.actions.complete")}
          </button>
        ) : (
          <button type="button" onClick={() => actions.deliver(order)} className="btn btn-secondary btn-sm">
            {t("orders.actions.deliver")}
          </button>
        )}
        <button type="button" onClick={() => actions.cancel(order)} className="btn btn-ghost btn-sm">
          {t("orders.actions.cancel")}
        </button>
      </div>
    );
  } else if (s === "delivered") {
    footer = mineAsClient ? (
      <div>
        <p className="text-[13px] text-ink">{t("orders.hints.delivered", { name: peerName })}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => actions.complete(order)} className="btn btn-primary btn-sm">
            {t("orders.actions.complete")}
          </button>
          <button type="button" onClick={actions.ask} className="btn btn-secondary btn-sm">
            {t("orders.actions.remarks")}
          </button>
        </div>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-3">{t("orders.hints.waitingConfirm")}</p>
        <button
          type="button"
          onClick={() => actions.remind(order)}
          disabled={remindedRecently}
          className="btn btn-secondary btn-sm"
        >
          {remindedRecently ? t("orders.actions.reminded") : t("orders.actions.remind")}
        </button>
      </div>
    );
  } else if (s === "completed") {
    footer = mineAsClient ? (
      <ReviewBlock order={order} peerName={peerName} review={review} onReview={(r, b) => actions.review(order, r, b)} />
    ) : (
      <p className="text-xs text-ink-3">{t("orders.hints.completedBuilder")}</p>
    );
  } else if (s === "declined") {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-3">
          {DECLINE_REASONS.includes(order.close_reason)
            ? t(`orders.declineReasons.${order.close_reason}`)
            : t("orders.status.declined")}
          {order.close_note ? ` · ${order.close_note}` : ""}
        </p>
        {mineAsClient && (
          <Link href="/" className="btn btn-secondary btn-sm">
            {t("orders.actions.findAnother")}
          </Link>
        )}
      </div>
    );
  } else if (s === "cancelled" && order.close_note) {
    footer = <p className="text-xs text-ink-3">{order.close_note}</p>;
  }

  return (
    <article
      id={`order-${order.id}`}
      className={`card my-2 w-full max-w-md scroll-mt-24 overflow-hidden ${closed ? "opacity-70" : ""}`}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{t("orders.brief.label")}</span>
        <StatusTag status={s} />
        {message?.created_at && (
          <span className="ml-auto text-[11px] tabular-nums text-ink-3">{formatTime(message.created_at, t.lang)}</span>
        )}
      </div>
      <div className={`px-4 pb-3 pt-2 ${closed ? "[&_h3]:line-through" : ""}`}>
        <BriefSummary brief={brief} order={order} />
      </div>
      {footer && <div className="border-t border-line/[0.06] px-4 py-3">{footer}</div>}
    </article>
  );
}
