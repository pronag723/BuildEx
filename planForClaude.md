# BuildEx — Remaining Development Plan (staged prompts for Claude Code)

## Context

BuildEx is a freelance marketplace for Minecraft builders and server owners, built as a
**Next.js 16 static export** (`output: "export"`, no server/API routes at runtime) backed by
**Supabase** (Postgres + RLS + Auth + Storage + Realtime). All privileged writes go through
**SECURITY DEFINER RPCs** that check `auth.uid()` server-side.

**Already working:** landing page, Discord OAuth + session handling, full multi-step onboarding
(buyer & builder), the builder **feed** (`/builders`, real Supabase data via
`app/builders/data/fetchBuilders.js`), public builder profiles, account settings with a rate
editor, and **1:1 realtime chat** (migration `0007_chat.sql`, `lib/chat/api.js`).

**Still missing (this plan):** exact per-size pricing, the **order lifecycle** (place → pay →
start → deliver → confirm → release), order dashboards, chat↔order integration, escrow-style
**file delivery + 3D preview**, **reviews**, **ranks + commission**, **disputes**, and finally
**real payment via SBP** (Russia). Payment is deliberately last; everything before it is made
testable with a **mock "mark as paid"** action.

### How to use this document
Each stage below has a **ready-to-paste prompt** for Claude Code. Run them **one stage at a time,
in order**, and verify each before moving on (each prompt ends with a verification note). Stages
1–6 are the core transactional spine and should be done in sequence. Stages 7–11 are layered
features. Stage 12 (payment) is the finale.

### Conventions every stage must follow (these are repeated in each prompt)
- Static export: **no API routes / server code**. Privileged DB logic = new SECURITY DEFINER RPCs.
- New migrations are **sequentially numbered** `.sql` files in `supabase/migrations/`, idempotent,
  with RLS + `GRANT EXECUTE ... TO authenticated` / `REVOKE ALL ... FROM public`, matching the
  style of `0006_delete_account.sql` and `0007_chat.sql`.
- Frontend data access mirrors existing patterns: `getSupabaseClient()` from
  `lib/supabase/client.js`, return-`{ data, error }` helpers like `lib/chat/api.js` and
  `lib/onboarding/api.js`, pure React hooks (no SWR/React Query), `useAuthGate`/`useRequireAuth`
  for gating.
- Money is integer **minor units** (kopecks) in the DB to avoid float errors; format in the UI.
- **Migrations are written but the user runs them in Supabase manually** — each prompt must print
  the SQL to run and remind the user.

---

## Stage 1 — Exact per-size pricing (rates model change)

**Why:** orders price off the building size, so builders must set an *exact* price per size instead
of today's `{ from, to }` range. This unblocks everything downstream.

**Scope:** change `builder_profiles.rates` JSONB shape from `{ small:{blocks,from,to}, ... }` to
`{ small:{ enabled, blocks, price }, medium:{...}, large:{...} }` (price = integer kopecks); let a
builder enable/disable sizes; update the rate editor (account + onboarding), the card/profile
display, and `fetchBuilders` price derivation; backfill existing rows.

```
We're switching builder pricing from a price RANGE to an EXACT price per building size.
Context: BuildEx is a Next.js static export + Supabase app. Builder rates live in
builder_profiles.rates (JSONB), introduced in supabase/migrations/0005_builder_rates.sql, shaped
{ small:{blocks,from,to}, medium:{...}, large:{...} }. The rate editor UI lives in the account page
(app/account/page.jsx, components RateEditor / RateCardPreview) and the onboarding rates step
(app/onboarding/builder/rates/page.jsx). Saving goes through saveBuilderRates in lib/onboarding/api.js.
The feed derives price ranges in app/builders/data/fetchBuilders.js (startsFrom/endsAt).

Do the following:
1. Define the new rates shape: { small:{enabled:bool, blocks:int, price:int_kopecks},
   medium:{...}, large:{...} }. Store price in integer kopecks. Add a small shared helper module
   (e.g. lib/pricing.js) with the size keys, labels, default blocks, and format/parse helpers
   (rubles<->kopecks) so all UI uses one source of truth.
2. Write supabase/migrations/0008_rates_exact_price.sql that backfills existing rows: set
   price = from (kopecks) per size, enabled = true where a tier existed. Idempotent. Print the SQL
   and remind me to run it in Supabase.
3. Update the rate editor (account + onboarding) to enter ONE exact price per size, with an
   enable/disable toggle per size. Update RateCardPreview and the public profile rate display
   (app/builders/profile/[username]) to show exact prices.
4. Update fetchBuilders / fetchBuilderByUsername to expose per-size exact prices and a
   "starts from" = cheapest enabled size. Keep the feed card working.
5. Update saveBuilderRates validation for the new shape.

Constraints: no API routes; keep the existing { data, error } helper style; don't break onboarding.
Verify: run `npm run dev`, edit rates in /account, confirm they persist and render on the public
profile and feed card. Show me before/after of the rates JSON.
```

