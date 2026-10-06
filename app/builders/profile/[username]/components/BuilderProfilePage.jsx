"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import CatalogNavbar from "../../../components/CatalogNavbar";
import CatalogMobileMenu from "../../../components/CatalogMobileMenu";
import { publicAsset } from "../../../../home/utils";
import Avatar from "../../../../../lib/ui/Avatar";
import { useAuthGate } from "../../../../../lib/auth/useAuthGate";
import SocialLinks from "../../../components/SocialLinks";
import { useFavorites } from "../../../../../lib/favorites/FavoritesContext";
import { useScrollLock } from "../../../../../lib/useScrollLock";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { styleChipLabel } from "../../../../../lib/i18n/labels.mjs";
import { Icon } from "../../../../../lib/icons";

// ─── Portfolio gallery ───────────────────────────────────────────────────────
// One large image with a strip of thumbnails under it, so a visitor can see
// how much work there is and jump straight to any piece. Click the image for
// a full-screen view (arrows and Esc work there too).
function PortfolioGallery({ items }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const touchStartX = useRef(null);
  const stripRef = useRef(null);
  const thumbRefs = useRef([]);
  const count = items.length;

  const go = useCallback((dir) => setIndex((i) => (i + dir + count) % count), [count]);
  const goLightbox = useCallback((dir) => {
    setLightboxIndex((current) => (current + dir + count) % count);
  }, [count]);

  useScrollLock(lightboxIndex != null);

  // Keep the active thumbnail in view inside the strip. Scrolls the strip
  // only — scrollIntoView would also scroll the page to reach a strip that is
  // below the fold.
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = thumbRefs.current[index];
    if (!strip || !thumb) return;
    const start = thumb.offsetLeft - 4;
    const end = thumb.offsetLeft + thumb.offsetWidth + 4;
    if (start < strip.scrollLeft) {
      strip.scrollTo({ left: start, behavior: "smooth" });
    } else if (end > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: end - strip.clientWidth, behavior: "smooth" });
    }
  }, [index]);

  useEffect(() => {
    if (lightboxIndex == null) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft" && count > 1) goLightbox(-1);
      if (event.key === "ArrowRight" && count > 1) goLightbox(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, count, goLightbox]);

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX == null || endX == null || Math.abs(endX - startX) < 36 || count < 2) return;
    go(endX < startX ? 1 : -1);
  };

  const lightboxImage = lightboxIndex == null ? null : items[lightboxIndex];
  const overlayButton =
    "flex items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70";

  return (
    <>
      <div
        className="group/media card-carousel relative aspect-[16/10] overflow-hidden rounded-xl bg-raised"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="card-carousel-track flex h-full"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightboxIndex(itemIndex)}
              tabIndex={itemIndex === index ? 0 : -1}
              className="relative h-full w-full flex-shrink-0 cursor-zoom-in"
              aria-label={t("profile.openFullScreen", { title: item.title || t("profile.portfolioImageAria") })}
            >
              <img
                src={publicAsset(item.thumbnail)}
                alt={item.title}
                className="h-full w-full object-cover"
                loading={itemIndex === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </button>
          ))}
        </div>

        <span className="pointer-events-none absolute right-3 top-3 hidden h-8 items-center gap-1.5 rounded-lg bg-black/55 px-2.5 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/media:opacity-100 sm:inline-flex">
          <Icon name="expand" size={14} />
          {t("profile.viewFullScreen")}
        </span>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label={t("card.previousBuild")}
              onClick={() => go(-1)}
              className={`carousel-arrow absolute left-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 ${overlayButton}`}
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <button
              type="button"
              aria-label={t("card.nextBuild")}
              onClick={() => go(1)}
              className={`carousel-arrow absolute right-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 ${overlayButton}`}
            >
              <Icon name="chevronRight" size={20} />
            </button>
            <span className="pointer-events-none absolute bottom-3 right-3 flex h-6 items-center rounded-md bg-black/55 px-2 text-xs font-medium tabular-nums text-white backdrop-blur-sm">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <div ref={stripRef} className="hide-scrollbar relative -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 py-1" role="tablist" aria-label={t("card.portfolioImages")}>
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { thumbRefs.current[i] = el; }}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t("profile.goToBuild", { n: i + 1 })}
              onClick={() => setIndex(i)}
              className={`relative aspect-[4/3] w-[4.5rem] flex-shrink-0 overflow-hidden rounded-lg bg-raised transition-opacity sm:w-24 ${
                i === index
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={publicAsset(item.thumbnail)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxImage && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={t("profile.fullScreenPhoto")}
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label={t("profile.closeFullScreen")}
          >
            <Icon name="close" size={20} />
          </button>
          <div className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <img
              src={publicAsset(lightboxImage.thumbnail)}
              alt={lightboxImage.title || t("profile.portfolioImage")}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            {count > 1 && (
              <>
                <button type="button" onClick={() => goLightbox(-1)} className="absolute left-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4" aria-label={t("profile.previousPhoto")}>
                  <Icon name="chevronLeft" size={22} />
                </button>
                <button type="button" onClick={() => goLightbox(1)} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4" aria-label={t("profile.nextPhoto")}>
                  <Icon name="chevronRight" size={22} />
                </button>
              </>
            )}
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-2.5 py-1 text-xs tabular-nums text-white/80">
              {lightboxIndex + 1} / {count}
            </span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Presence({ online }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-accent" : "bg-line/25"}`}
        aria-hidden="true"
      />
      {online ? t("card.onlineNow") : t("profile.offline")}
    </span>
  );
}

