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

/** Whether the real payment gateway flow is switched on for this build. */
export function paymentsEnabled() {
  return PAYMENTS_ENABLED;
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

  // Pass our origin so the buyer returns to this app's orders page after paying.
  const returnUrl =
    typeof window !== "undefined" ? `${window.location.origin}/orders/` : undefined;

  const { data, error } = await supabase.functions.invoke("create-invoice", {
    body: { orderId, returnUrl },
  });
  if (error) return { checkoutUrl: null, error };
  if (!data?.checkoutUrl) {
    return { checkoutUrl: null, error: new Error("No checkout URL returned") };
  }
  return { checkoutUrl: data.checkoutUrl, error: null };
}
