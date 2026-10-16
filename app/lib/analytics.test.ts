import { describe, it, expect, vi, beforeEach } from "vitest";

const capture = vi.fn();
const init = vi.fn();
vi.mock("posthog-js", () => ({ default: { init, capture, identify: vi.fn(), reset: vi.fn() } }));

beforeEach(() => {
  vi.resetModules();
  capture.mockClear();
  init.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analytics", () => {
  it("is a silent no-op without a key", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { doNotTrack: null });
    const a = await import("./analytics");
    a.initAnalytics();
    a.track("game_started", { format: "snake" });
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(a.analyticsEnabled()).toBe(false);
  });

  it("respects Do Not Track even with a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    const a = await import("./analytics");
    a.initAnalytics();
    a.track("x");
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("initialises privately (no autocapture or replay) and captures events when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { doNotTrack: null });
    const a = await import("./analytics");
    a.initAnalytics();
    expect(init).toHaveBeenCalledWith("phc_test", expect.objectContaining({ autocapture: false, disable_session_recording: true, capture_pageview: false, person_profiles: "identified_only" }));
    a.track("game_started", { format: "snake" });
    expect(capture).toHaveBeenCalledWith("game_started", { format: "snake" });
  });

  it("never throws if posthog does", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { doNotTrack: null });
    capture.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const a = await import("./analytics");
    a.initAnalytics();
    expect(() => a.track("x")).not.toThrow();
  });
});