// ─── Contact panel ───────────────────────────────────────────────────────────
// The page's one job is to get a visitor talking to this builder, so the
// sticky column holds exactly that: are they around, the message button, and
// the other places they said they can be reached. Their name and avatar are
// already in the header beside it, so they are not repeated here.
function ContactPanel({ builder, onContact }) {
  const t = useT();
  return (
    <div className="card builder-sidebar-sticky p-5">
      <p className="text-sm text-ink-2">
        <Presence online={builder.online} />
      </p>
      <button type="button" onClick={onContact} className="btn btn-primary btn-lg mt-4 w-full">
        <Icon name="chat" size={17} />
        {t("profile.contactBuilder")}
      </button>

      <SocialLinks
        contactLinks={builder.contact_links}
        variant="list"
        title={t("profile.links")}
        className="mt-5 border-t border-line/[0.08] pt-4"
      />
    </div>
  );
}

// Shown while the profile loads: the real layout's shapes, not a spinner on an
// empty page.
export function BuilderProfileSkeleton() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="catalog-root">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <main aria-busy="true">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8 lg:px-8">
          <div className="h-3.5 w-40 rounded skeleton" />
          <div className="mt-6 flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl skeleton sm:h-20 sm:w-20" />
            <div className="space-y-2.5">
              <div className="h-6 w-48 rounded skeleton" />
              <div className="h-3.5 w-64 max-w-[60vw] rounded skeleton" />
            </div>
          </div>
          <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="aspect-[16/10] rounded-xl skeleton" />
            <div className="hidden h-40 rounded-xl skeleton lg:block" />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BuilderProfilePage({ builder }) {
  const t = useT();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const gate = useAuthGate();
  const router = useRouter();

  // Favorites — signed-in visitors can bookmark this builder from the header.
  const { canFavorite, isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(builder.id, "builder");

  useScrollLock(mobileMenuOpen);

  // Open (or jump to) a chat thread with this builder. Auth-gated: unauthenticated
  // visitors are routed to /login first, then back here. The /chats page resolves
  // the @handle to the builder and starts the conversation.
  const contactBuilder = useCallback(() => {
    // Next prepends the deployment basePath to router.push automatically, so the
    // path must stay base-less here — wrapping it in withBase() would double the
    // prefix (/BuildEx/BuildEx/chats) and 404 on GitHub Pages.
    const target = `/chats?to=${encodeURIComponent(builder.username)}`;
    gate(
      () => {
        router.push(target);
      },
      { redirectTo: target }
    );
  }, [gate, router, builder.username]);

  const memberSince = builder.member_since
    ? t("profile.memberSince", { year: new Date(builder.member_since).getFullYear() })
    : null;
  const about = builder.about || builder.bio;

  return (
    <div className="catalog-root has-bottom-bar">
      <CatalogNavbar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <CatalogMobileMenu mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <main>
        <div className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20">
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-ink-3" aria-label={t("profile.breadcrumb")}>
            {/* "Home" and "Builders" were separate crumbs until the feed
                became the site root; they now point at the same page. */}
            <Link href="/" className="flex-shrink-0 rounded-sm transition-colors hover:text-ink">
              {t("nav.builders")}
            </Link>
            <Icon name="chevronRight" size={14} className="flex-shrink-0 opacity-60" />
            <span className="truncate text-ink-2" aria-current="page">{builder.display_name}</span>
          </nav>

          {/* ── Identity ───────────────────────────────────────────────── */}
          <header className="mt-5 sm:mt-6">
            <div className="flex items-start gap-4 sm:gap-5">
              <Avatar
                src={builder.avatar}
                name={builder.display_name}
                alt={builder.display_name}
                className="h-16 w-16 rounded-xl text-2xl sm:h-20 sm:w-20 sm:text-3xl"
              />

              <div className="min-w-0 flex-1 pt-0.5 sm:pt-1.5">
                <h1 className="break-words text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.875rem]">
                  {builder.display_name}
                </h1>
                {/* Each separator is glued to the item after it, so a wrapped
                    line never ends on a stray "·". */}
                <p className="mt-1 flex flex-wrap items-center gap-y-1 text-sm text-ink-3">
                  <span>@{builder.username}</span>
                  {memberSince && (
                    <span className="whitespace-nowrap">
                      <span aria-hidden="true" className="mx-2">·</span>
                      {memberSince}
                    </span>
                  )}
                  {/* The contact panel carries presence from `lg` up; on a
                      phone it takes its own line. */}
                  <span className="basis-full whitespace-nowrap sm:basis-auto lg:hidden">
                    <span aria-hidden="true" className="mx-2 hidden sm:inline">·</span>
                    <Presence online={builder.online} />
                  </span>
                </p>
              </div>

              {canFavorite && builder.id && (
                <button
                  type="button"
                  onClick={() => toggleFavorite(builder.id, "builder")}
                  aria-pressed={favorited}
                  aria-label={favorited ? t("card.removeFavorite") : t("card.addFavorite")}
                  className="btn btn-secondary btn-sm flex-shrink-0 px-2.5 sm:px-3"
                >
                  <Icon name="heart" size={15} filled={favorited} className={favorited ? "text-accent-ink" : ""} />
                  <span className="hidden sm:inline">{favorited ? t("profile.saved") : t("profile.save")}</span>
                </button>
              )}
            </div>

            {builder.specialties.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {builder.specialties.map((s) => (
                  <span key={s} className="tag h-6 px-2 text-xs">
                    {styleChipLabel(s, t.lang)}
                  </span>
                ))}
              </div>
            )}

            {/* Below `lg` the contact panel is replaced by the bottom bar, so
                the links live here instead. Exactly one copy is visible. */}
            <SocialLinks contactLinks={builder.contact_links} className="mt-4 lg:hidden" />
          </header>

          {/* ── Work + contact ─────────────────────────────────────────── */}
          <div className="mt-8 grid grid-cols-1 items-start gap-10 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-10">
              <section aria-labelledby="portfolio-heading">
                <h2 id="portfolio-heading" className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
                  {t("profile.portfolio")}
                  {builder.portfolio.length > 0 && (
                    <span className="text-sm font-normal text-ink-3">
                      {t("card.builds", { count: builder.portfolio.length })}
                    </span>
                  )}
                </h2>
                {builder.portfolio.length === 0 ? (
                  <div className="block-grid flex aspect-[16/10] items-center justify-center rounded-xl px-6 text-center text-sm text-ink-3">
                    {t("profile.noPortfolio")}
                  </div>
                ) : (
                  <PortfolioGallery items={builder.portfolio} />
                )}
              </section>

              {/* About — nothing at all when there is no bio. */}
              {about && (
                <section aria-labelledby="about-heading">
                  <h2 id="about-heading" className="mb-2.5 text-lg font-semibold">{t("profile.about")}</h2>
                  <p className="max-w-prose whitespace-pre-line break-words text-[15px] leading-7 text-ink-2">
                    {about}
                  </p>
                </section>
              )}
            </div>

            <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:block">
              <ContactPanel builder={builder} onContact={contactBuilder} />
            </aside>
          </div>
        </div>
      </main>

      {/* Mobile bottom bar — the message button stays in reach while scrolling. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-[60] border-t border-line/10 bg-canvas/90 px-4 pt-3 backdrop-blur-md lg:hidden">
        <button type="button" onClick={contactBuilder} className="btn btn-primary btn-lg mx-auto flex w-full max-w-lg">
          <Icon name="chat" size={17} />
          {t("profile.contactBuilder")}
        </button>
      </div>
    </div>
  );
}
