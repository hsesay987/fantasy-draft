import { afterEach, describe, expect, it, vi } from "vitest";
import type { TriviaCategory } from "../topicDraft/trivia/types";
import { bundledCategories } from "../topicDraft/trivia";
import { WORLDS, checkpointAt } from "../components/pixel/worlds";
import { answer, crowdPoll, cutTwo, init, LADDER, LEDGES, loadClimb, RUNGS, saveClimb, scoreFraction, swap, tierOf, walk, type RungState } from "./engine";

/** `n` full categories; every clue's text says which tier it came from. */
const cats = (n: number): TriviaCategory[] =>
  Array.from({ length: n }, (_, c) => ({
    name: `Cat ${c}`,
    clues: [0, 1, 2, 3].map((t) => ({ q: `c${c} tier${t}?`, right: `right ${c}-${t}`, wrong: [`w1 ${c}-${t}`, `w2 ${c}-${t}`, `w3 ${c}-${t}`] })),
  }));

const current = (s: RungState) => s.questions[s.rung - 1]!;
const right = (s: RungState, times = 1): RungState => {
  let out = s;
  for (let i = 0; i < times; i++) out = answer(out, current(out).answer);
  return out;
};
const wrong = (s: RungState) => answer(s, current(s).options.find((o) => o !== current(s).answer)!);
const fresh = (seed = 7) => init(cats(4), seed);

/** A localStorage stand-in, so nothing here depends on a browser. */
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
  return data;
}
afterEach(() => vi.unstubAllGlobals());

describe("the ladder", () => {
  it("has 12 rungs that always pay more, with ledges at 4 and 8", () => {
    expect(RUNGS).toBe(12);
    expect(LADDER).toHaveLength(12);
    expect(LADDER[11]).toBe(10000);
    LADDER.slice(1).forEach((p, i) => expect(p).toBeGreaterThan(LADDER[i]!));
    expect(LEDGES).toEqual([4, 8]);
  });

  it("uses clue tiers 1-3, 4-6, 7-9, 10-12", () => expect([1, 3, 4, 6, 7, 9, 10, 12].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]));
});

describe("init", () => {
  it("deals three clues per tier in order, each with four options holding the answer", () => {
    const s = fresh();
    expect(s.questions).toHaveLength(12);
    s.questions.forEach((q, i) => {
      expect(q.q).toContain(`tier${tierOf(i + 1)}`);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    });
    expect(new Set(s.questions.map((q) => q.q)).size).toBe(12);
    expect(s).toMatchObject({ rung: 1, used: [], hidden: [], poll: null, picks: [], status: "climbing", points: 0, seed: 7 });
  });

  it("keeps each tier's fourth clue as its spare", () => {
    const s = fresh();
    expect(s.spares).toHaveLength(4);
    s.spares.forEach((q, t) => {
      expect(q!.q).toContain(`tier${t}`);
      expect(s.questions.map((x) => x.q)).not.toContain(q!.q);
    });
  });

  it("deals the same climb for the same seed, and a different one for another", () => {
    expect(init(cats(6), 42)).toEqual(init(cats(6), 42));
    expect(init(cats(6), 42).questions).not.toEqual(init(cats(6), 43).questions);
  });

  it("never asks the same question twice, even if two categories share a clue", () => {
    const s = init([...cats(4), ...cats(4)], 3);
    const all = [...s.questions, ...s.spares.flatMap((q) => (q ? [q] : []))];
    expect(new Set(all.map((q) => q.q)).size).toBe(all.length);
  });

  it("skips clues that cannot make four different options", () => {
    const bad: TriviaCategory = { name: "Bad", clues: [0, 1, 2, 3].map((t) => ({ q: `bad tier${t}?`, right: "same", wrong: ["same", "x"] })) };
    const s = init([...cats(4), bad], 1);
    expect(s.questions.some((q) => q.q.startsWith("bad"))).toBe(false);
    expect(s.spares.some((q) => q?.q.startsWith("bad"))).toBe(false);
  });

  it("works on every bundled topic it is pointed at", () => {
    const s = init(bundledCategories("anime"), 5);
    expect(s.questions).toHaveLength(12);
    expect(s.spares.every(Boolean)).toBe(true);
  });
});

