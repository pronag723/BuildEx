"use client";

// "Announce a contest": a title, the rules, an optional prize line, an end
// date and optional photos. Posting goes through create_contest (0119), which
// checks the end date (an hour to a year from now), the photos and the daily
// cap it shares with topics.

import { useEffect, useState } from "react";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { CONTEST_PRIZE_MAX, createContest } from "../../../lib/community/api";
import { ComposerDialog, CountedField, PhotoPicker, usePhotoUploads } from "./PhotoUploads";

const TITLE_MAX = 120;
const BODY_MAX = 10000;
const DAY = 24 * 60 * 60 * 1000;

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ContestComposer({ open, onClose, onCreated }) {
  const t = useT();
  const uploads = usePhotoUploads(open);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [prize, setPrize] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setPrize("");
    setEndsAt(toLocalInput(new Date(Date.now() + 7 * DAY)));
    setError(null);
  }, [open]);

  const end = endsAt ? new Date(endsAt) : null;
  const endOk = end && !Number.isNaN(end.getTime()) && end.getTime() > Date.now() + 60 * 60 * 1000 && end.getTime() < Date.now() + 365 * DAY;
  const ok = title.trim().length >= 3 && body.trim().length >= 1 && endOk && !uploads.uploading && uploads.allReady;

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const { topicId, error: e } = await createContest({
      title: title.trim(),
      body: body.trim(),
      images: uploads.paths,
      endsAt: end,
      prize: prize.trim(),
    });
    setBusy(false);
    if (e) {
      setError(serverMessage(e, "community.errors.failed"));
      return;
    }
    onCreated(topicId);
  }

  return (
    <ComposerDialog
      open={open}
      title={t("community.contest.newTitle")}
      busy={busy}
      canSubmit={ok}
      submitLabel={t("community.discussions.publish")}
      onClose={onClose}
      onSubmit={submit}
      error={error}
    >
      <CountedField label={t("community.discussions.titleLabel")} value={title} onChange={setTitle} max={TITLE_MAX} placeholder={t("community.contest.titleHint")} />
      <CountedField label={t("community.contest.rules")} value={body} onChange={setBody} max={BODY_MAX} rows={8} placeholder={t("community.contest.bodyHint")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CountedField label={t("community.contest.prize")} value={prize} onChange={setPrize} max={CONTEST_PRIZE_MAX} placeholder={t("community.contest.prizeHint")} optional />
        <label className="block">
          <span className="mb-1.5 flex text-sm font-medium">{t("community.contest.endsAt")}</span>
          <input
            type="datetime-local"
            value={endsAt}
            min={toLocalInput(new Date(Date.now() + 60 * 60 * 1000))}
            max={toLocalInput(new Date(Date.now() + 364 * DAY))}
            onChange={(e) => setEndsAt(e.target.value)}
            className="input"
          />
          <span className={`mt-1 block text-xs ${endsAt && !endOk ? "text-danger" : "text-ink-3"}`}>{t("community.contest.endsHint")}</span>
        </label>
      </div>
      <PhotoPicker uploads={uploads} label={t("community.post.photos")} optional />
      <p className="text-xs text-ink-3">{t("community.contest.organiserNote")}</p>
    </ComposerDialog>
  );
}
