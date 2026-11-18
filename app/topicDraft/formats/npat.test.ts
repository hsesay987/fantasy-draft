import { beforeEach, describe, expect, it } from "vitest";
import {
  answer, finish, init, next, redactFor, reviewItems, scoreCategory, seenKeys, settle, tick, vote, winners,
  type NPAnswer, type NPState,
} from "./npat";
import { REVEAL_MS, VOTE_MS } from "../npat/rules";
import { setHistorySource, setListSource, type NpatEntry } from "../npat/source";

// Fixture lists: B, H and (hard) Q have 15 answers in both categories, so they are the only letters a round can draw.
const filler = (l: string) => Array.from({ length: 15 }, (_, i): NpatEntry => ({ name: `${l} filler ${i}`, tier: "solid" }));
const LISTS: Record<string, NpatEntry[]> = {
  superhero: [
    { name: "Hulk", also: ["Hulk Smash"], tier: "unicorn" },
    { name: "Hellboy", tier: "deep" },
    { name: "Hawkeye", tier: "rare" },
    { name: "Batman", also: ["Dark Knight"], tier: "common" },
    { name: "Éclair", tier: "rare" },
    ...filler("B"), ...filler("H"), ...filler("Q"),
  ],
  animal: [
    { name: "Horse", tier: "common" },
    { name: "Hedgehog", tier: "unicorn" },
    ...filler("B"), ...filler("H"), ...filler("Q"),
  ],
};

beforeEach(() => {
  setListSource((c) => LISTS[c] ?? []);
  setHistorySource(null);
});

const T0 = 1_000_000;
const P4 = ["Ann", "Bob", "Cy", "Dee"];
type InitOpts = Parameters<typeof init>[0];
const make = (o: Partial<InitOpts> & { letter?: string } = {}): NPState => {
  const { letter, ...rest } = o;
  const s = init({ players: P4, categories: ["superhero", "animal"], rounds: 2, teams: 0, teamMap: {}, seed: 7, now: T0, ...rest });
  return letter ? { ...s, letter, letters: s.letters.map(() => letter) } : s;
};
/** Each player's answers, in category order. */
const write = (s: NPState, rows: Record<string, string[]>, now = T0 + 1): NPState => {
  for (const [p, texts] of Object.entries(rows)) texts.forEach((t, c) => { s = answer(s, p, c, t, now); });
  return s;
};
const close = (s: NPState) => tick(s, s.phaseAt + s.roundMs);
const ans = (s: NPState, p: string, c = 0): NPAnswer => s.history[s.history.length - 1]!.answers[p]![c]!;
const step = (s: NPState) => tick(s, s.phaseAt + 600_000);

