import { afterEach, describe, expect, it, vi } from "vitest";
import type { TriviaCategory } from "../topicDraft/trivia/types";
import { climbDetail, climbGrid, climbHistory, dailySaveKey, daySeed, endOf, freeSaveKey, lifelineState, pollShare, safePoints, startClimb } from "./climb";
import { answer, crowdPoll, cutTwo, init, loadClimb, saveClimb, swap, walk, type RungState } from "./engine";

const cats = (n: number): TriviaCategory[] =>
  Array.from({ length: n }, (_, c) => ({
    name: `Cat ${c}`,
    clues: [0, 1, 2, 3].map((t) => ({ q: `c${c} tier${t}?`, right: `right ${c}-${t}`, wrong: [`w1 ${c}-${t}`, `w2 ${c}-${t}`, `w3 ${c}-${t}`] })),
  }));
const now = (s: RungState) => s.questions[s.rung - 1]!;
const right = (s: RungState, times = 1) => { let out = s; for (let i = 0; i < times; i++) out = answer(out, now(out).answer); return out; };
const wrong = (s: RungState) => answer(s, now(s).options.find((o) => o !== now(s).answer)!);
const fresh = (seed = 7) => init(cats(4), seed);

function stubStorage(start: Record<string, string> = {}) {
  const data = new Map(Object.entries(start));
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
  return data;
}
afterEach(() => vi.unstubAllGlobals());

describe("save keys", () => {
  it("keeps every day apart, and free play apart from the daily", () => {
    expect(dailySaveKey("2026-11-05")).not.toBe(dailySaveKey("2026-11-06"));
    expect(freeSaveKey("films")).not.toBe(freeSaveKey("anime"));
    expect(dailySaveKey("films")).not.toBe(freeSaveKey("films"));
  });
  it("yesterday's climb never loads as today's", () => {
    stubStorage();
    const yesterday = right(fresh(), 3);
    saveClimb(dailySaveKey("2026-11-05"), yesterday);
    expect(startClimb(cats(4), dailySaveKey("2026-11-06"), 7).rung).toBe(1);
    expect(startClimb(cats(4), dailySaveKey("2026-11-05"), 7).rung).toBe(4);
  });
  it("free play never overwrites the daily", () => {
    stubStorage();
    const daily = right(fresh(), 2);
    saveClimb(dailySaveKey("2026-11-05"), daily);
    saveClimb(freeSaveKey("films"), right(fresh(99), 5));
    expect(loadClimb(dailySaveKey("2026-11-05"))).toEqual(daily);
  });
});

describe("startClimb", () => {
  it("resumes a saved climb exactly, lifelines included", () => {
    stubStorage();
    const mid = crowdPoll(cutTwo(right(fresh(), 4)));
    saveClimb("k", mid);
    expect(startClimb(cats(4), "k", 123)).toEqual(mid);
  });
  it("starts fresh on corrupt data rather than crashing", () => {
    for (const bad of ["{not json", "null", "[]", JSON.stringify({ ...fresh(), rung: 99 }), JSON.stringify({ ...fresh(), points: 10000 })]) {
      stubStorage({ k: bad });
      const s = startClimb(cats(4), "k", 7);
      expect(s).toEqual(fresh());
    }
  });
  it("a saved climb with no questions in it is no climb: a topic that has questions now starts properly", () => {
    stubStorage();
    saveClimb("k", init([], 7));
    expect(startClimb(cats(4), "k", 7).questions).toHaveLength(12);
  });
  it("the same seed gives everyone the same daily climb", () => {
    stubStorage();
    expect(startClimb(cats(4), "a", 5)).toEqual(startClimb(cats(4), "b", 5));
    expect(daySeed("2026-11-05")).toBe(daySeed("2026-11-05"));
    expect(daySeed("2026-11-05")).not.toBe(daySeed("2026-11-06"));
  });
});

