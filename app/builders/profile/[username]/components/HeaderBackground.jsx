"use client";

import { useEffect } from "react";
import { headerBgOverlay, hasHeaderBg } from "../../../../../lib/profile/headerBg.mjs";
import { rewriteStorageUrl } from "../../../../../lib/supabase/storageUrl";
import { announceScene } from "../../../../components/SiteHeader";

// The id the site header looks for: pages showing this pass it as the
// navbar's `overScene`, so the header turns see-through over the background.
export const PROFILE_SCENE_ID = "profile-scene";

// The builder's header background (0110), behind the top of the profile —
// visitors' page and the owner's editor alike. Full width, ~620px on a phone
// and 460px on desktop below the site header, dimmed and faded into the page
// colour so the text on it stays readable in either theme. It reaches up
// under the site header (which goes see-through over it), so the header takes
// on the background too. The parent must be `relative`.
export default function HeaderBackground({ bg, className = "" }) {
  const shown = hasHeaderBg(bg);

  // Tell the header it has a scene to lie over (or not) once the DOM has it.
  useEffect(() => {
    const id = setTimeout(announceScene, 0);
    return () => {
      clearTimeout(id);
      setTimeout(announceScene, 0);
    };
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      id={PROFILE_SCENE_ID}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-[calc(-1*var(--header-h))] h-[calc(620px+var(--header-h))] overflow-hidden lg:h-[calc(460px+var(--header-h))] ${className}`}
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