describe("scoring", () => {
  it("a Unicorn alone scores 100, two sharers get 50 each", () => {
    let s = close(write(make({ letter: "H" }), { Ann: ["Hulk"] }));
    expect(s.phase).toBe("reveal");
    expect(s.points.Ann).toBe(100);
    expect(ans(s, "Ann")).toMatchObject({ status: "ok", entry: "Hulk", points: 100, tier: "unicorn", shared: false });
    s = close(write(make({ letter: "H" }), { Ann: ["Hulk"], Bob: ["Hulk"] }));
    expect([s.points.Ann, s.points.Bob]).toEqual([50, 50]);
    expect(ans(s, "Bob").shared).toBe(true);
  });

  it("three sharers of an 85 get 43 each; accents, case and a leading 'the' group together", () => {
    const s = close(write(make({ letter: "H" }), { Ann: ["Hellboy"], Bob: ["HÉLLBOY"], Cy: ["the hellboy"] }));
    expect([s.points.Ann, s.points.Bob, s.points.Cy, s.points.Dee]).toEqual([43, 43, 43, 0]);
  });

  it("'The Hulk' and 'hulk' group, and an alias groups with its name", () => {
    const s = close(write(make({ letter: "H" }), { Ann: ["The Hulk"], Bob: ["hulk"], Cy: ["Hulk Smash"] }));
    expect([ans(s, "Ann").entry, ans(s, "Bob").entry, ans(s, "Cy").entry]).toEqual(["Hulk", "Hulk", "Hulk"]);
    expect([s.points.Ann, s.points.Bob, s.points.Cy]).toEqual([50, 50, 50]);
  });

  it("the letter check judges only what was typed: an alias match never rescues another letter", () => {
    const s = close(write(make({ letter: "B" }), { Ann: ["Dark Knight"], Bob: ["Batman"] }));
    expect(ans(s, "Ann")).toMatchObject({ status: "wrong-letter", entry: null, points: 0 });
    expect(ans(s, "Bob")).toMatchObject({ status: "ok", entry: "Batman", points: 10, shared: false });
  });

  it("a leading 'the' and accents are ignored for the letter", () => {
    let s = close(write(make({ letter: "H" }), { Ann: ["The Hulk"] }));
    expect(ans(s, "Ann")).toMatchObject({ status: "ok", entry: "Hulk", points: 100 });
    s = close(write(make({ letter: "E" }), { Ann: ["Éclair"] }));
    expect(ans(s, "Ann")).toMatchObject({ status: "ok", entry: "Éclair", points: 60 });
  });

  it("a wrong-letter answer scores 0 and never reaches the vote", () => {
    const s = close(write(make({ letter: "H" }), { Ann: ["Batman"], Bob: ["Zorro"] }));
    expect(s.phase).toBe("reveal");
    expect(ans(s, "Ann").status).toBe("wrong-letter");
    expect(ans(s, "Bob").status).toBe("wrong-letter");
    expect([s.points.Ann, s.points.Bob]).toEqual([0, 0]);
  });

  it("a blank scores 0", () => {
    const s = close(write(make({ letter: "H" }), { Ann: ["   "] }));
    expect(ans(s, "Ann")).toMatchObject({ status: "blank", points: 0 });
    expect(ans(s, "Bob").status).toBe("blank");
    expect(s.points.Ann).toBe(0);
  });

  it("uses the history-adjusted tier", () => {
    setHistorySource(() => ({ count: 50, plays: 100 }));
    const s = close(write(make({ letter: "H" }), { Ann: ["Hulk"] }));
    expect(ans(s, "Ann").tier).toBe("obvious");
    expect(s.points.Ann).toBe(15);
  });

  it("scoreCategory: per player points, tier and shared", () => {
    const ok = (entry: string): NPAnswer => ({ text: entry, entry, status: "ok" });
    const out = scoreCategory("superhero", { Ann: ok("Hawkeye"), Bob: ok("Hawkeye"), Cy: { text: "", entry: null, status: "blank" } });
    expect(out).toEqual({
      Ann: { points: 30, tier: "rare", shared: true }, Bob: { points: 30, tier: "rare", shared: true }, Cy: { points: 0, tier: null, shared: false },
    });
    // On one team, a shared answer is one sharer.
    expect(scoreCategory("superhero", { Ann: ok("Hawkeye"), Bob: ok("Hawkeye") }, [["Ann", "Bob"], ["Cy"]]).Ann).toEqual({ points: 60, tier: "rare", shared: false });
  });
});

describe("teams", () => {
  const teamed = () => make({ letter: "H", teams: 2, teamMap: { Ann: 0, Bob: 0, Cy: 1, Dee: 1 } });

  it("teammates sharing an answer are scored once for the team, with no dock", () => {
    const s = close(write(teamed(), { Ann: ["Hulk"], Bob: ["the hulk"] }));
    expect(s.teams).toEqual([["Ann", "Bob"], ["Cy", "Dee"]]);
    expect([s.points.Ann, s.points.Bob]).toEqual([100, 100]);
    expect(ans(s, "Ann").shared).toBe(false);
    expect(s.teamPoints).toEqual([100, 0]);
  });

  it("an answer shared across teams is halved for each", () => {
    const s = close(write(teamed(), { Ann: ["Hulk"], Bob: ["Hulk"], Cy: ["Hulk"] }));
    expect([s.points.Ann, s.points.Bob, s.points.Cy]).toEqual([50, 50, 50]);
    expect(s.teamPoints).toEqual([50, 50]);
  });

  it("winners are the top team's members", () => {
    let s = close(write({ ...teamed(), rounds: 1, letters: ["H"] }, { Ann: ["Hulk"], Cy: ["Hawkeye"] }));
    while (!s.done) s = step(s);
    expect(winners(s)).toEqual(["Ann", "Bob"]);
  });
});

