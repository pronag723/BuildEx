"use client";

// # library: free materials (migration 0119) — schematics and structures
// anyone may download. A grid of cards (cover photo, title, file type, size,
// downloads), newest or most downloaded; a card opens the item in the channel
// column (TopicView, with the Download button).

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import { formatCount } from "../../../lib/works/format.mjs";
import { fetchLibrary, fileExtension, LIBRARY_PAGE } from "../../../lib/community/api";
import Toast from "../../components/Toast";
import ChannelHeader from "./ChannelHeader";
import EmptyState from "./EmptyState";
import LibraryComposer from "./LibraryComposer";
import { PostGridSkeleton } from "./ShowcasePosts";
import { formatBytes } from "./TopicMedia";

function LibraryCard({ item, onOpen }) {
  const t = useT();
  const ext = fileExtension(item.fileName);
  return (
    <article className="card overflow-hidden">
      <button type="button" onClick={() => onOpen(item.id)} className="block w-full text-left">
        <span className="relative block aspect-[4/3] w-full bg-raised">
          {item.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.cover} alt={item.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          )}
          {ext && (
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white">.{ext}</span>
          )}
          {item.pinned && (
            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white">
              <Icon name="pin" size={12} />
            </span>
          )}
          {item.hidden && <span className="absolute bottom-2 left-2 rounded-md bg-danger/90 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("community.requests.hiddenTag")}</span>}
        </span>
        <span className="block px-3 pb-3 pt-2.5">
          <span className="block truncate text-[13px] font-medium text-ink">{item.title}</span>
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
            <Avatar src={item.author.avatarUrl} name={item.author.displayName} size={16} />
            <span className="min-w-0 truncate">{item.author.displayName}</span>
          </span>
          <span className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-3">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon name="download" size={12} />
              {formatCount(item.downloads, t.lang)}
            </span>
            <span>{formatBytes(item.fileSize, t.lang)}</span>
          </span>
        </span>
      </button>
    </article>
  );
}

export default function LibrarySection({ onBack, onOpenItem }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [sort, setSort] = useState("new");
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composer, setComposer] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetchLibrary({ sort }).then(({ items: rows }) => {
      if (cancelled) return;
      setItems(rows);
      setMore(rows.length >= LIBRARY_PAGE);
    });
    return () => {
      cancelled = true;
    };
  }, [sort, status]);

  async function loadMore() {
    setLoadingMore(true);
    const { items: rows } = await fetchLibrary({ sort, offset: items.length });
    setLoadingMore(false);
    setItems((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...rows.filter((p) => !seen.has(p.id))];
    });
    setMore(rows.length >= LIBRARY_PAGE);
  }

  const action = signedIn
    ? { label: t("community.library.new"), icon: "upload", onClick: () => setComposer(true) }
    : { label: t("community.library.new"), icon: "upload", href: `/login?redirect=${encodeURIComponent("/community?s=library")}` };

  return (
    <>
      <ChannelHeader
        channel="library"
        onBack={onBack}
        sort={{ value: sort, options: ["new", "popular"], labels: { new: t("community.library.sort.new"), popular: t("community.library.sort.popular") }, onChange: setSort }}
        action={action}
      />

      <div className="px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        {items === null ? (
          <PostGridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon="file" title={t("community.library.emptyTitle")} body={t("community.library.emptyBody")} action={action} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <LibraryCard key={item.id} item={item} onOpen={onOpenItem} />
              ))}
            </div>
            {more && (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-secondary">
                  {loadingMore ? t("community.loading") : t("community.showMore")}
                </button>
              </div>
            )}
          </>
        )}
        <p className="mt-6 text-center text-xs text-ink-3">{t("community.library.risk")}</p>
      </div>

      <LibraryComposer
        open={composer}
        onClose={() => setComposer(false)}
        onCreated={(id) => {
          setComposer(false);
          showNotice(t("community.library.published"));
          onOpenItem(id);
        }}
      />
      <Toast message={notice} />
    </>
  );
}
