import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const API_BASE = "https://api.nowpayments.io/v1";
const port = Number(process.env.PORT || 8787);
const sharedSecret = process.env.RELAY_SHARED_SECRET || "";
const stateFile = process.env.STATE_FILE || "./state.json";
const maxBody = 256 * 1024;

for (const name of [
  "RELAY_SHARED_SECRET",
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_EMAIL",
  "NOWPAYMENTS_PASSWORD",
]) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}
if (sharedSecret.length < 32) throw new Error("RELAY_SHARED_SECRET must be at least 32 characters");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { nonces: {}, idempotency: {} };
  }
}
let state = loadState();
const inFlight = new Map();

function saveState() {
  fs.mkdirSync(path.dirname(path.resolve(stateFile)), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
}

function cleanupState(now = Date.now()) {
  for (const [nonce, expires] of Object.entries(state.nonces)) {
    if (Number(expires) < now) delete state.nonces[nonce];
  }
  for (const [key, entry] of Object.entries(state.idempotency)) {
    if (Number(entry.expires) < now) delete state.idempotency[key];
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function safeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a || "") || !/^[a-f0-9]{64}$/i.test(b || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function verifyRequest(req, pathname, rawBody) {
  const timestamp = req.headers["x-buildex-timestamp"];
  const nonce = req.headers["x-buildex-nonce"];
  const signature = req.headers["x-buildex-signature"];
  if (!timestamp || !nonce || !signature || !/^[a-f0-9-]{16,80}$/i.test(String(nonce))) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000) return false;

  cleanupState();
  if (state.nonces[nonce]) return false;
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const message = `${timestamp}.${nonce}.${req.method}.${pathname}.${bodyHash}`;
  const expected = crypto.createHmac("sha256", sharedSecret).update(message).digest("hex");
  if (!safeEqualHex(String(signature), expected)) return false;

  state.nonces[nonce] = Date.now() + 600_000;
  saveState();
  return true;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function providerAuth() {
  const response = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.NOWPAYMENTS_EMAIL,
      password: process.env.NOWPAYMENTS_PASSWORD,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.token) throw new Error(`NOWPayments auth failed (${response.status})`);
  return data.token;
}

async function provider(pathname, options = {}) {
  const token = await providerAuth();
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.NOWPAYMENTS_API_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`NOWPayments request failed (${response.status})`);
    error.status = response.status;
    error.providerBody = data;
    throw error;
  }
  return data;
}

const rate = new Map();
function rateLimited(address) {
  const now = Date.now();
  const bucket = rate.get(address) || [];
  const current = bucket.filter((time) => now - time < 60_000);
  current.push(now);
  rate.set(address, current);
  return current.length > 60;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }
    if (rateLimited(req.socket.remoteAddress || "unknown")) {
      return json(res, 429, { error: "Rate limit exceeded" });
    }

    const rawBody = req.method === "GET" ? "" : await readBody(req);
    if (!verifyRequest(req, url.pathname, rawBody)) {
      return json(res, 401, { error: "Invalid or replayed request signature" });
    }
    const body = rawBody ? JSON.parse(rawBody) : {};

    if (req.method === "POST" && url.pathname === "/payouts") {
      const key = String(body.idempotencyKey || "");
      const withdrawals = Array.isArray(body.withdrawals) ? body.withdrawals : [];
      if (!/^[a-f0-9-]{32,128}$/i.test(key) || !withdrawals.length || withdrawals.length > 1000) {
        return json(res, 400, { error: "Invalid payout request" });
      }
      if (state.idempotency[key]) return json(res, 200, state.idempotency[key].response);
      for (const item of withdrawals) {
        if (!item.address || !["usdttrc20", "usdterc20"].includes(item.currency) ||
            !Number.isFinite(item.amount) || item.amount <= 0) {
          return json(res, 400, { error: "Invalid withdrawal entry" });
        }
      }
      let request = inFlight.get(key);
      if (!request) {
        request = provider("/payout", {
          method: "POST",
          body: JSON.stringify({ withdrawals }),
        });
        inFlight.set(key, request);
      }
      let result;
      try {
        result = await request;
      } finally {
        inFlight.delete(key);
      }
      state.idempotency[key] = {
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
        response: result,
      };
      saveState();
      return json(res, 200, result);
    }

    const match = url.pathname.match(/^\/payouts\/([a-zA-Z0-9-]+)(\/verify)?$/);
    if (match && req.method === "POST" && match[2] === "/verify") {
      if (!/^[0-9]{4,10}$/.test(String(body.code || ""))) {
        return json(res, 400, { error: "Invalid verification code" });
      }
      const result = await provider(`/payout/${encodeURIComponent(match[1])}/verify`, {
        method: "POST",
        body: JSON.stringify({ verification_code: String(body.code) }),
      });
      return json(res, 200, result);
    }
    if (match && req.method === "GET" && !match[2]) {
      return json(res, 200, await provider(`/payout/${encodeURIComponent(match[1])}`));
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, error.status === 400 ? 400 : 502, {
      error: error.message || "Relay failure",
      provider: error.providerBody || undefined,
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BuildEx payout relay listening on 127.0.0.1:${port}`);
});