describe("unknown answers", () => {
  const unknown = (players = P4) => close(write(make({ players, letter: "H" }), { Ann: ["Hypnotoad"] }));

  it("with 3+ voters, a majority accepts; it scores as common and is flagged for review", () => {
    let s = unknown();
    expect(s.phase).toBe("vote");
    expect(s.voteOn).toBe(0);
    expect(ans(s, "Ann").status).toBe("unknown");
    expect(vote(s, "Ann", true, T0)).toBe(s); // the answerer can't vote
    s = vote(s, "Bob", true, s.phaseAt + 1);
    expect(vote(s, "Bob", false, s.phaseAt + 2)).toBe(s); // one vote each
    s = vote(s, "Cy", true, s.phaseAt + 2);
    expect(s.phase).toBe("vote");
    s = vote(s, "Dee", false, s.phaseAt + 3); // everyone voted: closes early
    expect(s.phase).toBe("reveal");
    expect(ans(s, "Ann")).toMatchObject({ accepted: true, review: true, points: 10, tier: "common" });
    expect(s.points.Ann).toBe(10);
    expect(reviewItems(s)).toEqual([{ player: "Ann", category: "superhero", answer: "Hypnotoad" }]);
  });

  it("a tie accepts, counting only the votes cast", () => {
    let s = unknown();
    s = vote(s, "Bob", true, s.phaseAt + 1);
    s = vote(s, "Cy", false, s.phaseAt + 1);
    expect(tick(s, s.phaseAt + VOTE_MS - 1)).toBe(s);
    s = tick(s, s.phaseAt + VOTE_MS);
    expect(s.phase).toBe("reveal");
    expect(ans(s, "Ann").accepted).toBe(true);
    expect(s.points.Ann).toBe(10);
  });

  it("no votes at all is a tie, so it is accepted", () => {
    const s = tick(unknown(), T0 + 60_000 + VOTE_MS);
    expect(ans(s, "Ann").accepted).toBe(true);
  });

  it("a majority rejects: 0 points, not for review", () => {
    let s = unknown();
    for (const p of ["Bob", "Cy"]) s = vote(s, p, false, s.phaseAt + 1);
    s = vote(s, "Dee", true, s.phaseAt + 1);
    expect(ans(s, "Ann")).toMatchObject({ accepted: false, points: 0 });
    expect(ans(s, "Ann").review).toBeUndefined();
    expect(s.points.Ann).toBe(0);
    expect(reviewItems(s)).toEqual([]);
  });

  it("with 2 players it is accepted without a vote", () => {
    const s = unknown(["Ann", "Bob"]);
    expect(s.phase).toBe("reveal");
    expect(ans(s, "Ann")).toMatchObject({ accepted: true, review: true, points: 10 });
  });

  it("the same unknown typed twice is one vote, and fewer than 3 voters accepts it at once", () => {
    const s = close(write(make({ letter: "H" }), { Ann: ["Hypnotoad"], Bob: ["hypnotoad!"] }));
    expect(s.phase).toBe("reveal");
    expect([s.points.Ann, s.points.Bob]).toEqual([5, 5]);
  });

  it("several unknowns are voted on one at a time", () => {
    let s = close(write(make({ players: [...P4, "Eve"], letter: "H" }), { Ann: ["Hypnotoad"], Bob: ["Hobgoblin x"] }));
    expect(s.voteOn).toBe(0);
    s = tick(s, s.phaseAt + VOTE_MS);
    expect([s.phase, s.voteOn]).toEqual(["vote", 1]);
    expect(ans(s, "Ann").accepted).toBe(true);
    for (const p of ["Ann", "Cy", "Dee", "Eve"]) s = vote(s, p, false, s.phaseAt + 1);
    expect(s.phase).toBe("reveal");
    expect([s.points.Ann, s.points.Bob]).toEqual([10, 0]);
  });

  it("settle: voters leaving below 3 accepts the answer", () => {
    let s = unknown();
    s = vote(s, "Bob", false, s.phaseAt + 1);
    s = settle(s, ["Dee"], s.phaseAt + 2);
    expect(s.phase).toBe("reveal");
    expect(ans(s, "Ann").accepted).toBe(true);
  });
});