---

## Stage 2 — Orders data model (migration `0008`/`0009`) + RPCs

**Why:** the transactional core. A state machine plus SECURITY DEFINER RPCs so a static client can
drive it safely.

**Scope:** `orders` table + status enum + RLS + RPCs. Mock-payment friendly: `place_order` creates
a `pending_payment` order; `mark_order_paid` (the mock) moves it to `paid` (escrowed) and triggers
chat integration in Stage 5.

```
Add the orders data model for BuildEx (Next.js static export + Supabase, RPC-driven, no API routes).
Study supabase/migrations/0007_chat.sql and 0006_delete_account.sql for the exact style (RLS,
SECURITY DEFINER, GRANT/REVOKE, canonical patterns). Builder pricing is exact-per-size in
builder_profiles.rates (see Stage 1 / lib/pricing.js).

Create the next sequential migration supabase/migrations/00XX_orders.sql with:
1. order_status enum: 'pending_payment','paid','in_progress','delivered','completed','cancelled','disputed'.
2. orders table:
   id uuid pk, buyer_id uuid -> profiles, builder_id uuid -> profiles, building_size text
   ('small'|'medium'|'large'), style text (one of the builder's specialties), brief text (the
   client's detailed technical task), price_kopecks int (buyer pays this), commission_kopecks int,
   builder_earnings_kopecks int, status order_status default 'pending_payment',
   conversation_id uuid null -> conversations, created_at, paid_at, started_at, delivered_at,
   completed_at, cancelled_at, plus an updated_at touch trigger.
3. A platform commission constant for now: default 15% (compute commission_kopecks /
   builder_earnings_kopecks at order creation; rank-based rates come in a later stage — leave a
   clearly-marked TODO).
4. RLS: buyer and builder can SELECT their own orders; no direct INSERT/UPDATE (all mutations via RPCs).
5. SECURITY DEFINER RPCs (auth.uid() checks, granted to authenticated only):
   - place_order(p_builder uuid, p_size text, p_style text, p_brief text) -> order id. Validates the
     size is enabled in the builder's rates, snapshots price from rates, computes commission/earnings,
     status 'pending_payment'. Buyer must not be the builder.
   - mark_order_paid(p_order uuid) -> void. MOCK PAYMENT for now: only the buyer can call; moves
     pending_payment -> paid, sets paid_at. (Real SBP payment replaces this later — mark with TODO.)
   - builder_start_work(p_order uuid): builder only, paid -> in_progress, started_at.
   - builder_deliver(p_order uuid): builder only, in_progress -> delivered (delivery payload added in
     Stage 6).
   - buyer_confirm_complete(p_order uuid): buyer only, delivered -> completed, completed_at (escrow
     release happens here later — TODO).
   - cancel_order(p_order uuid): allowed buyer-side while pending_payment/paid; sets cancelled.
   Each RPC must reject illegal status transitions.
Print all SQL and remind me to run it in Supabase. Do NOT build UI yet.
Verify: from the browser console / a scratch call, exercise place_order then mark_order_paid against
a test builder and show the row transitions.
```

---

## Stage 3 — Order placement UI (buyer side)

**Why:** the "Place Order" path the buyer described: pick size (price updates live) + style + write
the brief → review → **Pay (mock)**.

**Scope:** a `lib/orders/api.js` helper module wrapping the RPCs, and an order-placement flow reached
from the builder profile / offer detail "Order now" CTA.

