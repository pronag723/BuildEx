// BuildEx Supabase reverse proxy (Deno Deploy).
//
// Why this exists: the app's Supabase project lives at `*.supabase.co`, which is
// fronted by Cloudflare. Russia's DPI (Roskomnadzor / TSPU) throttles/blocks
// Cloudflare nationwide, so the browser cannot reach Supabase directly from there.
// This proxy runs on Deno Deploy (a non-Cloudflare host with a reachable `*.deno.dev`
// domain) and forwards every request — REST, Auth, Storage, and Realtime WebSockets —
// to the real Supabase host. The app points `NEXT_PUBLIC_SUPABASE_URL` at this proxy,
// and the Supabase JS SDK derives every URL (incl. storage + realtime) from that base.
//
// Deploy: `deployctl deploy --project=<name> proxy/supabase-proxy.ts`
// or link the GitHub repo in the Deno Deploy dashboard with this file as the entrypoint.

// The real Supabase project host. No scheme, no trailing slash.
const UPSTREAM = "czorlwcjseiwpjuwtpry.supabase.co";

// Headers that must never be copied verbatim to the upstream fetch (hop-by-hop or
// set automatically by the runtime). `host` is rewritten to the upstream below.
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // `content-length` is recomputed by fetch when we stream the body.
  "content-length",
]);

// Permissive CORS for the browser. The app is always cross-origin to this proxy
// (GitHub Pages today, a custom domain later), so we reflect the request origin and
// allow the headers/methods the Supabase SDK uses.
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*";
  const reqHeaders =
    req.headers.get("access-control-request-headers") ??
    "authorization, x-client-info, apikey, content-type, x-upsert, prefer, range";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "access-control-allow-headers": reqHeaders,
    "access-control-expose-headers":
      "content-range, content-encoding, content-length, x-upsert, range, etag",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

// Rewrite any absolute reference to the upstream host (in Location / redirect_uri /
// body of auth redirects) back to this proxy's host, so OAuth round-trips stay on a
// reachable domain instead of bouncing the browser to the blocked `*.supabase.co`.
function rewriteUpstreamHost(value: string, proxyOrigin: string): string {
  return value
    .replaceAll(`https://${UPSTREAM}`, proxyOrigin)
    .replaceAll(`http://${UPSTREAM}`, proxyOrigin)
    // redirect_uri / encoded query-param form
    .replaceAll(
      encodeURIComponent(`https://${UPSTREAM}`),
      encodeURIComponent(proxyOrigin),
    );
}

// --- WebSocket (Realtime) proxying ------------------------------------------------
// Supabase Realtime connects to `wss://<host>/realtime/v1/websocket?...`. We accept
// the client upgrade, open a matching socket to the upstream, and relay frames both
// ways until either side closes.
function proxyWebSocket(req: Request, url: URL): Response {
  const { socket: client, response } = Deno.upgradeWebSocket(req);
  const upstreamUrl = `wss://${UPSTREAM}${url.pathname}${url.search}`;
  const upstream = new WebSocket(upstreamUrl);

  // Buffer client frames that arrive before the upstream socket is open.
  const pending: (string | ArrayBufferLike | Blob | ArrayBufferView)[] = [];
  let upstreamOpen = false;

  client.onmessage = (e) => {
    if (upstreamOpen) upstream.send(e.data);
    else pending.push(e.data);
  };
  client.onclose = (e) => {
    try {
      upstream.close(e.code <= 1015 ? e.code : 1000, e.reason);
    } catch { /* already closed */ }
  };
  client.onerror = () => {
    try { upstream.close(); } catch { /* noop */ }
  };

  upstream.onopen = () => {
    upstreamOpen = true;
    for (const msg of pending) upstream.send(msg);
    pending.length = 0;
  };
  upstream.onmessage = (e) => {
    try { client.send(e.data); } catch { /* client gone */ }
  };
  upstream.onclose = (e) => {
    try {
      client.close(e.code <= 1015 ? e.code : 1000, e.reason);
    } catch { /* already closed */ }
  };
  upstream.onerror = () => {
    try { client.close(1011, "upstream error"); } catch { /* noop */ }
  };

  return response;
}

// --- HTTP proxying ----------------------------------------------------------------
async function proxyHttp(req: Request, url: URL): Promise<Response> {
  const proxyOrigin = url.origin;

  const headers = new Headers();
  for (const [key, value] of req.headers) {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set("host", UPSTREAM);

  const target = `https://${UPSTREAM}${url.pathname}${url.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual", // inspect auth 3xx so we can rewrite the host
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half"; // required when streaming a request body
  }

  const upstreamRes = await fetch(target, init);

  // Copy response headers, rewriting any that leak the upstream host, and layer CORS on top.
  const resHeaders = new Headers(upstreamRes.headers);
  const location = resHeaders.get("location");
  if (location) resHeaders.set("location", rewriteUpstreamHost(location, proxyOrigin));
  for (const [k, v] of Object.entries(corsHeaders(req))) resHeaders.set(k, v);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: resHeaders,
  });
}

Deno.serve((req: Request) => {
  const url = new URL(req.url);

  // Health check for the "is the proxy reachable from Russia?" test.
  if (url.pathname === "/healthz") {
    return new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain", ...corsHeaders(req) },
    });
  }

  // CORS preflight — answer directly, don't forward.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  // Realtime WebSocket upgrade.
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return proxyWebSocket(req, url);
  }

  return proxyHttp(req, url);
});
