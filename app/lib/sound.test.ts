import { describe, it, expect, vi } from "vitest";
import { SFX_DEFS, loadPrefs } from "./sound";

describe("sound defs", () => {
  it("every sfx has valid notes", () => {
    for (const notes of Object.values(SFX_DEFS)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq).toBeGreaterThanOrEqual(80);
        expect(n.freq).toBeLessThanOrEqual(2000);
        expect(n.dur).toBeGreaterThan(0);
      }
    }
  });
  it("loadPrefs falls back to defaults when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadPrefs()).toEqual({ muted: false, volume: 0.6 });
    vi.unstubAllGlobals();
  });
});
