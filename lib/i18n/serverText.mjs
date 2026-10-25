// Text that reaches the UI from the database rather than from the bundle:
// messages raised by RPCs (chat rate limits, the report flow, the moderation
// console) and the titles/bodies the new-message trigger writes into
// notifications. The database is English-only and is not changed by
// localization, so known strings are mapped to dictionary keys here. Anything
// unknown — and everything, in English — is shown exactly as the server sent it.

import { getLang, translate } from "./translate.mjs";

const EXACT = {
  // migration 0030 — flood guard
  "You are sending messages too quickly. Please wait a moment.": "server.tooFast",
  // migration 0100 — conversation opening and reports
  "Not authenticated": "server.notAuthenticated",
  "Invalid recipient": "server.invalidRecipient",
  "Recipient not found": "server.recipientNotFound",
  "This member is not accepting direct messages.": "server.notAcceptingMessages",
  "You have started too many new conversations in the past hour. Please try again later.":
    "server.tooManyConversationsHour",
  "You have reached the daily limit for starting new conversations. Please try again tomorrow.":
    "server.tooManyConversationsDay",
  "Conversation not found": "server.conversationNotFound",
  "Please describe what is wrong with this conversation.": "server.describeReport",
  "You have already reported this conversation. Our team is reviewing it.":
    "server.alreadyReported",
  "You have submitted too many reports today. Please try again tomorrow.":
    "server.tooManyReports",
  // migration 0101 — moderation console
  "No builder given": "server.noBuilderGiven",
  "That builder profile does not exist": "server.builderNotFound",
  "No image given": "server.noImageGiven",
  "A report is closed as either reviewed or dismissed": "server.reportCloseState",
  "That report does not exist": "server.reportNotFound",
  // migration 0106 — works, price tiers, co-authors (the limits are the
  // current values of the tuning functions; change both together)
  "You can have up to 300 works.": "server.tooManyWorks",
  "You can have up to 12 price tiers.": "server.tooManyTiers",
  "A work can have up to 10 photos.": "server.tooManyPhotos",
  "A work can credit up to 8 co-authors.": "server.tooManyCoauthors",
  "That price tier belongs to another builder.": "server.foreignTier",
  "That work belongs to another builder.": "server.foreignWork",
  "You cannot credit yourself as a co-author.": "server.selfCoauthor",
  "That builder is not on BuildEx.": "server.builderNotOnSite",
  "Not signed in": "server.notSignedIn",
  // migration 0107 — likes
  "Sign in to like works.": "server.signInToLike",
  "That work is not available.": "server.workUnavailable",
  "You cannot like your own work.": "server.ownWorkLike",
  "You are liking too quickly. Please try again later.": "server.likingTooFast",
  // migration 0108 — reviews and their moderation
  "Sign in to leave a review.": "server.signInToReview",
  "You cannot review yourself.": "server.selfReview",
  "You can review a builder after you have both written in a chat.": "server.reviewNeedsChat",
  "You can review this builder a day after your chat started.": "server.reviewTooSoon",
  "Choose a rating from 1 to 5.": "server.chooseRating",
  "Write at least 20 characters.": "server.reviewTooShort",
  "A review can be up to 1500 characters.": "server.reviewTooLong",
  "You have written too many reviews today. Please try again tomorrow.": "server.tooManyReviews",
  "That review is not available.": "server.reviewUnavailable",
  "You cannot report your own review.": "server.ownReviewReport",
  "Please describe what is wrong with this review.": "server.describeReviewReport",
  "You have already reported this review. Our team is reviewing it.":
    "server.alreadyReportedReview",
  "That review does not exist": "server.reviewNotFound",
  "That work does not exist": "server.workNotFound",
  // lib/chat/api.js — client-side guards whose message reaches the toast
  "Supabase not configured": "server.notConfigured",
  "Message is empty": "server.messageEmpty",
  "Missing conversation": "server.missingConversation",
  "No image selected": "server.noImageSelected",
  "Image upload failed": "server.imageUploadFailed",
  "No conversation to report": "server.noConversationToReport",
  // migration 0100 — notification trigger and conversation previews
  "Sent a photo": "server.sentPhoto",
  "New message": "server.newMessage",
  "Someone": "server.someone",
  "Photo": "server.photo",
};

const PHOTO_PREFIX = "Photo · ";

export function translateServerText(text, lang) {
  if (lang !== "ru" || typeof text !== "string" || !text) return text;
  const key = EXACT[text.trim()];
  if (key) return translate(key, null, lang);
  if (text.startsWith(PHOTO_PREFIX)) {
    return translate("server.photoCaption", { caption: text.slice(PHOTO_PREFIX.length) }, lang);
  }
  return text;
}

/**
 * The message to show for a failed call: the server's own wording (mapped to
 * the current language when we know it), or the given fallback key.
 */
export function serverMessage(error, fallbackKey, lang = getLang()) {
  const message = error?.message;
  return message ? translateServerText(message, lang) : translate(fallbackKey, null, lang);
}