```
Build the buyer order-placement flow for BuildEx (static export + Supabase, RPCs only).
Stage 2 added the orders table and RPCs (place_order, mark_order_paid, ...). Builder exact-per-size
pricing is in builder_profiles.rates with helpers in lib/pricing.js. Reuse the { data, error } helper
style from lib/chat/api.js.

1. Create lib/orders/api.js with thin wrappers: placeOrder({builderId,size,style,brief}),
   markOrderPaid(orderId), and fetchOrder(orderId) (+ buyer/builder list fns we'll expand in Stage 4).
2. Wire the existing "Order now" / hire CTA on app/builders/profile/[username] and
   app/builders/[offerId] to an order flow (a dedicated /order/[username] route or a modal — pick
   what fits the codebase). The form:
   - choose building size from the builder's ENABLED sizes; show the exact price and update a live
     total as size changes;
   - choose a style from the builder's specialties;
   - a required "brief" textarea (detailed technical task);
   - a review/summary step showing price + a clear "platform holds the money until you confirm" note.
3. The "Pay" button calls placeOrder then markOrderPaid (MOCK — leave an obvious comment that real
   SBP payment replaces this in the final stage). On success route to the order detail page (Stage 4
   builds it; for now route to /orders/[id] which may be a stub).
4. Gate the whole flow with useAuthGate/useRequireAuth; a builder cannot order from themselves.

Constraints: no API routes; money handled as kopecks via lib/pricing.js; graceful empty/error states
like the rest of the app.
Verify: run dev, place a mock order end-to-end as a buyer against a seeded builder, confirm the order
row goes pending_payment -> paid. Screenshot the flow.
```

---

## Stage 4 — Order dashboards & detail page (both roles)

**Why:** buyers and builders need to see and act on orders; the builder profile should show **active
orders**.

**Scope:** `/orders` list (role-aware tabs) + `/orders/[id]` detail with a status timeline and
role/status-gated action buttons (Start work, Deliver, Confirm, Cancel).

```
Build order management UI for BuildEx (static export + Supabase, RPC-driven).
Stage 2 RPCs: builder_start_work, builder_deliver, buyer_confirm_complete, cancel_order. Stage 3 added
lib/orders/api.js. Follow existing page/layout conventions (see app/chats and app/account).

1. Extend lib/orders/api.js: listMyOrdersAsBuyer(), listMyOrdersAsBuilder(), and realtime is NOT
   required (one-time fetch + refetch on action is fine, like fetchBuilders).
2. /orders page (auth-gated): role-aware. If the user is a builder/both, show an "Incoming orders"
   section; everyone sees "My purchases". Each row: counterpart (avatar/name), size+style, price,
   status badge, created date; links to detail.
3. /orders/[id] detail page: order summary (size, style, full brief, price breakdown buyer-pays /
   commission / builder-earns), a status TIMELINE, and action buttons gated by role + status:
   - builder, status paid: "Start work" -> builder_start_work
   - builder, status in_progress: "Deliver" -> (Stage 6 adds the upload; for now a placeholder)
   - buyer, status delivered: "Confirm & release" -> buyer_confirm_complete
   - buyer, status pending_payment/paid: "Cancel" -> cancel_order
   - a "Open chat" button that deep-links to the conversation (Stage 5 links order<->conversation).
4. Show "Active orders" on the builder's own profile/account view (count + quick list of
   in_progress/paid orders).

Constraints: no API routes; static export means /orders/[id] needs the standard dynamic-route handling
this project already uses for [offerId]/[username]; reuse status/badge styling. Reflect every illegal
action by disabling the button (RPCs already enforce server-side).
Verify: as builder and buyer (two accounts/tabs), walk an order paid -> in_progress -> delivered ->
completed using the buttons. Screenshot each role's view.
```

---

## Stage 5 — Chat ↔ order integration

**Why:** the user wants chat to show **"Order paid"** and the brief **copied into the chat**, plus
status updates, so both parties coordinate in one place.

**Scope:** when an order is paid, ensure a conversation exists and post a **system message** carrying
the order summary; post further system messages on status changes; render a special "order" message
type in the thread.

