"use client";

// Records that an account accepted the current Terms of Use and Privacy Policy.
//
// Sign-in is a single click, so the acceptance is staged in localStorage at the
// moment the user clicks the sign-in button (where the notice is shown) and
// flushed to `record_legal_acceptance` once the OAuth round trip lands and we
// have a session to write it against.
//
// The checkout-acceptance path that used to live here went with the payment
// layer. `legal_checkout_acceptances` stays in the database as a record of what
// was accepted while it existed; nothing writes to it any more.

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
