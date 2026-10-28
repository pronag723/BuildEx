"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { getSupabaseClient } from "../supabase/client";

// Whether the current visitor has a builder profile: true / false, or null
// while that's still unknown (auth loading, or the lookup in flight). A guest
// is never a builder. Builder-ness is the builder_profiles row, never
// profiles.role — the owner can read their own row even while it is hidden.
//
// The header, the phone menu and the feed all ask at once, so they share one
// in-flight lookup. Only a "yes" is remembered for the session: someone who is
// not a builder yet may become one in onboarding without a page reload, and
// the next component to mount should see that.

const builders = new Set();
const pending = new Map();

function lookup(userId) {
  if (!pending.has(userId)) {
    const supabase = getSupabaseClient();
    const request = supabase
      ? supabase
          .from("builder_profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle()
          .then(({ data, error }) => (error ? null : Boolean(data)))
          .catch(() => null)
      : Promise.resolve(null);
    pending.set(
      userId,
      request.then((isBuilder) => {
        pending.delete(userId);
        if (isBuilder) builders.add(userId);
        return isBuilder;
      })
    );
  }
  return pending.get(userId);
}

export function useIsBuilder() {
  const { status, user } = useAuth();
  const userId = status === "authenticated" ? user?.id ?? null : null;
  const [answer, setAnswer] = useState({ userId: null, isBuilder: null });

  useEffect(() => {
    if (!userId || builders.has(userId)) return undefined;
    let cancelled = false;
    lookup(userId).then((isBuilder) => {
      if (!cancelled) setAnswer({ userId, isBuilder });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (status === "loading") return null;
  if (status !== "authenticated") return false;
  if (!userId) return null;
  if (builders.has(userId)) return true;
  return answer.userId === userId ? answer.isBuilder : null;
}
