import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toppic.io";

/** Let search engines in, but keep them out of accounts, admin and live rooms, which have nothing to index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/room/", "/online/room/", "/toppic/room/", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
