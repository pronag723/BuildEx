export const dynamic = "force-static";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about/", "/builders/", "/builders/profile/"],
        disallow: [
          "/account/",
          "/admin/",
          "/chats/",
          "/login/",
          "/onboarding/"
        ]
      }
    ],
    sitemap: "https://buildex.builders/sitemap.xml",
    host: "https://buildex.builders"
  };
}
