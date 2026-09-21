"use client";

import BuilderCard from "./BuilderCard";
import { Icon } from "../../../lib/icons";

export default function BuilderGrid({ builders, animKey }) {
  if (builders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center reveal active">
        <div className="w-16 h-16 sm:w-20 sm:h-20 glass rounded-3xl flex items-center justify-center text-gray-400 mb-5 sm:mb-6">
          <Icon name="search" size={32} strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-semibold mb-2">No builders found</h3>
        <p className="text-gray-400 text-sm max-w-xs">
          Try adjusting your filters or search query to find more creators.
        </p>
      </div>
    );
  }

  return (
    /* Two per row on every width. A phone used to show one card at a time,
       which turned browsing into scrolling past one builder per screen; the
       card below is sized so the narrow column still reads. */
    <div
      key={animKey}
      className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 xs:gap-3.5 sm:gap-5"
    >
      {builders.map((builder, index) => (
        <BuilderCard
          key={`${animKey}-${builder.username}`}
          builder={builder}
          animationDelay={Math.min(index, 8) * 65}
        />
      ))}
    </div>
  );
}
