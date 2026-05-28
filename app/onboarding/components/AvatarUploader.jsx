"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { uploadAvatar } from "../../../lib/onboarding/api";
import {
  PORTFOLIO_ACCEPTED_MIME,
  PORTFOLIO_MAX_FILE_MB,
} from "../../../lib/onboarding/constants";

export default function AvatarUploader({
  userId,
  value,
  fallbackInitial = "B",
  onChange,
  onError,
  size = 120,
}) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files) {
    const file = files?.[0];
    if (!file) return;
    if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
      onError?.("Only PNG, JPG, WebP or GIF images are accepted.");
      return;
    }
    if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
      onError?.(`Image must be under ${PORTFOLIO_MAX_FILE_MB} MB.`);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      onError?.("Couldn't reach storage. Try again in a moment.");
      return;
    }
    setBusy(true);
    setProgress(0.05);
    const { url, error } = await uploadAvatar(supabase, userId, file, setProgress);
    setBusy(false);
    setProgress(0);
    if (error) {
      onError?.(error.message || "Upload failed.");
      return;
    }
    onChange?.(url);
  }

  function clear(e) {
    e.stopPropagation();
    onChange?.(null);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`upload-tile avatar-tile ${value ? "has-image" : ""}`}
        style={{ width: size, height: size }}
        aria-label={value ? "Replace avatar" : "Upload avatar"}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" />
            <button
              type="button"
              onClick={clear}
              className="upload-clear-btn"
              aria-label="Remove avatar"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 5l6 6M11 5l-6 6" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <span
              className="text-3xl text-[#4ade80] font-bold logo-font"
              aria-hidden="true"
            >
              {fallbackInitial}
            </span>
            <span className="text-[10px] uppercase tracking-widest opacity-70">
              {busy ? "Uploading…" : "Upload"}
            </span>
          </>
        )}
        {busy && (
          <div
            className="absolute inset-x-3 bottom-3 h-1 rounded-full bg-black/40 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="h-full bg-[#4ade80] transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={PORTFOLIO_ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-gray-500 text-center max-w-[180px] leading-snug">
        Square PNG or JPG, up to {PORTFOLIO_MAX_FILE_MB} MB.
      </p>
    </div>
  );
}
