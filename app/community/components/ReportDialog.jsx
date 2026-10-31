"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { useScrollLock } from "../../../lib/useScrollLock";

// "Report" for anything public in the Community. `onSubmit(reason)` resolves
// to { error }; the dialog stays open on failure.
export default function ReportDialog({ open, title, onClose, onSubmit }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useScrollLock(open);
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div className="safe-bottom relative w-full rounded-t-2xl border border-line/10 bg-surface p-5 shadow-pop sm:max-w-md sm:rounded-2xl">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t("community.report.body")}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 1000))}
          rows={4}
          autoFocus
          placeholder={t("community.report.placeholder")}
          className="input mt-4 h-auto resize-none py-2.5"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true);
              const { error } = (await onSubmit(reason.trim())) || {};
              setBusy(false);
              if (!error) onClose();
            }}
            className="btn btn-danger"
          >
            {t("community.report.send")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
