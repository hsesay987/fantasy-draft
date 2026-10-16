import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.nba.com",
      },
      {
        protocol: "https",
        hostname: "www.basketball-reference.com",
      },
      {
        protocol: "https",
        hostname: "i.cdn.turner.com",
      },
      {
        protocol: "https",
        hostname: "a.espncdn.com",
      },
    ],
  },
};

// Sentry build plugin: source maps are uploaded only when SENTRY_AUTH_TOKEN (+ org/project) are set; otherwise it is inert.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
