"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { fetchTaggedWorks, removeMeFromWork } from "../../../lib/works/edit";
import { Icon } from "../../../lib/icons";

// Works other builders credited you on. Credits need no acceptance, so this is
// where you take your name off one. Renders nothing when there are none.
export default function TaggedInWorks({ userId }) {
  const t = useT();
  const [works, setWorks] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetchTaggedWorks(userId).then(({ works: rows }) => setWorks(rows));
  }, [userId]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  if (works.length === 0) return null;

  const remove = async (workId) => {
    const { error: e } = await removeMeFromWork(workId);
    if (e) setError(serverMessage(e, "account.errors.saveFailed"));
    load();
  };

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t("account.tagged.title")}</h2>
      <p className="mt-0.5 text-xs text-ink-3">{t("account.tagged.subtitle")}</p>
      <ul className="mt-4 space-y-2">
        {works.map((work) => (
          <li key={work.id} className="flex items-center gap-3 rounded-xl border border-line/[0.08] p-3">
            <div className="min-w-0 flex-1">
              {work.builder ? (
                <Link
                  href={`/builders/profile?u=${encodeURIComponent(work.builder.username)}&w=${work.id}`}
                  className="block truncate text-sm font-semibold text-ink hover:text-accent-ink"
                >
                  {work.title || t("profile.works.untitled")}
                </Link>
              ) : (
                <p className="truncate text-sm font-semibold text-ink">{work.title || t("profile.works.untitled")}</p>
              )}
              <p className="truncate text-xs text-ink-3">
                {work.builder ? `@${work.builder.username}` : ""}
                {work.role ? ` · ${work.role}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => remove(work.id)} className="btn btn-ghost btn-sm text-danger">
              <Icon name="close" size={14} />
              {t("account.tagged.remove")}
            </button>
          </li>
        ))}
      </ul>
      {error && <div role="alert" className="auth-banner auth-banner-error mt-3">{error}</div>}
    </section>
  );
}
