"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { styleChipLabel } from "../../../lib/i18n/labels.mjs";
import { useScrollLock } from "../../../lib/useScrollLock";
import { chatImageUrl } from "../../../lib/chat/api";
import { uploadBriefPhoto } from "../../../lib/orders/api";
import { fetchSavedWorks } from "../../../lib/community/api";
import {
  BRIEF_BUILD_TYPES,
  BRIEF_DELIVERY,
  BRIEF_LIMITS,
  BRIEF_STYLES,
  BRIEF_VERSIONS,
  BUDGET_PRESETS,
  SIZE_PRESETS,
  briefErrors,
  briefPayload,
  emptyBrief,
  parseRub,
} from "../../../lib/orders/brief.mjs";
import { BriefSummary } from "./BriefCard";

// The brief (ТЗ) builder. Four things are asked up front — what, budget,
// deadline, description — because that is what a builder needs to answer;
// everything else sits under "More details" (stage-0 proposal П2). Desktop is
// a dialog with a live preview of the card the builder will get; a phone gets
// a full-screen sheet with the send button pinned to the bottom.

function Chip({ active, onClick, children, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`tag-toggle disabled:opacity-40 ${active ? "border-accent/60 bg-raised text-ink" : ""}`}
    >
      {children}
    </button>
  );
}

