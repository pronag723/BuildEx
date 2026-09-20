// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Icon system
// A single cohesive icon family (lucide-react) replaces the old emoji "stickers".
// Data files (offers.js, onboarding/constants.js, home/data.js) stay serializable
// by storing string keys (e.g. icon: "castle"); render sites resolve them here.
//
// The registry holds only keys something actually renders. The tier, rank,
// order, payment and review icons went with those features, and the legacy
// emoji aliases went with the pricing-tier rows they were there to keep
// rendering. An unknown key renders nothing and warns in development.
// ─────────────────────────────────────────────────────────────────────────────

import {
  // build styles
  Castle, Sparkles, Rocket, Cpu, Building2, Camera, Leaf, Mountain, Swords, Palette,
  // people / work
  Handshake, Users, Link2, Image as ImageIcon, Hammer,
  // app surfaces (chat / admin / profile / onboarding)
  ShieldCheck, MessageCircle, Calendar, Blocks, Info, Check, X,
  // flow / misc
  Search, Sun, Moon, LogOut,
  // contact / social links
  Send, AtSign, CirclePlay, Video, Music,
  // moderation console
  Eye, EyeOff, Trash2, ExternalLink, Flag, User, RefreshCw,
} from "lucide-react";

// Semantic key → lucide component. Keys are referenced from the data files.
export const ICONS = {
  // styles
  castle: Castle,
  sparkles: Sparkles,
  rocket: Rocket,
  cyberpunk: Cpu,
  modern: Building2,
  camera: Camera,
  leaf: Leaf,
  mountain: Mountain,
  swords: Swords,
  palette: Palette,
  // people / work
  handshake: Handshake,
  users: Users,
  link: Link2,
  image: ImageIcon,
  hammer: Hammer,
  // app surfaces
  shield: ShieldCheck,
  chat: MessageCircle,
  calendar: Calendar,
  blocks: Blocks,
  info: Info,
  check: Check,
  close: X,
  // flow / misc
  search: Search,
  sun: Sun,
  moon: Moon,
  logout: LogOut,
  // contact / social links (builder_profiles.contact_links). lucide ships no
  // brand marks, so each platform borrows the closest semantic glyph — one
  // coherent family beats eight mismatched logos.
  send: Send,       // Telegram
  at: AtSign,       // X / Twitter
  play: CirclePlay, // YouTube
  video: Video,     // Twitch
  music: Music,     // TikTok

  // ── Moderation console ───────────────────────────────────────────────────
  eye: Eye,
  eyeOff: EyeOff,
  trash: Trash2,
  external: ExternalLink,
  flag: Flag,
  user: User,
  refresh: RefreshCw,
};

/**
 * Render an icon by semantic key with consistent defaults.
 * Inherits color via `currentColor`, so callers control color with text classes.
 */
export function Icon({ name, size = 18, strokeWidth = 1.75, className = "", ...rest }) {
  const Cmp = ICONS[name];
  if (!Cmp) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[icons] Unknown icon key: "${name}"`);
    }
    return null;
  }
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      {...rest}
    />
  );
}
