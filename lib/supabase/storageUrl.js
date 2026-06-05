"use client";

// Rewrites Storage URLs that were saved with the *old* Supabase host (back when
// the app talked to `*.supabase.co` directly) so they go through the current
// proxy host instead. Only the host part is changed; the path/query stay intact.
//
// Why this exists: Russia blocks Cloudflare-fronted `*.supabase.co`, so we now
// route the SDK through a Deno Deploy proxy (see proxy/supabase-proxy.ts). New
// uploads already use the proxy host, but rows uploaded before the swap still
// embed the old absolute URL. Rewriting at render time fixes the legacy data
// without a DB migration, and remains correct if the proxy host ever changes.

const LEGACY_HOSTS = ["czorlwcjseiwpjuwtpry.supabase.co"];

function currentBase() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function rewriteStorageUrl(url) {
  if (!url || typeof url !== "string") return url;
  const base = currentBase();
  if (!base) return url;
  // Already pointing at the current base — nothing to do.
  if (url.startsWith(`${base}/`)) return url;
  for (const host of LEGACY_HOSTS) {
    if (url.includes(`://${host}/`)) {
      return url.replace(/^https?:\/\/[^/]+/, base);
    }
  }
  return url;
}

// Field names that hold Storage URLs anywhere in a Supabase response. Joins
// nest profile rows under various aliases (buyer, builder, reviewer, ...), so
// instead of hand-patching every loader we deep-walk the response and rewrite
// these keys wherever they appear. Cheap (string check + key match) and runs
// once per fetch.
const URL_FIELD_KEYS = new Set([
  "avatar_url",
  "banner_url",
  "other_avatar_url",
  "thumbnail",
  "preview_url",
  // portfolio_images.url — also the generic key in mapped portfolio entries.
  "url",
]);

export function rewriteUrlsDeep(value) {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(rewriteUrlsDeep);
  const out = {};
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (typeof v === "string" && URL_FIELD_KEYS.has(k)) {
      out[k] = rewriteStorageUrl(v);
    } else if (v && typeof v === "object") {
      out[k] = rewriteUrlsDeep(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
