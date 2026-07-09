# BuildEx — Minecraft Builder Marketplace

> A freelance marketplace platform connecting Minecraft server owners with professional builders. Commission custom spawns, lobbies, hubs and world decorations through a secure, escrow-based payment system.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?style=flat-square&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![NOWPayments](https://img.shields.io/badge/NOWPayments-Crypto_Payments-10B981?style=flat-square)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Design System](#design-system)
- [Database Schema](#database-schema)
- [Pages and Routes](#pages-and-routes)
- [Components](#components)
- [API Routes](#api-routes)
- [Business Logic](#business-logic)
- [Authentication](#authentication)
- [Payments and Escrow](#payments-and-escrow)
- [Builder Rank System](#builder-rank-system)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Development Roadmap](#development-roadmap)

---

## Overview

BuildEx is a niche freelance marketplace built specifically for the Minecraft community. Server owners post projects and receive bids from vetted builders. Payments are held in escrow until the build is approved — protecting both parties. Builders earn a rank as they complete more projects, which reduces their platform commission and increases their visibility.

The platform was designed with a dark glass aesthetic inspired by modern gaming portals, using frosted glass surfaces, animated green gradients, and smooth scroll-reveal animations throughout.

---

## Features

### Landing Page
- Full-screen hero section with animated floating cards showing live platform data
- Left-aligned headline with right-side visual cluster (featured builder card, bid notification, online indicator, escrow status)
- Animated moving green gradient that responds to scroll position
- Auto-scrolling horizontal belt of top builder projects (pauses on hover)
- Scroll-reveal animations on all sections
- Dark / light theme toggle with localStorage persistence
- Animated stat counters (count-up on scroll into view)
- Fully responsive: mobile hamburger menu, tablet and desktop layouts
- How It Works section with 3-step explainer
- Testimonials grid from real community members
- Sticky frosted glass navbar

### Catalog / Offer Feed
- Paginated grid of active builder offers
- Sidebar filters: style, build type, price range, rating, rank
- URL-encoded filter state (shareable and SEO-indexable links)
- Search bar with instant results
- Sort by: newest, highest rated, price low→high, price high→low
- Offer cards showing thumbnail, builder name + rank badge, starting price, rating, tags
- Hover overlay with "View offer" CTA

### Offer Detail Page
- Full image gallery with thumbnail navigation
- Complete offer description, scope, delivery timeline, revision policy
- Sticky builder sidebar with mini-profile, package selector and price breakdown
- Price breakdown showing: builder price + BuildEx fee (based on rank) = total you pay
- "Order now" CTA — requires authentication

### Builder Profiles
- Public profile page at `/builders/profile/[username]`
- Profile banner with dark green gradient background
- Avatar with rank badge (color-coded by tier) positioned at bottom-right corner
- Online availability indicator (pulsing green dot)
- Five stat pills: average rating, projects completed, repeat client rate, response time, on-time delivery rate
- Tabbed content: Portfolio / Reviews / About
- Portfolio grid of completed builds with hover overlay
- Reviews tab with rating breakdown bar chart and individual review cards
- Sidebar cards: starting prices, rank progress, skills chart, tools and formats
- "Hire" and "Message" action buttons

### Builder Dashboard
- Protected route — builders only
- Overview page: earnings summary, active orders, recent reviews, quick actions
- **Offer management:**
  - Table of all offers with status, view count, order count, and actions
  - Create new offer via 4-step guided form
  - Edit and duplicate existing offers
  - Pause/resume offers without losing data
- **Order management:**
  - Incoming order queue with status indicators
  - Accept or decline pending orders
  - Mark order as delivered
  - View order requirements and communicate with buyer
- **Profile settings:**
  - Edit display name, bio, specialties, availability
  - Manage portfolio images
  - Builder balance, USDT withdrawal destination, and withdrawal history

### Offer Creation (Multi-Step Form)
- **Step 1 — Basics:** title, style category, build type, tags
- **Step 2 — Scope:** description (min 100 chars), starting price, delivery days, number of revisions
- **Step 3 — Media:** drag-and-drop image upload (min 3, max 10), direct upload to Supabase Storage, real-time progress per file, drag-to-reorder (first image = catalog thumbnail)
- **Step 4 — Review:** live preview of how the offer card looks in the catalog, publish button
- Auto-save as draft on every step transition
- Zod validation on all fields with inline error messages
- Cannot publish without at least 3 images

### Order System
- Buyer fills in project requirements and proceeds to checkout
- NOWPayments hosted checkout created by a Supabase Edge Function
- A signature-verified NOWPayments webhook marks the order paid
- Builder delivers schematic files via order thread
- Buyer approves: earnings become available in the builder balance
- Builder requests a partial USDT withdrawal; an admin reviews and sends it manually
- If buyer declines delivery: enters revision cycle
- Dispute flow: funds held while manual review takes place
- One review per completed order (unlocked only after completion)

### Messaging
- Per-order message thread between buyer and builder
- Real-time updates via Supabase Realtime subscriptions
- File attachments for schematic delivery

### Review System
- Star rating (1–5) + written review
- Reviews only unlockable after order reaches `completed` status (prevents fake reviews)
- Builder profile shows aggregate rating and per-star breakdown bar chart
- Each review links back to the specific project

### Authentication
- Discord OAuth as primary login (one click, no form filling)
- Email + password as fallback
- Role selection on first login: Buyer / Builder / Both
- Session persistence via Supabase JWT with refresh tokens
- Protected routes redirect to `/login` automatically

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR, routing, API routes |
| Language | JavaScript + JSX | Components and logic |
| Styling | Tailwind CSS + globals.css | Utility classes + custom design tokens |
| Database | PostgreSQL via Supabase | All persistent data |
| Auth | Supabase Auth + Discord OAuth | User sessions |
| File Storage | Supabase Storage | Portfolio images, schematic files |
| Payments | NOWPayments + Supabase Edge Functions | Buyer checkout, payout ledger, and manual USDT withdrawals |
| Forms | React Hook Form + Zod | Form state and validation |
| Notifications | react-hot-toast | In-app toast messages |
| Icons | lucide-react | UI icons |
| Real-time | Supabase Realtime | Live order messages |

---

## Project Structure

```
buildex/
├── src/
│   ├── app/
│   │   ├── layout.js                    # Root HTML shell, metadata, fonts
│   │   ├── page.jsx                     # Homepage (landing page)
│   │   ├── globals.css                  # Full design system and custom CSS
│   │   │
│   │   ├── home/                        # Homepage-specific code
│   │   │   ├── data.js                  # navItems, projects, steps, testimonials
│   │   │   ├── utils.js                 # smoothScrollTo, showSoon helpers
│   │   │   └── components/
│   │   │       ├── Navbar.jsx
│   │   │       ├── MobileMenu.jsx
│   │   │       ├── HeroSection.jsx
│   │   │       ├── ProjectsSection.jsx
│   │   │       ├── HowItWorksSection.jsx
│   │   │       ├── WhyBuildExSection.jsx
│   │   │       └── SiteFooter.jsx
│   │   │
│   │   ├── login/page.jsx               # Login page
│   │   ├── signup/page.jsx              # Registration page
│   │   │                                # (OAuth lands directly on /onboarding — no callback page)
│   │   │
│   │   ├── builders/
│   │   │   ├── page.jsx                 # Offer catalog (server-rendered)
│   │   │   ├── [offerId]/page.jsx       # Offer detail page
│   │   │   └── profile/
│   │   │       └── [username]/page.jsx  # Public builder profile
│   │   │
│   │   ├── checkout/
│   │   │   └── [offerId]/page.jsx       # Hosted payment checkout
│   │   │
│   │   ├── orders/
│   │   │   ├── page.jsx                 # All orders (buyer and builder)
│   │   │   └── [orderId]/page.jsx       # Order detail + messaging
│   │   │
│   │   ├── dashboard/
│   │   │   ├── layout.jsx               # Dashboard shell with sidebar
│   │   │   ├── page.jsx                 # Overview / stats
│   │   │   ├── offers/
│   │   │   │   ├── page.jsx             # Offer management table
│   │   │   │   ├── new/page.jsx         # Create offer (multi-step)
│   │   │   │   └── [offerId]/edit/page.jsx
│   │   │   └── orders/page.jsx          # Incoming orders
│   │   │
│   │   └── api/
│   │       ├── checkout/
│   │       │   └── create-intent/route.js
│   │       ├── orders/
│   │       │   └── [orderId]/
│   │       │       ├── accept/route.js
│   │       │       ├── complete/route.js
│   │       │       └── messages/route.js
│   │       ├── offers/
│   │       │   └── [offerId]/route.js
│   │       ├── stripe/
│   │       │   └── connect/
│   │       │       ├── onboard/route.js
│   │       │       └── status/route.js
│   │       └── webhooks/
│   │           └── stripe/route.js
│   │
│   ├── components/
│   │   ├── ui/                          # Shared primitives
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Textarea.jsx
│   │   │   ├── Select.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Badge.jsx
│   │   │   ├── Avatar.jsx
│   │   │   ├── RatingStars.jsx
│   │   │   ├── Spinner.jsx
│   │   │   └── EmptyState.jsx
│   │   │
│   │   ├── catalog/                     # Catalog page components
│   │   │   ├── OfferGrid.jsx
│   │   │   ├── OfferCard.jsx
│   │   │   ├── CatalogFilters.jsx
│   │   │   ├── CatalogSearch.jsx
│   │   │   └── CatalogSort.jsx
│   │   │
│   │   ├── offer/                       # Offer detail page components
│   │   │   ├── OfferGallery.jsx
│   │   │   ├── OfferDetails.jsx
│   │   │   ├── BuilderSidebar.jsx
│   │   │   └── OrderForm.jsx
│   │   │
│   │   ├── profile/                     # Builder profile components
│   │   │   ├── ProfileHero.jsx
│   │   │   ├── ProfileStats.jsx
│   │   │   ├── ProfileTabs.jsx
│   │   │   ├── PortfolioGrid.jsx
│   │   │   ├── ReviewsList.jsx
│   │   │   ├── ReviewCard.jsx
│   │   │   └── RankProgress.jsx
│   │   │
│   │   ├── dashboard/                   # Dashboard components
│   │   │   ├── DashboardSidebar.jsx
│   │   │   ├── OffersTable.jsx
│   │   │   ├── OrdersTable.jsx
│   │   │   └── OfferForm/
│   │   │       ├── OfferFormShell.jsx
│   │   │       ├── Step1Basics.jsx
│   │   │       ├── Step2Scope.jsx
│   │   │       ├── Step3Media.jsx
│   │   │       └── Step4Review.jsx
│   │   │
│   │   └── orders/                      # Order flow components
│   │       ├── CheckoutForm.jsx
│   │       ├── PriceBreakdown.jsx
│   │       ├── OrderTimeline.jsx
│   │       ├── OrderMessages.jsx
│   │       └── OrderActions.jsx
│   │
│   ├── context/
│   │   └── AuthContext.jsx              # User session context
│   │
│   └── lib/
│       ├── supabase/
│       │   ├── client.js                # Browser Supabase client
│       │   ├── server.js                # Server Component client
│       │   └── middleware.js            # Middleware client
│       ├── payments/                    # NOWPayments client helpers
│       ├── auth.js                      # getCurrentUser, requireAuth helpers
│       └── commission.js                # Fee calculation logic
│
├── middleware.js                        # Route protection
├── tailwind.config.js
├── next.config.js
└── .env.local
```

---

## Design System

All visual styles are defined in `src/app/globals.css`. New components must use existing classes and never redefine them.

### Colors

| Token | Dark theme | Light theme | Usage |
|---|---|---|---|
| Background | `#171717` | `#e7e6e4` | Page background |
| Surface | `#222222` | `#ffffff` | Card backgrounds |
| Primary accent | `#4ade80` | `#4ade80` | Buttons, highlights, icons |
| Green dim | `rgba(74,222,128,0.1)` | same | Tag backgrounds |
| Green border | `rgba(74,222,128,0.2)` | same | Tag borders, card borders on hover |
| Text | `#f0f0f0` | `#0f172a` | Primary text |
| Subtext | `#888888` | `#475569` | Secondary text |
| Muted | `#505050` | `#94a3b8` | Labels, metadata |

### CSS Classes (defined in globals.css)

```css
/* Frosted glass surface — use on all cards, modals, nav */
.glass { background: rgba(39,39,39,0.65); backdrop-filter: blur(28px); border: 1px solid rgba(255,255,255,0.12); }

/* Animated green glow — use on primary action buttons */
.green-glow { box-shadow: 0 0 15px -3px rgba(74,222,128,0.4); animation: gentlePulse 2.4s infinite; }

/* Card hover effect — lift + green border */
.card-hover { transition: all 0.4s cubic-bezier(0.4,0,0.2,1); }
.card-hover:hover { transform: translateY(-6px); box-shadow: 0 0 25px rgba(74,222,128,0.3); border-color: rgba(74,222,128,0.5); }

/* Scroll reveal — add .active class via IntersectionObserver */
.reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease-out, transform 0.8s ease-out; }
.reveal.active { opacity: 1; transform: translateY(0); }

/* Floating bob animation */
.floating-card { animation: floatBase 3s ease-in-out infinite; }

/* Ghost button */
.ghost-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); }

/* Animated moving gradient background */
.gradient-background { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; }
```

### Typography

| Element | Font | Weight | Class |
|---|---|---|---|
| Logo | Space Grotesk | 700–800 | `logo-font` |
| Page headings | Space Grotesk | 700–800 | `font-bold tracking-tighter` |
| Section headings | Inter | 600 | `text-4xl font-semibold` |
| Body text | Inter | 400 | `text-gray-400` |
| Labels / metadata | Inter | 500 | `text-sm text-gray-400` |

### Component Conventions

- **Buttons:** always `rounded-full` (pill shape), never square or `rounded-lg`
- **Cards:** `rounded-3xl` for large cards, `rounded-2xl` for smaller panels
- **Tags / badges:** `rounded-full px-3 py-1 text-xs font-medium`
- **Section spacing:** `py-24` vertical padding, `max-w-7xl mx-auto px-6` container
- **Page padding:** `pt-24` top padding to clear the fixed navbar

---

## Database Schema

All tables live in Supabase PostgreSQL with Row Level Security enabled.

### `profiles`
Extends `auth.users`. Created automatically on first login.

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | References `auth.users.id` |
| `username` | text (unique) | Public URL slug |
| `display_name` | text | Shown everywhere in UI |
| `avatar_url` | text | Supabase Storage URL |
| `discord_id` | text (unique) | From Discord OAuth |
| `role` | text | `buyer` / `builder` / `both` |
| `minecraft_username` | text | Optional |
| `bio` | text | Profile description |
| `created_at` | timestamptz | Auto |

### `builder_profiles`
One-to-one with `profiles` for builder-specific data.

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | References `profiles.id` |
| `rank` | text | `newcomer` / `builder` / `craftsman` / `architect` / `master` |
| `specialties` | text[] | Array of style tags |
| `response_time_hours` | int | Avg response time |
| `projects_completed` | int | Completed order count |
| `avg_rating` | numeric(3,2) | Calculated from reviews |
| `repeat_client_rate` | int | Percentage |
| `on_time_rate` | int | Percentage |
| `is_available` | boolean | Accepting new orders |
| `payout_method` | text | Builder USDT withdrawal network |

### `offers`
A builder's listed service (like a Fiverr gig).

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | |
| `builder_id` | uuid (FK) | References `profiles.id` |
| `title` | text | 10–80 chars |
| `description` | text | 100–2000 chars |
| `style` | text | `medieval` / `scifi` / `fantasy` / `organic` / `modern` / `pvp` / `hub` / `other` |
| `build_type` | text | `spawn` / `lobby` / `hub` / `arena` / `decoration` / `village` / `kingdom` / `other` |
| `starting_price` | int | In cents (e.g. 5000 = $50.00) |
| `delivery_days` | int | 1–90 |
| `revisions` | int | 0–10 |
| `status` | text | `draft` / `active` / `paused` |
| `view_count` | int | Incremented on page view |
| `order_count` | int | Completed orders |

### `offer_images`
Portfolio images attached to an offer.

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | |
| `offer_id` | uuid (FK) | References `offers.id` (cascade delete) |
| `url` | text | Supabase Storage public URL |
| `position` | int | Display order (0 = thumbnail) |

### `orders`

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | |
| `offer_id` | uuid (FK) | |
| `buyer_id` | uuid (FK) | |
| `builder_id` | uuid (FK) | |
| `total_price` | int | What buyer paid (cents) |
| `platform_fee` | int | BuildEx cut (cents) |
| `builder_earnings` | int | What builder receives (cents) |
| `status` | text | See order statuses below |
| `invoice_id` | text | NOWPayments invoice identifier |
| `delivery_deadline` | timestamptz | |
| `requirements` | text | Buyer's build brief |

**Order statuses:** `pending_acceptance` → `active` → `in_revision` → `completed` / `disputed` / `cancelled` / `refunded`

### `reviews`
One review per completed order.

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | |
| `order_id` | uuid (FK, unique) | One review per order |
| `reviewer_id` | uuid (FK) | Who wrote it |
| `builder_id` | uuid (FK) | Who it's about |
| `rating` | int | 1–5 |
| `body` | text | Written review |

### `messages`
Per-order message thread.

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | |
| `order_id` | uuid (FK) | |
| `sender_id` | uuid (FK) | |
| `body` | text | |
| `created_at` | timestamptz | |

---

## Pages and Routes

| Route | Type | Auth | Description |
|---|---|---|---|
| `/` | Client | No | Landing page |
| `/login` | Client | No | Login with Discord or email |
| `/signup` | Client | No | Register + role selection |
| `/onboarding` | Client | Yes | OAuth landing + multi-step profile setup |
| `/builders` | Server | No | Offer catalog with filters |
| `/builders/[offerId]` | Server | No | Offer detail + order CTA |
| `/builders/profile/[username]` | Server | No | Public builder profile |
| `/order` | Client | Yes | Order placement and hosted checkout |
| `/orders` | Client | Yes | All user's orders |
| `/orders/[orderId]` | Client | Yes | Order detail + messages |
| `/dashboard` | Client | Builder | Stats overview |
| `/dashboard/offers` | Client | Builder | Manage offers |
| `/dashboard/offers/new` | Client | Builder | Create offer |
| `/dashboard/offers/[id]/edit` | Client | Builder | Edit offer |
| `/dashboard/orders` | Client | Builder | Incoming orders |

---

## API Routes

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `create-invoice` Edge Function | POST | Buyer | Create NOWPayments invoice |
| `/api/orders/[id]/accept` | POST | Builder | Accept order, capture funds |
| `/api/orders/[id]/complete` | POST | Buyer | Approve delivery, credit builder balance |
| `/api/orders/[id]/messages` | GET/POST | Participant | Read/send messages |
| `/api/offers/[id]` | PATCH/DELETE | Builder | Update or delete own offer |
| `/api/stripe/connect/status` | GET | Builder | Check onboarding status |
| `payment-webhook` Edge Function | POST | NOWPayments | Handle signed payment events |

---

## Business Logic

### Commission Calculation

Commission is **added on top** of the builder's quoted price. The builder always receives exactly what they quoted. The platform fee is paid by the buyer.

```
Builder quotes: $200
Builder rank:   Architect (8% fee)
Buyer pays:     $200 + $16 = $216
Builder gets:   $200
BuildEx earns:  $16
```

Commission rates:

| Rank | Commission | Requirement |
|---|---|---|
| Newcomer | 20% | New account |
| Builder | 15% | 5+ projects, rating 4.0+ |
| Craftsman | 12% | 20+ projects, rating 4.5+, 3mo+ |
| Architect | 8% | 50+ projects, rating 4.7+, no disputes |
| Master Builder | 5% | 100+ projects, rating 4.9+, invite/review |

### Rank Calculation

Rank is recalculated nightly by a cron job. Criteria checked in order:
1. Projects completed count
2. Average rating threshold
3. Account age (for Craftsman+)
4. Zero active disputes (for Architect+)
5. Manual review approval (for Master Builder)

Rank can decrease if a builder goes inactive for 60+ days or receives a serious dispute.

---

## Authentication

Discord and Google OAuth are the two supported login providers. Both go through Supabase Auth using the PKCE flow.

**Flow:**
1. User clicks "Log in" / "Join as Builder" / any auth-gated CTA → routed to `/login`
2. User picks Discord or Google → Supabase redirects to the provider
3. Provider returns to `/onboarding?code=…` (no intermediate callback page)
4. The `AuthProvider` mounted in the root layout creates the Supabase client with `detectSessionInUrl: true`, which auto-exchanges the `?code=` for a session and then runs `ensureProfile()` to create a `profiles` row on first login (auto-populated from OAuth metadata: display name, avatar, username slug, `discord_id` when applicable)
5. The `OnboardingGate` on `/onboarding` reads the session, fans the user out to the right onboarding step, and — when onboarding is complete — sends them on to the original `?redirect=` target (or `/account` if there was no preserved target)

**Protected routes** are guarded **client-side** via the `useRequireAuth()` hook and the `<AuthGuard>` wrapper component in `lib/auth/`. This project ships as a static export (`output: "export"`), so Next.js middleware does not run at request time — client-side guards are functionally equivalent and run as soon as the page hydrates.

**Auth-gated CTAs** (Order, Hire, Message, Post a Project, Request Quote) use the `useAuthGate()` hook. Signed-in users get the action; signed-out users are redirected to `/login?redirect=<current-path>` and returned to the same spot after login.

**Session management** uses Supabase's PKCE flow with short-lived JWTs and automatic refresh. Sessions persist in `localStorage` under the key `buildex-auth`. The `AuthProvider` (mounted in `app/layout.js`) listens to `onAuthStateChange` so every component re-renders the moment a session changes.

### Wiring up your Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers**, enable **Discord** and **Google**. For each provider, set the redirect URL in the provider's developer console to:
   ```
   <YOUR_SUPABASE_URL>/auth/v1/callback
   ```
3. In **Authentication → URL Configuration → Redirect URLs**, allow your local + production OAuth landing URLs:
   ```
   http://localhost:3000/onboarding
   https://your-domain.com/onboarding
   ```
   (OAuth providers now redirect users directly to `/onboarding`; there is no longer an intermediate `/auth/callback` page.)
4. Copy your Project URL and `anon` public key into `.env.local` (see `.env.example`).
5. Create the `profiles` table per the schema above. Minimum SQL to get login working:
   ```sql
   create table profiles (
     id uuid primary key references auth.users on delete cascade,
     username text unique,
     display_name text,
     avatar_url text,
     discord_id text unique,
     role text,
     bio text,
     minecraft_username text,
     created_at timestamptz default now()
   );
   alter table profiles enable row level security;
   create policy "profiles are viewable" on profiles for select using (true);
   create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);
   create policy "users update own profile" on profiles for update using (auth.uid() = id);
   ```
6. Restart `npm run dev` after editing `.env.local`. The login page will swap from its "not configured" banner to working OAuth buttons.

---

## Payments and Escrow

BuildEx uses **NOWPayments hosted invoices** for incoming payments and a
**manual admin payout ledger** for builder withdrawals.

**Full payment lifecycle:**

```
1. Buyer places an order and opens a NOWPayments hosted invoice
      ↓
2. NOWPayments sends a signed IPN after settlement
      ↓
3. The webhook verifies amount, currency, terminal status, and signature
      ↓
4. Builder delivers; buyer confirms completion
      ↓
5. Snapshotted builder earnings become available in Account → Payouts
      ↓
6. Builder requests a partial USDT withdrawal (minimum $20)
      ↓
7. Admin reviews the destination and approves the request
      ↓
8. Admin sends the crypto payout manually from NOWPayments or another wallet
      ↓
9. Admin records the settlement reference or marks the payout failed
```

Disputes resolved in the builder's favor credit earnings; refunds do not. Requested
funds are reserved immediately and return to available balance on cancellation,
rejection, or manual payout failure. See
[`docs/payments-supabase-setup.md`](docs/payments-supabase-setup.md) for production setup.

---

## Builder Rank System

Ranks are displayed as badges throughout the platform — on profile pages, offer cards, in the catalog, and in the checkout price breakdown. Higher rank = lower fee for buyers = more orders for builders.

| Rank | Badge Color | Icon | Commission |
|---|---|---|---|
| Newcomer | Gray `#94a3b8` | ⬜ | 20% |
| Builder | Blue `#60a5fa` | 🟦 | 15% |
| Craftsman | Purple `#a78bfa` | 🟣 | 12% |
| Architect | Orange `#fb923c` | 🟠 | 8% |
| Master Builder | Green `#4ade80` | 🏆 | 5% |

Master Builder badge has an additional CSS pulse animation (`badgePulse` keyframe) to distinguish it from other ranks.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- A NOWPayments account for buyer checkout and optional manual withdrawals
- Discord application for OAuth (free)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/buildex.git
cd buildex

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Fill in all values (see Environment Variables section)

# Run database migrations
# Paste the SQL from /supabase/migrations/ into your Supabase SQL editor

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Base path when deploying under a sub-path (e.g. GitHub Pages /BuildEx).
# Leave empty for local dev / root deploys.
NEXT_PUBLIC_BASE_PATH=
```

**Supabase keys:** Found in your project's Settings → API.

> ⚠️ **Static export — public bundle only.** BuildEx builds with `output: "export"`
> (no server, no API routes). Only `NEXT_PUBLIC_*` variables exist at runtime and
> they are **baked into the client bundle that ships to every visitor**. Never put
> a secret here — no `SUPABASE_SERVICE_ROLE_KEY`, no payment secret keys, no
> webhook secrets. The anon key is safe to expose *because* all access is gated by
> Postgres RLS + `SECURITY DEFINER` RPCs (see `supabase/migrations/`).
>
> Any server-side secret (the service-role key, the NOWPayments API key and
> IPN signing secret for the pending payment stage) belongs only in a Supabase
> Edge Function's environment — never in this repo's build.

---

## Development Roadmap

### Phase 1 — Foundation ✅
- [x] Next.js project setup with Tailwind CSS
- [x] Global design system (glass, gradients, animations)
- [x] Landing page with all sections
- [x] Responsive mobile / tablet / desktop layouts
- [x] Dark / light theme with localStorage persistence
- [x] Mobile hamburger menu

### Phase 2 — Auth 🔄
- [ ] Supabase project setup and database migrations
- [ ] Discord OAuth login
- [ ] Email/password registration
- [ ] Role selection on first login
- [ ] Auth middleware for protected routes
- [ ] AuthContext for session access across app

### Phase 3 — Catalog
- [ ] Shared UI component library (Button, Input, Modal, Badge, etc.)
- [ ] `/builders` catalog page with OfferCard grid
- [ ] Sidebar filters with URL state
- [ ] Search and sort
- [ ] `/builders/[offerId]` offer detail page
- [ ] Price breakdown component with commission calculation

### Phase 4 — Builder Profiles
- [ ] `/builders/profile/[username]` page
- [ ] Portfolio grid, reviews, about tabs
- [ ] Rank badge system with color coding
- [ ] Stats pills and skills sidebar

### Phase 5 — Dashboard
- [ ] Protected dashboard layout with sidebar nav
- [ ] Offer management table
- [ ] 4-step offer creation form
- [ ] Supabase Storage image upload with progress
- [ ] Offer editing and status management

### Phase 6 — Orders and Payments
- [x] NOWPayments hosted checkout
- [x] Builder balance and withdrawal requests
- [ ] Server-side PaymentIntent with manual capture
- [ ] Order acceptance and fund capture
- [ ] Delivery and approval flow
- [x] Admin-reviewed manual crypto payouts
- [ ] Webhook handler for async events

### Phase 7 — Trust and Retention
- [ ] Review system (post-completion only)
- [ ] Per-order message thread with Supabase Realtime
- [ ] Dispute flow
- [ ] Rank recalculation cron job
- [ ] Email notifications (Resend / SendGrid)
- [ ] Builder dashboard analytics

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Contact

Built by the BuildEx team. For questions or partnership inquiries, join the [Discord server](https://discord.gg/buildex) or open an issue on GitHub.
