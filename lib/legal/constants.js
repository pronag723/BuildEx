// Version and effective date of the documents in app/legal/documents.js.
//
// Versions are recorded against an account when it accepts them at sign-in
// (see lib/legal/api.js), so they must only move when the wording materially
// changes. Version 2.0 is the directory rewrite: the payments policy, the
// seller terms and the ready-made build licence were withdrawn, and the terms
// and privacy policy were rewritten to describe a site that takes no payment
// and is not a party to anyone's deal.
export const LEGAL_EFFECTIVE_DATE = "September 20, 2026";

export const LEGAL_VERSIONS = Object.freeze({
  terms: "2.0",
  privacy: "2.0",
  community: "2.0",
  notice: "2.0"
});

export const ACCOUNT_ACCEPTANCE_STORAGE_KEY = "buildex-pending-legal-acceptance";