describe("answering", () => {
  it("a right answer climbs and banks that rung's points", () => {
    const s = right(fresh(), 3);
    expect(s).toMatchObject({ rung: 4, points: LADDER[2], status: "climbing" });
    expect(s.picks).toEqual(s.questions.slice(0, 3).map((q) => q.answer));
  });

  it("a wrong answer drops to the last ledge's points", () => {
    expect(wrong(right(fresh(), 5))).toMatchObject({ status: "fell", points: LADDER[3] }); // correct through rung 5
    expect(wrong(right(fresh(), 4))).toMatchObject({ status: "fell", points: LADDER[3] }); // standing on the ledge itself
    expect(wrong(right(fresh(), 2))).toMatchObject({ status: "fell", points: 0 }); // wrong on rung 3
    expect(wrong(right(fresh(), 3))).toMatchObject({ status: "fell", points: 0 }); // one short of the ledge
    expect(wrong(right(fresh(), 8))).toMatchObject({ status: "fell", points: LADDER[7] });
    expect(wrong(right(fresh(), 11))).toMatchObject({ status: "fell", points: LADDER[7] });
  });

  it("records the wrong pick", () => {
    const s = fresh();
    const pick = current(s).options.find((o) => o !== current(s).answer)!;
    expect(answer(s, pick).picks).toEqual([pick]);
  });

  it("rung 12 right tops out at 10000", () => {
    const s = right(fresh(), 12);
    expect(s).toMatchObject({ status: "top", points: 10000 });
    expect(scoreFraction(s)).toBe(1);
  });

  it("scoreFraction is points over the top prize", () => {
    expect(scoreFraction(fresh())).toBe(0);
    expect(scoreFraction(right(fresh(), 8))).toBe(0.25);
  });

  it("ignores garbage, a hidden option, and anything after the climb is over", () => {
    const s = fresh();
    expect(answer(s, "not an option")).toBe(s);
    expect(answer(s, 5 as unknown as string)).toBe(s);
    const cut = cutTwo(s);
    expect(answer(cut, cut.hidden[0]!)).toBe(cut);
    const fell = wrong(s);
    expect(answer(fell, current(fell).answer)).toBe(fell);
    const top = right(s, 12);
    expect(answer(top, current(top).answer)).toBe(top);
  });

  it("clears a lifeline's marks when the next question comes up", () => {
    const s = right(crowdPoll(cutTwo(fresh())));
    expect(s.hidden).toEqual([]);
    expect(s.poll).toBeNull();
    expect(s.used).toEqual(["cut", "poll"]);
  });
});

describe("walking away", () => {
  it("keeps current points, and only while climbing", () => {
    const s = walk(right(fresh(), 5));
    expect(s).toMatchObject({ status: "walked", points: LADDER[4], rung: 6 });
    const fell = wrong(fresh());
    expect(walk(fell)).toBe(fell);
    expect(walk(s)).toBe(s);
    const top = right(fresh(), 12);
    expect(walk(top)).toBe(top);
  });

  it("from the ground keeps nothing", () => expect(walk(fresh())).toMatchObject({ status: "walked", points: 0 }));
});

