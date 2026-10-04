// Text the database produces (see lib/i18n/serverText.mjs). English is never
// looked up — the server's own wording is shown as-is — but the keys must
// exist here so both dictionaries share one shape.
export default {
  tooFast: "You are sending messages too quickly. Please wait a moment.",
  notAuthenticated: "Not authenticated",
  invalidRecipient: "Invalid recipient",
  recipientNotFound: "Recipient not found",
  notAcceptingMessages: "This member is not accepting direct messages.",
  tooManyConversationsHour:
    "You have started too many new conversations in the past hour. Please try again later.",
  tooManyConversationsDay:
    "You have reached the daily limit for starting new conversations. Please try again tomorrow.",
  conversationNotFound: "Conversation not found",
  describeReport: "Please describe what is wrong with this conversation.",
  alreadyReported: "You have already reported this conversation. Our team is reviewing it.",
  tooManyReports: "You have submitted too many reports today. Please try again tomorrow.",
  noBuilderGiven: "No builder given",
  builderNotFound: "That builder profile does not exist",
  noImageGiven: "No image given",
  reportCloseState: "A report is closed as either reviewed or dismissed",
  reportNotFound: "That report does not exist",
  notConfigured: "Supabase not configured",
  messageEmpty: "Message is empty",
  missingConversation: "Missing conversation",
  noImageSelected: "No image selected",
  imageUploadFailed: "Image upload failed",
  noConversationToReport: "No conversation to report",
  sentPhoto: "Sent a photo",
  newMessage: "New message",
  someone: "Someone",
  photo: "Photo",
  photoCaption: "Photo · {caption}",
};
