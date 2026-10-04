// Labels for values stored in the database as vocabulary keys.
//
// A builder's styles are stored as keys ("medieval", "sci-fi") and the feed has
// always printed the raw key on cards and the profile (the account page adds
// `capitalize`). English keeps doing exactly that; Russian shows the
// translated style name, and anything unknown falls through unchanged.

import { hasKey, translate } from "./translate.mjs";

export function styleChipLabel(value, lang) {
  if (lang !== "ru" || typeof value !== "string") return value;
  const key = `styles.${value}`;
  return hasKey(lang, key) ? translate(key, null, lang) : value;
}
