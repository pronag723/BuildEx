export default {
  loading: "Loading…",
  intro: {
    title: "Your profile",
    builderBody: "Manage how you appear across BuildEx — your identity, styles and portfolio.",
    visitorBody: "Manage your account details and how you appear to the builders you message.",
  },
  sections: {
    aria: "Account sections",
    profile: "Profile",
    profileShort: "Profile",
    danger: "Account",
    dangerShort: "Account",
  },
  errors: {
    saveFailed: "Couldn't save.",
    deleteNotEnabled:
      "Account deletion isn't enabled on the database yet. Run Supabase migration 0006 (delete_own_account), then try again.",
    deleteFailed: "Couldn't delete your account. Please try again.",
  },
  loadError: {
    title: "Couldn't load your profile",
    body: "We hit a snag fetching your account. Please try again.",
  },
  header: {
    nameHint: "Shown big on your profile.",
    handleLabel: "Your @nickname",
    handleHint: "Unique to you — used in your profile URL, mentions and DMs.",
    linksHint: "Shown as buttons on your public profile. Clear a field to remove it.",
    builderBadge: "Builder",
    addLinks: "Add Discord, Telegram, YouTube and more",
    editProfile: "Edit profile",
  },
  about: {
    title: "About",
    bio: "Bio",
    placeholder: "Share your story, what you love building, the kind of projects you take on…",
    // {edit} is the bold "Edit".
    empty: "No bio yet. Click {edit} to add one.",
  },
  styles: {
    title: "Styles",
    pickOne: "Pick at least one style.",
    empty: "No styles yet. Click {edit} to pick some — they are what clients filter the catalog by.",
  },
  portfolio: {
    subtitle: "Drag in your best builds. The first image becomes your cover.",
    done: "Done editing",
    manage: "Manage portfolio",
    empty: "No builds in your portfolio yet. Click {manage} to add some.",
  },
  actions: {
    title: "Account",
    browse: "Browse builders",
    delete: "Delete account",
    deleteBody:
      "Permanently remove your account and everything tied to it — profile, availability, portfolio and conversations. This can't be undone.",
  },
  deleteDialog: {
    title: "Delete your account?",
    body:
      "This permanently deletes your BuildEx account and all associated data — profile, availability, portfolio images and conversations.",
    irreversible: "This action cannot be undone.",
    // {word} is the literal DELETE the user has to type — never translated,
    // because the check compares against it.
    typeToConfirm: "Type {word} to confirm",
    deleting: "Deleting…",
  },
  become: {
    title: "List yourself as a builder",
    cta: "Create a builder profile",
    body:
      "Get listed in the builders directory so server owners can find you and message you directly. Three steps: your name and avatar, the styles you build in, and a few photos of your work. It takes a couple of minutes, and you can edit or remove it later.",
  },
};
