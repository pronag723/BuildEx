// Labels for values stored in the database as vocabulary keys.
//
// A builder's styles are stored as keys ("medieval", "sci-fi"). Both languages
// show the dictionary name ("Medieval", "Sci-Fi"); the feed used to print the
// raw lowercase key in English while Russian got a proper label. Anything that
// isn't in the vocabulary falls through unchanged.

import { hasKey, translate } from "./translate.mjs";

export function styleChipLabel(value, lang) {
  if (typeof value !== "string") return value;
  const key = `styles.${value}`;
  return hasKey(lang, key) ? translate(key, null, lang) : value;
}
