// Browser-side error monitoring. No DSN = Sentry stays off.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_RATE ?? 0.1),
   
    // Third-party noise we can't act on.
    ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications.", "AbortError", /Failed to fetch/i, /Load failed/i],
    denyUrls: [/pagead2\.googlesyndication\.com/, /extensions\//i, /^chrome:\/\//i],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
