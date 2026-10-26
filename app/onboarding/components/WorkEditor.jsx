"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { publicAsset } from "../../home/utils";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { PORTFOLIO_ACCEPTED_MIME, PORTFOLIO_MAX_FILE_MB } from "../../../lib/onboarding/constants";
import {
  addWorkPhoto,
  createWork,
  deleteWork,
  removeWorkPhoto,
  reorderWorkPhotos,
  saveWorkCoauthors,
  updateWork,
} from "../../../lib/works/edit";
import { Icon } from "../../../lib/icons";
import CoauthorPicker from "./CoauthorPicker";

export const WORK_PHOTOS_MAX = 10;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const SHORT_MAX = 24;

let keySeq = 0;
const nextKey = () => `k${(keySeq += 1)}`;

const coauthorsFrom = (work) =>
  (work?.coauthors || []).map((c) => ({
    key: nextKey(),
    coauthorId: c.profile?.id || null,
    profile: c.profile,
    name: c.name,
    role: c.role || "",
  }));

// Add or edit one work: photos (first one is the cover), title, description,
// version / size / time, the price tier it was made under, co-authors.
// Nothing is written until Save; a photo removed here is deleted then.
export default function WorkEditor({ userId, work, tiers, nextPosition, onClose, onSaved }) {
  const t = useT();
  const fileRef = useRef(null);
  const [workId, setWorkId] = useState(work?.id || null);
  const [title, setTitle] = useState(work?.title || "");
  const [description, setDescription] = useState(work?.description || "");
  const [version, setVersion] = useState(work?.version || "");
  const [size, setSize] = useState(work?.size || "");
  const [durationDays, setDurationDays] = useState(work?.durationDays ? String(work.durationDays) : "");
  const [priceTierId, setPriceTierId] = useState(work?.priceTierId || "");
  const [coauthors, setCoauthors] = useState(() => coauthorsFrom(work));
  const [photos, setPhotos] = useState(() => (work?.photos || []).map((p) => ({ ...p, key: nextKey() })));
  const [removed, setRemoved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  useScrollLock(true);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  // Free the local previews when the editor goes away.
  useEffect(
    () => () => photos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const addFiles = (fileList) => {
    setError(null);
    const room = WORK_PHOTOS_MAX - photos.length;
    const files = Array.from(fileList || []);
    const accepted = [];
    for (const file of files) {
      if (!PORTFOLIO_ACCEPTED_MIME.includes(file.type)) {
        setError(t("onboarding.portfolioUpload.badType", { name: file.name }));
        continue;
      }
      if (file.size > PORTFOLIO_MAX_FILE_MB * 1024 * 1024) {
        setError(t("onboarding.portfolioUpload.tooLarge", { name: file.name, mb: PORTFOLIO_MAX_FILE_MB }));
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > room) setError(t("account.workEditor.photosMax", { max: WORK_PHOTOS_MAX }));
    const added = accepted.slice(0, Math.max(0, room)).map((file) => ({
      key: nextKey(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((list) => [...list, ...added]);
  };

  const removePhoto = (key) => {
    setPhotos((list) => {
      const photo = list.find((p) => p.key === key);
      if (photo?.id) setRemoved((r) => [...r, photo]);
      if (photo?.preview) URL.revokeObjectURL(photo.preview);
      return list.filter((p) => p.key !== key);
    });
  };

  const movePhoto = (index, dir) => {
    setPhotos((list) => {
      const next = list.slice();
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const valid = title.trim().length > 0 && photos.length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const fields = { title, description, version, size, durationDays, priceTierId };

    let id = workId;
    if (id) {
      const { error: e } = await updateWork(id, fields);
      if (e) return fail(e);
    } else {
      const { id: created, error: e } = await createWork(userId, fields, nextPosition);
      if (e || !created) return fail(e);
      id = created;
      setWorkId(created);
    }

    for (const photo of removed) {
      const { error: e } = await removeWorkPhoto(photo);
      if (e) return fail(e);
    }
    setRemoved([]);

    // Upload new photos one at a time so the progress line means something,
    // remembering each saved id so a failed save can simply be retried.
    const saved = [];
    const pending = photos.filter((p) => !p.id).length;
    let done = 0;
    for (let i = 0; i < photos.length; i += 1) {
      const photo = photos[i];
      if (photo.id) {
        saved.push(photo);
        continue;
      }
      setProgress(t("account.workEditor.uploading", { n: done + 1, total: pending }));
      const { photo: row, error: e } = await addWorkPhoto(userId, id, photo.file, i);
      if (e || !row) return fail(e);
      done += 1;
      const savedPhoto = { ...row, key: photo.key, preview: photo.preview };
      saved.push(savedPhoto);
      setPhotos((list) => list.map((p) => (p.key === photo.key ? savedPhoto : p)));
    }
    setProgress(null);

    const { error: orderError } = await reorderWorkPhotos(id, saved.map((p) => p.id));
    if (orderError) return fail(orderError);

    const { error: coauthorError } = await saveWorkCoauthors(id, coauthors);
    if (coauthorError) return fail(coauthorError);

    setSaving(false);
    onSaved(id);
  };

  function fail(e) {
    setSaving(false);
    setProgress(null);
    setError(serverMessage(e, "account.errors.saveFailed"));
  }

  const remove = async () => {
    if (!workId) {
      onClose();
      return;
    }
    setSaving(true);
    const { error: e } = await deleteWork({ id: workId, photos: [...photos, ...removed].filter((p) => p.id) });
    if (e) return fail(e);
    setSaving(false);
    onSaved(null);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={work ? t("account.workEditor.editTitle") : t("account.workEditor.newTitle")}
        className="flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line/[0.08] sm:shadow-pop"
      >
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-line/[0.08] px-4 sm:px-5">
          <h2 className="text-base font-semibold text-ink">
            {work ? t("account.workEditor.editTitle") : t("account.workEditor.newTitle")}
          </h2>
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-ghost btn-icon" aria-label={t("common.cancel")}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="bx-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <p className="onb-label mb-1.5">{t("account.workEditor.photos")}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <div key={photo.key} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview || publicAsset(photo.url)} alt="" className="h-full w-full object-cover" />
                  {index === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {t("account.workEditor.cover")}
                    </span>
                  )}
                  <div className="absolute inset-x-1 bottom-1 flex justify-between">
                    <span className="flex gap-1">
                      <button type="button" onClick={() => movePhoto(index, -1)} disabled={index === 0} className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30" aria-label={t("account.workEditor.moveLeft")}>
                        <Icon name="chevronLeft" size={14} />
                      </button>
                      <button type="button" onClick={() => movePhoto(index, 1)} disabled={index === photos.length - 1} className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white disabled:opacity-30" aria-label={t("account.workEditor.moveRight")}>
                        <Icon name="chevronRight" size={14} />
                      </button>
                    </span>
                    <button type="button" onClick={() => removePhoto(photo.key)} className="flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white" aria-label={t("account.workEditor.removePhoto")}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {photos.length < WORK_PHOTOS_MAX && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="upload-tile flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg text-xs text-ink-3"
                >
                  <Icon name="photo" size={20} />
                  {t("account.workEditor.addPhotos")}
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={PORTFOLIO_ACCEPTED_MIME.join(",")}
              multiple
              hidden
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <p className="mt-1.5 text-xs text-ink-3">{t("account.workEditor.photosHint", { max: WORK_PHOTOS_MAX, mb: PORTFOLIO_MAX_FILE_MB })}</p>
          </div>

          <div>
            <label htmlFor="work-title" className="onb-label mb-1.5 block">{t("account.workEditor.title")}</label>
            <input
              id="work-title"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, TITLE_MAX))}
              placeholder={t("account.workEditor.titlePlaceholder")}
              className="onb-input"
            />
          </div>

          <div>
            <label htmlFor="work-description" className="onb-label mb-1.5 block">{t("account.workEditor.description")}</label>
            <textarea
              id="work-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder={t("account.workEditor.descriptionPlaceholder")}
              className="onb-input onb-textarea"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-ink-3">{description.length}/{DESCRIPTION_MAX}</p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label htmlFor="work-version" className="onb-label mb-1.5 block">{t("profile.viewer.version")}</label>
              <input id="work-version" value={version} onChange={(e) => setVersion(e.target.value.slice(0, SHORT_MAX))} placeholder="Java 1.21" className="onb-input" />
            </div>
            <div>
              <label htmlFor="work-size" className="onb-label mb-1.5 block">{t("profile.viewer.size")}</label>
              <input id="work-size" value={size} onChange={(e) => setSize(e.target.value.slice(0, SHORT_MAX))} placeholder="200×200" className="onb-input" />
            </div>
            <div>
              <label htmlFor="work-days" className="onb-label mb-1.5 block">{t("account.workEditor.days")}</label>
              <input
                id="work-days"
                inputMode="numeric"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="9"
                className="onb-input"
              />
            </div>
          </div>

          {tiers.length > 0 && (
            <div>
              <label htmlFor="work-tier" className="onb-label mb-1.5 block">{t("account.workEditor.tier")}</label>
              <select id="work-tier" value={priceTierId} onChange={(e) => setPriceTierId(e.target.value)} className="onb-input">
                <option value="">{t("account.workEditor.tierNone")}</option>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>{tier.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-3">{t("account.workEditor.tierHint")}</p>
            </div>
          )}

          <div>
            <p className="onb-label mb-1.5">{t("profile.viewer.coauthors")}</p>
            <CoauthorPicker items={coauthors} onChange={setCoauthors} selfId={userId} />
          </div>

          {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
        </div>

        <div className="safe-bottom flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-line/[0.08] px-4 pt-3 sm:px-5 sm:pb-3">
          {confirmDelete ? (
            <>
              <span className="text-sm text-ink-2">{t("account.workEditor.confirmDelete")}</span>
              <button type="button" onClick={remove} disabled={saving} className="btn btn-danger btn-sm">{t("account.workEditor.delete")}</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={save} disabled={!valid || saving} className="btn btn-primary">
                {saving ? progress || t("account.workEditor.saving") : t("account.workEditor.save")}
              </button>
              <button type="button" onClick={onClose} disabled={saving} className="btn btn-ghost">{t("common.cancel")}</button>
              {workId && (
                <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} className="btn btn-ghost ml-auto text-danger">
                  <Icon name="trash" size={15} /> {t("account.workEditor.delete")}
                </button>
              )}
              {!valid && (
                <span className="basis-full text-xs text-ink-3">{t("account.workEditor.needs")}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
