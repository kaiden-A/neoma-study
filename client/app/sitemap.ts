import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Only pages a crawler can read without a session belong here. Shared notes
// (/s/), invites (/join/) and the whole app shell are deliberately excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/signup`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/login`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
