# BuildEx

A directory of Minecraft builders.

Builders publish a profile with their portfolio, the styles they work in and the
ways they want to be contacted. Anyone can browse those profiles; signed-in
users can message a builder here. That is the whole product.

**BuildEx takes no payment, holds no money, vets nobody and is not a party to
any deal.** Everything after the introduction — scope, price, deadline, payment —
is arranged directly between the client and the builder. The landing page and
`app/legal/documents.js` both say so, and `tests/legal-launch.test.mjs` fails the
build if the copy starts claiming otherwise.

An earlier version of this site had orders, escrowed payments, commissions,
ranks, reviews, ready-made build sales and studios. All of it was removed. If
you find a reference to any of it, it is a leftover — please delete it.

## Stack

- **Next.js 16** (App Router) with `output: "export"` — the whole site is static
  HTML. There is no server and no API route at runtime, so anything privileged
  goes through a Supabase security-definer RPC.
- **React 19**, **Tailwind CSS 3**, **lucide-react** for icons (no emoji — see
  `lib/icons.jsx`).
- **Supabase** for auth (Google and Discord OAuth), Postgres, Storage and
  realtime chat. Row-level security is the access boundary, not the UI.
- Deployed to **GitHub Pages** by `.github/workflows/deploy.yml` on push to
  `main`.

## Running it

```bash
npm install
npm run dev
```

Create `.env.local` first:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_BASE_PATH=
```

`NEXT_PUBLIC_BASE_PATH` is for serving under a subpath (e.g. `/BuildEx` on
GitHub Pages). Leave it empty for local work. Never hardcode a leading path in a
href — wrap it with `withBase()` from `app/home/utils.js`.

Other scripts:

```bash
npm run build   # static export into out/
npm test        # node --test over tests/*.test.mjs
```

## Database

SQL lives in `supabase/migrations/`, numbered and idempotent. Paste each file
into the Supabase SQL editor in order. `supabase/migrations/README.md` is a
historical ledger — migrations 0008–0094 build features that later migrations
(0095–0097) decommission, so read them as history, not as a description of the
current schema.

Migrations 0095 onward are the ones that matter now:

| # | What it does |
|---|---|
| 0095 | Removes the payment, order, payout and dispute layer |
| 0096 | Removes reviews and ranks |
| 0097 | Removes studios and role-based registration |
| 0098–0099 | Builder contact / social links (`builder_profiles.contact_links`) |
| 0100 | Chat abuse controls: rate limits and `conversation_reports` |
| 0101 | Moderation: `builder_profiles.is_hidden` enforced in RLS |

Sign-in needs your Supabase project's **Redirect URLs** to include
`<site>/auth/callback/`, or one-click sign-in lands nowhere.

`supabase/functions/delete-account` is the only Edge Function still in use.

## Routes

| Route | What it is |
|---|---|
| `/` | Landing page (`app/home/`) |
| `/builders` | The directory: search, style / build-type filters, favourites |
| `/builders/profile/?u=<handle>` | A builder's public profile |
| `/chats` | Conversations |
| `/account` | Your profile; where you opt in to becoming a builder |
| `/onboarding/builder/{identity,styles,portfolio}` | The three-step builder setup |
| `/login`, `/auth/callback` | OAuth sign-in |
| `/admin` | Moderator console — gated by `profiles.is_admin`, enforced in the RPCs |
| `/legal`, `/legal/<slug>` | Terms, privacy, community & copyright, legal notice |

Static export means `/builders/profile/[username]` cannot serve arbitrary
handles, so the real profile page is the query-param route
`/builders/profile/?u=<handle>`, which fetches the builder client-side.

## How the code is arranged

```
app/
  home/          landing page sections + data.js (all landing copy lives there)
  builders/      directory, filters, profile pages, fetchBuilders
  onboarding/    the three builder setup steps + the gate that resumes them
  chats/  account/  admin/  auth/  legal/
lib/
  auth/          AuthContext, profile bootstrap, redirects, guards
  onboarding/    api.js (writes), state.js (step machine), contactLinks.js
  chat/  favorites/  notifications/  presence/  admin/  legal/
  supabase/      browser client + storage URL rewriting
  icons.jsx      the icon registry; data files store string keys
```

Two rules worth knowing before you change anything:

1. **"Is this person a builder?" is the existence of a `builder_profiles` row.**
   Never `profiles.role` — that column is legacy and existing accounts still
   carry stale values in it.
2. **Decommission, never delete, in the database.** Removed features leave their
   tables and records behind; migrations revoke grants and drop triggers instead
   of dropping data.

## Conventions

- Contact links are validated in `lib/onboarding/contactLinks.js` *and* by a SQL
  `CHECK` constraint. They are typed by one user and rendered on a public page,
  so keep the two in step.
- Copy that makes a claim about what BuildEx does belongs in
  `app/home/data.js` or `app/legal/documents.js`, and has to be true of the code.
- The legal documents are written in plain English by people who are not
  lawyers. They are deliberately conservative. Have a lawyer read them before
  relying on them.
