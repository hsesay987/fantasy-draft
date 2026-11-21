import { afterEach, describe, expect, it } from "vitest";
import { answer, init, judged, lock, next, pendingUnknowns, type DigState } from "../topicDraft/formats/npatDig";
import "../topicDraft/npat/lists";
import { adjustTier, normAnswer, type Tier } from "../topicDraft/npat/rules";
import { entriesOf, lookup, setHistorySource, tierOf } from "../topicDraft/npat/source";
import { overlaySource, soloResult, SOLO_MAX, SOLO_PLAYER } from "./solo";

afterEach(() => setHistorySource(null));

const CATS = ["name", "place", "animal", "thing", "food"];
const start = (overlay?: unknown) => {
  setHistorySource(overlaySource(overlay));
  return init({ players: [SOLO_PLAYER], categories: CATS, strict: true, teams: 0, teamMap: {}, seed: 19, now: 0, letter: "B" });
};
/** Plays the dig through: each category's answer typed and locked; unknowns are judged by `judge` (default: left to the timeout). */
const play = (texts: string[], judge?: (text: string) => { ok: boolean; niche: number }) => {
  let s: DigState = next(start(), 1); // the reel lands
  texts.forEach((t, i) => {
    s = answer(s, SOLO_PLAYER, t, 2 + i);
    s = lock(s, SOLO_PLAYER, 3 + i);
    if (s.phase === "judge") {
      const v = pendingUnknowns(s).map((u) => ({ player: u.player, ...(judge ? judge(u.text) : { ok: false, niche: 0 }) }));
      s = judge ? judged(s, v, 4 + i) : next(s, 4 + i);
    }
    s = next(s, 5 + i); // verdict -> next category (or the summary)
  });
  return s;
};

describe("overlay", () => {
  it("gives each overlaid entry its overlay tier, and leaves the rest on their list tier", () => {
    for (const base of ["solid", "rare", "deep", "unicorn"] as Tier[]) {
      const e = entriesOf("animal").find((x) => x.tier === base)!;
      const moved = adjustTier(base, 1, 1000);
      expect(moved).not.toBe(base);
      setHistorySource(overlaySource({ animal: { [normAnswer(e.name)]: moved } }));
      expect(tierOf("animal", e)).toBe(moved);
      const other = entriesOf("animal").find((x) => x.tier === base && x !== e)!;
      expect(tierOf("animal", other)).toBe(base);
    }
  });
  it("a missing or malformed overlay falls back to the list tiers", () => {
    const e = entriesOf("animal").find((x) => x.tier === "unicorn")!;
    for (const bad of [undefined, null, "x", 42, { animal: "nope" }, { animal: { [normAnswer(e.name)]: "nonsense" } }]) {
      setHistorySource(overlaySource(bad));
      expect(tierOf("animal", e)).toBe("unicorn");
    }
  });
});

describe("a solo daily", () => {
  it("has a 500 point maximum: five categories, a Unicorn each", () => expect(SOLO_MAX).toBe(500));

  it("plays through five categories to the summary", () => {
    const s = play(["", "", "", "", ""]);
    expect(s.phase).toBe("summary");
    expect(s.results[SOLO_PLAYER]).toHaveLength(5);
  });

  it("scores list answers, builds the grid, score and answers to send, and fills unknowns by the judge's verdict", () => {
    const bob = lookup("name", "Bob")!;
    const s = play(["Bob", "Bzzzqqq", "Paris", "", "Bzzznope"], (t) => (t === "Bzzzqqq" ? { ok: true, niche: 90 } : { ok: false, niche: 0 }));
    const r = soloResult(s);
    const bobPts = { common: 10, obvious: 15, solid: 30, rare: 60, deep: 85, unicorn: 100 }[tierOf("name", bob)];
    expect(r.points).toEqual([bobPts, 60, 0, 0, 0]);
    expect(r.total).toBe(bobPts + 60);
    expect(r.score).toBeCloseTo((bobPts + 60) / 500);
    expect(r.grid).toBe(`${bobPts >= 60 ? "🟩" : bobPts >= 30 ? "🟨" : "🟥"}🟩🟥🟥🟥`);
    const t = (bobPts + 60) / 500;
    expect(r.history[0]).toBeCloseTo(bobPts / 500);
    expect(r.history[4]).toBeCloseTo(t);
    expect(r.answers).toEqual([
      { category: "name", text: "Bob" }, { category: "place", text: "Bzzzqqq" }, { category: "animal", text: "Paris" }, { category: "thing", text: "" }, { category: "food", text: "Bzzznope" },
    ]);
  });

  it("an unchecked unknown that starts with the letter scores as common (the engine's timeout fallback)", () => {
    const r = soloResult(play(["Bzzzqqq", "", "", "", ""]));
    expect(r.points[0]).toBe(10);
  });

  it("caps the score at 1", () => {
    const s = play(["", "", "", "", ""]);
    const fake = { ...s, results: { [SOLO_PLAYER]: s.results[SOLO_PLAYER]!.map((a) => ({ ...a, points: 150 })) } };
    expect(soloResult(fake).score).toBe(1);
    expect(soloResult(fake).grid).toBe("🟩🟩🟩🟩🟩");
  });
});
