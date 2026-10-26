"use client";

import { publicAsset } from "../../../../home/utils";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { formatCount, relativeAgo } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";

// `like` is the visitor's view of it ({ liked, likes }), so a like given in
// the viewer shows here too.
function WorkMeta({ work, like, className = "" }) {
  const t = useT();
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <span className="inline-flex items-center gap-1">
        <Icon
          name="heart"
          size={12}
          filled={like.liked}
          className={like.liked ? "text-[rgb(var(--heart))]" : ""}
        />{" "}
        {formatCount(like.likes, t.lang)}
      </span>
      {work.createdAt && <span>{relativeAgo(work.createdAt, t.lang)}</span>}
    </span>
  );
}

// The first work, large: the builder's pinned one, or simply their first.
function FeaturedCard({ work, like, onOpen }) {
  const t = useT();
  const cover = work.photos[0];
  return (
    <button
      type="button"
      onClick={() => onOpen(work)}
      className="group relative col-span-2 block aspect-[16/10] overflow-hidden rounded-2xl bg-raised text-left text-white lg:row-span-2 lg:aspect-auto lg:min-h-[380px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={publicAsset(cover.url)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        loading="eager"
        decoding="async"
      />
      <span className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent lg:h-40" />
      <span className="absolute left-3 top-3 inline-flex h-6 items-center gap-1.5 rounded-lg bg-black/55 px-2.5 text-[11.5px] font-semibold lg:left-3.5 lg:top-3.5 lg:h-[26px] lg:text-xs">
        <Icon name="pin" size={12} /> {t("profile.works.featured")}
      </span>
      <span className="absolute inset-x-3.5 bottom-3 block lg:inset-x-5 lg:bottom-4">
        <span className="block truncate text-[17px] font-bold tracking-[-0.01em] lg:text-[22px]">
          {work.title || t("profile.works.untitled")}
        </span>
        <WorkMeta work={work} like={like} className="mt-1 text-xs text-white/80 lg:text-[13px]" />
      </span>
    </button>
  );
}

function WorkCard({ work, like, onOpen }) {
  const t = useT();
  const cover = work.photos[0];
  return (
    <button
      type="button"
      onClick={() => onOpen(work)}
      className="group flex min-w-0 flex-col gap-1.5 text-left"
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-raised">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicAsset(cover.url)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
        {work.coauthors.length > 0 && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex h-5 items-center rounded-md bg-black/60 px-1.5 text-[10.5px] font-semibold text-white">
            {t("profile.works.collab")}
          </span>
        )}
        {work.photos.length > 1 && (
          <span className="absolute right-1.5 top-1.5 inline-flex h-5 items-center gap-1 rounded-md bg-black/55 px-1.5 text-[10.5px] font-semibold text-white">
            <Icon name="image" size={11} /> {work.photos.length}
          </span>
        )}
      </span>
      <span className="block truncate text-[13px] font-semibold text-ink lg:text-sm">
        {work.title || t("profile.works.untitled")}
      </span>
      <WorkMeta work={work} like={like} className="-mt-1 text-[11.5px] text-ink-3 lg:text-[12.5px]" />
    </button>
  );
}

export function WorksGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-4 lg:grid-cols-4 lg:gap-x-3.5 lg:gap-y-5">
      <div className="col-span-2 aspect-[16/10] rounded-2xl skeleton lg:row-span-2 lg:aspect-auto lg:min-h-[380px]" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="aspect-[4/3] rounded-xl skeleton" />
          <div className="h-3 w-3/4 rounded skeleton" />
        </div>
      ))}
    </div>
  );
}

// Works as cards: the featured one large (full width on a phone, 2×2 from
// `lg`), the rest in a 4:3 grid — two columns on a phone, four on desktop.
export default function WorksGrid({ works, total, loading, loadingMore, likeOf, onOpen, onLoadMore }) {
  const t = useT();
  if (loading) return <WorksGridSkeleton />;

  if (works.length === 0) {
    return (
      <div className="block-grid flex aspect-[16/10] items-center justify-center rounded-xl px-6 text-center text-sm text-ink-3 lg:aspect-[21/9]">
        {t("profile.works.empty")}
      </div>
    );
  }

  const [featured, ...rest] = works;
  const remaining = Math.max(0, total - works.length);

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-4 lg:grid-cols-4 lg:gap-x-3.5 lg:gap-y-5">
        <FeaturedCard work={featured} like={likeOf(featured)} onOpen={onOpen} />
        {rest.map((work) => (
          <WorkCard key={work.id} work={work} like={likeOf(work)} onOpen={onOpen} />
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="btn btn-secondary mt-5 w-full"
        >
          {loadingMore ? t("profile.works.loading") : t("profile.works.showMore", { count: remaining })}
        </button>
      )}
    </div>
  );
}
