// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — NOWPayments payment provider (Edge Function shared module)
//
// The ONLY place that knows the NOWPayments wire format. The two Edge Functions
// (create-invoice / payment-webhook) call this through a tiny interface, so
// swapping NOWPayments → another gateway later means rewriting this file only.
//
// Auth model (NOWPayments):
//   • Invoice creation is authenticated with the API key in the `x-api-key`
//     header (secret NOWPAYMENTS_API_KEY).
//   • The IPN callback is signed by NOWPayments with a SEPARATE IPN secret:
//       sig = HMAC_SHA512( json_with_keys_sorted_alphabetically , IPN_SECRET )
//     delivered in the `x-nowpayments-sig` request HEADER (not the body).
// Secrets come from Deno.env — never hardcode them.
//
// Docs: https://documenter.getpostman.com/view/7907941/S1a32n38  — confirm the
// exact IPN signing recipe against the live docs before flipping payments on
// (see verifyWebhook note below).
// ─────────────────────────────────────────────────────────────────────────────

import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const API_BASE = "https://api.nowpayments.io/v1";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

const encoder = new TextEncoder();

/** HMAC-SHA512 hex of `message` keyed by `secret` (Web Crypto supports SHA-512). */
async function hmacSha512Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return encodeHex(new Uint8Array(sig));
}

/** Constant-time-ish compare of two hex strings (case-insensitive). */
function safeEqual(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/**
 * NOWPayments signs the JSON with its object keys sorted ALPHABETICALLY (their
 * PHP reference does `ksort` + `json_encode(..., JSON_UNESCAPED_SLASHES)`). We
 * reproduce that: sort keys recursively, then JSON.stringify (which, like
 * JSON_UNESCAPED_SLASHES, leaves "/" unescaped). NOWPayments IPN payloads are
 * flat ASCII, so no unicode/float-encoding edge cases bite in practice.
 */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortDeep(src[k]);
    return out;
  }
  return v;
}

export interface CreateInvoiceInput {
  amount: string; // fiat amount as a string, e.g. "25.00"
  currency: string; // e.g. "USD"
  payCurrency?: string; // e.g. "usdttrc20"
  orderId: string; // our orders.id — echoed back in the IPN as order_id
  callbackUrl: string; // payment-webhook function URL (ipn_callback_url)
  returnUrl: string; // where the buyer lands after paying (our /orders page)
}

export interface CreateInvoiceResult {
  invoiceId: string | null;
  checkoutUrl: string | null;
  raw: unknown;
}

export interface MinAmountResult {
  amount: number | null;
  raw: unknown;
}

