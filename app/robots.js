export const dynamic = "force-static";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/builders/", "/builders/profile/", "/studios/"],
        disallow: [
          "/account/",
          "/admin/",
          "/chats/",
          "/login/",
          "/onboarding/",
          "/order/",
          "/orders/"
        ]
      }
    ],
    sitemap: "https://buildex.builders/sitemap.xml",
    host: "https://buildex.builders"
  };
}
