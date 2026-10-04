// Contact-link platforms (lib/onboarding/contactLinks.js). Brand names are
// the same in every language.
export default {
  discord: {
    label: "Discord",
    placeholder: "yourname or https://discord.gg/abc123",
    hint: "Your Discord username, or an invite link to your server.",
  },
  telegram: {
    label: "Telegram",
    placeholder: "@yourname",
    hint: "Your @username, or the t.me link to your profile.",
  },
  youtube: {
    label: "YouTube",
    placeholder: "@yourchannel",
    hint: "Your @channel handle, or a youtube.com link.",
  },
  twitch: {
    label: "Twitch",
    placeholder: "yourchannel",
    hint: "Your Twitch channel name.",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@yourname",
    hint: "Your @username on TikTok.",
  },
  instagram: {
    label: "Instagram",
    placeholder: "@yourname",
    hint: "Your @username on Instagram.",
  },
  x: {
    label: "X / Twitter",
    placeholder: "@yourname",
    hint: "Your @username on X.",
  },
  other: {
    label: "Website",
    placeholder: "https://yoursite.com",
    hint: "Any other page clients should see. Must start with https://.",
  },
  errors: {
    pick: "Pick where clients should reach you.",
    tooLong: "Keep it under {max} characters.",
    httpsOnly: "Enter a full link starting with https:// — other kinds of links aren't allowed.",
    notAtHandle: "That doesn't look like a {platform} @username or link.",
    notHandle: "That doesn't look like a {platform} username or link.",
  },
};
