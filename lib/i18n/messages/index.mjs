// Every dictionary, keyed by language then namespace. Keys are addressed as
// "namespace.path.to.key" (see ../translate.mjs). English is the source of
// truth and the fallback; tests/i18n.test.mjs keeps the Russian tree in step.

import enCommon from "./en/common.mjs";
import enNav from "./en/nav.mjs";
import enAuth from "./en/auth.mjs";
import enCatalog from "./en/catalog.mjs";
import enCard from "./en/card.mjs";
import enProfile from "./en/profile.mjs";
import enStyles from "./en/styles.mjs";
import enBuildTypes from "./en/buildTypes.mjs";
import enPlatforms from "./en/platforms.mjs";
import enChat from "./en/chat.mjs";
import enNotifications from "./en/notifications.mjs";
import enAccount from "./en/account.mjs";
import enOnboarding from "./en/onboarding.mjs";
import enAdmin from "./en/admin.mjs";
import enAbout from "./en/about.mjs";
import enFooter from "./en/footer.mjs";
import enLegal from "./en/legal.mjs";
import enServer from "./en/server.mjs";

import ruCommon from "./ru/common.mjs";
import ruNav from "./ru/nav.mjs";
import ruAuth from "./ru/auth.mjs";
import ruCatalog from "./ru/catalog.mjs";
import ruCard from "./ru/card.mjs";
import ruProfile from "./ru/profile.mjs";
import ruStyles from "./ru/styles.mjs";
import ruBuildTypes from "./ru/buildTypes.mjs";
import ruPlatforms from "./ru/platforms.mjs";
import ruChat from "./ru/chat.mjs";
import ruNotifications from "./ru/notifications.mjs";
import ruAccount from "./ru/account.mjs";
import ruOnboarding from "./ru/onboarding.mjs";
import ruAdmin from "./ru/admin.mjs";
import ruAbout from "./ru/about.mjs";
import ruFooter from "./ru/footer.mjs";
import ruLegal from "./ru/legal.mjs";
import ruServer from "./ru/server.mjs";

export const messages = {
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    catalog: enCatalog,
    card: enCard,
    profile: enProfile,
    styles: enStyles,
    buildTypes: enBuildTypes,
    platforms: enPlatforms,
    chat: enChat,
    notifications: enNotifications,
    account: enAccount,
    onboarding: enOnboarding,
    admin: enAdmin,
    about: enAbout,
    footer: enFooter,
    legal: enLegal,
    server: enServer,
  },
  ru: {
    common: ruCommon,
    nav: ruNav,
    auth: ruAuth,
    catalog: ruCatalog,
    card: ruCard,
    profile: ruProfile,
    styles: ruStyles,
    buildTypes: ruBuildTypes,
    platforms: ruPlatforms,
    chat: ruChat,
    notifications: ruNotifications,
    account: ruAccount,
    onboarding: ruOnboarding,
    admin: ruAdmin,
    about: ruAbout,
    footer: ruFooter,
    legal: ruLegal,
    server: ruServer,
  },
};
