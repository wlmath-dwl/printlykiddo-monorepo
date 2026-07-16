import type { MetadataRoute } from "next";

const DEFAULT_SITE_ORIGIN = "https://printlykiddo.com";

export const revalidate = 3600;

function getSiteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_ORIGIN;
  return raw.replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
