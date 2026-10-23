import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("monitoring", () => {
  it("is fully inert without keys", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("POSTHOG_KEY", "");
    const m = await import("./monitoring");
    expect(m.monitoringEnabled).toEqual({ sentry: false, posthog: false });
    expect(() => m.captureError(new Error("x"), { a: 1 })).not.toThrow();
    expect(() => m.trackServer("evt", { a: 1 })).not.toThrow();
    await expect(m.shutdownMonitoring()).resolves.toBeUndefined();
  });

  it("enables each integration independently and never throws on bad input", async () => {
    vi.stubEnv("SENTRY_DSN", "https://publickey@o0.ingest.sentry.io/1");
    vi.stubEnv("POSTHOG_KEY", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "http://127.0.0.1:9"); // nothing listens; sends must fail silently
    const m = await import("./monitoring");
    expect(m.monitoringEnabled).toEqual({ sentry: true, posthog: true });
    expect(() => m.captureError(new Error("boom"))).not.toThrow();
    expect(() => m.trackServer("evt", { circular: undefined })).not.toThrow();
    await m.shutdownMonitoring(); // bounded: must return even when both services are unreachable
  }, 10_000);
});
