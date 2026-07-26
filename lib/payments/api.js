"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Payments data layer (Stage 12)
// Thin client wrapper over the `create-invoice` Edge Function. Same { ..., error }
// convention as lib/orders/api.js — never throws; resolves to a null result on a
// missing/misconfigured client.
//
// `NEXT_PUBLIC_PAYMENTS_ENABLED` selects real NOWPayments checkout or the
// temporary mock-payment test path. It is baked into the static site at build
// time, so GitHub Actions must be rebuilt after changing the repository variable.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

// Read at module scope: NEXT_PUBLIC_* is inlined at build time, so this is a
// compile-time constant in the static export.
const PAYMENTS_ENABLED =
  String(process.env.NEXT_PUBLIC_PAYMENTS_ENABLED || "").toLowerCase() === "true";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Emergency switch for all checkout. Keep this separate from PAYMENTS_ENABLED:
// false there selects test payments, while this switch stops ordering entirely.
const CHECKOUT_PAUSED = false;

/** Whether the real payment gateway flow is switched on for this build. */
export function paymentsEnabled() {
  return PAYMENTS_ENABLED;
}

/** Whether buyers may start a new order. */
export function checkoutAvailable() {
  return !CHECKOUT_PAUSED;
}

// Create a NOWPayments checkout for an existing pending_payment order and return
// its hosted-checkout URL. The Edge Function verifies the caller owns the order
// (via RLS) before creating the invoice. Returns { checkoutUrl, error }.
export async function createInvoice(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { checkoutUrl: null, error: new Error("Supabase not configured") };
  }
  if (!orderId) {
    return { checkoutUrl: null, error: new Error("Missing order id") };
  }

  // Include the deployment basePath so hosted checkouts return to the correct
  // static route under GitHub Pages or any other subpath deployment.
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${BASE_PATH}/orders/`
      : undefined;

  const { data, error } = await supabase.functions.invoke("create-invoice", {
    body: { orderId, returnUrl },
  });
  if (error) {
    // supabase-js can collapse a non-2xx Edge Function response into a generic
    // message. Preserve the JSON body when available for actionable feedback.
    let detail = null;
    try {
      const context = error.context;
      if (context && typeof context.json === "function") {
        const body = await context.json();
        detail = body?.error || body?.message || null;
      }
    } catch {
      // Keep the original Supabase error when the response body is unavailable.
    }
    return {
      checkoutUrl: null,
      error: detail ? new Error(String(detail)) : error,
    };
  }
  if (!data?.checkoutUrl) {
    return { checkoutUrl: null, error: new Error("No checkout URL returned") };
  }
  return { checkoutUrl: data.checkoutUrl, error: null };
}

// Completes a temporary test payment without contacting NOWPayments. The Edge
// Function verifies the caller owns the order before marking it paid.
export async function completeTestPayment(orderId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Supabase not configured") };
  if (!orderId) return { error: new Error("Missing order id") };

  const { error } = await supabase.functions.invoke("complete-test-payment", {
    body: { orderId },
  });
  return { error: error || null };
}
