"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Email notification settings
// The client side of migration 0104. Two profile columns drive it:
//
//   • email_on_message — "email me about unread messages" (default on);
//   • locale           — the language those emails are written in.
//
// Both are writable by their owner through a plain UPDATE (column grants, the
// 0028 pattern) but have no client SELECT grant — profiles is publicly
// readable, and someone's notification preference is nobody else's business —
// so reads go through the get_my_email_settings() RPC.
//
// The email address itself never comes through here: the server reads it from
// auth.users when it sends.
//
// Every function resolves to { ..., error } instead of throwing, like the rest
// of lib/.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseClient } from "../supabase/client";

const LOCALES = ["en", "ru"];

// The signed-in user's settings. `locale` is null until it has been set.
export async function fetchMyEmailSettings() {
  const supabase = getSupabaseClient();
  if (!supabase) return { settings: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("get_my_email_settings");
  if (error) return { settings: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { settings: null, error: new Error("Profile not found") };
  return {
    settings: { emailOnMessage: row.email_on_message !== false, locale: row.locale || null },
    error: null,
  };
}

export async function setEmailOnMessage(userId, enabled) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { error: new Error("Supabase not configured") };

  const { error } = await supabase
    .from("profiles")
    .update({ email_on_message: Boolean(enabled) })
    .eq("id", userId);
  return { error: error || null };
}

// An explicit choice from the header language switch. Overwrites whatever was
// stored before.
export async function saveMyLocale(userId, locale) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || !LOCALES.includes(locale)) return { error: null };

  const { error } = await supabase.from("profiles").update({ locale }).eq("id", userId);
  return { error: error || null };
}

// Fill the email language from the interface language, only if it has never
// been set. Returns the stored value (which may differ, if it was already set).
export async function initMyLocale(locale) {
  const supabase = getSupabaseClient();
  if (!supabase || !LOCALES.includes(locale)) return { locale: null, error: null };

  const { data, error } = await supabase.rpc("init_my_locale", { p_locale: locale });
  if (error) return { locale: null, error };
  return { locale: data || null, error: null };
}

// The /unsubscribe/ page. `token` is the signed token from the email link;
// action "resubscribe" turns emails back on. No sign-in needed — the
// email-unsubscribe Edge Function checks the token's signature.
// Returns { emailOnMessage, error }, where error.code is "invalid_token" for a
// link that is malformed or was not issued by us.
export async function changeEmailSubscription(token, action = "unsubscribe") {
  const supabase = getSupabaseClient();
  if (!supabase) return { emailOnMessage: null, error: new Error("Supabase not configured") };

  const { data, error } = await supabase.functions.invoke("email-unsubscribe", {
    body: { token, action },
  });
  if (error) {
    let code = null;
    try {
      // FunctionsHttpError keeps the Response; our function answers JSON.
      const body = await error.context?.json?.();
      code = body?.error || null;
    } catch {
      // Not JSON (network failure, function not deployed): leave code empty.
    }
    const wrapped = new Error(error.message || "Request failed");
    wrapped.code = code;
    return { emailOnMessage: null, error: wrapped };
  }
  return { emailOnMessage: Boolean(data?.email_on_message), error: null };
}
