"use client";

import { getSupabaseClient } from "../supabase/client";
import {
  ACCOUNT_ACCEPTANCE_STORAGE_KEY,
  LEGAL_VERSIONS
} from "./constants";

export function stageAccountAcceptance() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ACCOUNT_ACCEPTANCE_STORAGE_KEY,
    JSON.stringify({ versions: { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy }, acceptedAt: new Date().toISOString() })
  );
}

export async function flushPendingAccountAcceptance() {
  if (typeof window === "undefined") return { error: null };
  const raw = window.localStorage.getItem(ACCOUNT_ACCEPTANCE_STORAGE_KEY);
  if (!raw) return { error: null };
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Legal acceptance service is unavailable.") };

  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(ACCOUNT_ACCEPTANCE_STORAGE_KEY);
    return { error: new Error("The saved legal acceptance was invalid.") };
  }

  for (const [documentType, documentVersion] of Object.entries(pending.versions || {})) {
    const { error } = await supabase.rpc("record_legal_acceptance", {
      p_document_type: documentType,
      p_document_version: documentVersion,
      p_context: "account_creation"
    });
    if (error) return { error };
  }
  window.localStorage.removeItem(ACCOUNT_ACCEPTANCE_STORAGE_KEY);
  return { error: null };
}

export async function recordCheckoutAcceptance({
  subjectType,
  subjectId,
  payCurrency,
  immediateDelivery = false,
  finalSale = false
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("Legal acceptance service is unavailable.") };
  const { error } = await supabase.rpc("record_checkout_acceptance", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_pay_currency: payCurrency || null,
    p_terms_version: LEGAL_VERSIONS.terms,
    p_privacy_version: LEGAL_VERSIONS.privacy,
    p_payment_policy_version: LEGAL_VERSIONS.payments,
    p_license_version: subjectType === "ready_build" ? LEGAL_VERSIONS.readyBuildLicense : null,
    p_immediate_delivery: Boolean(immediateDelivery),
    p_final_sale: Boolean(finalSale)
  });
  return { error };
}
