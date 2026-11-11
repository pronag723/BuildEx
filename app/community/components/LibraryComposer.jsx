"use client";

// "Share a file" in the Library: a title, a description, 1–10 photos of the
// build and one file (.schem, .schematic, .litematic, .nbt, .mcstructure or a
// .zip of them, up to 20 MB) uploaded to community-files. The uploader must
// confirm the file is theirs, or that its author lets them share it for free.
// Posting goes through create_library_item (0119).

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { Icon } from "../../../lib/icons";
import {
  createLibraryItem,
  fileExtension,
  LIBRARY_EXTENSIONS,
  LIBRARY_MAX_BYTES,
  uploadLibraryFile,
} from "../../../lib/community/api";
import { ComposerDialog, CountedField, PhotoPicker, usePhotoUploads } from "./PhotoUploads";
import { formatBytes } from "./TopicMedia";

const TITLE_MAX = 120;
const BODY_MAX = 10000;
const ACCEPT = LIBRARY_EXTENSIONS.map((e) => `.${e}`).join(",");

export default function LibraryComposer({ open, onClose, onCreated }) {
  const t = useT();
  const { user } = useAuth();
  const uploads = usePhotoUploads(open);
  const inputRef = useRef(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // { name, size, path, busy, error }
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setFile(null);
    setConsent(false);
    setError(null);
  }, [open]);

  async function pickFile(f) {
    if (!f) return;
    if (!LIBRARY_EXTENSIONS.includes(fileExtension(f.name))) {
      setFile({ name: f.name, size: f.size, path: null, busy: false, error: t("community.library.badType") });
      return;
    }
    if (f.size > LIBRARY_MAX_BYTES) {
      setFile({ name: f.name, size: f.size, path: null, busy: false, error: t("community.library.tooLarge") });
      return;
    }
    const name = f.name.slice(-120);
    setFile({ name, size: f.size, path: null, busy: true, error: null });
    const { path, error: e } = await uploadLibraryFile(user?.id, f);
    setFile({ name, size: f.size, path, busy: false, error: e ? serverMessage(e, "community.library.uploadFailed") : null });
  }

  const ok =
    title.trim().length >= 3 &&
    body.trim().length >= 1 &&
    uploads.paths.length > 0 &&
    uploads.allReady &&
    !uploads.uploading &&
    file?.path &&
    consent;

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const { topicId, error: e } = await createLibraryItem({
      title: title.trim(),
      body: body.trim(),
      images: uploads.paths,
      filePath: file.path,
      fileName: file.name,
      fileSize: file.size,
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
      title={t("community.library.newTitle")}
      busy={busy}
      canSubmit={ok}
      submitLabel={t("community.discussions.publish")}
      onClose={onClose}
      onSubmit={submit}
      error={error}
    >
      {/* File */}
      <div>
        <p className="mb-1.5 text-sm font-medium">{t("community.library.file")}</p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line/15 p-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {file && (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-ink">
                {file.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" /> : <Icon name="file" size={17} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{file.name}</span>
                <span className={`block text-xs ${file.error ? "text-danger" : "text-ink-3"}`}>
                  {file.error || (file.busy ? t("community.library.uploading") : formatBytes(file.size, t.lang))}
                </span>
              </span>
            </span>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={file?.busy} className="btn btn-secondary btn-sm">
            <Icon name="upload" size={15} />
            {file ? t("community.library.replaceFile") : t("community.library.chooseFile")}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-ink-3">{t("community.library.fileHint")}</p>
      </div>

      <CountedField label={t("community.discussions.titleLabel")} value={title} onChange={setTitle} max={TITLE_MAX} placeholder={t("community.library.titleHint")} />
      <CountedField label={t("community.library.bodyLabel")} value={body} onChange={setBody} max={BODY_MAX} rows={6} placeholder={t("community.library.bodyHint")} />
      <PhotoPicker uploads={uploads} label={t("community.library.photos")} hint={t("community.library.photosHint")} />

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[rgb(var(--accent))]" />
        <span>{t("community.library.consent")}</span>
      </label>
    </ComposerDialog>
  );
}
