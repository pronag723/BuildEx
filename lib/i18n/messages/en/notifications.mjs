export default {
  title: "Notifications",
  ariaUnread: "Notifications ({count} unread)",
  markAllRead: "Mark all as read",
  empty: "You're all caught up.",
  // The account page setting for message emails (Account tab). "10 minutes"
  // mirrors message_email_delay() in migration 0104 — change both together.
  email: {
    title: "Email notifications",
    toggleLabel: "Email me when I get a new message",
    // {email} is the account's own address, set in bold.
    toggleHint:
      "If a message stays unread for about 10 minutes, we send one email per conversation to {email}.",
    noEmail: "Your account has no email address, so we can't send these.",
    loadFailed: "Couldn't load your email settings.",
    saveFailed: "Couldn't save. Please try again.",
  },
  // /unsubscribe/ — opened from the link at the bottom of a message email.
  unsubscribe: {
    working: "Updating your email preferences…",
    doneTitle: "You're unsubscribed",
    doneBody: "We won't email you about new messages any more. They'll still be waiting for you on BuildEx.",
    undo: "Turn them back on",
    resubscribedTitle: "Emails are back on",
    resubscribedBody: "We'll email you when a message stays unread.",
    unsubscribeAgain: "Unsubscribe",
    invalidTitle: "This link doesn't work",
    invalidBody:
      "The unsubscribe link is incomplete or invalid. You can turn message emails off in your account settings instead.",
    errorTitle: "Something went wrong",
    errorBody:
      "We couldn't update your email preferences. Please try again, or change them in your account settings.",
    settings: "Account settings",
    browse: "Back to BuildEx",
  },
};
