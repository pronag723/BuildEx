export const dynamic = "force-static";

const baseUrl = "https://buildex.builders";

export default function sitemap() {
  const pages = [
    {
      url: baseUrl,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${baseUrl}/builders/`,
      changeFrequency: "daily",
      priority: 0.9
    },
    {
      url: `${baseUrl}/builders/profile/`,
      changeFrequency: "weekly",
      priority: 0.6
    }
  ];
  // Mirrors legalSlugs in app/legal/documents.js — the payments policy, seller
  // terms and ready-made build licence were withdrawn with the features they
  // described, so their URLs are gone too.
  const legal = ["", "terms/", "privacy/", "community/", "legal-notice/"];
  return pages.concat(legal.map((path) => ({ url: `${baseUrl}/legal/${path}`, changeFrequency: "monthly", priority: 0.4 })));
}
