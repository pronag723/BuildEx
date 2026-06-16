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

import { useEffect, useState } from "react";

import BuilderProfilePage from "./[username]/components/BuilderProfilePage";
import BuilderNotFound from "./[username]/components/BuilderNotFound";
import { fetchBuilderByUsername } from "../data/fetchBuilders";

export default function ProfileByQueryPage() {
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState(null);

  useEffect(() => {
    const handle = new URLSearchParams(window.location.search).get("u");
    if (!handle) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetchBuilderByUsername(handle).then(({ builder: row }) => {
      if (cancelled) return;
      setBuilder(row || null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
      </main>
    );
  }

  if (!builder) return <BuilderNotFound />;

  return <BuilderProfilePage builder={builder} />;
}
