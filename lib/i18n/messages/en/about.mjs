// /about — the explanatory page.
//
// HONESTY RULE. BuildEx is a directory. It does not process payments, hold
// funds, vet or verify builders, or take any part in a deal. Nothing here may
// say or imply otherwise — see app/legal/documents.js, which is the promise
// this copy has to match (tests/legal-launch.test.mjs reads this file).
export default {
  browseBuilders: "Browse Builders",
  hero: {
    badge: "A directory of Minecraft builders",
    //   keeps the first line from breaking, as the original &nbsp;s did.
    line1: "Find the builder",
    line2: "behind the build",
    line3: "you want",
    body:
      "Browse builder profiles, look at the work they have actually made, and contact them yourself — on Discord, on Telegram, or here.",
    howItWorks: "How it works",
    cardTitle: "Builder profile",
    cardMeta: "Portfolio · styles · links",
    cardBody: "See the builds before you say a word.",
    // Example style chips on the illustrative profile card.
    chipA: "Fantasy",
    chipB: "Medieval",
    message: "Message",
    reach: "Reach them directly",
    onBuildEx: "On BuildEx",
    online: { one: "{count} builder online now", other: "{count} builders online now" },
    listed: { one: "{count} builder listed", other: "{count} builders listed" },
    scrollAria: "Scroll to the build showcase",
  },
  projects: {
    // {hl} is the green highlight.
    heading: "The kind of thing {hl}",
    highlight: "people build",
    viewAll: "View all builders →",
    items: {
      castle: { title: "Dark Fantasy Castle", alt: "Dark fantasy Minecraft castle build" },
      spawn: { title: "Spawn", alt: "Minecraft anarchy spawn build" },
      courtyard: { title: "Spawn Courtyard", alt: "Minecraft anarchy spawn build design" },
      throneHall: { title: "Throne Hall", alt: "Medieval throne hall interior Minecraft build" },
      japanHouse: { title: "Japan House", alt: "Traditional Japanese house Minecraft build" },
      citadel: { title: "Gray Citadel", alt: "Gray stone citadel Minecraft build" },
      greatHall: { title: "Great Hall", alt: "Royal throne hall Minecraft interior" },
    },
  },
  how: {
    // {brand} is "Build" + green "Ex".
    heading: "How {brand} Works",
    steps: {
      browse: {
        title: "1. Browse the profiles",
        body:
          "Open the directory and filter by style or build type. Every profile is a builder's own portfolio, uploaded and written by them.",
      },
      contact: {
        title: "2. Contact them directly",
        body:
          "Use the Discord, Telegram or other links a builder publishes on their profile — or message them here on BuildEx.",
      },
      arrange: {
        title: "3. Arrange it between you",
        body:
          "Scope, price, deadline and payment are agreed directly with the builder. BuildEx introduces you and stays out of the rest.",
      },
    },
  },
  features: {
    badge: "What you get",
    heading: "What you actually {hl}",
    highlight: "get",
    aria: "What BuildEx gives you",
    previous: "Previous feature",
    next: "Next feature",
    show: "Show {title}",
    mockSite: "Their site",
    mockIn: "Can you add a dragon tower?",
    mockOut: "On it — sending some sketches ✦",
    items: {
      portfolios: {
        title: "Portfolios, not promises",
        body:
          "Every profile is the builder's own work, uploaded by them and shown full size. Look at it before you talk to anyone.",
        bullets: ["Full-size portfolio images", "Filter by style and build type", "Nothing scored or ranked by us"],
      },
      contact: {
        title: "Contact on their terms",
        body:
          "Builders publish the ways they want to be reached — Discord, Telegram, YouTube, their own site. You take it from there.",
        bullets: ["Their own handles and links", "Checked for safe link formats", "No middleman in the conversation"],
      },
      chat: {
        title: "Or message here",
        body:
          "Prefer to keep first contact on the site? BuildEx chat carries text and photos while you work out what you need.",
        bullets: ["Direct messaging", "Paste & send photos", "Report a conversation"],
      },
    },
  },
  why: {
    heading: "What {brand} is — and isn't",
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
