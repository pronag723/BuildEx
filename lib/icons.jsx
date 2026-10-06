// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Icon system
// One icon family (lucide-react) at one stroke weight. Components ask for an
// icon by semantic key — <Icon name="heart" /> — rather than importing glyphs
// or pasting SVG paths, so the whole site draws from the same set. Data files
// (contact link platforms, the about-page steps) store keys, not components.
//
// The registry holds only keys something actually renders. An unknown key
// renders nothing and warns in development.
// ─────────────────────────────────────────────────────────────────────────────

import {
  // navigation and actions
  ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Menu, X,
  Search, SlidersHorizontal, Check, Plus, Pencil, Trash2, Upload, Maximize2,
  ExternalLink, RefreshCw, LogOut,
  // people, messaging, account
  User, Users, MessageCircle, Send, ImagePlus, Image as ImageIcon, Flag, ShieldCheck,
  Bell, Heart, Hammer, Mail,
  // theme
  Sun, Moon,
  // contact link platforms
  AtSign, CirclePlay, Video, Music, Camera, Link2,
  // moderation console
  Eye, EyeOff, Calendar,
} from "lucide-react";

export const ICONS = {
  // navigation and actions
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  menu: Menu,
  close: X,
  search: Search,
  filters: SlidersHorizontal,
  check: Check,
  plus: Plus,
  pencil: Pencil,
  trash: Trash2,
  upload: Upload,
  expand: Maximize2,
  external: ExternalLink,
  refresh: RefreshCw,
  logout: LogOut,

  // people, messaging, account
  user: User,
  users: Users,
  chat: MessageCircle,
  send: Send,
  photo: ImagePlus,
  image: ImageIcon,
  flag: Flag,
  shield: ShieldCheck,
  bell: Bell,
  heart: Heart,
  hammer: Hammer,
  mail: Mail,

  // theme
  sun: Sun,
  moon: Moon,

  // contact link platforms (builder_profiles.contact_links). lucide ships no
  // brand marks, so each platform borrows the closest semantic glyph — one
  // coherent family beats eight mismatched logos.
  at: AtSign,        // X / Twitter
  play: CirclePlay,  // YouTube
  video: Video,      // Twitch
  music: Music,      // TikTok
  camera: Camera,    // Instagram
  link: Link2,       // a website

  // moderation console
  eye: Eye,
  eyeOff: EyeOff,
  calendar: Calendar,
};

/**
 * Render an icon by semantic key with consistent defaults.
 * Inherits colour via `currentColor`, so callers set colour with text classes.
 * `filled` fills the shape (a saved heart).
 */
export function Icon({ name, size = 18, strokeWidth = 1.75, filled = false, className = "", ...rest }) {
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
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
      {...rest}
    />
  );
}
