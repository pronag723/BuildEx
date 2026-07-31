"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatPrice } from "../../../lib/pricing";

function Chevron({ className = "w-5 h-5" }) {
  return <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7l3 3-3 3" /></svg>;
}

function Arrow({ className = "w-4 h-4" }) {
  return <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 10h10M11 6l4 4-4 4" /></svg>;
}

export default function ReadyBuildCard({ listing, animationDelay = 0 }) {
  const media = [...(listing.media || [])].sort((a, b) => a.position - b.position);
  const [index, setIndex] = useState(0);
  const [infoHover, setInfoHover] = useState(false);
  const touchStartX = useRef(null);
  const count = media.length;

  const changeSlide = (event, direction) => {
    event.preventDefault();
    event.stopPropagation();
    setIndex((current) => (current + direction + count) % count);
  };

  const selectSlide = (event, nextIndex) => {
    event.preventDefault();
    event.stopPropagation();
    setIndex(nextIndex);
  };

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX == null || endX == null || Math.abs(endX - startX) < 36 || count < 2) return;
    setIndex((current) => (endX < startX ? (current + 1) % count : (current - 1 + count) % count));
  };

  return (
    <Link
      href={`/build?id=${encodeURIComponent(listing.id)}`}
      className="offer-card glass rounded-3xl overflow-hidden group flex flex-col cursor-pointer"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div
        className="group/media card-carousel relative h-64 sm:h-72 flex-shrink-0 overflow-hidden bg-black/40"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {count ? (
          <div className="card-carousel-track flex h-full w-full" style={{ transform: `translateX(-${index * 100}%)` }}>
            {media.map((image) => (
              <div key={image.id} className="relative h-full w-full flex-shrink-0 overflow-hidden">
                <img
                  src={image.url}
                  alt={image.alt || listing.title}
                  className={`h-full w-full object-cover transition-transform duration-[550ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${infoHover ? "scale-[1.07]" : "scale-100"}`}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        ) : <div className="flex h-full items-center justify-center text-sm text-gray-600">Photos coming soon</div>}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${infoHover ? "opacity-100" : "opacity-0"}`}>
          <span className={`inline-flex items-center gap-2 rounded-full bg-[#4ade80] px-6 py-2.5 text-sm font-bold text-black shadow-lg shadow-green-500/30 transition-transform duration-300 ${infoHover ? "translate-y-0" : "translate-y-2.5"}`}>View Build <Arrow /></span>
        </div>

        <span className="absolute left-3 top-3 z-10 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-xs capitalize text-white/80 backdrop-blur-md">{listing.style}</span>
        <span className="absolute right-3 top-3 z-10 rounded-full border border-[#4ade80]/35 bg-black/60 px-3 py-1 text-sm font-extrabold text-[#4ade80] backdrop-blur-md">{formatPrice(listing.price_kopecks)}</span>

        {count > 1 && <>
          <button type="button" aria-label="Previous image" onClick={(event) => changeSlide(event, -1)} className="carousel-arrow absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/50 bg-[#4ade80]/25 text-white backdrop-blur-md hover:border-[#4ade80] hover:bg-[#4ade80] hover:text-black"><Chevron className="h-5 w-5 rotate-180" /></button>
          <button type="button" aria-label="Next image" onClick={(event) => changeSlide(event, 1)} className="carousel-arrow absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/50 bg-[#4ade80]/25 text-white backdrop-blur-md hover:border-[#4ade80] hover:bg-[#4ade80] hover:text-black"><Chevron /></button>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5" role="tablist" aria-label="Build images">
            {media.map((image, slideIndex) => <button type="button" key={image.id} onClick={(event) => selectSlide(event, slideIndex)} role="tab" aria-selected={slideIndex === index} aria-label={`Show image ${slideIndex + 1}`} className={`carousel-progress-indicator h-1.5 rounded-full ${slideIndex === index ? "w-4 bg-[#4ade80]" : "w-1.5 bg-white/50"}`} />)}
          </div>
        </>}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5" onMouseEnter={() => setInfoHover(true)} onMouseLeave={() => setInfoHover(false)}>
        <div>
          <h2 className="truncate text-lg font-bold">{listing.title}</h2>
          <p className="mt-1 min-h-10 line-clamp-2 text-sm leading-relaxed text-gray-400">{listing.description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
          <div><p className="text-[10px] uppercase tracking-wide text-gray-500">Instant download</p><p className="text-xs text-gray-300">3D preview included</p></div>
          <span className="offer-card-view-btn inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/30 bg-[#4ade80]/12 px-4 py-2 text-xs font-semibold text-[#4ade80] transition-all group-hover:border-[#4ade80] group-hover:bg-[#4ade80] group-hover:text-black group-hover:shadow-[0_0_18px_rgba(74,222,128,0.45)]">View Build <Arrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
        </div>
      </div>
    </Link>
  );
}
