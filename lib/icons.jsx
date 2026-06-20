// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Icon system
// A single cohesive icon family (lucide-react) replaces the old emoji "stickers".
// Data files (offers.js, onboarding/constants.js, home/data.js) stay serializable
// by storing string keys (e.g. icon: "castle"); render sites resolve them here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  // build styles
  Castle, Sparkles, Rocket, Cpu, Building2, Camera, Leaf, Mountain, Swords, Palette,
  // server types
  Globe, Handshake, Gamepad2, Drama, Network,
  // builder tools
  Wand2, Paintbrush, Axe, Sprout, Wrench, Map, Ruler, Box, Film, Image as ImageIcon, Pickaxe,
  // project types
  Briefcase, Users, Trophy, Link2, Zap,
  // pricing tiers
  Home, Landmark, Package,
  // app surfaces (orders / chat / admin / profile / offer detail)
  Lock, ShieldCheck, MessageCircle, Scale, Clock, Calendar, RotateCcw,
  Folder, Lightbulb, Blocks, Info, PartyPopper, Check, X, FileText,
  // flow / misc
  Search, Wallet, Hammer, Target, Sun, Moon, Star, LogOut,
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
  // server types
  globe: Globe,
  handshake: Handshake,
  gamepad: Gamepad2,
  drama: Drama,
  network: Network,
  // builder tools
  wand: Wand2,
  paintbrush: Paintbrush,
  axe: Axe,
  sprout: Sprout,
  wrench: Wrench,
  map: Map,
  ruler: Ruler,
  box: Box,
  film: Film,
  image: ImageIcon,
  pickaxe: Pickaxe,
  // project types
  briefcase: Briefcase,
  users: Users,
  trophy: Trophy,
  link: Link2,
  zap: Zap,
  // pricing tiers
  home: Home,
  landmark: Landmark,
  package: Package,
  // studios (partner program)
  studio: Building2,
  // app surfaces
  lock: Lock,
  shield: ShieldCheck,
  chat: MessageCircle,
  scale: Scale,
  clock: Clock,
  calendar: Calendar,
  revision: RotateCcw,
  folder: Folder,
  files: FileText,
  lightbulb: Lightbulb,
  blocks: Blocks,
  info: Info,
  party: PartyPopper,
  check: Check,
  close: X,
  // flow / misc
  search: Search,
  wallet: Wallet,
  hammer: Hammer,
  target: Target,
  sun: Sun,
  moon: Moon,
  star: Star,
  logout: LogOut,

  // ── Legacy aliases ──────────────────────────────────────────────────────
  // Pricing-tier icons were once persisted as emoji in the DB (builder_profiles
  // rates jsonb). Map those stored glyphs to the new icons so existing rows keep
  // rendering. New saves store the string keys above.
  "🏠": Home,
  "🏛️": Landmark,
  "🏰": Castle,
  "📦": Package,
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

/**
 * A row of filled rating stars. Color is inherited from the parent (set a text
 * color class on the wrapper, e.g. text-amber-400).
 */
export function Stars({ count = 5, size = 14, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} size={size} strokeWidth={0} className="fill-current" />
      ))}
    </span>
  );
}
