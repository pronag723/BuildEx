// The anchor of a legal-document section, always built from its ENGLISH
// heading so a shared #link (or a Community rules deep link) points at the
// same section in every interface language.
export function sectionId(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
