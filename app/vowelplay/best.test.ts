import { afterEach, describe, expect, it, vi } from "vitest";
import { bestFor, saveBest } from "./best";

const KEY = "toppic:vowelplay:best:v1";

/** A small stand-in for the browser's storage: the tests run in Node, which has none. */
function fakeStorage(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

afterEach(() => vi.unstubAllGlobals());

describe("best scores", () => {
  it("is 0 when nothing is saved", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(bestFor("films")).toBe(0);
  });

  it("keeps the higher score, per topic", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveBest("films", 300);
    saveBest("films", 120);
    expect(bestFor("films")).toBe(300);
    saveBest("films", 450);
    expect(bestFor("films")).toBe(450);
    expect(bestFor("books")).toBe(0);
  });

  it("does not read a topic off the object's prototype", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(bestFor("constructor")).toBe(0);
  });

  it("survives storage throwing", () => {
    const boom = () => { throw new Error("denied"); };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    expect(bestFor("films")).toBe(0);
    expect(() => saveBest("films", 10)).not.toThrow();
  });

  it("survives storage being missing", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(bestFor("films")).toBe(0);
    expect(() => saveBest("films", 10)).not.toThrow();
  });

  it("treats a damaged save as empty, and can write over it", () => {
    for (const bad of ["{not json", "null", "[1,2]", '{"films":"lots"}', '{"films":-5}']) {
      const store = fakeStorage({ [KEY]: bad });
      vi.stubGlobal("localStorage", store);
      expect(bestFor("films")).toBe(0);
      saveBest("films", 40);
      expect(bestFor("films")).toBe(40);
    }
  });
});
