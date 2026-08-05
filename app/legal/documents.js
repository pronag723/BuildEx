import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSIONS } from "../../lib/legal/constants";

const mandatoryRights = "Nothing in this policy excludes rights or remedies that applicable law does not allow BuildEx or a seller to exclude.";

export const legalDocuments = {
  terms: {
    title: "Terms of Use",
    version: LEGAL_VERSIONS.terms,
    summary: "The rules for accounts, marketplace transactions, platform use, and the relationship between buyers, sellers, and BuildEx.",
    sections: [
      ["Who may use BuildEx", ["You must be at least 13 and legally able to enter this agreement. If local law requires parental consent or a higher age, you may use BuildEx only with that consent. You must give accurate information, protect your account, and promptly report unauthorized access."]],
      ["Marketplace role", ["Builders and studios are independent sellers. BuildEx supplies the marketplace, protected-payment administration, file-release tools, communications, and dispute review; BuildEx is not the builder, buyer, employer, partner, or agent of either party except to the limited extent expressly stated.", "A seller is responsible for its listing, promises, work, taxes, permissions, and legal compliance. BuildEx may moderate the marketplace and decide platform disputes, but does not guarantee a seller's identity, skills, availability, or results."]],
      ["Orders and payments", ["Prices, cryptocurrency, network, fees, and the applicable seller are shown at checkout. Network fees, price volatility, confirmation times, wallet errors, and third-party provider availability are risks of crypto payments. An order is not paid until BuildEx receives reliable provider confirmation.", "Ready-made purchases and custom commissions follow the Payment, Final-Sale and Dispute Policy. Custom funds are protected until completion, buyer confirmation, or a dispute decision; this service is not represented as a licensed escrow service."]],
      ["Ownership", ["A buyer receives custom-build rights only after full payment, subject to third-party and pre-existing materials. A ready-made build remains owned by its seller and is provided under the Ready-Made Build License. Minecraft and third-party assets remain owned by their respective owners."]],
      ["Acceptable use", ["Do not commit fraud, evade fees, manipulate reviews, harass others, upload malware, scrape or disrupt the service, infringe rights, sell stolen work, bypass access controls, or use BuildEx for unlawful activity. Do not move an introduced transaction off-platform to avoid commissions."]],
      ["Moderation and suspension", ["BuildEx may remove content, restrict features, hold a transaction for review, suspend an account, or terminate access when reasonably necessary for safety, legal compliance, provider requirements, policy enforcement, or protection of users. Where appropriate, users may appeal through support."]],
      ["Disclaimers and liability", ["The platform is provided on an 'as available' basis. To the maximum extent permitted by law, BuildEx is not liable for indirect, incidental, special, consequential, or lost-profit damages, or for seller content and conduct. BuildEx's aggregate platform liability for a claim will not exceed the platform fees paid by that claimant during the six months before the event giving rise to the claim.", mandatoryRights]],
      ["Changes and contact", ["Material changes will be versioned and, where required, presented for renewed acceptance. Continued use after the effective date constitutes acceptance only where law permits. Questions may be sent to mcbuildex@gmail.com. Operator identity and governing-law details appear in the Legal Notice."]]
    ]
  },
  payments: {
    title: "Payment, Final-Sale and Dispute Policy",
    version: LEGAL_VERSIONS.payments,
    summary: "Separate purchase, final-sale, and remedy rules for ready-made digital builds and commissioned custom builds.",
    sections: [
      ["Ready-made builds: final sale", ["Before payment, the listing and checkout identify the build, seller, price, Minecraft edition/version, file format, approximate size, included content, dependencies, preview, and license. The buyer requests immediate digital access and acknowledges that the purchase becomes final once access is supplied.", "After access is supplied, there is no change-of-mind refund for disliking an accurately represented build, selecting the wrong clearly disclosed edition, or lacking ordinary tools needed to use ZIP or world files.", "Support remains available for missing access, duplicate payment, corrupt or materially unusable files, material misdescription, undisclosed incompatibility, infringement, fraud, and mandatory legal remedies. A seller may not materially replace the purchase-specific file version after payment."]],
      ["EU digital-content acknowledgement", ["Where applicable, the buyer expressly requests performance and immediate delivery before the withdrawal period ends and acknowledges that the statutory withdrawal right is lost when digital performance begins, to the extent permitted by law."]],
      ["Custom builds: documented scope", ["The enforceable scope is the checkout brief, selected size and style, agreed price, and amendments clearly agreed in the order chat. Uncommunicated expectations are not part of the scope.", "A buyer may open a support dispute within seven calendar days after delivery. The appeal must identify a material difference from the documented scope and provide relevant evidence."]],
      ["Custom-build outcomes", ["BuildEx reviews the brief, agreed chat amendments, rates or listing, delivered file, preview, and evidence from both parties. Version 1 supports only a full release to the builder or a full buyer refund; no partial award is available.", "A refund is not available for changed preferences, uncommunicated requirements, minor subjective aesthetic differences within scope, buyer modifications, or incompatibility disclosed before purchase. BuildEx records and communicates its reasoned decision."]],
      ["Refund processing", ["A refund is complete only after the payment provider or authorized manual process confirms the outbound transfer. BuildEx records the provider reference, asset/network, amount, timestamps, and any failure. A database label alone is not proof that funds were returned.", mandatoryRights]]
    ]
  },
  sellers: {
    title: "Builder and Studio Terms",
    version: LEGAL_VERSIONS.sellers,
    summary: "Additional obligations for independent builders, studios, owners, and managed team members.",
    sections: [
      ["Independent seller status", ["Each builder or studio is an independent seller, not a BuildEx employee. Sellers control how work is produced and are responsible for taxes, registrations, insurance, and compliance applicable to their business."]],
      ["Listings and delivery", ["Sellers must describe services and ready-made files accurately, disclose compatibility and dependencies, use truthful images and previews, meet agreed deadlines, keep order communications on-platform, and deliver safe, usable files. Material substitutions require the buyer's documented agreement."]],
      ["Authority and intellectual property", ["A seller warrants that it created or is authorized to sell and license every submitted build, image, description, and asset; that delivery will not infringe another person's rights; and that third-party or pre-existing materials are disclosed with their license limits."]],
      ["Fees, payouts, and taxes", ["The checkout and seller interface disclose applicable commissions. Sellers authorize deductions, reversals, and reserves required for refunds, disputes, fraud, or provider corrections. Sellers must provide a compatible payout wallet and bear loss caused by an incorrect address or network where law permits."]],
      ["Studios", ["A studio owner is responsible for team access, permissions, client commitments, work allocation, and payouts to members. Adding a team member does not make BuildEx that person's employer. Owners must promptly remove access that is no longer authorized."]],
      ["Enforcement", ["BuildEx may unpublish inaccurate listings, preserve evidence, delay a payout during review, remove infringing material, or suspend a seller. Repeated infringement, fraud, or evasion may result in permanent removal."]]
    ]
  },
  "ready-build-license": {
    title: "Ready-Made Build License",
    version: LEGAL_VERSIONS.readyBuildLicense,
    summary: "The standard non-exclusive license included with every ready-made BuildEx purchase.",
    sections: [
      ["License grant", ["After confirmed payment, the seller grants the buyer a worldwide, perpetual, non-exclusive, non-transferable license to download, use, display, and modify the purchased build in the buyer's Minecraft worlds and projects, including monetized servers and media, unless a listing clearly grants broader rights."]],
      ["Restrictions", ["The buyer may not resell, redistribute, share, sublicense, upload, or provide the original or modified build as a standalone downloadable product; may not claim authorship of the original build; and may not remove ownership notices included with the file."]],
      ["Ownership and third-party rights", ["The seller retains ownership of the build. This license does not transfer Minecraft, textures, mods, plugins, or other third-party materials, which remain subject to their own terms. The listing must disclose material dependencies."]],
      ["Breach and remedies", ["The license ends if the buyer materially breaches these restrictions and does not cure a curable breach after notice. Mandatory consumer rights and lawful backup copies are unaffected."]]
    ]
  },
  privacy: {
    title: "Privacy and Storage Policy",
    version: LEGAL_VERSIONS.privacy,
    summary: "What BuildEx collects, why it is used, where it is shared, and the choices available to users.",
    sections: [
      ["Information collected", ["BuildEx processes OAuth identifiers and email, public profiles, Minecraft usernames, portfolios, listings, studios, favorites, reviews, chats, briefs, uploads, deliverables and previews, payment and wallet records, disputes, moderation records, device/security logs, and functional browser storage."]],
      ["Purposes and legal bases", ["Information is used to create accounts, publish profiles, perform contracts, process and protect transactions, operate chat and delivery, prevent abuse, resolve disputes, comply with law, and improve reliable platform operation. Depending on location, processing rests on contract, legitimate interests, consent, or legal obligations."]],
      ["Public information", ["Profiles, usernames, portfolios, listings, studio pages, reviews, and selected activity are public. Chats, order files, payment details, and disputes are restricted to authorized participants, staff, and service providers as needed."]],
      ["Providers and transfers", ["Data may be handled by Supabase, Discord, Google, NOWPayments or FD Transfers, hosting and security providers, and professional advisers. These parties may process data in other countries under applicable transfer safeguards and their own policies."]],
      ["Retention and deletion", ["Account and content data is retained while needed for the service and then deleted or de-identified under operational schedules. BuildEx may preserve transaction, tax, fraud, dispute, and legal records for required limitation or retention periods. Public blockchain transaction records are permanent and cannot be erased by BuildEx."]],
      ["Your choices", ["Subject to local law, request access, correction, export, deletion, restriction, objection, or withdrawal of consent through mcbuildex@gmail.com. You may also complain to your data-protection authority. Identity verification may be required before fulfilling a request."]],
      ["Cookies and security", ["BuildEx currently uses functional storage needed for authentication, preferences, and service operation. No non-essential analytics or advertising cookies are represented as active. If that changes, consent controls will be introduced where required. No system is perfectly secure; report suspected incidents promptly."]]
    ]
  },
  community: {
    title: "Community and Copyright Policy",
    version: LEGAL_VERSIONS.community,
    summary: "Content standards, safety reporting, moderation, copyright procedures, and the Minecraft relationship disclaimer.",
    sections: [
      ["Community rules", ["Do not harass, threaten, discriminate, scam, impersonate, manipulate reviews, send spam, solicit unsafe off-platform payments, expose private information, upload malware, or publish unlawful, sexualized-minor, hateful, or dangerously deceptive content."]],
      ["Reporting and moderation", ["Report scams, stolen builds, harassment, unsafe content, privacy violations, and underage-account concerns to mcbuildex@gmail.com with links and evidence. BuildEx may investigate, preserve evidence, restrict visibility, remove content, warn users, suspend accounts, or refer urgent matters to relevant authorities. Affected users may request an appeal."]],
      ["Copyright complaints", ["A rights holder may email mcbuildex@gmail.com with identification of the protected work, the allegedly infringing material and its location, contact details, a good-faith statement, an accuracy-and-authority statement, and a physical or electronic signature. BuildEx may forward the notice to the uploader and remove or restrict the content.", "A counter-notice should identify the removed material, state under penalty of perjury that removal resulted from mistake or misidentification, provide contact details and appropriate jurisdictional consent, and include a signature. BuildEx may restore material when legally permitted. Repeat infringers may be terminated."]],
      ["Minecraft disclaimer", ["BuildEx is an unofficial marketplace and is not affiliated with, endorsed by, sponsored by, or approved by Mojang Studios or Microsoft. Minecraft names, marks, and assets belong to their respective owners. Users must follow the Minecraft Usage Guidelines, End User License Agreement, and other applicable rules."]]
    ]
  },
  "legal-notice": {
    title: "Legal & Contact Notice",
    version: "1.0",
    summary: "Official platform, contact, electronic-notice, and publication information for BuildEx.",
    sections: [
      ["Platform", ["BuildEx operates buildex.builders as an online marketplace for commissioning and licensing Minecraft builds. Builders and studios offer their work as independent sellers, and BuildEx provides the marketplace services described in the Terms of Use."]],
      ["Official contacts", ["General support: mcbuildex@gmail.com", "Legal notices: mcbuildex@gmail.com", "Privacy requests: mcbuildex@gmail.com", "Copyright notices: mcbuildex@gmail.com"]],
      ["Electronic notices", ["Notices from BuildEx may be delivered through the platform, to the email associated with an account, or through another contact method a user provides. A notice is considered received when it is made available through the applicable channel, subject to mandatory law. Users are responsible for keeping their contact information current."]],
      ["Governing terms", ["The Terms of Use and any transaction-specific terms govern use of BuildEx. Mandatory consumer protections and any rights that cannot lawfully be waived remain in effect. Applicable law and forum are determined under valid transaction terms and the conflict-of-law rules that apply to the parties and claim."]],
      ["Publication information", [`This notice is version 1.0 and is effective ${LEGAL_EFFECTIVE_DATE}. Material updates will be dated and versioned in the Legal Center.`]]
    ]
  }
};

export const LEGAL_EFFECTIVE = LEGAL_EFFECTIVE_DATE;
export const legalSlugs = Object.keys(legalDocuments);