export async function getMinimumInvoiceAmount(
  payCurrency: string,
  fiatEquivalent = "usd",
): Promise<MinAmountResult> {
  const apiKey = env("NOWPAYMENTS_API_KEY");
  const params = new URLSearchParams({
    // NOWPayments requires the fiat pay-in/source currency explicitly.
    currency_from: fiatEquivalent.toLowerCase(),
    currency_to: payCurrency.toLowerCase(),
    fiat_equivalent: fiatEquivalent.toLowerCase(),
    is_fee_paid_by_user: "true",
  });

  const res = await fetch(`${API_BASE}/min-amount?${params.toString()}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `NOWPayments min-amount failed (${res.status}): ${JSON.stringify(raw)}`,
    );
  }

  const fiat = typeof raw?.fiat_equivalent === "number"
    ? raw.fiat_equivalent
    : typeof raw?.fiat_equivalent === "string"
    ? Number(raw.fiat_equivalent)
    : null;

  return {
    amount: Number.isFinite(fiat) ? fiat : null,
    raw,
  };
}

/**
 * Create a hosted NOWPayments invoice for the EXACT order price.
 *
 * `is_fee_paid_by_user: true` asks NOWPayments to add its processing fee on top
 * for the buyer (the equivalent of "client pays the commission"), so the operator
 * receives the full order price and the builder / studio / BuildEx split (computed
 * in place_order) stays exact. Where the gateway can't pass a fee on a given rail,
 * the small (~0.5%) residue simply comes out of BuildEx's platform margin — the
 * builder/studio cut is never affected either way.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const apiKey = env("NOWPAYMENTS_API_KEY");

  const body = {
    price_amount: Number(input.amount),
    price_currency: input.currency.toLowerCase(), // NOWPayments wants e.g. "usd"
    pay_currency: input.payCurrency?.toLowerCase(),
    order_id: input.orderId,
    order_description: `BuildEx order ${input.orderId}`,
    ipn_callback_url: input.callbackUrl,
    success_url: input.returnUrl,
    cancel_url: input.returnUrl,
    // is_fixed_rate intentionally omitted: fixed-rate invoices lock the exchange
    // rate on the gateway's side and impose a high minimum ($50+). Standard
    // invoices show the buyer the live crypto equivalent at checkout time — fine
    // for USDT (already pegged) and normal for all other coins. Our USD price is
    // recorded in the DB and in the payments row regardless.
    is_fee_paid_by_user: true, // fee on top of the buyer — keeps our split exact
  };

  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `NOWPayments create-invoice failed (${res.status}): ${JSON.stringify(raw)}`,
    );
  }

  // Shape: { id, invoice_url, order_id, price_amount, ... }
  const result = raw as { id?: string | number; invoice_url?: string };
  return {
    invoiceId: result?.id != null ? String(result.id) : null,
    checkoutUrl: result?.invoice_url ?? null,
    raw,
  };
}

export interface WebhookVerdict {
  valid: boolean;
  orderId: string | null;
  status: string | null; // gateway payment_status: finished / confirming / ...
  isPaid: boolean;
  method: "crypto" | "card" | null;
  amountCents: number | null;
  invoiceId: string | null;
}

/**
 * Verify a NOWPayments IPN callback and extract the fields we act on.
 *
 * The signature is HMAC-SHA512 over the request body with keys sorted
 * alphabetically, keyed by NOWPAYMENTS_IPN_SECRET, delivered in the
 * `x-nowpayments-sig` header. We recompute it the same way and compare. Re-confirm
 * the exact recipe against the live docs when activating real payments.
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookVerdict> {
  const ipnSecret = env("NOWPAYMENTS_IPN_SECRET");
  const invalid: WebhookVerdict = {
    valid: false,
    orderId: null,
    status: null,
    isPaid: false,
    method: null,
    amountCents: null,
    invoiceId: null,
  };

  if (!signature) return invalid;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return invalid;
  }

  const expected = await hmacSha512Hex(
    JSON.stringify(sortDeep(payload)),
    ipnSecret,
  );
  if (!safeEqual(expected, signature)) return invalid;

  const status = payload.payment_status != null
    ? String(payload.payment_status)
    : null;
  // NOWPayments terminal "money settled" state. We deliberately do NOT treat
  // 'confirmed' (on-chain only, pre-settlement) or 'partially_paid' (underpaid)
  // as paid — only 'finished' releases the order.
  const amountStr = payload.price_amount != null
    ? String(payload.price_amount)
    : null;
  // A signed callback is not sufficient on its own: the settlement payload
  // must also contain a well-formed fiat amount and the currency we requested.
  // This keeps malformed/provider-version-drifted callbacks from reaching the
  // paid ledger as NULL values.
  const amountCents = amountStr && /^\d+(?:\.\d{1,2})?$/.test(amountStr)
    ? Math.round(Number(amountStr) * 100)
    : null;
  const currency = payload.price_currency != null
    ? String(payload.price_currency).toLowerCase()
    : null;
  const isPaid = status === "finished" &&
    currency === "usd" &&
    amountCents != null &&
    Number.isSafeInteger(amountCents);

  // NOWPayments is crypto-first; pay_currency present ⇒ a crypto rail. Card (via
  // their fiat on-ramp partners, when enabled) isn't reliably distinguishable in
  // the IPN, so we report 'crypto' when we have a pay_currency and leave it null
  // otherwise rather than guess.
  const method: "crypto" | "card" | null = payload.pay_currency ? "crypto" : null;

  return {
    valid: true,
    orderId: payload.order_id != null ? String(payload.order_id) : null,
    status,
    isPaid,
    method,
    amountCents: Number.isFinite(amountCents as number) ? amountCents : null,
    invoiceId: payload.payment_id != null ? String(payload.payment_id) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mass Payout (platform → builder)
//
// Paying builders is a separate NOWPayments product from accepting invoices and
// uses a DIFFERENT auth: a short-lived JWT obtained from the account
// email+password (POST /v1/auth), sent as a Bearer token ALONGSIDE the x-api-key
// header on the payout call. Each batch must then be confirmed with a 2FA code
// (POST /v1/payout/{id}/verify) — there is no way around the 2FA, which is why
// payouts are operator-driven from the admin console rather than automatic.
//
// Secrets: NOWPAYMENTS_EMAIL, NOWPAYMENTS_PASSWORD (for /v1/auth) +
// NOWPAYMENTS_API_KEY (reused). The account must have Mass Payout enabled, 2FA
// on, and a FUNDED USDT balance to pay out from.
//
// Re-confirm the exact request/response shapes against the live NOWPayments
// payout docs before activating real payouts.
// ─────────────────────────────────────────────────────────────────────────────

/** A single crypto withdrawal in a payout batch. */
export interface PayoutWithdrawal {
  address: string; // builder's USDT wallet
  amount: string; // amount in `currency`, as a string e.g. "18.20"
  currency?: string; // payout currency; defaults to USDT TRC-20 ("usdttrc20")
}

export interface CreatePayoutResult {
  batchId: string | null;
  status: string | null;
  raw: unknown;
}

/** Exchange the account email+password for a short-lived (~5 min) Bearer token. */
async function nowpaymentsAuth(): Promise<string> {
  const email = env("NOWPAYMENTS_EMAIL");
  const password = env("NOWPAYMENTS_PASSWORD");

  const res = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `NOWPayments auth failed (${res.status}): ${JSON.stringify(raw)}`,
    );
  }
  const token = (raw as { token?: string })?.token;
  if (!token) throw new Error("NOWPayments auth returned no token");
  return token;
}

/**
 * Create a Mass Payout batch (status WAITING). Returns the batch id, which must
 * then be confirmed via verifyPayout() with the emailed 2FA code before funds
 * actually move.
 */
export async function createPayout(
  withdrawals: PayoutWithdrawal[],
): Promise<CreatePayoutResult> {
  if (!withdrawals.length) throw new Error("No withdrawals to pay out");

  const apiKey = env("NOWPAYMENTS_API_KEY");
  const token = await nowpaymentsAuth();

  const body = {
    ipn_callback_url: Deno.env.get("SUPABASE_URL")
      ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`
      : undefined,
    withdrawals: withdrawals.map((w) => ({
      address: w.address,
      currency: (w.currency ?? "usdttrc20").toLowerCase(),
      amount: Number(w.amount),
    })),
  };

  const res = await fetch(`${API_BASE}/payout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `NOWPayments create-payout failed (${res.status}): ${JSON.stringify(raw)}`,
    );
  }

  const result = raw as { id?: string | number; status?: string };
  return {
    batchId: result?.id != null ? String(result.id) : null,
    status: result?.status != null ? String(result.status) : null,
    raw,
  };
}

/**
 * Confirm a created payout batch with the 2FA verification code (emailed / from
 * the authenticator). On success NOWPayments begins sending the withdrawals.
 */
export async function verifyPayout(
  batchId: string,
  code: string,
): Promise<{ ok: boolean; raw: unknown }> {
  const apiKey = env("NOWPAYMENTS_API_KEY");
  const token = await nowpaymentsAuth();

  const res = await fetch(`${API_BASE}/payout/${batchId}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ verification_code: code }),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `NOWPayments verify-payout failed (${res.status}): ${JSON.stringify(raw)}`,
    );
  }
  return { ok: true, raw };
}
