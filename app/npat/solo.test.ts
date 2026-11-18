import { afterEach, describe, expect, it } from "vitest";
import { answer, finish, init } from "../topicDraft/formats/npat";
import "../topicDraft/npat/lists";
import { adjustTier, normAnswer, type Tier } from "../topicDraft/npat/rules";
import { entriesOf, lookup, setHistorySource, tierOf } from "../topicDraft/npat/source";
import { overlaySource, playToEnd, soloResult, SOLO_PLAYER } from "./solo";

afterEach(() => setHistorySource(null));

const CATS = ["name", "place", "animal", "thing"];
const start = (overlay?: unknown) => {
  setHistorySource(overlaySource(overlay));
  return init({ players: [SOLO_PLAYER], categories: CATS, rounds: 1, roundSeconds: 60, strict: true, teams: 0, teamMap: {}, seed: 19, now: 0, letter: "B" });
};
const write = (texts: string[]) => {
  let s = start();
  texts.forEach((t, i) => { s = answer(s, SOLO_PLAYER, i, t, 1); });
  return playToEnd(finish(s, SOLO_PLAYER, 2), 3);
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
  it("plays the whole round out after writing closes", () => {
    const s = write(["", "", "", ""]);
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(1);
  });

  it("scores list answers, gives unknowns 0, and builds the grid, score and answers to send", () => {
    const bob = lookup("name", "Bob")!;
    const s = write(["Bob", "Bzzzqqq", "Paris", ""]);
    const r = soloResult(s);
    const bobPts = { common: 10, obvious: 15, solid: 30, rare: 60, deep: 85, unicorn: 100 }[tierOf("name", bob)];
    expect(r.points).toEqual([bobPts, 0, 0, 0]);
    expect(r.total).toBe(bobPts);
    expect(r.score).toBeCloseTo(bobPts / 400);
    expect(r.grid).toBe(`${bobPts >= 60 ? "🟩" : bobPts >= 30 ? "🟨" : "🟥"}🟥🟥🟥`);
    expect(r.history).toEqual([bobPts / 400, bobPts / 400, bobPts / 400, bobPts / 400]);
    expect(r.answers).toEqual([
      { category: "name", text: "Bob" }, { category: "place", text: "Bzzzqqq" }, { category: "animal", text: "Paris" }, { category: "thing", text: "" },
    ]);
  });

  it("caps the score at 1", () => {
    const s = write(["", "", "", ""]);
    const fake = { ...s, history: [{ ...s.history[0]!, answers: { [SOLO_PLAYER]: s.history[0]!.answers[SOLO_PLAYER]!.map((a) => ({ ...a, points: 150 })) } }] };
    expect(soloResult(fake).score).toBe(1);
    expect(soloResult(fake).grid).toBe("🟩🟩🟩🟩");
  });
});
