"use client";

import BuilderCard from "./BuilderCard";

export default function BuilderGrid({ builders, animKey }) {
  if (builders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center reveal active">
        <div className="w-20 h-20 glass rounded-3xl flex items-center justify-center text-4xl mb-6">
          🔍
        </div>
        <h3 className="text-xl font-semibold mb-2">No builders found</h3>
        <p className="text-gray-400 text-sm max-w-xs">
          Try adjusting your filters or search query to find more creators.
        </p>
      </div>
    );
  }

  return (
    <div
      key={animKey}
      className="grid grid-cols-1 sm:grid-cols-2 gap-5"
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
