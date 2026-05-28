"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { uploadBanner } from "../../../lib/onboarding/api";
import {
  PORTFOLIO_ACCEPTED_MIME,
  PORTFOLIO_MAX_FILE_MB,
} from "../../../lib/onboarding/constants";

export default function BannerUploader({ userId, value, onChange, onError }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

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
    const { url, error } = await uploadBanner(supabase, userId, file, setProgress);
    setBusy(false);
    setProgress(0);
    if (error) {
      onError?.(error.message || "Upload failed.");
      return;
    }
    onChange?.(url);
  }

  return (
    <div>
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
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`upload-tile banner-tile ${value ? "has-image" : ""} ${
          dragOver ? "is-dragging" : ""
        }`}
        aria-label={value ? "Replace banner" : "Upload banner"}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange?.(null);
              }}
              className="upload-clear-btn"
              aria-label="Remove banner"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 5l6 6M11 5l-6 6" />
              </svg>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center text-center px-6">
            <svg viewBox="0 0 24 24" className="w-7 h-7 mb-2 text-[#4ade80]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-sm font-medium">
              {busy ? "Uploading…" : "Drop a banner here or click to upload"}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Wide image, 4:1 ratio works best. Up to {PORTFOLIO_MAX_FILE_MB} MB.
            </p>
          </div>
        )}
        {busy && (
          <div
            className="absolute inset-x-6 bottom-4 h-1 rounded-full bg-black/40 overflow-hidden"
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
    </div>
  );
}
