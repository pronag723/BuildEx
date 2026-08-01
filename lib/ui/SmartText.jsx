"use client";

const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCTUATION_RE = /[),.;!?]+$/;

function compactUrlLabel(rawUrl) {
  try {
    const url = new URL(rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "buildex.builders") {
      if (url.pathname.startsWith("/builders/profile")) {
        const handle = url.searchParams.get("u");
        return handle ? `BuildEx profile · @${handle}` : "BuildEx profile";
      }
      if (url.pathname.startsWith("/build")) return "BuildEx ready-made build";
      if (url.pathname.startsWith("/orders")) return "BuildEx order";
      if (url.pathname.startsWith("/studios")) return "BuildEx studio";
      return "BuildEx link";
    }

    const pathPart = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join(" / ");
    const label = pathPart ? `${host} · ${pathPart}` : host;
    return label.length > 48 ? `${label.slice(0, 45)}…` : label;
  } catch {
    return rawUrl.length > 48 ? `${rawUrl.slice(0, 45)}…` : rawUrl;
  }
}

export default function SmartText({ children, linkClassName = "" }) {
  const text = String(children ?? "");
  const parts = text.split(URL_RE);

  return parts.map((part, index) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;

    const punctuation = part.match(TRAILING_PUNCTUATION_RE)?.[0] || "";
    const rawUrl = punctuation ? part.slice(0, -punctuation.length) : part;
    const href = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl;

    return (
      <span key={`${index}-${rawUrl}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={rawUrl}
          className={`smart-link ${linkClassName}`}
        >
          <span className="smart-link-label">{compactUrlLabel(rawUrl)}</span>
          <span aria-hidden="true" className="smart-link-arrow">↗</span>
        </a>
        {punctuation}
      </span>
    );
  });
}
