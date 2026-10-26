"use client";

import { useCallback, useEffect, useState } from "react";
import { publicAsset } from "../../home/utils";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { fetchPriceTiers } from "../../../lib/works/api";
import { fetchMyWorks, reorderWorks, setPinnedWork } from "../../../lib/works/edit";
import { Icon } from "../../../lib/icons";
import WorkEditor from "./WorkEditor";

// A work is ready to show when it has a title and at least one photo.
export const isCompleteWork = (work) => Boolean(work.title) && work.photos.length > 0;

// The builder's works: add, edit, reorder, pin one as "Best work". Used by
// onboarding (the first work) and /account. onChange gets the list after
// every change, so the parent can count complete works.
export default function WorksManager({ userId, onChange }) {
  const t = useT();
  const [works, setWorks] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [editing, setEditing] = useState(null); // a work, or "new"
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [{ works: rows, error: e }, { tiers: tierRows }] = await Promise.all([
      fetchMyWorks(userId),
      fetchPriceTiers(userId),
    ]);
    if (e) setError(serverMessage(e, "account.works.loadFailed"));
    setWorks(rows);
    setTiers(tierRows);
    onChange?.(rows);
  }, [userId, onChange]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const move = async (index, dir) => {
    const target = index + dir;
    if (!works || target < 0 || target >= works.length) return;
    const next = works.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setWorks(next);
    const { error: e } = await reorderWorks(next.map((w) => w.id));
    if (e) setError(serverMessage(e, "account.errors.saveFailed"));
    load();
  };

  const togglePin = async (work) => {
    const { error: e } = await setPinnedWork(work.pinned ? null : work.id);
    if (e) setError(serverMessage(e, "account.errors.saveFailed"));
    load();
  };

  if (works === null) {
    return <div className="h-24 rounded-xl skeleton" />;
  }

  const untitled = works.filter((w) => !w.title).length;

  return (
    <div className="space-y-3">
      {untitled > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px] text-warn">
          <Icon name="pencil" size={15} className="mt-0.5 flex-shrink-0" />
          {t("account.works.untitledNudge", { count: untitled })}
        </p>
      )}

      {works.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line/15 p-6 text-center text-sm text-ink-3">
          {t("account.works.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {works.map((work, index) => (
            <li key={work.id} className="flex items-center gap-3 rounded-xl border border-line/[0.08] bg-raised/60 p-2.5">
              <div className="h-[60px] w-20 flex-shrink-0 overflow-hidden rounded-lg bg-raised">
                {work.photos[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicAsset(work.photos[0].url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${work.title ? "text-ink" : "text-warn"}`}>
                  {work.title || t("profile.works.untitled")}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                  <span>{t("admin.works.photos", { count: work.photos.length })}</span>
                  {work.pinned && <span className="text-accent-ink">{t("profile.works.featured")}</span>}
                  {work.removed && <span className="text-warn">{t("account.works.removed")}</span>}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="btn btn-ghost btn-icon btn-sm disabled:opacity-30" aria-label={t("account.works.moveUp")}>
                  <Icon name="chevronLeft" size={15} className="rotate-90" />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === works.length - 1} className="btn btn-ghost btn-icon btn-sm disabled:opacity-30" aria-label={t("account.works.moveDown")}>
                  <Icon name="chevronRight" size={15} className="rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(work)}
                  aria-pressed={work.pinned}
                  className={`btn btn-ghost btn-icon btn-sm ${work.pinned ? "text-accent-ink" : ""}`}
                  aria-label={work.pinned ? t("account.works.unpin") : t("account.works.pin")}
                  title={work.pinned ? t("account.works.unpin") : t("account.works.pin")}
                >
                  <Icon name="pin" size={15} />
                </button>
                <button type="button" onClick={() => setEditing(work)} className="btn btn-secondary btn-sm">
                  <Icon name="pencil" size={14} />
                  <span className="hidden sm:inline">{t("common.edit")}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setEditing("new")} className="btn btn-secondary w-full">
        <Icon name="plus" size={16} />
        {t("account.works.add")}
      </button>

      {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}

      {editing && (
        <WorkEditor
          userId={userId}
          work={editing === "new" ? null : editing}
          tiers={tiers}
          nextPosition={works.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
