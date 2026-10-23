// Product analytics (PostHog). Everything here is a safe no-op unless NEXT_PUBLIC_POSTHOG_KEY is set,
// the visitor has not enabled Do Not Track, and we're in the browser. No autocapture, no session replay:
// we only send the explicit events listed in the Analytics Plan, never typed player names.
import posthog from "posthog-js";

let ready = false;

export function analyticsEnabled() {
  return ready;
}

export function initAnalytics() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (ready || !key || typeof window === "undefined") return;
  if (navigator.doNotTrack === "1") return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false, // sent manually on route change
    autocapture: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
  ready = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!ready) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* analytics must never break the game */
  }
}

export function identify(id: string) {
  if (!ready) return;
  try {
    posthog.identify(id); // id only — never email or name
  } catch {
    /* ignore */
  }
}

export function resetAnalytics() {
  if (!ready) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
