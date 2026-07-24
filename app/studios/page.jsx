"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import BuilderProfilePage from "../builders/profile/[username]/components/BuilderProfilePage";
import BuilderNotFound from "../builders/profile/[username]/components/BuilderNotFound";
import { fetchStudio } from "../../lib/studios/api";

export default function StudioPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudioPageInner />
    </Suspense>
  );
}

function StudioPageInner() {
  const params = useSearchParams();
  const slug = params.get("s") || "";
  const [studio, setStudio] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchStudio(slug).then(({ studio: row }) => {
      if (!active) return;
      setStudio(row || null);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) return <Loading />;
  if (!studio) return <BuilderNotFound provider="studio" />;

  return (
    <BuilderProfilePage
      builder={{
        ...studio,
        tools: [],
        response_time: "live",
        online: studio.has_capacity,
      }}
    />
  );
}

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
    </main>
  );
}
