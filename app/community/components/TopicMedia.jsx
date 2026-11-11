"use client";

// What an open topic carries besides text (migration 0119): its photos (a
// contest's or a Library item's), a contest's prize and end date, and a
// Library item's file with the Download button.

import { useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { formatDateTime } from "../../../lib/i18n/format.mjs";
import { Icon } from "../../../lib/icons";
import { communityImageUrl, fileExtension, libraryFileUrl, registerLibraryDownload } from "../../../lib/community/api";
import { ContestBadges, contestEnded } from "./ContestBits";

export function formatBytes(n, lang) {
  const mb = n / (1024 * 1024);
  const fmt = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: mb < 10 ? 1 : 0 });
  if (mb >= 1) return `${fmt.format(mb)} ${lang === "ru" ? "МБ" : "MB"}`;
  return `${fmt.format(Math.max(1, Math.round(n / 1024)))} ${lang === "ru" ? "КБ" : "KB"}`;
}

function Gallery({ images }) {
  const t = useT();
  const urls = (Array.isArray(images) ? images : []).map(communityImageUrl).filter(Boolean);
  const [index, setIndex] = useState(0);
  if (urls.length === 0) return null;
  const current = urls[Math.min(index, urls.length - 1)];
  return (
    <div className="mt-4">
      <a href={current} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-raised">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt="" className="max-h-[28rem] w-full object-contain" />
      </a>
      {urls.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("community.post.photos")}>
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContestPanel({ topic }) {
  const t = useT();
  const ended = contestEnded(topic.contest_ends_at);
  return (
    <div className="mt-4 rounded-xl border border-line/[0.08] bg-line/[0.03] p-4">
      <ContestBadges endsAt={topic.contest_ends_at} official={topic.pinned} />
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-3">{t("community.contest.prize")}</dt>
          <dd className="mt-0.5 font-medium text-ink">{topic.contest_prize || t("community.contest.noPrize")}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{t(ended ? "community.contest.endedAt" : "community.contest.endsAt")}</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {formatDateTime(topic.contest_ends_at, t.lang, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-3">{t(topic.pinned ? "community.contest.officialNote" : "community.contest.organiserNote")}</p>
    </div>
  );
}

function LibraryPanel({ topic }) {
  const t = useT();
  const { status } = useAuth();
  const [count, setCount] = useState(topic.download_count || 0);
  const url = libraryFileUrl(topic.file_path, topic.file_name);
  const ext = fileExtension(topic.file_name);

  async function onDownload() {
    // Signed-in downloads are counted (once per person); guests just download.
    if (status !== "authenticated") return;
    const { count: next } = await registerLibraryDownload(topic.id);
    if (typeof next === "number") setCount(next);
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line/[0.08] bg-line/[0.03] p-4 sm:flex-row sm:items-center">
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-ink">
        <Icon name="file" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={topic.file_name}>{topic.file_name}</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {ext && <span className="uppercase">.{ext}</span>}
          {ext && " · "}
          {formatBytes(topic.file_size || 0, t.lang)}
          {" · "}
          {t("community.library.downloads", { count })}
        </p>
      </div>
      {url && (
        <a href={url} download={topic.file_name} onClick={onDownload} className="btn btn-primary btn-sm justify-center">
          <Icon name="download" size={15} />
          {t("community.library.download")}
        </a>
      )}
      <p className="text-xs text-ink-3 sm:hidden">{t("community.library.risk")}</p>
    </div>
  );
}

export default function TopicMedia({ topic }) {
  const t = useT();
  if (!topic) return null;
  return (
    <>
      {topic.kind === "contest" && topic.contest_ends_at && <ContestPanel topic={topic} />}
      {topic.kind === "library" && topic.file_path && (
        <>
          <LibraryPanel topic={topic} />
          <p className="mt-1.5 hidden text-xs text-ink-3 sm:block">{t("community.library.risk")}</p>
        </>
      )}
      <Gallery images={topic.images} />
    </>
  );
}
