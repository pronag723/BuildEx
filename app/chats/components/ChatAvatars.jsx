"use client";

import Avatar from "../../../lib/ui/Avatar";
import { Icon } from "../../../lib/icons";
import { isOnline } from "../../../lib/presence/api";

// A person's avatar with the presence dot in its corner — only while they are
// really on the site (profiles.last_seen_at inside the presence window).
export function PresenceAvatar({ src, name, size = 44, lastSeenAt, ring = "ring-surface" }) {
  const online = isOnline(lastSeenAt);
  const dot = size >= 40 ? 11 : 9;
  return (
    <span className="relative inline-flex flex-shrink-0">
      <Avatar src={src} name={name} size={size} />
      {online && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full bg-accent ring-2 ${ring}`}
          style={{ width: dot, height: dot }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

// The two system threads get neutral tiles, not coloured ones: the wordmark
// for the official channel, a lifebuoy for support.
function Tile({ size, children }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center border border-line/[0.09] bg-raised text-ink-2"
      style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.25)) }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function UpdatesAvatar({ size = 44 }) {
  return (
    <Tile size={size}>
      <span className="wordmark leading-none text-ink" style={{ fontSize: Math.round(size * 0.34) }}>
        bx
      </span>
    </Tile>
  );
}

export function SupportAvatar({ size = 44 }) {
  return (
    <Tile size={size}>
      <Icon name="support" size={Math.round(size * 0.45)} />
    </Tile>
  );
}
