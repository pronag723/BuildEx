// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Legal documents
//
// BuildEx is a directory. It lists builders who chose to publish a profile,
// shows their work and their own contact links, and carries messages between
// them and the people who want to hire them. It does not process payments, is
// not a party to any agreement between a client and a builder, and takes no
// responsibility for how a deal turns out. Every document here has to say that
// and nothing more generous.
//
// The payment policy, the seller terms and the ready-made build licence were
// removed with the features they described. The database keeps the old
// acceptance and refund records — those are history, not promises.
//
// These are written in plain, conservative English by people who are not
// lawyers. They are deliberately modest about what BuildEx offers and make no
// attempt at jurisdiction-specific drafting. Have a lawyer read them before
// relying on them.
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSIONS } from "../../lib/legal/constants";

const mandatoryRights = "Nothing in this document removes a right or remedy that applicable law does not allow to be removed.";

const notAParty = "BuildEx is not a party to any agreement between a client and a builder.";

export const legalDocuments = {
  terms: {
    title: "Terms of Use",
    version: LEGAL_VERSIONS.terms,
    summary: "The rules for using BuildEx, and the limits of what BuildEx is: a directory of builders, not a party to the work you arrange through it.",
    sections: [
      ["What BuildEx is", [
        "BuildEx is a directory. Minecraft builders publish a profile with their own portfolio, the styles they work in, and the ways they want to be contacted. Anyone can browse those profiles, and signed-in users can send a builder a message here.",
        "That is the whole of the service. BuildEx introduces people to each other. Everything that follows an introduction — what gets built, for how much, by when, and how it is paid for — is arranged directly between the client and the builder.",
        notAParty
      ]],
      ["No payments through BuildEx", [
        "BuildEx does not process, hold, escrow, transfer, release, or refund money, in any currency, at any time. There is no checkout, no wallet, no commission, and no platform fee. No payment for any build ever passes through BuildEx.",
        "If you pay a builder, you pay them directly, by whatever method the two of you agree, and you carry that risk yourselves. BuildEx cannot reverse, recover, refund or trace such a payment, because BuildEx never sees it and holds no funds.",
        "Before paying anyone, satisfy yourself about who they are and agree the terms in writing between you."
      ]],
      ["BuildEx does not check or endorse builders", [
        "Profiles are self-published. The display name, portfolio images, description, styles and contact links on a profile were entered by that user, not by BuildEx.",
        "BuildEx does not verify a builder's identity, age, location, skill, experience, availability, authorship of the work they show, or their willingness or ability to finish a job. Being listed here is not a recommendation, an endorsement, a certification, or a guarantee of anything.",
        "Judge a builder by their work, by what they tell you, and by any independent checks you choose to make."
      ]],
      ["Your agreement is with the builder", [
        "Scope, price, deadlines, revisions, delivery, file formats, and who owns or may use the finished build are for the client and the builder to agree between themselves. Put the agreement in writing where you can.",
        `${notAParty} BuildEx is not the employer, agent, partner, representative, broker or guarantor of either side.`,
        "BuildEx does not mediate, arbitrate, investigate or decide disputes about work, payment or delivery, and offers no compensation scheme for a deal that goes wrong. If a disagreement cannot be settled between you, it is a matter between you, subject to whatever rights the law gives you against each other."
      ]],
      ["Who may use BuildEx", [
        "You must be at least 13 and legally able to agree to these terms. If the law where you live requires a parent's or guardian's consent, or sets a higher age, you may use BuildEx only on that basis.",
        "Give accurate information, keep your account secure, and tell us promptly at mcbuildex@gmail.com if you think someone else has used it. You are responsible for what happens through your account."
      ]],
      ["Your content", [
        "You keep ownership of what you upload — your avatar, portfolio images, profile text and messages. By publishing them on BuildEx you give BuildEx permission to store, display and distribute them for the purpose of running the directory, and to show them in the ordinary way search engines and link previews display a public page.",
        "You must have the right to publish what you upload. Do not upload someone else's builds, screenshots or renders as your own, and do not upload anything you are not permitted to share.",
        "You can edit or remove your content, or delete your account, from your account page. Deleting an account removes the profile and its images; copies may persist for a time in backups, and messages already sent remain visible to the person you sent them to."
      ]],
      ["Acceptable use", [
        "Do not defraud or deceive other users, impersonate anyone, harass, threaten or abuse people, send spam or unsolicited advertising, publish other people's private information, upload malware or harmful files, sell or pass off work that is not yours, scrape or overload the service, attempt to bypass access controls or security, or use BuildEx for anything unlawful.",
        "Contact links on a profile must be genuine ways to reach that user. Using them to send people to phishing pages, malware, or unrelated commercial offers is not allowed."
      ]],
      ["Moderation and suspension", [
        "BuildEx may hide or remove a profile, portfolio image, message or account, or restrict access to features, where that is reasonably necessary to enforce these terms, to comply with the law, or to protect users. Reports can be sent from a conversation or by email to mcbuildex@gmail.com.",
        "Moderation is housekeeping for the directory. It is not a remedy for a deal that went badly, and removing an account does not give anyone their money back. You may ask us to reconsider a decision by writing to mcbuildex@gmail.com."
      ]],
      ["Availability and disclaimers", [
        "BuildEx is provided free of charge, as it is and as available. It may be changed, interrupted or discontinued at any time, and nothing here promises that it will be available, complete, accurate or error-free.",
        "To the fullest extent the law allows, BuildEx gives no warranties about the service or about any user of it, and is not responsible for the conduct of any user, for any content a user publishes, or for any loss arising out of a dealing between a client and a builder — including work that is not delivered, not as described, or paid for and never received.",
        mandatoryRights
      ]],
      ["Limitation of liability", [
        "To the fullest extent the law allows, BuildEx is not liable for indirect, incidental, special or consequential loss, or for lost profits, lost data, lost opportunities or lost goodwill.",
        "BuildEx is a free service and receives no payment from either side of a deal. Any liability it does have is limited to the fullest extent the law allows.",
        mandatoryRights
      ]],
      ["Changes and contact", [
        "These terms are versioned. If they change materially, the new version and its effective date will be published here, and where the law requires it we will ask for acceptance again. Continuing to use BuildEx after a change means you accept it, to the extent the law permits.",
        "Questions, complaints and legal notices: mcbuildex@gmail.com. Contact and publication details are in the Legal & Contact Notice."
      ]]
    ]
  },
  privacy: {
    title: "Privacy and Storage Policy",
    version: LEGAL_VERSIONS.privacy,
    summary: "What BuildEx collects, why, who else can see it, and how to get it changed or deleted.",
    sections: [
      ["What is collected", [
        "When you sign in with Google or Discord, BuildEx receives an account identifier, your email address, and the display name and picture attached to that account. It does not receive your password.",
        "When you sign in with an email code instead, BuildEx keeps the email address you enter as your account's address. See \"Signing in with an email code\" below.",
        "If you publish a builder profile, BuildEx stores what you enter: your handle, display name, description, styles and build types, the contact links you choose to publish, your avatar and banner, and your portfolio images.",
        "BuildEx also stores the messages you send through the site, the builders you favourite, reports you submit, notifications generated for you, your email-notification setting and preferred language, and a timestamp of when you were last active, which is what drives the online indicator. Ordinary technical logs are produced by our hosting and database providers, and page visits are counted without cookies — see \"Visitor statistics\" below."
      ]],
      ["Google user data", [
        "If you choose to sign in with Google, BuildEx requests only the basic scopes openid, email and profile. From Google it receives your Google account identifier, your email address, your name and your profile picture. BuildEx does not request access to Gmail, Google Drive, Google Calendar, your contacts or any other Google service, and it never sees your Google password.",
        "This data is used only to sign you in, to keep your BuildEx account linked to your Google account, to pre-fill the display name and picture on your account (which you can change), to email you when a message sent to you on BuildEx goes unread (which you can turn off — see \"Message emails\" below), and to contact you about your account or a moderation matter. Your Google email address is never shown on your public profile.",
        "Google user data is not sold, is not used for advertising, is not used to build user profiles for anyone else, and is not used to develop, improve or train artificial-intelligence or machine-learning models. It is not shared with anyone except Supabase, which stores it for us to run sign-in, Resend, which receives your email address only to deliver sign-in codes and message emails, and where the law requires disclosure.",
        "BuildEx's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
        "The data is kept while your BuildEx account exists and is deleted when you delete your account from the account page. You can also revoke BuildEx's access at any time at myaccount.google.com/permissions, or ask for deletion by writing to mcbuildex@gmail.com."
      ]],
      ["Why it is used", [
        "To create and run your account, to publish your profile if you have one, to deliver your messages and notifications, to show accurate online status, to enforce the Terms of Use and moderate abuse, and to keep the service working and secure.",
        "Depending on where you live, the legal basis for this is the contract between you and BuildEx, our legitimate interest in running a safe directory, your consent where you chose to publish something, or a legal obligation.",
        "BuildEx does not sell personal data and does not use it for advertising or profiling."
      ]],
      ["Signing in with an email code", [
        "Instead of Google or Discord, you can sign in with your email address. BuildEx emails that address a six-digit code; typing it on the login page signs you in, or creates your account if you are new. A code works once and expires after ten minutes. BuildEx has no passwords, so the code is the only way into an account that uses email sign-in.",
        "BuildEx keeps the address you enter as your account's email address and uses it as described in this policy. It is not shown on your profile, and BuildEx does not derive your handle or display name from it. If the address already belongs to an account you created with Google or Discord, the code signs you in to that same account.",
        "The codes are delivered by Resend, which receives your email address and the email for that purpose. A sign-in email contains only the code; it carries no marketing and no open or click tracking."
      ]],
      ["Bot check on the login page", [
        "To stop automated sign-ups and abuse of the code emails, the login page uses Cloudflare Turnstile, a bot check run by Cloudflare. While you are on that page, Turnstile reads technical signals from your browser and connection — such as your IP address and browser characteristics — and Cloudflare uses them to tell people from automated traffic. Usually this needs nothing from you; occasionally it asks for a click.",
        "BuildEx only learns whether the check was passed. Turnstile runs only on the login page, in a frame served by Cloudflare, and Cloudflare processes this data under its own privacy policy and says it does not use it for advertising. The legal basis is our legitimate interest in keeping sign-in secure."
      ]],
      ["Message emails", [
        "BuildEx uses the email address on your account to tell you about messages you have not read. If someone messages you and the message is still unread about ten minutes later, BuildEx sends one email with the sender's name, a short preview of the message (a photo is described, not attached) and a link back to the conversation. It does not email you about that conversation again until you have opened it, and it limits how many of these emails anyone receives in an hour and in a day.",
        "These emails are on for every account by default, because they are part of how messaging works. You can turn them off at any time with the unsubscribe link at the bottom of any of them — no sign-in needed — or under Account → Email notifications. Turning them off does not affect your messages, which stay in BuildEx. Emails are written in the language you last chose on the site.",
        "The emails are delivered by Resend, which receives your email address and the content of each email for that purpose. BuildEx does not use them for marketing and does not turn on open or click tracking for them. A record of each one — when it was due, whether it was sent, and the preview it carried — is kept for up to 30 days to enforce the limits and to investigate delivery problems."
      ]],
      ["What is public", [
        "A builder profile is public to anyone on the internet: handle, display name, description, styles, build types, avatar, banner, portfolio images, the contact links you published, and whether you were recently active.",
        "Publishing a Discord handle, Telegram username or any other contact link makes it public. Only publish contact details you are willing for strangers to see and use.",
        "Messages are visible to the people in that conversation, and to a moderator if the conversation is reported. Your email address is not shown on your profile."
      ]],
      ["Who else handles it", [
        "Supabase hosts the database, authentication and file storage. Google and Discord provide sign-in. Resend delivers sign-in codes and message emails. Cloudflare provides visitor statistics and the bot check on the login page. The site is served by our web host. These providers process data on our behalf, may do so in other countries, and have their own privacy policies.",
        "Data may also be disclosed where the law requires it, or where it is necessary to investigate abuse or protect someone's safety."
      ]],
      ["Keeping and deleting", [
        "Account and profile data is kept while the account exists. Deleting your account from the account page removes your profile, your portfolio images and your uploaded files, and is not reversible.",
        "Messages you have already sent stay in the recipient's conversation. Moderation records and reports may be kept for as long as needed to deal with repeat abuse and to comply with the law. Backups are overwritten on an ordinary schedule.",
        "Records of legal acceptances — which version of these documents an account accepted, and when — are kept as evidence that consent was given."
      ]],
      ["Your choices", [
        "You can edit or delete your profile and its images at any time from your account page, and delete your account there too. You can turn message emails off from the account page or with the link in any of them.",
        "Subject to local law, you may also ask for access to your data, correction, a copy, deletion, restriction, or to object to processing, by writing to mcbuildex@gmail.com. We may need to confirm who you are first. You can complain to your local data-protection authority.",
        mandatoryRights
      ]],
      ["Visitor statistics", [
        "BuildEx uses Cloudflare Web Analytics to count visits and to see which pages are used and how quickly they load. When you open a page, a small script sends Cloudflare the page's address, the address of the page you came from, your browser, operating system and device type, and how long the page took to load; Cloudflare works out your approximate country from the connection. Pages whose address carries a sign-in code or an unsubscribe link are not counted.",
        "This uses no cookies or other browser storage, does not recognise you from one visit to the next or across other websites, and is not linked to your BuildEx account. Like any connection, it reaches Cloudflare from your IP address, which Cloudflare says it does not use to identify or track visitors. BuildEx sees only totals — for example how many visits a page had, or from which countries — never a record of one person's visit. The legal basis is our legitimate interest in knowing how the site is used."
      ]],
      ["Cookies and security", [
        "BuildEx uses browser storage only for things the site needs to work: your sign-in session, your light or dark theme choice, and a few interface preferences. There are no advertising cookies, and the visitor statistics above use no cookies or browser storage at all. The bot check on the login page runs in Cloudflare's frame under Cloudflare's own terms. If that ever changes, a consent control will be added where the law requires one.",
        "BuildEx stores no passwords: you sign in through Google, Discord or a one-time code sent to your email. Access to data is restricted at the database level so that users can only read and change what is theirs, and public profiles are the only thing served publicly. No system is perfectly secure; if you think an account or the service has been compromised, write to mcbuildex@gmail.com."
      ]]
    ]
  },
  community: {
    title: "Community and Copyright Policy",
    version: LEGAL_VERSIONS.community,
    summary: "Content standards, how to report a problem, how copyright complaints work, and the Minecraft disclaimer.",
    sections: [
      ["Community rules", [
        "Do not harass, threaten or abuse people, discriminate, impersonate someone else, scam or defraud, send spam, publish private information about anyone, upload malware, or post unlawful content, content that sexualises minors, hateful content, or content designed to deceive people into harm.",
        "Do not publish someone else's builds, renders or screenshots as your own work. A portfolio is a claim of authorship — make it a true one."
      ]],
      ["Staying safe with people you meet here", [
        "BuildEx does not check who anyone is, and does not hold or handle money, so the ordinary precautions apply: look at the work, ask questions, agree terms in writing, be wary of anyone in a hurry, and use a payment method you trust and understand. BuildEx cannot recover a payment or intervene in a dispute.",
        "Report scams, stolen builds, harassment, unsafe content, privacy problems and suspected underage accounts from the conversation itself, or by emailing mcbuildex@gmail.com with links and evidence."
      ]],
      ["Reporting and moderation", [
        "Reports are reviewed by a moderator, who can see the reported conversation. A moderator may hide a profile or an image, restrict or remove an account, or refer something urgent to the relevant authorities.",
        "Moderation is about what is published here and how people behave here. It cannot settle a disagreement about work or money. If you think a decision about your account was wrong, write to mcbuildex@gmail.com and ask for it to be looked at again."
      ]],
      ["Copyright complaints", [
        "If you own work that someone has published here without permission, email mcbuildex@gmail.com identifying the work, where the infringing copy is on BuildEx, your contact details, a statement that you believe in good faith that the use is not authorised, a statement that the information is accurate and that you are the owner or authorised to act for them, and your signature.",
        "We may pass the notice to the person who uploaded the material and remove or hide it. If your material was removed by mistake, reply with a counter-notice identifying it, stating why you believe the removal was a mistake, and giving your contact details and signature; we may restore it where we are legally free to. Accounts that repeatedly infringe may be removed."
      ]],
      ["Minecraft disclaimer", [
        "BuildEx is an unofficial fan directory and is not affiliated with, endorsed by, sponsored by, or approved by Mojang Studios or Microsoft. Minecraft names, marks and assets belong to their respective owners. Users must follow the Minecraft Usage Guidelines, End User Licence Agreement and any other applicable rules."
      ]]
    ]
  },
  "legal-notice": {
    title: "Legal & Contact Notice",
    version: LEGAL_VERSIONS.notice,
    summary: "Who runs BuildEx, how to reach us, and how notices are given.",
    sections: [
      ["The site", [
        "BuildEx operates buildex.builders as a free, public directory of Minecraft builders. Builders publish their own profiles and are independent of BuildEx.",
        `BuildEx does not sell anything, does not take payment for anything, and does not act for either side of a deal arranged through it. ${notAParty}`
      ]],
      ["Contact", [
        "General and support: mcbuildex@gmail.com",
        "Legal notices: mcbuildex@gmail.com",
        "Privacy requests: mcbuildex@gmail.com",
        "Copyright notices: mcbuildex@gmail.com"
      ]],
      ["Notices", [
        "We may contact you through the site or at the email address on your account. A notice counts as received when it has been made available through one of those channels, so far as the law allows. Keep your contact details current.",
        "Notices to BuildEx should go to mcbuildex@gmail.com."
      ]],
      ["Governing documents", [
        "Use of BuildEx is governed by the Terms of Use, together with the Privacy and Storage Policy and the Community and Copyright Policy. Consumer protections and any other rights that cannot lawfully be waived are unaffected.",
        `This notice is version ${LEGAL_VERSIONS.notice} and is effective ${LEGAL_EFFECTIVE_DATE}. Material updates will be dated and versioned in the Legal Center.`
      ]]
    ]
  }
};

export const LEGAL_EFFECTIVE = LEGAL_EFFECTIVE_DATE;
export const legalSlugs = Object.keys(legalDocuments);
