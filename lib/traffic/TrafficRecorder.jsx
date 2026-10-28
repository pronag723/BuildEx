"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Traffic source recorder (migration 0111)
//
// Two jobs, both fire-and-forget:
//
//   1. Once per visit — a tab's first page load that did not come from
//      BuildEx itself — classify where it came from (lib/traffic/classify.mjs)
//      and send it to record_site_visit. sessionStorage remembers that this tab
//      already did, so client-side navigation and reloads are not new visits.
//      The same touch is kept in localStorage ("last non-direct touch") until
//      the browser signs up.
//
//   2. After sign-in, once per account and browser, send that kept touch to
//      record_signup_source. The database accepts it only for an account
//      created in the last day, so signing in to an old account adds nothing.
//
// Not recorded: local development hosts, crawlers and automation, the two
// pages whose URL carries a secret (/auth/callback, /unsubscribe — the same
// pair CloudflareAnalytics skips), and any browser where an admin has signed
// in, so the team's own visits stay out of the numbers.
//
// Described in the privacy policy under "Where visitors come from".
// Renders nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { getSupabaseClient } from "../supabase/client";
import { classifyVisit, deviceClass, looksAutomated, shouldReplaceTouch } from "./classify.mjs";

const VISIT_KEY = "bx-visit";
const TOUCH_KEY = "bx-touch";
const NO_TRACK_KEY = "bx-no-track";
const SENT_PREFIX = "bx-signup-src:";

const UNTRACKED_PATH = /\/(?:auth\/callback|unsubscribe)\/?$/;
const LOCAL_HOST = /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]|.+\.local|.+\.localhost|.+\.test)$/i;

// Storage can throw (private mode, blocked site data); every access is guarded
// and a failure just means nothing is recorded.
function read(storage, key) {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    window[storage].setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readTouch() {
  try {
    const parsed = JSON.parse(read("localStorage", TOUCH_KEY) || "null");
    return parsed && typeof parsed.channel === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function trackingAllowed() {
  if (typeof window === "undefined") return false;
  if (LOCAL_HOST.test(window.location.hostname)) return false;
  if (looksAutomated(navigator.userAgent, navigator.webdriver)) return false;
  return read("localStorage", NO_TRACK_KEY) !== "1";
}

function recordVisit() {
  // The path rule is for visits only: a visit sends its landing path, the
  // sign-up call below does not — and a new account usually first appears on
  // /auth/callback itself.
  if (!trackingAllowed() || UNTRACKED_PATH.test(window.location.pathname)) return;
  if (read("sessionStorage", VISIT_KEY)) return;
  // Marked before the request, so a slow or failed call is never retried into
  // a second visit.
  if (!write("sessionStorage", VISIT_KEY, "1")) return;

  const touch = classifyVisit({
    href: window.location.href,
    referrer: document.referrer,
    host: window.location.host,
  });
  if (!touch) return;

  if (shouldReplaceTouch(readTouch(), touch)) {
    write("localStorage", TOUCH_KEY, JSON.stringify({ ...touch, at: new Date().toISOString() }));
  }

  const supabase = getSupabaseClient();
  if (!supabase) return;
  supabase
    .rpc("record_site_visit", {
      p_channel: touch.channel,
      p_source: touch.source,
      p_medium: touch.medium,
      p_campaign: touch.campaign,
      p_referrer_host: touch.referrer_host,
      p_landing_path: touch.landing_path,
      p_device: deviceClass(navigator.userAgent, navigator.maxTouchPoints || 0),
      p_lang: navigator.language || null,
    })
    .then(() => {}, () => {});
}

// One attempt per tab when the call fails (e.g. before 0111 is applied), so a
// missing function costs one request per visit, not one per render.
let signupAttempted = false;

function recordSignupSource(userId) {
  if (signupAttempted || !userId) return;
  if (read("localStorage", SENT_PREFIX + userId)) return;
  const touch = readTouch();
  // Nothing kept means storage was blocked or the account predates tracking.
  // Better "unknown" in the console than a made-up "direct".
  if (!touch) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  signupAttempted = true;
  supabase
    .rpc("record_signup_source", {
      p_channel: touch.channel,
      p_source: touch.source,
      p_medium: touch.medium,
      p_campaign: touch.campaign,
      p_referrer_host: touch.referrer_host,
      p_landing_path: touch.landing_path,
      p_first_seen_at: touch.at || null,
    })
    .then(({ error }) => {
      if (!error) write("localStorage", SENT_PREFIX + userId, "1");
    }, () => {});
}

export default function TrafficRecorder() {
  const { status, user, profile, profileLoaded } = useAuth();

  // Off the critical path: the first paint and the session restore matter more.
  useEffect(() => {
    const timer = window.setTimeout(recordVisit, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !profileLoaded || !profile) return;
    if (profile.is_admin === true) {
      write("localStorage", NO_TRACK_KEY, "1");
      return;
    }
    if (!trackingAllowed()) return;
    recordSignupSource(user?.id);
  }, [status, profileLoaded, profile, user?.id]);

  return null;
}
