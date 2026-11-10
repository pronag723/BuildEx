"use client";

// # saved: two tabs. "Works" is what the viewer bookmarked on builder
// profiles (still needed to attach works to a brief); "Posts & topics" is
// forum_saves — Showcase posts as tiles, then saved topics as rows.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { Icon } from "../../../lib/icons";
import { publicAsset } from "../../home/utils";
import { relativeAgo } from "../../../lib/works/format.mjs";
import { fetchShowcasePosts, fetchTopics } from "../../../lib/community/api";
import Toast from "../../components/Toast";
import ChannelHeader from "./ChannelHeader";
import EmptyState from "./EmptyState";
import FeedRow, { FeedList, FeedSkeleton } from "./FeedRow";
import ShowcaseSection from "./ShowcaseSection";
import { PostGridSkeleton, PostTile, usePostActions } from "./ShowcasePosts";
import { KindTag } from "./DiscussionsSection";
import { channelForKind } from "./channels";

const TABS = ["works", "posts"];

function SavedPostsAndTopics({ onOpenTopic }) {
  const t = useT();
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [posts, setPosts] = useState(null);
  const [topics, setTopics] = useState(null);
  const [notice, setNotice] = useState(null);
  const showNotice = useCallback((msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);
  const { onLike, onSave } = usePostActions(setPosts, showNotice, { dropUnsaved: true });

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    setTopics(null);
    Promise.all([fetchShowcasePosts({ scope: "saved" }), fetchTopics({ scope: "saved" })]).then(([p, x]) => {
      if (cancelled) return;
      setPosts(p.posts);
      setTopics(x.topics);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (posts === null || topics === null) return <PostGridSkeleton count={4} />;
  if (posts.length === 0 && topics.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title={t("community.saved.emptyPostsTitle")}
        body={t("community.saved.emptyPostsBody")}
        action={{ label: t("community.channels.showcase.name"), icon: "grid", href: "/community?s=showcase" }}
      />
    );
  }
  return (
    <div className="space-y-6">
      {posts.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{t("community.saved.posts")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {posts.map((p) => (
              <PostTile key={p.id} post={p} signedIn={signedIn} onOpen={(id) => onOpenTopic(id, "showcase")} onLike={onLike} onSave={onSave} />
            ))}
          </div>
        </section>
      )}
      {topics.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{t("community.saved.topics")}</h2>
          <FeedList>
            {topics.map((topic) => {
              const name = topic.author_display_name || topic.author_username || t("common.member");
              return (
                <FeedRow
                  key={topic.id}
                  author={{ name, avatar: topic.author_avatar_url ? publicAsset(topic.author_avatar_url) : null }}
                  time={relativeAgo(topic.last_activity_at, t.lang)}
                  title={topic.title}
                  text={topic.excerpt}
                  pinned={topic.pinned}
                  chips={<KindTag kind={topic.kind} />}
                  metrics={[{ icon: "chat", value: topic.reply_count, label: t("community.topic.replies", { count: topic.reply_count }) }]}
                  onClick={() => onOpenTopic(topic.id, channelForKind(topic.kind))}
                />
              );
            })}
          </FeedList>
        </section>
      )}
      <Toast message={notice} />
    </div>
  );
}

export default function SavedSection({ onBack, onOpenTopic }) {
  const t = useT();
  const [tab, setTab] = useState("works");
  return (
    <>
      <ChannelHeader channel="saved" onBack={onBack} />
      <div className="px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        <div role="tablist" aria-label={t("community.saved.tabsAria")} className="mb-4 inline-flex rounded-lg bg-line/[0.06] p-0.5">
          {TABS.map((key) => (
            <button
              key={key}
              id={`saved-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls="saved-panel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                const next = TABS[(TABS.indexOf(key) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                setTab(next);
                document.getElementById(`saved-tab-${next}`)?.focus();
              }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${tab === key ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
            >
              <Icon name={key === "works" ? "grid" : "bookmark"} size={14} />
              {t(`community.saved.tabs.${key}`)}
            </button>
          ))}
        </div>
        <div id="saved-panel" role="tabpanel" aria-labelledby={`saved-tab-${tab}`}>
          {tab === "works" ? <ShowcaseSection key="saved" mode="saved" embedded /> : <SavedPostsAndTopics onOpenTopic={onOpenTopic} />}
        </div>
      </div>
    </>
  );
}
