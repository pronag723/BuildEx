// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Cryptomus payment provider (Edge Function shared module)
//
// The ONLY place that knows the Cryptomus wire format. The two Edge Functions
// (create-invoice / payment-webhook) call this through a tiny interface, so
// swapping Cryptomus → CoinGate/Stripe later means rewriting this file only.
//
// Auth model (Cryptomus): every request/callback is signed with
//   sign = md5( base64( <json body> ) + API_KEY )
// The payment API key signs invoice creation AND the callback we receive.
// Secrets come from Deno.env — never hardcode them.
//
// Docs: https://doc.cryptomus.com/  — confirm the exact sign/base64 quirk against
// the live docs before flipping payments on (see verifyWebhook note below).
// ─────────────────────────────────────────────────────────────────────────────

import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const API_BASE = "https://api.cryptomus.com/v1";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

/** md5 hex of an arbitrary string (Web Crypto has no MD5; Deno std does). */
async function md5Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "MD5",
    new TextEncoder().encode(input),
  );
  return encodeHex(new Uint8Array(digest));
}

/** Cryptomus signature over a JSON string: md5(base64(json) + apiKey). */
async function signBody(jsonString: string, apiKey: string): Promise<string> {
  return await md5Hex(encodeBase64(jsonString) + apiKey);
}

export interface CreateInvoiceInput {
  amount: string; // fiat amount as a string, e.g. "25.00"
  currency: string; // e.g. "USD"
  orderId: string; // our orders.id — echoed back in the callback
  callbackUrl: string; // payment-webhook function URL
  returnUrl: string; // where the buyer lands after paying (our /orders page)
}

export interface CreateInvoiceResult {
  invoiceId: string | null;
  checkoutUrl: string | null;
  raw: unknown;
}

/**
 * Create a hosted checkout. We request the EXACT order price; the Cryptomus
 * merchant setting "client pays the commission" adds the processing fee on top
 * for the buyer, so we receive the full price as USDT and the builder / studio /
 * BuildEx split (computed in place_order) stays exact regardless of crypto vs card.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const merchant = env("CRYPTOMUS_MERCHANT_ID");
  const apiKey = env("CRYPTOMUS_PAYMENT_KEY");

  const body = {
    amount: input.amount,
    currency: input.currency,
    order_id: input.orderId,
    url_callback: input.callbackUrl,
    url_return: input.returnUrl,
    url_success: input.returnUrl,
    // Surface both rails at checkout; the buyer picks crypto or card there.
    is_payment_multiple: false,
  };
  const json = JSON.stringify(body);

  const res = await fetch(`${API_BASE}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant,
      sign: await signBody(json, apiKey),
    },
    body: json,
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Cryptomus create-payment failed (${res.status}): ${JSON.stringify(raw)}`,
    );
  }

  // Shape: { state: 0, result: { uuid, url, ... } }
  const result = (raw as { result?: { uuid?: string; url?: string } })?.result;
  return {
    invoiceId: result?.uuid ?? null,
    checkoutUrl: result?.url ?? null,
    raw,
  };
}

export interface WebhookVerdict {
  valid: boolean;
  orderId: string | null;
  status: string | null; // gateway payment status: paid / paid_over / ...
  isPaid: boolean;
  method: "crypto" | "card" | null;
  amountCents: number | null;
  invoiceId: string | null;
}

/**
 * Verify a Cryptomus callback and extract the fields we act on.
 *
 * Cryptomus signs the callback the same way: md5(base64(json_without_sign) +
 * PAYMENT_API_KEY). The one cross-language gotcha is slash escaping — PHP's
 * json_encode escapes "/" as "\/" by default, so the body they signed may differ
 * from a naive JS JSON.stringify. We therefore accept a match against either the
 * plain re-encoding OR the slash-escaped variant. Re-confirm against the live
 * docs when activating real payments.
 */
export async function verifyWebhook(rawBody: string): Promise<WebhookVerdict> {
  const apiKey = env("CRYPTOMUS_PAYMENT_KEY");
  const invalid: WebhookVerdict = {
    valid: false,
    orderId: null,
    status: null,
    isPaid: false,
    method: null,
    amountCents: null,
    invoiceId: null,
  };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return invalid;
  }

  const provided = String(payload.sign ?? "");
  if (!provided) return invalid;

  const { sign: _sign, ...rest } = payload;
  const plain = JSON.stringify(rest);
  const slashEscaped = plain.replace(/\//g, "\\/");

  const candidates = await Promise.all([
    signBody(plain, apiKey),
    signBody(slashEscaped, apiKey),
  ]);
  if (!candidates.includes(provided)) return invalid;

  const status = payload.status != null ? String(payload.status) : null;
  // Cryptomus terminal "money received" states.
  const isPaid = status === "paid" || status === "paid_over";

  // payment_type / network hints at the rail; treat anything non-crypto-ish that
  // came through the card flow as "card". Cryptomus exposes this inconsistently,
  // so we keep it best-effort and default to null when unsure.
  const payType = String(payload.payer_currency ?? payload.network ?? "").toLowerCase();
  const method: "crypto" | "card" | null = payType
    ? (payType.includes("card") || payType === "usd" ? "card" : "crypto")
    : null;

  const amountStr = payload.amount != null ? String(payload.amount) : null;
  const amountCents = amountStr ? Math.round(parseFloat(amountStr) * 100) : null;

  return {
    valid: true,
    orderId: payload.order_id != null ? String(payload.order_id) : null,
    status,
    isPaid,
    method,
    amountCents: Number.isFinite(amountCents as number) ? amountCents : null,
    invoiceId: payload.uuid != null ? String(payload.uuid) : null,
  };
}
