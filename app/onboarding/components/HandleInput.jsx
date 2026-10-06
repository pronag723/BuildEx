"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { isHandleAvailable } from "../../../lib/onboarding/api";
import {
  HANDLE_MAX,
  HANDLE_MIN,
  HANDLE_REGEX,
} from "../../../lib/onboarding/constants";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

/**
 * Controlled @handle input with debounced uniqueness check.
 *
 * Props:
 *   - value:           current handle (without @)
 *   - onChange:        (next) => void
 *   - currentUserId:   needed so a user re-editing their own handle isn't told it's taken
 *   - onValidityChange:(boolean) => void  — fired whenever the input becomes valid/invalid
 *   - id, label, hint
 *
 * The status line is held as a dictionary key (`message`) and translated at
 * render time, so it follows a language switch while it is on screen.
 */
export default function HandleInput({
  value,
  onChange,
  currentUserId,
  onValidityChange,
  id = "handle",
  label,
  hint,
}) {
  const t = useT();
  const [state, setState] = useState({ status: "idle", message: "" });
  const debounceRef = useRef(null);
  const reqRef = useRef(0);
  const lastReportedValidity = useRef(null);

  // Sanitize input (strip leading @, lowercase, drop disallowed chars)
  function handleInput(next) {
    let v = String(next).toLowerCase();
    if (v.startsWith("@")) v = v.slice(1);
    v = v.replace(/[^a-z0-9_]/g, "").slice(0, HANDLE_MAX);
    onChange(v);
  }

  useEffect(() => {
    let cancelled = false;
    clearTimeout(debounceRef.current);

    const trimmed = String(value || "").toLowerCase();
    if (!trimmed) {
      setState({ status: "idle", message: "" });
      return () => {
        cancelled = true;
      };
    }
    if (trimmed.length < HANDLE_MIN) {
      setState({
        status: "error",
        message: "onboarding.handle.tooShort",
      });
      return () => {
        cancelled = true;
      };
    }
    if (!HANDLE_REGEX.test(trimmed)) {
      setState({
        status: "error",
        message: "onboarding.handle.format",
      });
      return () => {
        cancelled = true;
      };
    }

    setState({ status: "checking", message: "onboarding.handle.checking" });

    debounceRef.current = setTimeout(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setState({ status: "error", message: "onboarding.handle.notConfigured" });
        return;
      }
      const reqId = ++reqRef.current;
      const result = await isHandleAvailable(supabase, trimmed, currentUserId);
      if (cancelled || reqId !== reqRef.current) return;

      if (result.available) {
        setState({
          status: "success",
          message: result.ownedBySelf ? "onboarding.handle.yours" : "onboarding.handle.available",
        });
      } else if (result.reason === "format") {
        setState({ status: "error", message: "onboarding.handle.invalidChars" });
      } else if (result.reason === "taken") {
        setState({ status: "error", message: "onboarding.handle.taken" });
      } else {
        setState({
          status: "error",
          message: "onboarding.handle.checkFailed",
        });
      }
    }, 380);

    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
    };
  }, [value, currentUserId]);

  // Notify parent of validity
  useEffect(() => {
    const valid = state.status === "success";
    if (lastReportedValidity.current !== valid) {
      lastReportedValidity.current = valid;
      onValidityChange?.(valid);
    }
  }, [state.status, onValidityChange]);

  const inputCls =
    "onb-input pr-12 " +
    (state.status === "error" ? "is-error " : "");

  return (
    <div>
      <label htmlFor={id} className="onb-label block mb-1.5">
        {label ?? t("onboarding.handle.label")}
      </label>
      <div className="onb-input-with-prefix relative">
        <span className="onb-input-prefix">@</span>
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck="false"
          autoCapitalize="off"
          className={inputCls}
          value={value || ""}
          onChange={(e) => handleInput(e.target.value)}
          maxLength={HANDLE_MAX}
          placeholder={t("onboarding.handle.placeholder")}
          aria-invalid={state.status === "error"}
          aria-describedby={`${id}-hint ${id}-status`}
        />
        <span className="onb-input-status" id={`${id}-status`} aria-live="polite">
          {state.status === "checking" && (
            <span
              className="w-4 h-4 rounded-full border-2 border-line/20 border-t-accent animate-spin"
              aria-label={t("onboarding.handle.checkingShort")}
            />
          )}
          {state.status === "success" && (
            <Icon name="check" size={16} strokeWidth={2.5} className="text-accent-ink" />
          )}
          {state.status === "error" && (
            <Icon name="close" size={16} strokeWidth={2.25} className="text-danger" />
          )}
        </span>
      </div>
      {/* Wraps rather than squeezing: on a phone the hint and the availability
          message were fighting over the same line, each down to two or three
          words per row. The status drops onto its own line instead. */}
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs">
        <p id={`${id}-hint`} className="text-ink-3 leading-snug min-w-0 basis-56 grow">
          {hint ?? t("onboarding.handle.hint")}
        </p>
        <span
          className={
            "flex-shrink-0 " +
            (state.status === "error"
              ? "text-danger"
              : state.status === "success"
              ? "text-accent-ink"
              : "text-ink-3")
          }
        >
          {state.message ? t(state.message, { min: HANDLE_MIN }) : ""}
        </span>
      </div>
    </div>
  );
}
