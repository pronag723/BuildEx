"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { useScrollLock } from "../../../lib/useScrollLock";
import { budgetText, DECLINE_REASONS, insideBrief, parseRub, shortDate } from "../../../lib/orders/brief.mjs";

// The small dialogs behind the order card's buttons. One shell, four bodies.

function Shell({ open, title, busy, onClose, children, footer }) {
  useScrollLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div className="safe-bottom relative w-full rounded-t-2xl border border-line/10 bg-surface p-5 shadow-pop sm:max-w-sm sm:rounded-2xl">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body
  );
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />;
}

const isoDate = (d) => {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
};

// "Take order": price and deadline, prefilled from the brief. Says up front
// whether this starts the order or goes to the client as an offer.
export function TakeOrderDialog({ order, onClose, onSubmit }) {
  const t = useT();
  const brief = order?.brief;
  const [price, setPrice] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    const b = order.brief || {};
    setPrice(String(b.budget_max_rub ?? b.budget_min_rub ?? ""));
    setDeadline(b.deadline || isoDate(Date.now() + 14 * 864e5));
  }, [order]);

  const value = parseRub(price);
  const today = isoDate(Date.now());
  const valid = value > 0 && deadline && deadline >= today;
  const inside = valid && insideBrief(brief, value, deadline);
  const budget = brief ? budgetText(brief, t.lang, t) : null;

  return (
    <Shell
      open={Boolean(order)}
      title={t("orders.take.title")}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              const { error } = (await onSubmit(order, value, deadline)) || {};
              setBusy(false);
              if (!error) onClose();
            }}
            className="btn btn-primary"
          >
            {busy && <Spinner />}
            {inside || !valid ? t("orders.take.start") : t("orders.take.offer")}
          </button>
        </>
      }
    >
      <p className="text-xs text-ink-3">
        {t("orders.take.asked", {
          budget: budget || t("orders.brief.noBudget"),
          date: brief?.deadline ? shortDate(brief.deadline, t.lang) : t("orders.brief.noRush"),
        })}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("orders.take.price")}</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, "").slice(0, 11))}
            inputMode="numeric"
            className="input"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("orders.take.deadline")}</span>
          <input type="date" value={deadline} min={today} onChange={(e) => setDeadline(e.target.value)} className="input" />
        </label>
      </div>
      {valid && (
        <p className="mt-3 text-xs leading-relaxed text-ink-2">
          {inside ? t("orders.take.insideHint") : t("orders.take.offerHint")}
        </p>
      )}
    </Shell>
  );
}

// "Decline": a one-tap reason the client sees, plus an optional note.
export function DeclineDialog({ order, onClose, onSubmit }) {
  const t = useT();
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReason(null);
    setNote("");
  }, [order]);

  return (
    <Shell
      open={Boolean(order)}
      title={t("orders.decline.title")}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={async () => {
              setBusy(true);
              const { error } = (await onSubmit(order, reason, note.trim())) || {};
              setBusy(false);
              if (!error) onClose();
            }}
            className="btn btn-danger"
          >
            {busy && <Spinner />}
            {t("orders.decline.confirm")}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("orders.decline.reasonAria")}>
        {DECLINE_REASONS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={reason === key}
            onClick={() => setReason(key)}
            className={`tag-toggle ${reason === key ? "border-accent/60 bg-raised text-ink" : ""}`}
          >
            {t(`orders.declineReasons.${key}`)}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 300))}
        rows={2}
        placeholder={t("orders.decline.notePlaceholder")}
        className="input mt-3 h-auto resize-none py-2.5"
      />
    </Shell>
  );
}

// Deliver and cancel: a question with an optional note.
export function NoteDialog({ open, title, body, placeholder, confirmLabel, danger = false, maxLength = 300, onClose, onSubmit }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  return (
    <Shell
      open={open}
      title={title}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { error } = (await onSubmit(note.trim())) || {};
              setBusy(false);
              if (!error) onClose();
            }}
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {body && <p className="text-sm leading-relaxed text-ink-2">{body}</p>}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, maxLength))}
        rows={2}
        placeholder={placeholder}
        className="input mt-3 h-auto resize-none py-2.5"
      />
    </Shell>
  );
}