```
Integrate orders with chat in BuildEx (Supabase, static export).
Chat lives in supabase/migrations/0007_chat.sql + lib/chat/api.js (messages table, conversations,
get_or_create_conversation, Realtime). Orders + RPCs are from Stages 2-4; orders.conversation_id
exists.

1. Migration: add an optional message kind to messages (e.g. msg_type text default 'text', plus a
   nullable jsonb meta) so we can render system/order messages, OR if you prefer, a separate approach
   — choose the least invasive that keeps RLS intact. Print SQL, remind me to run it.
2. Update the relevant order RPCs (mark_order_paid, builder_start_work, builder_deliver,
   buyer_confirm_complete, cancel_order) so that on each transition they:
   - ensure a conversation between buyer & builder exists (reuse the get_or_create logic),
   - set orders.conversation_id,
   - insert a system message (msg_type='order_event') describing the event; on PAID, the message/meta
     carries the full order summary (size, style, price, and the brief) — i.e. the brief is "copied
     into the chat".
   Keep these inserts inside the SECURITY DEFINER functions so RLS isn't a problem.
3. In the chat UI (app/chats/components/MessageThread.jsx), render order_event messages distinctly:
   an "Order paid" card with the brief, and compact status-update lines for the other events, with a
   link to /orders/[id].

Constraints: don't break existing text messaging, unread counts, or Realtime. No API routes.
Verify: place + mock-pay an order, then open /chats — confirm an "Order paid" card with the brief
appears in the thread, and that Start/Deliver/Confirm post follow-up system lines. Screenshot.
```

---

## Stage 6 — Escrow-style delivery: private world-file upload + locked download

**Why:** the builder delivers the finished world; the buyer must **not** be able to download it and
then dispute. So the file is uploaded to **our private storage**, stays locked, and only unlocks for
download once the buyer confirms completion (escrow over the deliverable). The 3D preview that lets
the buyer *review without downloading* is Stage 7.

**Scope:** a **private** Supabase Storage bucket for deliverables, an `order_deliveries` record, the
builder upload in the Deliver action, and a download that is only authorized after `completed` (via a
signed-URL RPC).

```
Add escrow-style world-file delivery to BuildEx (Supabase Storage + RPC, static export).
Existing storage patterns: supabase/migrations/0003_storage_buckets.sql (public buckets, owner-folder
RLS) and uploadImage in lib/onboarding/api.js. Orders + RPCs are from Stages 2-5; builder_deliver and
buyer_confirm_complete already transition status.

1. Migration:
   - Create a PRIVATE storage bucket 'deliverables' (public=false) with RLS so only the order's
     builder can upload to deliverables/{order_id}/... and NOBODY gets public read.
   - Create order_deliveries (order_id, storage_path, file_name, size_bytes, note, created_at) with RLS
     (buyer+builder can SELECT; insert via RPC).
   - RPC builder_attach_delivery(p_order, p_path, p_file_name, p_size, p_note): builder-only, records
     the delivery and moves in_progress -> delivered (fold this into / alongside builder_deliver).
   - RPC get_delivery_download_url(p_order): returns a short-lived SIGNED URL for the file, but ONLY if
     the caller is the buyer AND order.status = 'completed' (i.e. after escrow release). Before
     completion, buyer cannot download. The builder may always re-download their own upload.
   Print SQL; remind me to run it. (Signed URL generation may need a SECURITY DEFINER function calling
   storage; if Postgres can't sign directly, note that this specific piece may require a Supabase Edge
   Function and stub it — but keep the locked/unlocked logic in the DB.)
2. lib/orders/api.js: uploadDeliverable(orderId, file) (private bucket upload with progress like
   uploadImage), attachDelivery(...), getDeliveryDownloadUrl(orderId).
3. Order detail UI: builder's "Deliver" action opens an upload (accept .zip) + optional note, then
   calls attach/deliver. Buyer sees "A delivery is ready — confirm to unlock download". The download
   button is disabled until status=completed; after Confirm & release it becomes available.
4. Optionally also surface the delivery as a chat order_event (reuse Stage 5).

Constraints: bucket MUST be private; never expose a permanent public URL to the world file. No API
routes except the explicitly-noted optional Edge Function for signing. Worlds can be large — show
upload progress and a size limit.
Verify: as builder upload a test .zip and Deliver; as buyer confirm the download is locked pre-confirm
and works post-confirm. Show the storage path and that the bucket is private.
```

---

## Stage 7 — 3D world preview (review without download) — *optional / research-first*

**Why:** the user's transparency idea — buyer reviews a **rotatable, zoomable 3D render** of the
delivered world before releasing escrow, while the file stays on our servers. This is the most
research-heavy piece; do it after the core flow works.

