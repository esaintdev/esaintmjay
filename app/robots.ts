import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/seo.ts";

export const dynamic = "force-dynamic";

/** /robots.txt — keep the studio and API out of search results. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
