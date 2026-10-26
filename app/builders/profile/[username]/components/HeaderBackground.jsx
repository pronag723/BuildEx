"use client";

import { headerBgOverlay, hasHeaderBg } from "../../../../../lib/profile/headerBg.mjs";
import { rewriteStorageUrl } from "../../../../../lib/supabase/storageUrl";

// The builder's header background (0110), behind the top of the profile —
// visitors' page and the owner's editor alike. Full width, ~620px on a phone
// and 460px on desktop, dimmed and faded into the page colour so the text on
// it stays readable in either theme. The parent must be `relative`.
export default function HeaderBackground({ bg, className = "" }) {
  if (!hasHeaderBg(bg)) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 h-[620px] overflow-hidden lg:h-[460px] ${className}`}
    >
      {bg.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rewriteStorageUrl(bg.imageUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
      ) : (
        <div className="absolute inset-0" style={{ background: bg.color }} />
      )}
      <div className="absolute inset-0" style={{ background: headerBgOverlay(bg.dim) }} />
    </div>
  );
}
