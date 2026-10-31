// Version and effective date of the documents in app/legal/documents.js.
//
// Versions are recorded against an account when it accepts them at sign-in
// (see lib/legal/api.js), so they must only move when the wording materially
// changes. Version 2.0 is the directory rewrite: the payments policy, the
// seller terms and the ready-made build licence were withdrawn, and the terms
// and privacy policy were rewritten to describe a site that takes no payment
// and is not a party to anyone's deal.
//
// Privacy 2.1 adds message emails: a new use of the account email address and
// a new processor (Resend). Moving a version never asks existing accounts to
// accept again — nothing in the app compares an account's accepted version
// with these — it only changes what is shown and what a new sign-in records.
// That is deliberate here: the emails run on contract / legitimate interest
// with a one-click opt-out, not on consent, so no re-acceptance is required.
//
// Privacy 2.2 adds visitor statistics (Cloudflare Web Analytics, a new
// processor). It is cookieless and runs on legitimate interest, so again no
// re-acceptance.
//
// Privacy 2.3 adds email-code sign-in (the address someone enters is kept as
// the account's email, and Resend now also delivers the codes) and the
// Cloudflare Turnstile bot check on the login page. Both run on contract /
// legitimate interest, so again no re-acceptance.
//
// The profile redesign (October 25, 2026) moves terms and community to 2.1
// (works, price lists, co-author credits and reviews: what BuildEx checks and
// what it does not, and the rules for reviews) and privacy to 2.4 (likes,
// work views counted per day — anonymous visitors by a salted daily hash of
// the IP, never the IP itself — public reviews, and reply-time figures). All
// run on contract / legitimate interest, so again no re-acceptance.
//
// October 28, 2026 (migration 0111) moves privacy to 2.5 and community to 2.2:
// moderators may now read conversations nobody reported (each opening is
// logged), and BuildEx records where visits and new accounts come from — an
// anonymous visit record, a daily salted IP hash for rate limiting, and the
// last non-direct source kept in localStorage until sign-up. Legitimate
// interest again, so no re-acceptance; reading unreported messages is the
// change worth telling existing users about.
//
// October 31, 2026 (migration 0114) moves terms to 2.2 and privacy to 2.6:
// briefs and orders kept in a chat (what was asked, the agreed price and
// deadline, each step), BuildEx not being a party to them, and a completed
// order as a second way to become eligible to review. Contract / legitimate
// interest again, so no re-acceptance.
//
// October 31, 2026 (migration 0115) moves privacy to 2.7: 3D previews in chat —
// the source file stays on the device, only outer blocks, colours and a
// picture are stored, like chat photos. Legitimate interest again, so no
// re-acceptance.
//
// October 31, 2026 (migration 0116) moves terms to 2.3, privacy to 2.8 and
// community to 2.3: public requests on "Looking for a builder" (visible to
// everyone for 30 days with the author's name and avatar), responses that
// open a chat, saved works, reports on public content, and rules for requests
// and responses. Legitimate interest again, so no re-acceptance.
export const LEGAL_EFFECTIVE_DATE = "September 20, 2026";

export const LEGAL_VERSIONS = Object.freeze({
  terms: "2.3",
  privacy: "2.8",
  community: "2.3",
  notice: "2.0"
});

// Documents revised after LEGAL_EFFECTIVE_DATE, with their own date. A
// document not listed here is effective from LEGAL_EFFECTIVE_DATE.
export const LEGAL_DOCUMENT_DATES = Object.freeze({
  terms: "October 31, 2026",
  privacy: "October 31, 2026",
  community: "October 31, 2026"
});

export const ACCOUNT_ACCEPTANCE_STORAGE_KEY = "buildex-pending-legal-acceptance";
