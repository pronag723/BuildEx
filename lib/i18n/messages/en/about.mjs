// /about — the explanatory page.
//
// HONESTY RULE. BuildEx is a directory. It does not process payments, hold
// funds, vet or verify builders, or take any part in a deal. Nothing here may
// say or imply otherwise — see app/legal/documents.js, which is the promise
// this copy has to match (tests/legal-launch.test.mjs reads this file).
export default {
  browseBuilders: "Browse builders",
  hero: {
    // The headline is three stacked lines (uppercased in CSS); the last one is
    // set in the accent colour.
    titleLine1: "The builder",
    titleLine2: "catalog for",
    titleAccent: "Minecraft",
    scrollAria: "Scroll to how it works",
  },
  how: {
    heading: "How it works",
    steps: {
      browse: {
        title: "Browse the profiles",
        body:
          "Open the directory and filter by style or build type. Every profile is a builder's own portfolio, uploaded and written by them.",
      },
      contact: {
        title: "Contact them directly",
        body:
          "Use the Discord, Telegram or other links a builder publishes on their profile — or message them here on BuildEx.",
      },
      arrange: {
        title: "Arrange it between you",
        body:
          "Scope, price, deadline and payment are agreed directly with the builder. BuildEx introduces you and stays out of the rest.",
      },
    },
  },
  why: {
    heading: "What we're responsible for",
    doesTitle: "What BuildEx does",
    doesNotTitle: "What BuildEx does not do",
    does: [
      "Lists Minecraft builders who chose to publish a profile here.",
      "Shows you their portfolio, their styles and the contact links they published.",
      "Gives you somewhere to message them, and somewhere to report abuse.",
    ],
    doesNot: [
      "Take, hold, escrow or refund money. No payment ever passes through BuildEx.",
      "Vet, verify, endorse, rank or guarantee any builder or any piece of work.",
      "Join in, mediate or take responsibility for any deal you make with a builder.",
    ],
    partnerLabel: "Partner",
    partnerName: "HelpingWorld Discord server",
  },
};
