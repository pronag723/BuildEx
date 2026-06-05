# Supabase reverse proxy (Russia / Cloudflare-block workaround)

The app's Supabase project (`czorlwcjseiwpjuwtpry.supabase.co`) is fronted by
**Cloudflare**, which is throttled/blocked by Russia's DPI. The browser therefore can't
reach Supabase directly from Russia without a VPN — builder profiles, images, and realtime
all fail while the GitHub Pages shell still loads.

[`supabase-proxy.ts`](./supabase-proxy.ts) is a tiny reverse proxy that runs on
**Deno Deploy** (a non-Cloudflare host with a reachable `*.deno.dev` domain). It forwards
**everything** the Supabase JS SDK needs — REST, Auth, Storage, and Realtime WebSockets — to
the real project. The app then points `NEXT_PUBLIC_SUPABASE_URL` at the proxy and the SDK
derives every URL from that base. No application code changes.

> **Do NOT use a Cloudflare Worker / Pages for this.** Cloudflare is the network being
> blocked — proxying through it cannot route around the block. The host must be
> non-Cloudflare (Deno Deploy, or Fly.io as a fallback).

## Upstream

```
UPSTREAM = "czorlwcjseiwpjuwtpry.supabase.co"
```

Defined at the top of `supabase-proxy.ts`. If the Supabase project ref ever changes, update
it there.

## Deploy

### Option A — dashboard (no CLI)
1. Go to <https://dash.deno.com> → **New Project** → link this GitHub repo.
2. Set the **entrypoint** to `proxy/supabase-proxy.ts`.
3. Deploy. You get a URL like `https://buildex-supabase.deno.dev`.

### Option B — CLI
```sh
deno install -gArf jsr:@deno/deployctl   # one-time
deployctl deploy --project=buildex-supabase --prod proxy/supabase-proxy.ts
```

No environment variables or secrets are needed by the proxy itself (the anon key is supplied
by the browser on each request and passed straight through).

## Step 1 — confirm it's reachable from Russia (before wiring the app)

Ask the tester in Russia (no VPN) to open, in a browser:

- `https://<proj>.deno.dev/healthz` → should show `ok`.
- `https://<proj>.deno.dev/rest/v1/` → should return a Supabase JSON error (e.g. `401`,
  "No API key found"). Getting JSON back proves the full path Russia → Deno → Supabase works.

If `*.deno.dev` itself turns out to be blocked, deploy the **same file** to **Fly.io**
(`*.fly.dev`) instead — Deno also runs there via the official Deno Docker image, or wrap it
with a small Dockerfile. The proxy logic is host-agnostic.

## Step 2 — point the app at the proxy

Update the **GitHub Actions repo secret** (Settings → Secrets and variables → Actions):

```
NEXT_PUBLIC_SUPABASE_URL = https://<proj>.deno.dev
```

Leave `NEXT_PUBLIC_SUPABASE_ANON_KEY` unchanged. Re-run the **Deploy** workflow. The
`preconnect`/`dns-prefetch` in `app/layout.js` auto-derives from this URL, so it warms the
proxy origin automatically.

For **local dev** you can keep `.env.local` pointed straight at `*.supabase.co` (no
censorship locally) — only the deployed site needs the proxy.

## OAuth login caveat

Browsing content (the originally-reported failure) needs no login and works through the proxy.
**OAuth login** is the tricky part: Supabase Cloud generates its callback on its own
`supabase.co` host. This proxy rewrites `Location` / `redirect_uri` to keep the browser on the
proxy host, and you must also add the proxy callback to the Google OAuth client:

- **Google Cloud Console → OAuth client → Authorized redirect URIs:** add
  `https://<proj>.deno.dev/auth/v1/callback`.
- **Supabase → Auth → URL Configuration:** add the proxy origin to the redirect allowlist.

If login still fails in Russia, the fully-robust fix at launch is Supabase's **Custom Domain
add-on** (serves Auth from `api.yourdomain.com`, eliminating the `supabase.co` callback).
At that point this proxy can be retired or kept in front for defense in depth — decide after a
reachability test on the custom domain.

## What the proxy handles

| Concern        | Handling                                                              |
| -------------- | --------------------------------------------------------------------- |
| REST / Storage | Streamed pass-through (`duplex: "half"` for upload bodies, `Range` ok) |
| Realtime       | `Upgrade: websocket` → relays frames to `wss://<upstream>/realtime/v1` |
| CORS           | Preflight answered; permissive headers reflecting the request origin   |
| Auth redirects | `redirect: "manual"` + host rewrite so callbacks stay on the proxy     |
| Health         | `GET /healthz` → `ok`                                                   |
