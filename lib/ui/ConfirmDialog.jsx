"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n/LanguageProvider";

// A yes/no question before something that can't be undone. Portalled to
// <body> so no ancestor's transform or overflow can trap the fixed overlay.
// Escape and a press on the backdrop cancel, unless the action is running.
export default function ConfirmDialog({ open, title, body, confirmLabel, busy = false, error = null, onConfirm, onCancel }) {
  const t = useT();
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onCancel()} />
      <div className="relative w-full max-w-sm rounded-2xl border border-line/10 bg-surface p-5 shadow-pop">
        <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
        {body && <p id="confirm-body" className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>}
        {error && (
          <div role="alert" className="auth-banner auth-banner-error mt-4">
            {error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost">
            {t("common.cancel")}
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy} className="btn btn-danger">
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