describe("rounds and timing", () => {
  it("write ends on the timer at roundMs (inclusive)", () => {
    const s = make({ roundSeconds: 45 });
    expect(s.roundMs).toBe(45_000);
    expect(tick(s, T0 + 44_999)).toBe(s);
    expect(tick(s, T0 + 45_000).phase).not.toBe("write");
    expect(make().roundMs).toBe(60_000);
  });

  it("write ends when everyone has finished", () => {
    let s = make();
    for (const p of ["Ann", "Bob", "Cy"]) s = finish(s, p, T0 + 1);
    expect(s.phase).toBe("write");
    expect(s.submitted).toEqual(["Ann", "Bob", "Cy"]);
    expect(finish(s, "Ann", T0 + 2)).toBe(s);
    s = finish(s, "Dee", T0 + 2);
    expect(s.phase).not.toBe("write");
  });

  it("with stopEarly, write ends after one finish", () => {
    expect(finish(make({ stopEarly: true }), "Bob", T0 + 1).phase).not.toBe("write");
  });

  it("answer overwrites and refuses an out-of-range cat, a non-string and over 40 characters", () => {
    let s = make({ letter: "H" });
    s = answer(s, "Ann", 0, "Hulk", T0 + 1);
    s = answer(s, "Ann", 0, "Hawkeye", T0 + 2);
    expect(s.answers.Ann).toEqual(["Hawkeye", ""]);
    for (const bad of [[-1, "x"], [2, "x"], [0.5, "x"], [0, 5], [0, null], [0, "x".repeat(41)]] as const) {
      expect(answer(s, "Ann", bad[0], bad[1], T0 + 3)).toBe(s);
    }
    expect(answer(s, "Zed", 0, "Hulk", T0 + 3)).toBe(s);
    expect(answer(s, "Ann", 0, "x".repeat(40), T0 + 3).answers.Ann![0]).toHaveLength(40);
    expect(answer(s, "Ann", 0, "Hulk", T0 + 60_000)).toBe(s); // time is up
    expect(answer(finish(s, "Ann", T0 + 3), "Ann", 0, "Hulk", T0 + 4).answers.Ann![0]).toBe("Hawkeye"); // done writing
  });

  it("each category reveals in turn, then a summary, then the next round, then done", () => {
    let s = close(write(make({ letter: "H" }), { Ann: ["Hulk", "Horse"], Bob: ["", "Hedgehog"] }));
    expect([s.phase, s.cat, s.points.Ann]).toEqual(["reveal", 0, 100]);
    expect(tick(s, s.phaseAt + REVEAL_MS - 1)).toBe(s);
    s = tick(s, s.phaseAt + REVEAL_MS);
    expect([s.phase, s.cat, s.points.Ann, s.points.Bob]).toEqual(["reveal", 1, 110, 100]);
    s = step(s);
    expect(s.phase).toBe("summary");
    s = step(s);
    expect([s.phase, s.round, s.cat, s.letter, s.answers, s.submitted]).toEqual(["write", 1, 0, s.letters[1], {}, []]);
    s = step(s);
    s = step(s);
    s = step(s);
    expect(s.done).toBe(false);
    s = step(s);
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(2);
    expect(tick(s, s.phaseAt + 600_000)).toBe(s);
    expect(winners(s)).toEqual(["Ann"]);
  });

  it("next skips a reveal, a vote or a summary but not writing", () => {
    let s = make({ letter: "H" });
    expect(next(s, T0 + 1)).toBe(s);
    s = close(s);
    s = next(s, s.phaseAt + 1);
    expect([s.phase, s.cat]).toEqual(["reveal", 1]);
  });

  it("ties share the win", () => {
    let s = close(write({ ...make({ letter: "H" }), rounds: 1, letters: ["H"] }, { Ann: ["Hulk"], Bob: ["Hulk"] }));
    while (!s.done) s = step(s);
    expect(winners(s)).toEqual(["Ann", "Bob"]);
  });
});

