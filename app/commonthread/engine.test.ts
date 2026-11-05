import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CLUES, dailyCategory, guess, loadRun, nextClue, options, practiceCategory, saveRun, savedRun, score, seedOf, shareGrid, startRun, type ThreadRun } from "./engine";
import { THREAD_TOPICS, clueImage, loadThreadTopic } from "./topics";
import { PINPOINT_TOPICS } from "../pinpoint/topics";
import type { ThreadCategory, ThreadTopic } from "./types";

const cat: ThreadCategory = {
  id: "directed-by-someone",
  label: "Directed by Someone",
  clues: ["a", "b", "c", "d", "e", "f"].map((name) => ({ name })),
  wrong: ["W1", "W2", "W3", "W4", "W5", "W6", "W7"],
  members: ["a", "b", "c", "d", "e", "f"],
};
const dir = path.join(process.cwd(), "app/commonthread/data");
const real = (pool: string) => JSON.parse(fs.readFileSync(path.join(dir, `${pool}.json`), "utf8")) as ThreadTopic;
const atClue = (n: number): ThreadRun => {
  let r = startRun(cat);
  for (let i = 1; i < n; i++) r = nextClue(r);
  return r;
};

describe("a Common Thread run", () => {
  it("opens on the first clue", () => {
    expect(startRun(cat)).toEqual({ catId: cat.id, shown: 1, removed: [], won: false, over: false });
  });

  it("scores 6 on clue 1 down to 1 on clue 6", () => {
    for (let n = 1; n <= CLUES; n++) {
      const r = guess(atClue(n), cat, cat.label);
      expect(r).toMatchObject({ won: true, over: true, shown: n });
      expect(score(r)).toBe(7 - n);
    }
  });

  it("a wrong guess removes the option and shows the next clue", () => {
    const r = guess(startRun(cat), cat, "W3");
    expect(r).toMatchObject({ removed: ["W3"], shown: 2, won: false, over: false });
  });

  it("asking for a clue costs a point but removes nothing, and stops at the last clue", () => {
    expect(nextClue(startRun(cat))).toMatchObject({ shown: 2, removed: [] });
    const last = atClue(CLUES);
    expect(nextClue(last)).toBe(last);
  });

  it("runs out after a wrong guess on clue 6", () => {
    const r = guess(atClue(CLUES), cat, "W1");
    expect(r).toMatchObject({ over: true, won: false, shown: CLUES, removed: ["W1"] });
    expect(score(r)).toBe(0);
  });

  it("scores nothing before the end", () => expect(score(startRun(cat))).toBe(0));

  it("ignores guesses after the end, removed options and labels that are not options", () => {
    const won = guess(startRun(cat), cat, cat.label);
    expect(guess(won, cat, "W1")).toBe(won);
    expect(nextClue(won)).toBe(won);
    const lost = guess(atClue(CLUES), cat, "W1");
    expect(guess(lost, cat, cat.label)).toBe(lost);
    const once = guess(startRun(cat), cat, "W1");
    expect(guess(once, cat, "W1")).toBe(once);
    const r = startRun(cat);
    expect(guess(r, cat, "Not an option")).toBe(r);
    expect(guess(r, { ...cat, id: "another" }, cat.label)).toBe(r);
  });
});

describe("the options", () => {
  it("are the answer and the seven wrong labels, in the same order for the same seed", () => {
    const o = options(cat, 123);
    expect(o).toHaveLength(8);
    expect([...o].sort()).toEqual([cat.label, ...cat.wrong].sort());
    expect(options(cat, 123)).toEqual(o);
    expect(cat.wrong).toEqual(["W1", "W2", "W3", "W4", "W5", "W6", "W7"]); // the category is left alone
  });

  it("give no signal in where the answer sits, on the seeds a daily really uses", () => {
    const at = Array<number>(8).fill(0);
    for (let day = 1; day <= 1600; day++) at[options(cat, seedOf(`films:${day}`)).indexOf(cat.label)]!++;
    for (const n of at) { // 200 expected in each slot
      expect(n).toBeGreaterThan(150);
      expect(n).toBeLessThan(250);
    }
  });
});

describe("the schedule", () => {
  it("has a topic file for exactly the Pinpoint topics", async () => {
    expect(THREAD_TOPICS.map((t) => t.id).sort()).toEqual(PINPOINT_TOPICS.map((t) => t.id).sort());
    for (const t of THREAD_TOPICS) expect((await loadThreadTopic(t.id)).pool, t.id).toBe(t.id);
    await expect(loadThreadTopic("nope")).rejects.toThrow();
  });

  it("no daily repeats until the topic's own list runs out, then it starts over", () => {
    for (const { id } of THREAD_TOPICS) {
      const t = real(id);
      const seen = new Set(Array.from({ length: t.daily.length }, (_, i) => dailyCategory(t, i + 1).id));
      expect(seen.size, id).toBe(t.daily.length);
      expect(t.daily.length, id).toBeGreaterThanOrEqual(50);
      expect(dailyCategory(t, t.daily.length + 1).id, id).toBe(dailyCategory(t, 1).id);
    }
  });

  it("practice never returns a daily category", () => {
    for (const { id } of THREAD_TOPICS) {
      const t = real(id);
      const daily = new Set(t.daily.flatMap((c) => [c.id, c.label]));
      for (let k = 0; k < 200; k++) {
        const c = practiceCategory(t, k / 200);
        expect(daily.has(c.id) || daily.has(c.label), `${id}/${c.id}`).toBe(false);
      }
    }
  });

  it("practice survives a rand at or outside its range", () => {
    const t = real("flags");
    for (const rand of [0, 1, 1.5, -1, Number.NaN]) expect(t.practice).toContain(practiceCategory(t, rand));
  });
});