function Label({ children, hint, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium">
      {children}
      {hint && <span className="text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

function ErrorText({ code }) {
  const t = useT();
  if (!code) return null;
  return <p className="mt-1.5 text-xs text-danger">{t(`orders.errors.${code}`)}</p>;
}

// Which budget control is lit: a preset, "own amount", "let them price it".
function budgetModeOf(form) {
  if (form.budget_open) return "open";
  const min = parseRub(form.budget_min_rub);
  const max = parseRub(form.budget_max_rub);
  if (min === null && max === null) return null;
  const preset = BUDGET_PRESETS.find((p) => p.min === min && p.max === max);
  return preset ? preset.key : "custom";
}

export default function BriefBuilder({ open, mode = "new", peerName, userId, initial, onClose, onSubmit }) {
  const t = useT();
  const [form, setForm] = useState(() => initial || emptyBrief());
  const [more, setMore] = useState(false);
  const [customBudget, setCustomBudget] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  // "From saved" (stage 4): the works the client bookmarked in the Showcase.
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedWorks, setSavedWorks] = useState(null);
  const fileRef = useRef(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const start = initial || emptyBrief();
    setForm(start);
    setMore(mode === "edit");
    setCustomBudget(budgetModeOf(start) === "custom");
    setShowErrors(false);
    setLinkDraft("");
    setUploadError(null);
    setSavedOpen(false);
  }, [open, initial, mode]);

  useEffect(() => {
    let cancelled = false;
    if (!savedOpen || savedWorks !== null) return undefined;
    fetchSavedWorks().then(({ works }) => {
      if (!cancelled) setSavedWorks(works || []);
    });
    return () => {
      cancelled = true;
    };
  }, [savedOpen, savedWorks]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const errors = useMemo(() => briefErrors(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const fallbackTitle = form.build_type ? t(`buildTypes.${form.build_type}`) : "";
  const preview = useMemo(() => {
    const p = briefPayload(form, fallbackTitle);
    return { ...p, title: p.title || "" };
  }, [form, fallbackTitle]);

  if (!open || typeof document === "undefined") return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const mode_ = customBudget ? "custom" : budgetModeOf(form);
  const visibleError = (key) => (showErrors || key === "budget" ? errors[key] : null);

  function pickPreset(p) {
    setCustomBudget(false);
    setForm((f) => ({ ...f, budget_open: false, budget_min_rub: p.min ?? "", budget_max_rub: p.max ?? "" }));
  }

  function toggleStyle(key) {
    setForm((f) => {
      const has = f.styles.includes(key);
      if (!has && f.styles.length >= BRIEF_LIMITS.styles) return f;
      return { ...f, styles: has ? f.styles.filter((s) => s !== key) : [...f.styles, key] };
    });
  }

  async function addPhotos(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length || !userId) return;
    setUploading(true);
    setUploadError(null);
    for (const file of files) {
      if (form.refs.length >= BRIEF_LIMITS.refs) break;
      const { ref, error } = await uploadBriefPhoto(userId, file);
      if (error || !ref) {
        setUploadError(t("orders.errors.photoFailed"));
        break;
      }
      setForm((f) => (f.refs.length >= BRIEF_LIMITS.refs ? f : { ...f, refs: [...f.refs, ref] }));
    }
    setUploading(false);
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!/^https:\/\/\S+$/.test(url) || form.refs.length >= BRIEF_LIMITS.refs) return;
    setForm((f) => ({ ...f, refs: [...f.refs, { kind: "link", url }] }));
    setLinkDraft("");
  }

  async function submit() {
    setShowErrors(true);
    if (hasErrors || busy) return;
    setBusy(true);
    const { error } = (await onSubmit(briefPayload(form, fallbackTitle))) || {};
    setBusy(false);
    if (!error) onClose();
  }

  const title =
    mode === "edit"
      ? t("orders.builder.editTitle")
      : mode === "public"
        ? t("orders.builder.publicTitle")
        : t("orders.builder.title", { name: peerName });

  const formBody = (
    <div className="space-y-6">
      {/* What */}
      <section>
        <Label>{t("orders.builder.what")}</Label>
        <div className="flex flex-wrap gap-2">
          {BRIEF_BUILD_TYPES.map((key) => (
            <Chip key={key} active={form.build_type === key} onClick={() => set("build_type", key)}>
              {t(`buildTypes.${key}`)}
            </Chip>
          ))}
        </div>
        <ErrorText code={visibleError("build_type")} />
        <input
          value={form.title}
          onChange={(e) => set("title", e.target.value.slice(0, BRIEF_LIMITS.title))}
          placeholder={fallbackTitle ? t("orders.builder.titlePlaceholderType", { type: fallbackTitle }) : t("orders.builder.titlePlaceholder")}
          aria-label={t("orders.builder.titleAria")}
          className="input mt-3"
        />
      </section>

      {/* Budget */}
      <section>
        <Label>{t("orders.builder.budget")}</Label>
        <div className="flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((p) => (
            <Chip key={p.key} active={mode_ === p.key} onClick={() => pickPreset(p)}>
              {t(`orders.budget.presets.${p.key}`)}
            </Chip>
          ))}
          <Chip
            active={mode_ === "custom"}
            onClick={() => {
              setCustomBudget(true);
              set("budget_open", false);
            }}
          >
            {t("orders.budget.custom")}
          </Chip>
          <Chip
            active={mode_ === "open"}
            onClick={() => {
              setCustomBudget(false);
              setForm((f) => ({ ...f, budget_open: true, budget_min_rub: "", budget_max_rub: "" }));
            }}
          >
            {t("orders.budget.open")}
          </Chip>
        </div>
        {mode_ === "custom" && (
          <div className="mt-3 flex items-center gap-2">
            <input
              value={form.budget_min_rub}
              onChange={(e) => set("budget_min_rub", e.target.value.replace(/[^\d\s]/g, "").slice(0, 11))}
              inputMode="numeric"
              placeholder={t("orders.budget.fromPlaceholder")}
              aria-label={t("orders.budget.fromPlaceholder")}
              className="input w-32"
            />
            <span className="text-ink-3">—</span>
            <input
              value={form.budget_max_rub}
              onChange={(e) => set("budget_max_rub", e.target.value.replace(/[^\d\s]/g, "").slice(0, 11))}
              inputMode="numeric"
              placeholder={t("orders.budget.toPlaceholder")}
              aria-label={t("orders.budget.toPlaceholder")}
              className="input w-32"
            />
            <span className="text-sm text-ink-2">₽</span>
          </div>
        )}
        <ErrorText code={visibleError("budget")} />
        {mode_ === "open" && <p className="mt-1.5 text-xs text-ink-3">{t("orders.budget.openHint")}</p>}
      </section>

      {/* Deadline */}
      <section>
        <Label htmlFor="brief-deadline">{t("orders.builder.deadline")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="brief-deadline"
            type="date"
            value={form.deadline}
            onChange={(e) => set("deadline", e.target.value)}
            className="input w-auto"
          />
          <Chip active={!form.deadline} onClick={() => set("deadline", "")}>
            {t("orders.brief.noRush")}
          </Chip>
        </div>
        <ErrorText code={visibleError("deadline")} />
      </section>

      {/* Description */}
      <section>
        <Label htmlFor="brief-description" hint={`${form.description.length} / ${BRIEF_LIMITS.description}`}>
          {t("orders.builder.description")}
        </Label>
        <textarea
          id="brief-description"
          value={form.description}
          onChange={(e) => set("description", e.target.value.slice(0, BRIEF_LIMITS.description))}
          rows={4}
          placeholder={t("orders.builder.descriptionPlaceholder")}
          className="input h-auto resize-y py-2.5 leading-relaxed"
        />
      </section>

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="flex w-full items-center gap-2 border-t border-line/[0.06] pt-4 text-sm font-medium text-ink-2 hover:text-ink"
      >
        <Icon name={more ? "chevronUp" : "chevronDown"} size={16} />
        {t("orders.builder.more")}
        <span className="text-xs font-normal text-ink-3">{t("orders.builder.moreHint")}</span>
      </button>

      {more && (
        <div className="space-y-6">
          <section>
            <Label hint={t("orders.builder.stylesHint")}>{t("orders.builder.styles")}</Label>
            <div className="flex flex-wrap gap-2">
              {BRIEF_STYLES.map((key) => (
                <Chip
                  key={key}
                  active={form.styles.includes(key)}
                  disabled={!form.styles.includes(key) && form.styles.length >= BRIEF_LIMITS.styles}
                  onClick={() => toggleStyle(key)}
                >
                  {styleChipLabel(key, t.lang)}
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <Label>{t("orders.builder.size")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={form.size_w}
                onChange={(e) => set("size_w", e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder={t("orders.builder.width")}
                aria-label={t("orders.builder.width")}
                className="input w-24"
              />
              <span className="text-ink-3">×</span>
              <input
                value={form.size_l}
                onChange={(e) => set("size_l", e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder={t("orders.builder.length")}
                aria-label={t("orders.builder.length")}
                className="input w-24"
              />
              <input
                value={form.size_h}
                onChange={(e) => set("size_h", e.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                placeholder={t("orders.builder.height")}
                aria-label={t("orders.builder.height")}
                className="input w-24"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SIZE_PRESETS.map(([w, l]) => (
                <Chip
                  key={`${w}x${l}`}
                  active={String(form.size_w) === String(w) && String(form.size_l) === String(l)}
                  onClick={() => setForm((f) => ({ ...f, size_w: String(w), size_l: String(l) }))}
                >
                  {w} × {l}
                </Chip>
              ))}
            </div>
            <ErrorText code={visibleError("size")} />
          </section>

          <section>
            <Label>{t("orders.builder.version")}</Label>
            <div className="flex flex-wrap gap-2">
              <Chip active={form.edition === "java"} onClick={() => set("edition", "java")}>Java</Chip>
              <Chip active={form.edition === "bedrock"} onClick={() => set("edition", "bedrock")}>Bedrock</Chip>
              <span className="mx-1 w-px self-stretch bg-line/[0.08]" aria-hidden="true" />
              {BRIEF_VERSIONS.map((v) => (
                <Chip key={v} active={form.mc_version === v} onClick={() => set("mc_version", form.mc_version === v ? "" : v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <ErrorText code={visibleError("mc_version")} />
          </section>

          <section>
            <Label>{t("orders.builder.delivery")}</Label>
            <div className="flex flex-wrap gap-2">
              {BRIEF_DELIVERY.map((key) => (
                <Chip key={key} active={form.delivery === key} onClick={() => set("delivery", form.delivery === key ? "" : key)}>
                  {t(`orders.delivery.${key}`)}
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <Label hint={t("orders.builder.refsHint", { n: BRIEF_LIMITS.refs })}>{t("orders.builder.refs")}</Label>
            <div className="flex flex-wrap gap-2">
              {form.refs.map((item, i) => (
                <span key={`${item.kind}-${i}`} className="relative">
                  {item.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={chatImageUrl({ path: item.path })}
                      alt={t("orders.brief.reference")}
                      className="h-16 w-16 rounded-lg border border-line/[0.09] object-cover"
                    />
                  ) : (
                    <span className="flex h-16 max-w-[10rem] items-center gap-1.5 rounded-lg border border-line/[0.09] bg-raised px-2.5 text-xs text-ink-2">
                      <Icon name={item.kind === "work" ? "image" : "link"} size={13} />
                      <span className="truncate">{item.kind === "work" ? t("orders.builder.workRef") : item.url}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, refs: f.refs.filter((_, j) => j !== i) }))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line/10 bg-surface text-ink-2 hover:text-ink"
                    aria-label={t("orders.builder.removeRef")}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              {form.refs.length < BRIEF_LIMITS.refs && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line/20 text-[11px] text-ink-2 hover:text-ink disabled:opacity-50"
                >
                  {uploading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-line/20 border-t-accent" />
                  ) : (
                    <>
                      <Icon name="plus" size={16} />
                      {t("orders.builder.addPhoto")}
                    </>
                  )}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
            </div>
            {uploadError && <p className="mt-1.5 text-xs text-danger">{uploadError}</p>}
            <button
              type="button"
              onClick={() => setSavedOpen((v) => !v)}
              aria-expanded={savedOpen}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
            >
              <Icon name="bookmark" size={13} />
              {t("orders.builder.fromSaved")}
            </button>
            {savedOpen && (
              <div className="mt-2 rounded-lg border border-line/[0.08] p-2">
                {savedWorks === null ? (
                  <div className="h-14 w-14 rounded-lg skeleton" />
                ) : savedWorks.length === 0 ? (
                  <p className="text-xs text-ink-3">{t("orders.builder.savedEmpty")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {savedWorks.map((w) => {
                      const on = form.refs.some((r) => r.kind === "work" && r.work_id === w.id);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          title={w.title || w.builder.displayName}
                          aria-pressed={on}
                          disabled={!on && form.refs.length >= BRIEF_LIMITS.refs}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              refs: on
                                ? f.refs.filter((r) => !(r.kind === "work" && r.work_id === w.id))
                                : [...f.refs, { kind: "work", work_id: w.id }],
                            }))
                          }
                          className={`h-14 w-14 overflow-hidden rounded-lg border-2 disabled:opacity-40 ${on ? "border-accent" : "border-transparent"}`}
                        >
                          {w.cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.cover} alt={w.title || ""} className="h-full w-full object-cover" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="https://"
                aria-label={t("orders.builder.linkAria")}
                className="input flex-1"
                inputMode="url"
              />
              <button
                type="button"
                onClick={addLink}
                disabled={!/^https:\/\/\S+$/.test(linkDraft.trim()) || form.refs.length >= BRIEF_LIMITS.refs}
                className="btn btn-secondary"
              >
                {t("orders.builder.addLink")}
              </button>
            </div>
          </section>

          <section>
            <Label htmlFor="brief-extra" hint={`${form.extra.length} / ${BRIEF_LIMITS.extra}`}>
              {t("orders.builder.extra")}
            </Label>
            <textarea
              id="brief-extra"
              value={form.extra}
              onChange={(e) => set("extra", e.target.value.slice(0, BRIEF_LIMITS.extra))}
              rows={2}
              placeholder={t("orders.builder.extraPlaceholder")}
              className="input h-auto resize-y py-2.5 leading-relaxed"
            />
          </section>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 hidden bg-black/60 sm:block" onClick={() => !busy && onClose()} />
      <div className="relative flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-line/10 sm:shadow-pop">
        <header className="flex flex-shrink-0 items-center gap-2 border-b border-line/[0.08] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-icon -ml-2" aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <p className="truncate text-xs text-ink-3">{t("orders.builder.subtitle")}</p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="bx-scroll min-h-0 overflow-y-auto px-4 py-5 sm:px-6">{formBody}</div>
          <aside className="hidden min-h-0 overflow-y-auto border-l border-line/[0.08] bg-canvas px-5 py-5 lg:block">
            <p className="mb-3 text-sm font-medium text-ink-2">{t("orders.builder.preview")}</p>
            <div className="card p-4">
              {preview.build_type ? (
                <BriefSummary brief={preview} />
              ) : (
                <p className="text-sm text-ink-3">{t("orders.builder.previewEmpty")}</p>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              {mode === "public" ? t("orders.builder.publicHint") : t("orders.builder.termsHint")}
            </p>
          </aside>
        </div>

        <footer className="safe-bottom flex flex-shrink-0 items-center gap-2 border-t border-line/[0.08] px-4 py-3 sm:px-6">
          <p className="mr-auto hidden text-xs text-ink-3 sm:block">
            {showErrors && hasErrors ? t("orders.errors.fix") : t("orders.builder.onlyType")}
          </p>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost hidden sm:inline-flex">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={submit} disabled={busy || uploading} className="btn btn-primary w-full sm:w-auto">
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" />}
            {mode === "edit" ? t("orders.builder.save") : mode === "public" ? t("orders.builder.publish") : t("orders.builder.send")}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