describe("letters", () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

  it("only draws letters in lettersAvailable, hard ones only with hard", () => {
    const drawn = new Set(seeds.flatMap((seed) => make({ seed, rounds: 3 }).letters));
    expect([...drawn].sort()).toEqual(["B", "H"]);
    const hard = new Set(seeds.flatMap((seed) => make({ seed, rounds: 3, hard: true }).letters));
    expect([...hard].sort()).toEqual(["B", "H", "Q"]);
    expect(make({ seed: 3 }).letter).toBe(make({ seed: 3 }).letters[0]);
  });

  it("skips avoided letters (np: keys or raw), then reuses them before repeating", () => {
    for (const seed of seeds) {
      expect(make({ seed, rounds: 1, avoid: ["np:H"] }).letters).toEqual(["B"]);
      expect(make({ seed, rounds: 1, avoid: ["B"] }).letters).toEqual(["H"]);
      expect([...make({ seed, rounds: 2, avoid: ["np:B", "np:H"] }).letters].sort()).toEqual(["B", "H"]);
    }
  });

  it("is deterministic for a seed", () => {
    expect(make({ seed: 99, rounds: 4, hard: true }).letters).toEqual(make({ seed: 99, rounds: 4, hard: true }).letters);
  });

  it("throws when no letter is available", () => {
    expect(() => make({ categories: ["nothing"] })).toThrow(/letter/i);
  });

  it("seenKeys is np:<letter> for each letter played", () => {
    let s = make({ letter: "H" });
    expect(seenKeys(s)).toEqual(["np:H"]);
    while (!s.done) s = step(s);
    expect(seenKeys(s)).toEqual(["np:H"]); // a letter played twice is one key
  });
});