describe("endOf", () => {
  it("is null while climbing", () => expect(endOf(fresh())).toBeNull());
  it("never calls a climb with no questions a win", () => {
    const s = init([], 7);
    expect(s.status).toBe("top");
    expect(endOf(s)).toBe("empty");
  });
  it("only rung twelve lights the lamp: a thin climb that runs out of questions is not the top", () => {
    expect(endOf(right(fresh(), 12))).toBe("lamp");
    const thin = init(cats(2), 7);
    expect(thin.questions.length).toBeLessThan(12);
    const done = right(thin, thin.questions.length);
    expect(done.status).toBe("top");
    expect(endOf(done)).toBe("short");
  });
  it("tells a fall from a walk", () => {
    expect(endOf(wrong(fresh()))).toBe("fell");
    expect(endOf(walk(fresh()))).toBe("walked");
  });
});

describe("safePoints", () => {
  it("is what a wrong answer would leave you with", () => {
    for (let cleared = 0; cleared < 12; cleared++) {
      const s = right(fresh(), cleared);
      expect(safePoints(s)).toBe(wrong(s).points);
    }
  });
});

describe("lifelineState", () => {
  it("starts ready and is spent once used", () => {
    const s = fresh();
    expect(lifelineState(s, "cut")).toBe("ready");
    expect(lifelineState(cutTwo(s), "cut")).toBe("used");
    expect(lifelineState(crowdPoll(s), "poll")).toBe("used");
    expect(lifelineState(swap(s), "swap")).toBe("used");
  });
  it("shows Swap as having nothing to bring in on a thin climb, where it could do nothing", () => {
    const thin = init(cats(2), 7);
    expect(lifelineState(thin, "swap")).toBe("none");
    expect(swap(thin)).toBe(thin);
    expect(lifelineState(thin, "cut")).toBe("ready");
  });
  it("is off for all three once the climb is over", () => {
    const s = wrong(fresh());
    for (const l of ["cut", "poll", "swap"] as const) expect(lifelineState(s, l)).not.toBe("ready");
  });
});

describe("pollShare", () => {
  it("has nothing to show before the poll", () => expect(pollShare(fresh(), now(fresh()).options[0]!)).toBeNull());
  it("skips what Cut Two took off a poll taken before it", () => {
    const polled = crowdPoll(fresh());
    expect(Object.keys(polled.poll!)).toHaveLength(4);
    const cut = cutTwo(polled);
    const q = now(cut);
    const shown = q.options.map((o) => pollShare(cut, o));
    expect(shown.filter((n) => n !== null)).toHaveLength(2);
    for (const o of cut.hidden) expect(pollShare(cut, o)).toBeNull();
  });
});

describe("the daily result", () => {
  it("charts the score after each rung, ending where the fall landed", () => {
    const fell = wrong(right(fresh(), 5));
    expect(climbHistory(fell)).toEqual([0.01, 0.02, 0.03, 0.05, 0.08, 0.05]);
  });
  it("has no extra point for walking away, and a full climb ends at the top", () => {
    expect(climbHistory(walk(right(fresh(), 2)))).toEqual([0.01, 0.02]);
    expect(climbHistory(walk(fresh()))).toEqual([]);
    const top = climbHistory(right(fresh(), 12));
    expect(top).toHaveLength(12);
    expect(top[11]).toBe(1);
  });
  it("draws a grid that hides the questions and marks ledges, a fall and a walk", () => {
    expect(climbGrid(wrong(right(fresh(), 5)))).toBe("🟩🟩🟩🟨🟩🟥");
    expect(climbGrid(walk(right(fresh(), 2)))).toBe("🟩🟩⬜");
    expect(climbGrid(right(fresh(), 12))).toBe("🟩🟩🟩🟨🟩🟩🟩🟨🟩🟩🟩🟩");
  });
  it("sends a small detail with no answers in it", () => {
    const s = wrong(right(cutTwo(fresh()), 3));
    const d = climbDetail(s);
    expect(d).toEqual({ status: "fell", points: 0, rung: 4, used: ["cut"] });
    expect(JSON.stringify(d)).not.toContain("right");
  });
});