describe("sharing", () => {
  const lines = (r: ThreadRun) => shareGrid(r, "TopPic Common Thread #3 · Films").split("\n");

  it("shows the score, one square per clue and the link", () => {
    const skip = nextClue(guess(startRun(cat), cat, "W1")); // a wrong guess, then a skip, right on clue 3
    expect(lines(guess(skip, cat, cat.label))).toEqual(["TopPic Common Thread #3 · Films 4/6", "🟥⬛🟩⬜⬜⬜", "toppicgames.com/commonthread"]);
  });

  it("shows a loss as X with no green", () => {
    let r = startRun(cat);
    for (const w of ["W1", "W2"]) r = guess(r, cat, w);
    while (r.shown < CLUES) r = nextClue(r);
    expect(lines(guess(r, cat, "W3")).slice(0, 2)).toEqual(["TopPic Common Thread #3 · Films X/6", "🟥🟥🟥⬛⬛⬛"]);
  });

  it("never spoils the category", () => {
    const text = shareGrid(guess(startRun(cat), cat, cat.label), "T");
    expect(text).not.toContain(cat.label);
    expect(text).not.toContain(cat.id);
  });
});

describe("saved runs", () => {
  let store: Record<string, string>;
  const key = "toppic:commonthread:films:5";
  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("resumes a saved run", () => {
    const r = guess(atClue(3), cat, "W2");
    saveRun("films", 5, r);
    expect(loadRun("films", 5, cat.id)).toEqual(r);
    expect(loadRun("films", 6, cat.id)).toBeNull();
    expect(loadRun("shows", 5, cat.id)).toBeNull();
  });

  it("starts fresh on a different category", () => {
    saveRun("films", 5, startRun(cat));
    expect(loadRun("films", 5, "another")).toBeNull();
  });

  it("gives the hub a saved result without needing the topic's category", () => {
    saveRun("films", 5, guess(startRun(cat), cat, cat.label));
    expect(savedRun("films", 5)).toMatchObject({ won: true, over: true });
    expect(savedRun("films", 6)).toBeNull();
  });

  it.each([
    ["garbage JSON", "{not json"],
    ["null", "null"],
    ["a number", "7"],
    ["an array", "[]"],
    ["missing fields", JSON.stringify({ catId: cat.id, shown: 2 })],
    ["shown as a string", JSON.stringify({ catId: cat.id, shown: "2", removed: [], won: false, over: false })],
    ["shown of zero", JSON.stringify({ catId: cat.id, shown: 0, removed: [], won: false, over: false })],
    ["shown too high", JSON.stringify({ catId: cat.id, shown: 7, removed: [], won: false, over: false })],
    ["shown not whole", JSON.stringify({ catId: cat.id, shown: 2.5, removed: [], won: false, over: false })],
    ["removed not a list", JSON.stringify({ catId: cat.id, shown: 2, removed: "W1", won: false, over: false })],
    ["removed holding a number", JSON.stringify({ catId: cat.id, shown: 2, removed: [1], won: false, over: false })],
    ["more wrong guesses than clues allow", JSON.stringify({ catId: cat.id, shown: 2, removed: ["W1", "W2"], won: false, over: false })],
    ["won but not over", JSON.stringify({ catId: cat.id, shown: 2, removed: [], won: true, over: false })],
    ["lost before the last clue", JSON.stringify({ catId: cat.id, shown: 2, removed: ["W1"], won: false, over: true })],
    ["lost with no wrong guess", JSON.stringify({ catId: cat.id, shown: 6, removed: [], won: false, over: true })],
  ])("starts fresh on corrupt data: %s", (_name, raw) => {
    store[key] = raw;
    expect(loadRun("films", 5, cat.id)).toBeNull();
    expect(savedRun("films", 5)).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
    });
    expect(loadRun("films", 5, cat.id)).toBeNull();
    expect(() => saveRun("films", 5, startRun(cat))).not.toThrow();
  });
});

describe("clue images", () => {
  it("uses the lookup the topic's images need, and the q when there is one", () => {
    expect(clueImage("flags", { name: "Japan", q: "jp" })).toBe("flag:jp");
    expect(clueImage("films", { name: "Avatar", q: "Avatar (2009 film)" })).toBe("wiki:Avatar (2009 film)");
    expect(clueImage("films", { name: "Heat" })).toBe("wiki:Heat");
    expect(clueImage("pokemon", { name: "Mew" })).toBe("poke:Mew");
    expect(clueImage("anime", { name: "Levi" })).toBe("anilist:Levi");
    expect(clueImage("villains", { name: "Joker" })).toBe("herowiki:Joker");
    for (const t of THREAD_TOPICS) expect(clueImage(t.id, { name: "x" }), t.id).toMatch(/^[a-z]+:x$/);
  });
});
