// /about — the explanatory page.
//
// HONESTY RULE. BuildEx is a directory. It does not process payments, hold
// funds, vet or verify builders, or take any part in a deal. Nothing here may
// say or imply otherwise — see app/legal/documents.js, which is the promise
// this copy has to match (tests/legal-launch.test.mjs reads this file).
export default {
  browseBuilders: "Browse builders",
  hero: {
    title: "A directory of Minecraft builders",
    body:
      "Browse builder profiles, look at the work they have actually made, and contact them yourself — on Discord, on Telegram, or here.",
    howItWorks: "How it works",
    online: { one: "{count} builder online now", other: "{count} builders online now" },
    listed: { one: "{count} builder listed", other: "{count} builders listed" },
    // The illustrative cards beside the hero text: what a profile is, and
    // where you reach a builder. No names, prices or real portfolio images.
    cardTitle: "Builder profile",
    cardMeta: "Portfolio · styles · links",
    cardBody: "See the builds before you say a word.",
    // Example style chips on the illustrative profile card.
    chipA: "Fantasy",
    chipB: "Medieval",
    message: "Message",
    reach: "Reach them directly",
    onBuildEx: "On BuildEx",
    scrollAria: "Scroll to the build showcase",
  },
  projects: {
    heading: "The kind of thing people build",
    note: "Example builds, to give a sense of the range. Each builder's own work is on their profile.",
    viewAll: "View all builders",
    items: {
      castle: { alt: "Dark fantasy Minecraft castle build" },
      spawn: { alt: "Minecraft anarchy spawn build" },
      courtyard: { alt: "Minecraft anarchy spawn build design" },
      throneHall: { alt: "Medieval throne hall interior Minecraft build" },
      japanHouse: { alt: "Traditional Japanese house Minecraft build" },
      citadel: { alt: "Gray stone citadel Minecraft build" },
      greatHall: { alt: "Royal throne hall Minecraft interior" },
    },
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
  },
};