describe("lifelines", () => {
  it("each works once per climb", () => {
    const cut = cutTwo(fresh());
    const nextCut = right(cut);
    expect(cutTwo(nextCut)).toBe(nextCut);
    const poll = crowdPoll(fresh());
    const nextPoll = right(poll);
    expect(crowdPoll(nextPoll)).toBe(nextPoll);
    const swapped = swap(fresh());
    expect(swap(swapped)).toBe(swapped);
    expect(right(swapped).used).toEqual(["swap"]);
  });

  it("do nothing once the climb is over", () => {
    const fell = wrong(fresh());
    expect(cutTwo(fell)).toBe(fell);
    expect(crowdPoll(fell)).toBe(fell);
    expect(swap(fell)).toBe(fell);
  });

  it("cutTwo hides two wrong options, never the answer", () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = cutTwo(init(cats(4), seed));
      expect(s.hidden).toHaveLength(2);
      expect(new Set(s.hidden).size).toBe(2);
      expect(s.hidden).not.toContain(current(s).answer);
      s.hidden.forEach((o) => expect(current(s).options).toContain(o));
    }
  });

  it("cutTwo gives the same cut on a refresh, and does not always cut the same slots", () => {
    expect(cutTwo(fresh(9))).toEqual(cutTwo(fresh(9)));
    const kinds = new Set(Array.from({ length: 30 }, (_, seed) => {
      const s = cutTwo(init(cats(4), seed));
      const left = current(s).options.find((o) => o !== current(s).answer && !s.hidden.includes(o))!;
      return left.slice(0, 2); // which of w1, w2, w3 survived
    }));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("crowdPoll sums to 100, covers what is on screen, and repeats for a seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const climbed of [0, 5, 11]) {
        const s = crowdPoll(right(init(cats(4), seed), climbed));
        const values = Object.values(s.poll!);
        expect(values.reduce((a, b) => a + b, 0)).toBe(100);
        expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
        expect(Object.keys(s.poll!).sort()).toEqual([...current(s).options].sort());
      }
    }
    expect(crowdPoll(fresh(11))).toEqual(crowdPoll(fresh(11)));
  });

  it("crowdPoll leans right, less on higher rungs", () => {
    const share = (climbed: number) => {
      let total = 0, top = 0;
      for (let seed = 0; seed < 200; seed++) {
        const s = crowdPoll(right(init(cats(4), seed * 31), climbed));
        const a = s.poll![current(s).answer]!;
        total += a;
        if (a === Math.max(...Object.values(s.poll!))) top++;
      }
      return { avg: total / 200, top };
    };
    const low = share(0), mid = share(6), high = share(11);
    expect(low.avg).toBeGreaterThan(mid.avg);
    expect(mid.avg).toBeGreaterThan(high.avg);
    expect(high.avg).toBeGreaterThan(25); // still a lean, over a 25% blind guess
    expect(low.top).toBe(200); // the crowd has the easy ones
    expect(high.top).toBeLessThan(180); // and can be wrong on the hard ones
  });

  it("crowdPoll after a cut only polls what is left, and still sums to 100", () => {
    const s = crowdPoll(cutTwo(fresh()));
    expect(Object.keys(s.poll!)).toHaveLength(2);
    s.hidden.forEach((o) => expect(s.poll).not.toHaveProperty([o]));
    expect(Object.values(s.poll!).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("swap replaces with the same tier and clears the old question's marks", () => {
    for (const climbed of [0, 3, 6, 9, 11]) {
      const before = crowdPoll(cutTwo(right(fresh(), climbed)));
      const tier = tierOf(before.rung);
      const after = swap(before);
      expect(current(after)).toEqual(before.spares[tier]);
      expect(after.spares[tier]).toBeNull();
      expect(after.rung).toBe(before.rung);
      expect(after.hidden).toEqual([]);
      expect(after.poll).toBeNull();
      expect(after.used).toContain("swap");
    }
  });

  it("swap no-ops without a spare, and the lifeline is not spent", () => {
    const s = init(cats(3), 1);
    expect(s.spares).toEqual([null, null, null, null]);
    expect(swap(s)).toBe(s);
    expect(s.used).toEqual([]);
  });
});

describe("thin question sets", () => {
  it("handles a thin question set by ending at the top of what exists", () => {
    const s = init(cats(2), 2);
    expect(s.questions).toHaveLength(8);
    const end = right(s, 8);
    expect(end).toMatchObject({ status: "top", points: LADDER[7], rung: 8 });
    expect(answer(end, current(end).answer)).toBe(end);
  });

  it("offers no swap when the tiers do not line up with the rungs", () => {
    // Two of tier 0's clues are unusable, so later questions sit on rungs tierOf would misread: a spare could swap in the wrong tier.
    const lopsided: TriviaCategory[] = cats(4).map((c, i) => (i < 2 ? { ...c, clues: c.clues.map((clue, t) => (t === 0 ? { ...clue, wrong: [clue.right, clue.right, clue.right] } : clue)) } : c));
    const s = init(lopsided, 4);
    expect(s.questions).toHaveLength(11);
    expect(s.spares.every((q) => q === null)).toBe(true);
    expect(() => right(s, s.questions.length)).not.toThrow();
  });

  it("no categories at all never throws and is simply over", () => {
    const s = init([], 1);
    expect(s).toMatchObject({ questions: [], status: "top", points: 0 });
    expect(answer(s, "x")).toBe(s);
    expect(walk(s)).toBe(s);
    expect(cutTwo(s)).toBe(s);
    expect(crowdPoll(s)).toBe(s);
    expect(swap(s)).toBe(s);
  });
});

describe("saving", () => {
  it("resumes a saved climb, the same at every stage", () => {
    stubStorage();
    const states = [fresh(), right(fresh(), 4), cutTwo(fresh()), crowdPoll(fresh()), crowdPoll(cutTwo(fresh())), cutTwo(crowdPoll(fresh())), swap(fresh()), wrong(right(fresh(), 5)), walk(right(fresh(), 3)), right(fresh(), 12), init(cats(2), 2), init([], 1)];
    for (const s of states) {
      saveClimb("k", s);
      expect(loadClimb("k")).toEqual(s);
    }
    const mid = wrong(cutTwo(right(fresh(), 5)));
    saveClimb("k", mid);
    expect(loadClimb("k")).toEqual(mid);
  });

  it("ignores missing and unparseable data", () => {
    const data = stubStorage();
    expect(loadClimb("k")).toBeNull();
    data.set("k", "{not json");
    expect(loadClimb("k")).toBeNull();
    for (const raw of ["null", "5", "[]", '"x"', "{}"]) {
      data.set("k", raw);
      expect(loadClimb("k"), raw).toBeNull();
    }
  });

  it("ignores data these rules could not have produced", () => {
    const data = stubStorage();
    const base = right(fresh(), 5);
    const first = base.questions[0]!;
    const corrupt: [string, Partial<RungState> | Record<string, unknown>][] = [
      ["rung NaN-ish", { rung: "6" }],
      ["rung fraction", { rung: 2.5 }],
      ["rung zero", { rung: 0 }],
      ["rung past the climb", { rung: 13 }],
      ["questions not a list", { questions: "x" }],
      ["no questions while climbing", { questions: [] }],
      ["too many questions", { questions: Array(13).fill(first) }],
      ["question missing its answer", { questions: base.questions.map((q, i) => (i ? q : { q: q.q, options: q.options })) }],
      ["answer not an option", { questions: base.questions.map((q, i) => (i ? q : { ...q, answer: "nope" })) }],
      ["three options", { questions: base.questions.map((q, i) => (i ? q : { ...q, options: q.options.filter((o) => o === q.answer || o !== q.options.find((x) => x !== q.answer)) })) }],
      ["spares not a list", { spares: null }],
      ["wrong number of spares", { spares: [null] }],
      ["bad spare", { spares: [{ q: 1 }, null, null, null] }],
      ["unknown lifeline", { used: ["phone"] }],
      ["lifeline twice", { used: ["cut", "cut"] }],
      ["hidden without the cut", { hidden: [...current(base).options.filter((o) => o !== current(base).answer).slice(0, 2)] }],
      ["poll without the lifeline", { poll: { a: 100 } }],
      ["unknown status", { status: "flying" }],
      ["points not earned", { points: 9999 }],
      ["points as a string", { points: "1200" }],
      ["picks out of step", { picks: [] }],
      ["picks not the right answers", { picks: ["a", "b", "c", "d", "e"] }],
      ["seed missing", { seed: undefined }],
      ["seed infinite-ish", { seed: "7" }],
    ];
    for (const [why, patch] of corrupt) {
      data.set("k", JSON.stringify({ ...base, ...patch }));
      expect(loadClimb("k"), why).toBeNull();
    }
    // A cut that hides the answer, a poll that does not add up, a win that never happened.
    const cut = cutTwo(fresh());
    data.set("k", JSON.stringify({ ...cut, hidden: [current(cut).answer, cut.hidden[0]] }));
    expect(loadClimb("k"), "hid the answer").toBeNull();
    const poll = crowdPoll(fresh());
    data.set("k", JSON.stringify({ ...poll, poll: Object.fromEntries(current(poll).options.map((o) => [o, 10])) }));
    expect(loadClimb("k"), "poll not 100").toBeNull();
    data.set("k", JSON.stringify({ ...poll, poll: { [current(poll).answer]: 100, intruder: 0 } }));
    expect(loadClimb("k"), "poll for something else").toBeNull();
    data.set("k", JSON.stringify({ ...fresh(), status: "top", points: 10000 }));
    expect(loadClimb("k"), "top without climbing").toBeNull();
    const fell = wrong(right(fresh(), 5));
    data.set("k", JSON.stringify({ ...fell, points: LADDER[4] }));
    expect(loadClimb("k"), "kept points past a fall").toBeNull();
    data.set("k", JSON.stringify({ ...fell, picks: fell.picks.slice(0, 5).concat(current(fell).answer) }));
    expect(loadClimb("k"), "fell on the right answer").toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } });
    expect(() => saveClimb("k", fresh())).not.toThrow();
    expect(loadClimb("k")).toBeNull();
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveClimb("k", fresh())).not.toThrow();
    expect(loadClimb("k")).toBeNull();
  });
});

