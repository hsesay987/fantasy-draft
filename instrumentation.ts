import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

// Server-side render/route errors reach Sentry (no-op when no DSN is configured).
export const onRequestError = Sentry.captureRequestError;