**Scope:** start with an exploration prompt (feasibility), then implement a viewer fed by a render
artifact derived from the uploaded world.

```
RESEARCH FIRST, then propose an implementation (don't write the full feature yet).
Goal for BuildEx: when a builder delivers a Minecraft world (.zip of region files uploaded to our
private 'deliverables' bucket in Stage 6), the BUYER should be able to preview it as a rotatable,
zoomable 3D scene IN THE BROWSER — without downloading the raw world file — so they can approve the
work before escrow releases.

Investigate and report (with trade-offs, no code yet):
1. Pipeline options to turn a Minecraft world (Anvil/region .mca files) into a web-viewable 3D artifact:
   e.g. parsing with deepslate / prismarine, server-side render to glTF/voxel mesh, or generating an
   interactive isometric map. Which run as a Supabase Edge Function vs. a separate worker? (Static
   export means the heavy conversion can't run in Next.js.)
2. Browser viewer options (three.js / a voxel viewer) and how to feed them the artifact from a private
   bucket via signed URL, keeping the raw world locked.
3. Storage/lifecycle: where the render artifact lives, who can read it (buyer+builder only), and how it
   ties to order_deliveries.
4. A phased implementation proposal with effort estimates, and a minimal v1 (e.g. fixed rendered
   screenshots / a single bundled mesh) vs. a full free-orbit v2.

Output a short written plan I can turn into the next prompt. Do not modify the codebase.
```

---

## Stage 8 — Reviews system

**Why:** replace hardcoded ratings with real reviews, gated to **completed orders**; feed builder
rating/aggregates.

**Scope:** `reviews` table (one per completed order) + RPC + recompute of builder aggregates; wire the
profile Reviews tab and `fetchBuilders` to real data.

```
Add a reviews system to BuildEx (Supabase, static export, RPC-driven). Reviews are currently mock data
in app/builders/data/offers.js, rendered on app/builders/profile/[username] (Reviews tab) and the feed
card (avg_rating, total_reviews in fetchBuilders — currently hardcoded 0).

1. Migration:
   - reviews table: id, order_id (unique -> exactly one review per order), reviewer_id (buyer),
     builder_id, rating int 1..5, body text, created_at. RLS: public SELECT; insert via RPC only.
   - Add cached aggregates to builder_profiles: avg_rating numeric, reviews_count int,
     completed_orders int (or compute on the fly — pick and justify).
   - RPC leave_review(p_order, p_rating, p_body): only the buyer of a COMPLETED order, once. Inserts
     review and recomputes the builder's aggregates.
   Print SQL; remind me to run it.
2. lib/orders or lib/reviews api: leaveReview(...), listBuilderReviews(builderId).
3. UI: on /orders/[id] for a completed order (buyer side), show a "Leave a review" form. On the public
   profile Reviews tab, render real reviews + the rating breakdown. Update fetchBuilders /
   fetchBuilderByUsername to use real avg_rating, reviews_count, completed_orders, and remove the
   hardcoded 0s.

Constraints: one review per order; can't review your own work; no API routes.
Verify: complete an order then leave a review; confirm it shows on the profile and the feed card's
rating updates. Screenshot.
```

---

## Stage 9 — Ranks & rank-based commission

**Why:** ranks are currently cosmetic/hardcoded. Tie them to real metrics and make the **commission
rate depend on rank** (replacing the fixed 15% from Stage 2).

**Scope:** rank criteria + a recompute RPC + commission-by-rank applied at `place_order`; surface rank
on profile/feed from real data.

```
Implement the rank system and rank-based commission for BuildEx (Supabase, static export).
builder_profiles.rank exists (rookie/advanced/expert/master) but is hardcoded. Stage 8 added
completed_orders / avg_rating / reviews_count. Stage 2's place_order currently uses a flat 15%
commission (marked TODO).

1. Decide and document rank criteria from real metrics (completed_orders, avg_rating, account age).
   Map each rank to a commission rate (e.g. rookie 15% -> advanced 12% -> expert 8% -> master 5% — confirm exact numbers with me if
   unsure). Put the rank->commission mapping in one shared place (SQL + a JS mirror, e.g. lib/ranks.js).
2. Migration:
   - RPC recompute_builder_rank(p_builder) that sets rank from the criteria; and a bulk
     recompute_all_ranks() for periodic runs.
   - Update place_order to look up the builder's rank and apply the rank's commission rate instead of
     the flat 15%.
   - Call recompute_builder_rank inside buyer_confirm_complete and leave_review so ranks update as
     metrics change.
   Print SQL; remind me to run it. (Note: scheduling recompute_all_ranks can use Supabase pg_cron
   later — leave a note, don't require it.)
3. UI: drive the rank badge on the profile and feed card from real builder_profiles.rank; show the
   builder their current rank, their commission rate, and progress toward the next rank (in /account).

Constraints: no API routes; keep commission math in kopecks; one source of truth for the mapping.
Verify: complete enough orders/reviews on a test builder to trip a rank change; confirm the badge
updates and a new order's commission reflects the new rate.
```

