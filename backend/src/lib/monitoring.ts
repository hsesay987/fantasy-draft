// Error monitoring (Sentry) and server-side product events (PostHog) for the API.
// Both are inert unless their env vars are set, so local dev and tests need no accounts.
import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE ?? 0.1),
  });
}

const phKey = process.env.POSTHOG_KEY;
const ph = phKey ? new PostHog(phKey, { host: process.env.POSTHOG_HOST || "https://us.i.posthog.com", flushAt: 20, flushInterval: 10_000 }) : null;

export const monitoringEnabled = { sentry: !!dsn, posthog: !!ph };

export { Sentry };

/** Report a handled error with a little context. Never throws. */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (!dsn) return;
  try {
    Sentry.withScope((scope) => {
      if (context) scope.setContext("details", context);
      Sentry.captureException(err);
    });
  } catch {
    /* monitoring must never break a request */
  }
}

/** Server-side product event. `distinctId` is a room code, user id or "server" — never a player name. */
export function trackServer(event: string, properties: Record<string, unknown> = {}, distinctId = "server") {
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
  } catch {
    /* ignore */
  }
}

/** Flush buffered events before the process exits. */
export async function shutdownMonitoring() {
  await Promise.race([Promise.allSettled([ph?.shutdown(2000), dsn ? Sentry.close(2000) : Promise.resolve()]), new Promise((r) => setTimeout(r, 3500))]);
}
