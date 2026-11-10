"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Community (/community)
//
// Laid out like a Discord server. On a desktop: a channel sidebar, the channel
// itself, and from 1280px a right column with pinned and popular topics. On a
// phone: two screens — a navigation screen (a rail of spaces plus the space's
// channel list) and the channel, full screen, with a topic as a third level.
//
// Channels live in `?s=` and an open topic in `&t=` (static export, so query
// params instead of routes; see channels.js). Every push records its depth in
// history.state so the phone's back control can walk real history (the
// hardware back button then does the same thing), and falls back to replacing
// the address when the viewer landed here directly.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useScrollLock } from "../../../lib/useScrollLock";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { withBase } from "../../home/utils";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import { CHANNELS, DEFAULT_CHANNEL, channelForKind, channelHref, hasTopics, readLocation, useIsDesktop, useMediaQuery } from "./channels";
import CommunitySidebar from "./CommunitySidebar";
import MobileRail from "./MobileRail";
import ChannelHeader from "./ChannelHeader";
import RightRail from "./RightRail";
import ShowcaseSection from "./ShowcaseSection";
import RequestsSection from "./RequestsSection";
import DiscussionsSection from "./DiscussionsSection";
import TopicView from "./TopicView";

const EDGE = 24; // px from the left edge where a back swipe may start
const SWIPE = 72; // px of travel that counts as a swipe

function depthOf() {
  return Number(window.history.state?.cDepth) || 0;
}

function ChannelContent({ channel, onBack, onOpenTopic }) {
  const spec = CHANNELS[channel];
  if (channel === "showcase" || channel === "saved") {
    return (
      <>
        <ChannelHeader channel={channel} onBack={onBack} />
        <div className="px-4 py-4 sm:px-6">
          <ShowcaseSection key={channel} mode={channel === "saved" ? "saved" : "all"} embedded />
        </div>
      </>
    );
  }
  if (channel === "requests") {
    return <RequestsSection onBack={onBack} />;
  }
  if (channel === "mytopics") {
    return <DiscussionsSection key="mine" channel="mytopics" scope="mine" onBack={onBack} onOpenTopic={onOpenTopic} />;
  }
  return <DiscussionsSection key={channel} channel={channel} kind={spec?.kind ?? null} onBack={onBack} onOpenTopic={onOpenTopic} />;
}

export default function CommunityPage() {
  const t = useT();
  const { status } = useAuth();
  const desktop = useIsDesktop();
  const wide = useMediaQuery("(min-width: 1280px)");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useScrollLock(mobileMenuOpen);
  const [loc, setLoc] = useState({ channel: null, topic: null });
  const [space, setSpace] = useState("home");
  const [topicData, setTopicData] = useState(null);
  const touch = useRef(null);

  useEffect(() => {
    const first = readLocation();
    setLoc(first);
    if (first.channel) setSpace(CHANNELS[first.channel].space || "home");
    const onPop = () => setLoc(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A guest who signs out while in "Mine" is sent to the default channel.
  useEffect(() => {
    if (status === "unauthenticated" && loc.channel && CHANNELS[loc.channel].auth) {
      window.history.replaceState(window.history.state, "", withBase("/community"));
      setLoc({ channel: null, topic: null });
    }
  }, [status, loc.channel]);

  const navigate = useCallback((url, { replace = false } = {}) => {
    const depth = depthOf();
    const state = { ...(window.history.state || {}), cDepth: replace ? depth : depth + 1 };
    window.history[replace ? "replaceState" : "pushState"](state, "", withBase(url));
    setLoc(readLocation());
    window.scrollTo({ top: 0 });
  }, []);

  const go = useCallback((key) => navigate(channelHref(key)), [navigate]);

  const openTopic = useCallback(
    (id, inChannel = null) => {
      const ch = inChannel || (hasTopics(loc.channel) ? loc.channel : channelForKind(null));
      setTopicData(null);
      navigate(channelHref(ch, id));
    },
    [navigate, loc.channel]
  );

  // The phone's back: one level up through history when we pushed it, else
  // by replacing the address (the viewer arrived here from a link).
  const goBack = useCallback(() => {
    if (depthOf() > 0) {
      window.history.back();
      return;
    }
    navigate(loc.topic ? channelHref(loc.channel) : "/community", { replace: true });
  }, [loc, navigate]);

  const onTouchStart = (e) => {
    const p = e.touches[0];
    touch.current = p && p.clientX <= EDGE ? { x: p.clientX, y: p.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    const p = e.changedTouches[0];
    if (!start || !p || desktop) return;
    if (p.clientX - start.x > SWIPE && Math.abs(p.clientY - start.y) < 60) goBack();
  };

  const channel = loc.channel || (desktop ? DEFAULT_CHANNEL : null);
  const topic = loc.topic;
  const showNav = desktop === false && !channel;

  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      {desktop === null ? (
        <main aria-busy="true" />
      ) : showNav ? (
        <main>
          <MobileRail space={space} onPickSpace={setSpace} active={null} onGo={go} />
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[1440px]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <CommunitySidebar active={channel} onGo={go} />
          <section className="min-w-0 flex-1" aria-label={t(`community.channels.${channel}.name`)}>
            {topic ? (
              <>
                <ChannelHeader channel={channel} onBack={goBack} thread={topicData?.title || t("community.shell.topic")} />
                <div className="px-4 pb-6 pt-4 sm:px-6">
                  <TopicView key={topic} topicId={topic} channel={channel} onBack={goBack} onLoaded={setTopicData} />
                </div>
              </>
            ) : (
              <ChannelContent key={channel} channel={channel} onBack={goBack} onOpenTopic={openTopic} />
            )}
          </section>
          {wide && <RightRail channel={channel} topic={topic ? topicData : null} onOpenTopic={openTopic} />}
        </main>
      )}
    </div>
  );
}