---

## Stage 10 — Disputes (basic)

**Why:** the buyer described confirming delivery; the inverse — rejecting — needs a path. Keep it
lightweight (manual resolution now; refunds wired in the payment stage).

**Scope:** let a buyer open a dispute on a `delivered` order; mark `disputed`; provide a minimal
resolution path (release to builder or refund to buyer) as RPCs, with refund as a stub until payment.

```
Add a basic dispute flow to BuildEx (Supabase, static export, RPC-driven).
Orders have status 'disputed' already in the enum (Stage 2). A buyer confirms via buyer_confirm_complete.

1. Migration:
   - disputes table: id, order_id, opened_by, reason text, status ('open'|'resolved_release'|
     'resolved_refund'), resolution_note, created_at, resolved_at. RLS: buyer+builder SELECT their own;
     inserts/updates via RPC.
   - RPC open_dispute(p_order, p_reason): buyer-only, order.status='delivered' -> 'disputed', creates
     dispute row, posts an order_event chat message (reuse Stage 5).
   - RPC resolve_dispute(p_order, p_outcome): for now restricted to a hardcoded admin uuid (or a
     profiles.is_admin flag — add it). 'release' -> completed (escrow release TODO), 'refund' ->
     cancelled (refund is a STUB until the payment stage — mark clearly).
   Print SQL; remind me to run it.
2. UI: on /orders/[id], buyer can "Open a dispute" when delivered (reason form). Show dispute status to
   both parties. A minimal /admin disputes view (gated to admin) listing open disputes with
   release/refund buttons.

Constraints: no API routes; refunds/payouts are stubs now (resolved in Stage 12). Keep it minimal.
Verify: open a dispute on a delivered order; as admin resolve it both ways and confirm status changes.
```

---

## Stage 11 — In-app notifications (light) — *optional*

**Why:** order events (paid, started, delivered, completed, disputed, new review) should be visible
without watching the chat. Reuse the existing unread-badge pattern.

```
Add lightweight in-app notifications to BuildEx (Supabase, static export), reusing the unread-badge
pattern in lib/chat/UnreadContext.jsx.

1. Migration: notifications table (id, user_id, type, title, body, link, read_at, created_at), RLS
   (owner SELECT/UPDATE-own-read), add to Realtime publication like messages. Have the order/review/
   dispute RPCs insert notifications for the relevant user. Print SQL; remind me to run it.
2. lib/notifications/api.js + a NotificationsContext mirroring UnreadContext (count + list + mark read),
   subscribed via Realtime.
3. A bell/dropdown in the navbar showing recent notifications with unread count; clicking routes to the
   linked order/chat.

Constraints: no API routes; don't duplicate chat unread logic — generalize or sit alongside it.
Verify: trigger an order event as one user and see the notification arrive live for the counterpart.
```

---

## Stage 12 — Payment: real escrow — *final*

