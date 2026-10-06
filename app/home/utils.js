/** Prefix public asset paths when deployed under a subpath (e.g. GitHub Pages). */
export function publicAsset(path) {
  if (!path) return path;
  // Absolute URLs (Supabase Storage, data/blob URIs, external images) must be
  // used verbatim — prefixing them with the basePath would corrupt them into
  // paths like "/https://…", which is why DB-backed images failed to load.
  if (/^(?:https?:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}`;
}

/** Prefix internal route hrefs with the deployment basePath. */
export function withBase(path) {
  return publicAsset(path);
}