describe("redactFor", () => {
  const TEXTS: Record<string, string[]> = { Ann: ["Hulk", "Horse"], Bob: ["Hawkeye", "Hedgehog"], Cy: ["Hellboy", "Hornet x"] };

  it("during write, a seat sees only its own answers, and no seat or a screen sees anyone's", () => {
    const s = write(make({ letter: "H" }), TEXTS);
    for (const me of [...P4, null]) {
      const json = JSON.stringify(redactFor(s, me));
      for (const [p, texts] of Object.entries(TEXTS)) {
        for (const t of texts) {
          if (p === me) expect(json).toContain(t);
          else expect(json).not.toContain(t);
        }
      }
    }
    expect(redactFor(s, null).answers).toEqual({});
    expect(redactFor(s, "Dee").filled).toEqual({ Ann: 2, Bob: 2, Cy: 2, Dee: 0 });
  });

  it("never shows a later round's letter or the seed", () => {
    const v = redactFor(make({ rounds: 3, hard: true }), "Ann");
    expect(v.letters).toHaveLength(1);
    expect(v.seed).toBe(0);
  });

  it("during the reveal, later categories stay hidden", () => {
    let s = close(write(make({ letter: "H" }), TEXTS));
    expect(s.phase).toBe("reveal");
    let json = JSON.stringify(redactFor(s, "Ann"));
    expect(json).toContain("Hawkeye");
    expect(json).not.toContain("Hedgehog");
    expect(json).not.toContain("Hornet");
    s = step(s); // Hornet x is unknown, with 3 voters
    expect(s.phase).toBe("vote");
    json = JSON.stringify(redactFor(s, "Ann"));
    expect(json).toContain("Hawkeye"); // the revealed category stays public
    expect(json).toContain("Hornet x"); // the answer under vote
    expect(json).not.toContain("Hedgehog"); // the rest of the category waits for its reveal
  });

  it("during a vote, the category's answers stay hidden from every seat and the screen, except the one under vote", () => {
    let s = close(write(make({ letter: "H" }), { Ann: ["Hypnotoad"], Bob: ["Hawkeye"] }));
    expect(s.phase).toBe("vote");
    for (const me of [...P4, null]) {
      const v = redactFor(s, me);
      const json = JSON.stringify(v);
      expect(json).not.toContain("Hawkeye");
      expect(json).toContain("Hypnotoad");
      expect(v.vote?.text).toBe("Hypnotoad");
      expect(v.history[0]!.answers.Ann).toEqual([]);
    }
    s = tick(s, s.phaseAt + VOTE_MS);
    expect(s.phase).toBe("reveal");
    for (const me of [...P4, null]) {
      const json = JSON.stringify(redactFor(s, me));
      expect(json).toContain("Hawkeye");
      expect(json).toContain("Hypnotoad");
    }
  });

  it("an open vote shows each seat only its own vote and who has voted", () => {
    let s = close(write(make({ letter: "H" }), { Ann: ["Hypnotoad"] }));
    s = vote(s, "Bob", false, s.phaseAt + 1);
    const cy = redactFor(s, "Cy");
    expect(cy.vote).toEqual({ text: "Hypnotoad", members: ["Ann"], voters: ["Bob", "Cy", "Dee"], voted: ["Bob"], mine: null });
    expect(redactFor(s, "Bob").vote!.mine).toBe(false);
    expect(redactFor(s, null).vote!.mine).toBeNull();
    s = tick(s, s.phaseAt + VOTE_MS);
    expect(redactFor(s, "Cy").history[0]!.answers.Ann![0]!.votes).toEqual({ Bob: false });
    expect(redactFor(s, "Cy").vote).toBeNull();
  });
});

describe("settle", () => {
  it("returns the same state when nothing changes", () => {
    const s = make();
    expect(settle(s, [], T0 + 1)).toBe(s);
  });

  it("a player who left counts as blank and is not waited for", () => {
    let s = write(make({ letter: "H" }), { Ann: ["Hawkeye"], Dee: ["Hulk", "Horse"] });
    for (const p of ["Ann", "Bob", "Cy"]) s = finish(s, p, T0 + 1);
    expect(s.phase).toBe("write");
    s = settle(s, ["Dee"], T0 + 2);
    expect(s.phase).toBe("reveal");
    expect(ans(s, "Dee", 0).status).toBe("blank");
    expect(ans(s, "Dee", 1).status).toBe("blank");
    expect(s.points.Dee).toBe(0);
    expect(s.points.Ann).toBe(60);
  });

  it("a player who leaves mid-reveal is blank for the categories still to come", () => {
    let s = close(write(make({ letter: "H" }), { Dee: ["Hulk", "Hedgehog"] }));
    expect(s.points.Dee).toBe(100);
    s = settle(s, ["Dee"], s.phaseAt + 1);
    s = step(s);
    expect(ans(s, "Dee", 1).status).toBe("blank");
    expect(s.points.Dee).toBe(100);
  });
});

describe("drinking", () => {
  it("sips only for the player voted out or with the wrong letter", () => {
    let s = close(write(make({ letter: "H", drinking: true }), { Ann: ["Batman"], Bob: ["Hypnotoad"], Dee: ["Hulk"] }));
    for (const p of ["Ann", "Cy", "Dee"]) s = vote(s, p, false, s.phaseAt + 1);
    expect(s.phase).toBe("reveal");
    expect(s.drinks!.totals).toEqual({ Ann: 1, Bob: 1, Cy: 0, Dee: 0 });
  });

  it("is off unless asked for", () => {
    expect(make().drinks).toBeUndefined();
  });
});
