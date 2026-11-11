"use client";

// # showcase: what people chose to publish to the community (migration 0118).
// A 4:3 tile grid, newest or most liked. A tile opens the post in
// the channel column (PostView). Hearts are likes (the forum's "helpful"),
// the yellow bookmark saves the post (the forum's save).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { Icon } from "../../../lib/icons";
import Avatar from "../../../lib/ui/Avatar";
import SaveButton from "../../../lib/ui/SaveButton";
import { formatCount } from "../../../lib/works/format.mjs";
import { fetchShowcasePosts, POSTS_PAGE, toggleHelpful, toggleTopicSave } from "../../../lib/community/api";
import Toast from "../../components/Toast";
import ChannelHeader from "./ChannelHeader";
import EmptyState from "./EmptyState";
import PostComposer from "./PostComposer";

export function PostTile({ post, signedIn, onOpen, onLike, onSave }) {
  const t = useT();
  const cover = post.images[0]?.url;
  return (
    <article className="card group overflow-hidden">
      <button type="button" onClick={() => onOpen(post.id)} className="relative block aspect-[4/3] w-full bg-raised text-left">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={post.caption} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        )}
        {post.images.length > 1 && (
          <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{post.images.length}</span>
        )}
        {post.pinned && (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white">
            <Icon name="pin" size={12} />
          </span>
        )}
        {post.hidden && <span className="absolute bottom-2 left-2 rounded-md bg-danger/90 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("community.requests.hiddenTag")}</span>}
      </button>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={() => onOpen(post.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={24} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink">{post.caption}</span>
            <span className="block truncate text-[11px] text-ink-3">{post.author.displayName}</span>
          </span>
        </button>
        {signedIn ? (
          <>
            <button
              type="button"
              onClick={() => onLike(post)}
              aria-pressed={post.liked}
              aria-label={t("community.showcase.like")}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-xs transition-colors hover:bg-line/[0.06] ${post.liked ? "text-[rgb(var(--heart))]" : "text-ink-3"}`}
            >
              <Icon name="heart" size={16} filled={post.liked} />
              {post.likes > 0 && <span className="tabular-nums">{formatCount(post.likes, t.lang)}</span>}
            </button>
            <SaveButton
              saved={post.saved}
              onToggle={() => onSave(post)}
              size={16}
              aria-label={post.saved ? t("community.showcase.unsave") : t("community.showcase.save")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-line/[0.06]"
            />
          </>
        ) : (
          post.likes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <Icon name="heart" size={14} />
              {formatCount(post.likes, t.lang)}
            </span>
          )
        )}
      </div>
    </article>
  );
}

export function PostGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton aspect-[4/3]" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-2/3 rounded" />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Likes and saves shared by the grid and the Saved tab.
export function usePostActions(setPosts, showNotice, { dropUnsaved = false } = {}) {
  const t = useT();
  const { user } = useAuth();
  const patch = useCallback((id, fields) => setPosts((prev) => (prev || []).map((p) => (p.id === id ? { ...p, ...fields } : p))), [setPosts]);

  async function onLike(post) {
    if (post.author.id === user?.id) {
      showNotice(t("community.post.ownLike"));
      return;
    }
    patch(post.id, { liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) });
    const { on, error } = await toggleHelpful("topic", post.id);
    if (error) {
      patch(post.id, { liked: post.liked, likes: post.likes });
      showNotice(serverMessage(error, "community.errors.failed"));
      return;
    }
    patch(post.id, { liked: Boolean(on) });
  }

  async function onSave(post) {
    const { saved: now, error } = await toggleTopicSave(post.id);
    if (error) {
      showNotice(serverMessage(error, "community.errors.failed"));
      return { ok: false };
    }
    if (dropUnsaved && !now) setPosts((prev) => prev.filter((p) => p.id !== post.id));
    else patch(post.id, { saved: Boolean(now) });
    return { ok: true };
  }

  return { onLike, onSave, patch };
}

export default function ShowcasePosts({ onBack, onOpenPost }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [sort, setSort] = useState("new");
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composer, setComposer] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);
  const { onLike, onSave } = usePostActions(setPosts, showNotice);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    fetchShowcasePosts({ sort }).then(({ posts: rows }) => {
      if (cancelled) return;
      setPosts(rows);
      setMore(rows.length >= POSTS_PAGE);
    });
    return () => {
      cancelled = true;
    };
  }, [sort, status]);

  async function loadMore() {
    setLoadingMore(true);
    const { posts: rows } = await fetchShowcasePosts({ sort, offset: posts.length });
    setLoadingMore(false);
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...rows.filter((p) => !seen.has(p.id))];
    });
    setMore(rows.length >= POSTS_PAGE);
  }

  const action = signedIn
    ? { label: t("community.post.new"), icon: "photo", onClick: () => setComposer(true) }
    : { label: t("community.post.new"), icon: "photo", href: `/login?redirect=${encodeURIComponent("/community?s=showcase")}` };

  return (
    <>
      <ChannelHeader
        channel="showcase"
        onBack={onBack}
        sort={{ value: sort, options: ["new", "popular"], labels: { new: t("community.showcase.sort.new"), popular: t("community.showcase.sort.popular") }, onChange: setSort }}
        action={action}
      />

      <div className="px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        {posts === null ? (
          <PostGridSkeleton />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="grid"
            title={t("community.post.emptyTitle")}
            body={t("community.post.emptyBody")}
            action={action}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {posts.map((p) => (
                <PostTile key={p.id} post={p} signedIn={signedIn} onOpen={onOpenPost} onLike={onLike} onSave={onSave} />
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
        {!signedIn && posts?.length > 0 && (
          <p className="mt-6 text-center text-xs text-ink-3">
            <Link href={`/login?redirect=${encodeURIComponent("/community?s=showcase")}`} className="underline hover:text-ink">
              {t("community.post.signInToPost")}
            </Link>
          </p>
        )}
      </div>

      <PostComposer
        open={composer}
        onClose={() => setComposer(false)}
        onCreated={(id) => {
          setComposer(false);
          showNotice(t("community.post.published"));
          onOpenPost(id);
        }}
      />
      <Toast message={notice} />
    </>
  );
}
