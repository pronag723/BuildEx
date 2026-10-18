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
export const LEGAL_EFFECTIVE_DATE = "September 20, 2026";

export const LEGAL_VERSIONS = Object.freeze({
  terms: "2.0",
  privacy: "2.1",
  community: "2.0",
  notice: "2.0"
});

// Documents revised after LEGAL_EFFECTIVE_DATE, with their own date. A
// document not listed here is effective from LEGAL_EFFECTIVE_DATE.
export const LEGAL_DOCUMENT_DATES = Object.freeze({
  privacy: "October 18, 2026"
});

export const ACCOUNT_ACCEPTANCE_STORAGE_KEY = "buildex-pending-legal-acceptance";
