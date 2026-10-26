"use client";

import { useRef, useState } from "react";
import Avatar from "../../../../lib/ui/Avatar";
import { Icon } from "../../../../lib/icons";
import { useT } from "../../../../lib/i18n/LanguageProvider";
import { getSupabaseClient } from "../../../../lib/supabase/client";
import { uploadAvatar } from "../../../../lib/onboarding/api";
import { PORTFOLIO_ACCEPTED_MIME, PORTFOLIO_MAX_FILE_MB } from "../../../../lib/onboarding/constants";

// The avatar with a camera badge. A tap opens the file picker; the photo
// uploads, then `onUploaded(url)` saves it. While it uploads the avatar dims
// under a spinner.
export default function EditableAvatar({ userId, src, name, onUploaded, onError }) {
  const t = useT();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function pick(files) {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
      onError(t("onboarding.upload.badType"));
      return;
    }
    if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
      onError(t("onboarding.upload.tooLarge", { mb: PORTFOLIO_MAX_FILE_MB }));
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      onError(t("onboarding.upload.noStorage"));
      return;
    }
    setBusy(true);
    const { url, error } = await uploadAvatar(supabase, userId, file);
    if (error || !url) {
      setBusy(false);
      onError(error?.message || t("onboarding.upload.failed"));
      return;
    }
    await onUploaded(url);
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={busy ? t("account.editor.avatar.uploading") : t("account.editor.avatar.change")}
        aria-busy={busy}
        className="relative block rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent/60 lg:rounded-[30px]"
      >
        <Avatar
          src={src}
          name={name}
          alt=""
          className={`h-[86px] w-[86px] rounded-[22px] text-3xl transition-opacity lg:h-[120px] lg:w-[120px] lg:rounded-[30px] lg:text-5xl ${
            busy ? "opacity-50" : ""
          }`}
        />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-line/20 border-t-accent" />
          </span>
        )}
        <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-raised text-ink-2 shadow-[0_0_0_3px_rgb(var(--canvas))] lg:h-[34px] lg:w-[34px] lg:shadow-[0_0_0_4px_rgb(var(--canvas))]">
          <Icon name="camera" size={14} strokeWidth={2.2} className="lg:h-4 lg:w-4" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PORTFOLIO_ACCEPTED_MIME.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => pick(event.target.files)}
      />
    </>
  );
}
