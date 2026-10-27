"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Public builder profile — query-param route (/builders/profile?u=<handle>).
//
// The sibling `[username]` route can only ever serve the handful of usernames
// listed in its generateStaticParams (a hard requirement of `output: "export"`),
// so it can't show real, DB-created builders. This single static page reads the
// handle from the URL on the client and fetches the builder from Supabase,
// which works for any user without a rebuild.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import BuilderProfilePage, { BuilderProfileSkeleton } from "./[username]/components/BuilderProfilePage";
import BuilderNotFound from "./[username]/components/BuilderNotFound";
import { fetchBuilderByUsername } from "../data/fetchBuilders";

export default function ProfileByQueryPage() {
  return (
    <Suspense fallback={<BuilderProfileSkeleton />}>
      <ProfileByQuery />
    </Suspense>
  );
}

// Follows ?u= as it changes: a link from one profile to another (a work's
// co-author) is a client navigation to this same page, which stays mounted.
function ProfileByQuery() {
  const handle = useSearchParams().get("u");
  const [state, setState] = useState({ handle: undefined, builder: null });

  useEffect(() => {
    if (!handle) {
      setState({ handle, builder: null });
      return undefined;
    }

    let cancelled = false;
    fetchBuilderByUsername(handle).then(({ builder: row }) => {
      if (cancelled) return;
      setState({ handle, builder: row || null });
    });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (state.handle !== handle) return <BuilderProfileSkeleton />;

  if (!state.builder) return <BuilderNotFound />;

  // Keyed so the next builder starts fresh: no open work, works or likes
  // carried over from the previous profile.
  return <BuilderProfilePage key={state.builder.id} builder={state.builder} />;
}