> **UPDATE (2026-06, global-market pivot): SBP is superseded by Cryptomus.** After the pivot from the
> Russian market to a global/English buyer market, payments run through **Cryptomus** (crypto gateway
> that also accepts Visa/Mastercard and settles **USDT** to the operator's wallet — no bank/company).
> The buyer pays the processing fee on top ("client pays the commission"), so the rank/studio
> commission math is untouched. **Implemented (dormant until keys):** `supabase/migrations/0031_payments.sql`
> (payments table, `payout_method`/`payout_details`, `mark_order_paid_internal`), the Edge Functions
> `create-invoice` + `payment-webhook` under `supabase/functions/`, and the client `lib/payments/api.js`
> gated on `NEXT_PUBLIC_PAYMENTS_ENABLED`. See `supabase/functions/README.md` for account setup,
> secrets, deploy, and activation. The SBP research below is retained for historical context only.

**Why (historical / SBP):** the placeholder `mark_order_paid` and the escrow release/refund stubs become real. Target
market is **Russia**, paying via **SBP (Система быстрых платежей)** through a Russian acquirer
(YooKassa / ЮKassa, Tinkoff, CloudPayments, or similar). This needs server-side code, which the static
export can't host — so use **Supabase Edge Functions (Deno)** for intent creation, webhooks, and
payouts.

> Do a research/design pass first (the prompt below), confirm the acquirer choice and payout/escrow
> capabilities with the user, THEN implement in a follow-up prompt. KYC/payout onboarding for builders
> and platform compliance are real considerations here.

```
RESEARCH + DESIGN (then we implement in a follow-up). BuildEx needs real payments to replace the mock
mark_order_paid and the escrow release/refund stubs. Market: Russia. Method: SBP (Система быстрых
платежей). The app is a Next.js static export (no server), with Supabase; privileged logic is in
SECURITY DEFINER RPCs. Money is stored in kopecks on the orders table; the platform holds funds until
the buyer confirms, then pays the builder minus a rank-based commission.

Investigate and produce a concrete plan (no production code yet):
1. Pick a Russian PSP that supports SBP for accepting payment AND for splitting/paying out to builders
   (escrow-like / marketplace split). Compare YooKassa (ЮKassa), Tinkoff, CloudPayments, Robokassa on:
   SBP support, hold/capture-later (two-stage) for escrow, split payments / payouts to third parties,
   KYC requirements, and whether they expose the webhooks we need.
2. Architecture on Supabase Edge Functions (Deno):
   - create-payment: called from the client for a pending_payment order; creates an SBP payment/QR or
     redirect; returns the pay URL.
   - payment-webhook: PSP -> our function; on success calls an RPC to move the order to 'paid'
     (escrowed) — this replaces the mock mark_order_paid. Verify webhook signatures.
   - release-payout: on buyer_confirm_complete, pay out builder_earnings to the builder; map to the
     PSP's payout/split API.
   - refund: on dispute refund, refund the buyer.
3. Data: what to add to orders (psp_payment_id, psp_status, payout_id, etc.) and a payments/ledger
   table for auditing. Builder payout identity / KYC fields.
4. The exact swap-out points in the current code (mark_order_paid, buyer_confirm_complete escrow
   release TODO, resolve_dispute refund stub) and how the client triggers create-payment instead of the
   mock.
5. Compliance/edge cases: minimums, fees, currency, failed/expired payments, idempotency, reconciliation.

Deliver a phased implementation plan + the open questions you need me to answer (acquirer account,
business entity, KYC). Do not modify payment code yet.
```

---

## Suggested order & dependencies

```
1  Pricing (exact per size)        ──┐
2  Orders model + RPCs             ──┤ core spine — strictly sequential
3  Order placement UI              ──┤
4  Order dashboards                ──┤
5  Chat ↔ order integration        ──┤
6  Escrow delivery (file lock)     ──┘
7  3D preview            (optional, after 6, research-first)
8  Reviews               (after 4)
9  Ranks + commission    (after 8)
10 Disputes              (after 6)
11 Notifications         (optional, anytime after 5)
12 PAYMENT (SBP)         (LAST — replaces mocks from 2/6/10)
```

## Verification (end-to-end, once 1–6 are done)
With two test accounts (one builder, one buyer):
1. Builder sets exact per-size prices in `/account`; they render on the public profile and feed.
2. Buyer opens the builder profile → "Order now" → picks size/style, writes a brief, clicks **Pay**
   (mock). Order appears as `paid`.
3. `/chats` shows an **"Order paid"** card with the brief copied in.
4. Builder: `/orders` → **Start work** → upload a `.zip` → **Deliver**.
5. Buyer: download is **locked**; **Confirm & release** → order `completed` → download unlocks.
6. Buyer leaves a review → shows on profile and updates the feed rating (Stage 8).
7. Run `npm run build` to confirm the static export still succeeds after each stage.

> Reminder: every stage that adds a migration prints the SQL for you to run manually in Supabase
> (matching how `0007_chat.sql` was applied). Keep migration files numbered sequentially and idempotent.
