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

let activeScrollAnimation = null;

export function smoothScrollTo(target, duration = 800) {
  const targetElement = document.querySelector(target);
  if (!targetElement) return;

  // A second navigation click used to start a competing requestAnimationFrame
  // loop, making the page lurch between two destinations. Keep one scroll
  // transaction at a time and honour the system motion preference.
  if (activeScrollAnimation) {
    window.cancelAnimationFrame(activeScrollAnimation);
    activeScrollAnimation = null;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targetElement.scrollIntoView({ block: "start", behavior: "auto" });
    return;
  }

  const startPosition = window.pageYOffset;
  const targetPosition =
    targetElement.getBoundingClientRect().top + window.pageYOffset;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);
    const ease =
      progress < 0.5
        ? 2 * progress * progress
        : -1 + (4 - 2 * progress) * progress;

    window.scrollTo(0, startPosition + distance * ease);
    if (timeElapsed < duration) {
      activeScrollAnimation = requestAnimationFrame(animation);
    } else {
      activeScrollAnimation = null;
    }
  }

  activeScrollAnimation = requestAnimationFrame(animation);
}

export function showSoon(message) {
  window.alert(message);
}
