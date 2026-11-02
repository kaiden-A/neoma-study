import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Public pages only: the app shell, invites, shared notes and the API are not
// for crawlers. The landing page, sign-in and sign-up stay indexable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/mcp",
          "/today",
          "/groups",
          "/vault",
          "/calendar",
          "/review",
          "/tasks",
          "/courses",
          "/notifications",
          "/settings",
          "/join/",
          "/offline",
          "/s/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
