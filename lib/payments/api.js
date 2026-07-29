"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Payments data layer (Stage 12)
// Thin client wrapper over the `create-invoice` Edge Function. Same { ..., error }
// convention as lib/orders/api.js — never throws; resolves to a null result on a
// missing/misconfigured client.
//
// DORMANT BY DEFAULT: paymentsEnabled() gates the real NOWPayments flow on the
// NEXT_PUBLIC_PAYMENTS_ENABLED env flag. Until NOWPayments keys exist the flag is
// off and the checkout page keeps using the mock markOrderPaid() path, so nothing
// breaks. Flip the flag (+ deploy the Edge Functions + set secrets) to go live.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// Read at module scope: NEXT_PUBLIC_* is inlined at build time, so this is a
// compile-time constant in the static export.
const PAYMENTS_ENABLED =
  String(process.env.NEXT_PUBLIC_PAYMENTS_ENABLED || "").toLowerCase() === "true";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Whether the real payment gateway flow is switched on for this build. */
export function paymentsEnabled() {
  return PAYMENTS_ENABLED;
}

// Create a NOWPayments checkout for an existing pending_payment order and return
// its hosted-checkout URL. The Edge Function verifies the caller owns the order
// (via RLS) before creating the invoice. Returns { checkoutUrl, error }.
async function edgeError(error) {
  let detail = null;
  try {
    const context = error?.context;
    if (context && typeof context.json === "function") {
      const body = await context.json();
      detail = body?.error || body?.message || null;
    }
  } catch {
    // Keep the original Supabase error when the response body is unavailable.
  }
  return detail ? new Error(String(detail)) : error;
}

export async function getPaymentOptions(amountCents) {
  const supabase = getSupabaseClient();
  if (!supabase) return { options: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase.functions.invoke("payment-options", {
    body: { amountCents: Number(amountCents) },
  });
  if (error) return { options: [], error: await edgeError(error) };
  return {
    options: Array.isArray(data?.options) ? data.options : [],
    message: data?.message || null,
    error: null,
  };
}

export async function createInvoice(orderId, payCurrency) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { checkoutUrl: null, error: new Error("Supabase not configured") };
  }
  if (!orderId) {
    return { checkoutUrl: null, error: new Error("Missing order id") };
  }
  if (!payCurrency) {
    return { checkoutUrl: null, error: new Error("Select a payment network") };
  }

  // Include the deployment basePath so hosted checkouts return to the correct
  // static route under GitHub Pages or any other subpath deployment.
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${BASE_PATH}/orders/`
      : undefined;

  const { data, error } = await supabase.functions.invoke("create-invoice", {
    body: { orderId, returnUrl, payCurrency },
  });
  if (error) {
    // supabase-js can collapse a non-2xx Edge Function response into a generic
    // message. Preserve the JSON body when available for actionable feedback.
    return {
      checkoutUrl: null,
      error: await edgeError(error),
    };
  }
  if (!data?.checkoutUrl) {
    return { checkoutUrl: null, error: new Error("No checkout URL returned") };
  }
  return { checkoutUrl: data.checkoutUrl, error: null };
}
