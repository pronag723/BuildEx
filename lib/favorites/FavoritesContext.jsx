"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Favorites context
// Holds the signed-in user's set of favorited builder ids so any component (the
// catalog cards, the filter, a future "saved" page) can read it and toggle it
// from anywhere — mirroring UnreadContext / NotificationsContext.
//
// Toggles are optimistic: the UI flips instantly and we reconcile with Supabase
// in the background, rolling back only if the write fails. A logged-out user
// gets an empty, no-op store (isFavorite always false, toggle resolves to a
// "needs auth" signal the caller can act on).
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { addFavorite, listFavorites, removeFavorite } from "./api";

const FavoritesContext = createContext({
  favoriteIds: new Set(),
  favoriteCount: 0,
  ready: false,
  canFavorite: false,
  isFavorite: () => false,
  toggleFavorite: async () => ({ ok: false, reason: "unconfigured" }),
});

export function FavoritesProvider({ children }) {
  const { status, user } = useAuth();
  const meId = user?.id || null;

  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  // (Re)load the favorites whenever the signed-in user changes. A logged-out
  // user resolves to an empty set.
  useEffect(() => {
    let cancelled = false;

    if (status !== "authenticated" || !meId) {
      setFavoriteIds(new Set());
      setReady(status !== "loading");
      return undefined;
    }

    setReady(false);
    listFavorites().then(({ builderIds }) => {
      if (cancelled) return;
      setFavoriteIds(new Set(builderIds));
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [status, meId]);

  const isFavorite = useCallback(
    (builderId) => Boolean(builderId) && favoriteIds.has(builderId),
    [favoriteIds]
  );

  // Optimistically flip the bookmark, then persist. Returns a small result so
  // the caller can react (e.g. show a "sign in to save builders" toast).
  const toggleFavorite = useCallback(
    async (builderId) => {
      if (!builderId) return { ok: false, reason: "invalid" };
      if (status !== "authenticated" || !meId) {
        return { ok: false, reason: "unauthenticated" };
      }

      const wasFavorite = favoriteIds.has(builderId);

      // Optimistic update.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(builderId);
        else next.add(builderId);
        return next;
      });

      const { error } = wasFavorite
        ? await removeFavorite(meId, builderId)
        : await addFavorite(meId, builderId);

      if (error) {
        // Roll back on failure.
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(builderId);
          else next.delete(builderId);
          return next;
        });
        return { ok: false, reason: "error", error };
      }

      return { ok: true, favorited: !wasFavorite };
    },
    [status, meId, favoriteIds]
  );

  const value = useMemo(
    () => ({
      favoriteIds,
      favoriteCount: favoriteIds.size,
      ready,
      canFavorite: status === "authenticated" && Boolean(meId),
      isFavorite,
      toggleFavorite,
    }),
    [favoriteIds, ready, status, meId, isFavorite, toggleFavorite]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