describe("the ladder world", () => {
  const w = WORLDS.ladder;

  it("has a checkpoint per rung, set at that rung's score, so a daily score names the rung it reached", () => {
    expect(w.id).toBe("ladder");
    expect(w.checkpoints).toHaveLength(RUNGS);
    expect(new Set(w.checkpoints.map((c) => c.name)).size).toBe(RUNGS);
    w.checkpoints.forEach((c, i) => {
      expect(c.at).toBe(LADDER[i]! / 10000);
      expect(checkpointAt(w, c.at)).toBe(c);
    });
    expect(checkpointAt(w, scoreFraction(wrong(right(fresh(), 9))))).toBe(w.checkpoints[7]);
  });

  it("spaces the rungs evenly up the tower, however uneven the points", () => {
    const heights = [0, ...LADDER.map((p) => w.pos(p / 10000, 0, 1).y)];
    heights[0] = w.pos(0, 0, 1).y;
    const steps = heights.slice(1).map((y, i) => heights[i]! - y);
    steps.forEach((s) => expect(s).toBe(steps[0]));
    expect(steps[0]).toBeGreaterThan(0);
    expect(w.pos(5, 0, 1)).toEqual(w.pos(1, 0, 1));
    expect(w.pos(-1, 0, 1)).toEqual(w.pos(0, 0, 1));
  });

  it("keeps the camera inside the map from the foot of the tower to the lamp", () => {
    for (const f of [0, 0.01, 0.05, 0.25, 0.5, 1]) {
      const c = w.camera(w.pos(f, 0, 1));
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y + w.viewH).toBeLessThanOrEqual(w.fullH);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + w.viewW).toBeLessThanOrEqual(w.fullW);
    }
  });
});
