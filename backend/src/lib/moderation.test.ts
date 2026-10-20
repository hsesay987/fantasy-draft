import { afterEach, describe, expect, it, vi } from "vitest";
import { moderate, userText } from "./moderation";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.JEV_API_KEY;
});

describe("moderation", () => {
  it("passes normal text without a key", async () => {
    expect((await moderate(["Stop the alien invasion"])).ok).toBe(true);
  });
  it("blocks slurs locally, no key needed", async () => {
    expect((await moderate(["you are a retard"])).ok).toBe(false);
  });
  it("blocks when Jev scores a rule over the threshold", async () => {
    process.env.JEV_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ answers: { hate: { noul: 0.02 }, sexual: { noul: 0.9 }, threat: { noul: 0 } } }) })));
    expect((await moderate(["something"])).ok).toBe(false);
  });
  it("fails open when Jev is down", async () => {
    process.env.JEV_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await moderate(["hello"])).ok).toBe(true);
  });
  it("collects every player-written field", () => {
    const t = userText({ mission: { title: "T", blurb: "B" }, opts: { customItems: [{ name: "X", universe: "U", archetype: "A" }] }, roles: [{ label: "R" }] });
    expect(t).toEqual(expect.arrayContaining(["T", "B", "X", "U", "A", "R"]));
  });
});
