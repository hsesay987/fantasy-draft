import { describe, expect, it } from "vitest";
import { DUEL_WORDS, GUESS_MS, REVEAL_ALL_MS, REVEAL_MS, DUEL_LEAD, JUDGE_MS, SPEAK_MS, buzz, giveUp, guess, init, mark, redactFor, settle, speedPoints, spoke, tick, winners, type VPState, type VPMode } from "./vowelplay";
import { VOWEL_TOPICS, wordsFor } from "../party/vowelWords";
import { toPuzzle } from "../party/vowelText";

const topic = VOWEL_TOPICS[0]!.id;
const T0 = 1_000;
const mk = (mode: VPMode = "first", players = ["Ann", "Bo", "Cy"], count = 3): VPState =>
  init({ players, topic, mode, answer: "type", count, seed: 7, now: T0, drinking: mode === "all" });
const cur = (s: VPState) => s.words[s.round]!;

describe("speedPoints", () => {
  it("is 100 early, falls evenly, floors at 10", () => {
    expect(speedPoints(0)).toBe(100);
    expect(speedPoints(2000)).toBe(100);
    expect(speedPoints(11000)).toBe(55);
    expect(speedPoints(20000)).toBe(10);
    expect(speedPoints(99999)).toBe(10);
  });
});

describe("init", () => {
  it("uses unseen names first, then avoid, never repeats, fixes total", () => {
    const names = wordsFor(topic);
    const avoid = names.slice(0, names.length - 3);
    const s = init({ players: ["A", "B"], topic, mode: "first", answer: "type", count: 10, avoid, seed: 1, now: T0 });
    expect(s.total).toBe(10);
    expect(s.words).toHaveLength(10);
    const got = s.words.map((w) => w.name);
    expect(new Set(got).size).toBe(10);
    const fresh = names.filter((n) => !avoid.includes(n));
    for (const n of fresh) expect(got).toContain(n);
    expect(s.words.every((w) => w.puzzle === toPuzzle(w.name))).toBe(true);
  });
  it("duel plays DUEL_WORDS", () => {
    expect(init({ players: ["A", "B"], topic, mode: "duel", answer: "type", count: 10, seed: 1, now: T0 }).total).toBe(DUEL_WORDS);
  });
  it("accepts any name sharing the puzzle", () => {
    const s0 = mk("first", ["A", "B"]);
    const s = { ...s0, words: [{ name: "Bat", puzzle: "BT", also: ["Bot"] }, ...s0.words.slice(1)] };
    expect(guess(s, "A", "bot", T0 + 10)).not.toBe(s);
    expect(guess(s, "A", "bat", T0 + 10)).not.toBe(s);
  });
});

describe("first", () => {
  it("right guess scores and reveals; wrong returns same object", () => {
    const s = mk();
    expect(guess(s, "Ann", "zzzzqx", T0 + 5)).toBe(s);
    const r = guess(s, "Bo", cur(s).name, T0 + 5);
    expect(r.points.Bo).toBe(1);
    expect(r.phase).toBe("reveal");
    expect(r.history[0]!.winner).toBe("Bo");
    expect(guess(r, "Ann", cur(s).name, T0 + 6)).toBe(r);
  });
  it("times out, advances and finishes", () => {
    let s = mk();
    expect(tick(s, T0 + GUESS_MS - 1)).toBe(s);
    s = tick(s, T0 + GUESS_MS);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.winner).toBeNull();
    let now = T0 + GUESS_MS;
    expect(tick(s, now + REVEAL_MS - 1)).toBe(s);
    for (let i = 0; i < 2; i++) {
      s = tick(s, (now += REVEAL_MS));
      expect(s.round).toBe(i + 1);
      expect(s.phase).toBe("guess");
      s = tick(s, (now += GUESS_MS));
    }
    expect(s.done).toBe(false);
    s = tick(s, now + REVEAL_MS);
    expect(s.done).toBe(true);
  });
  it("ignores strangers and giving up", () => {
    const s = mk();
    expect(guess(s, "Zed", cur(s).name, T0 + 1)).toBe(s);
    expect(giveUp(s, "Ann", T0 + 1)).toBe(s);
  });
  it("a player named constructor can score", () => {
    const s = mk("first", ["constructor", "Bo"]);
    const r = guess(s, "constructor", cur(s).name, T0 + 1);
    expect(r.points.constructor).toBe(1);
    expect(winners(r)).toEqual(["constructor"]);
  });
});

describe("all", () => {
  it("scores by speed, stays open, ends when all done", () => {
    const s = mk("all");
    const a = guess(s, "Ann", cur(s).name, T0 + 1000);
    expect(a.points.Ann).toBe(100);
    expect(a.gotMs.Ann).toBe(1000);
    expect(a.phase).toBe("guess");
    expect(guess(a, "Ann", cur(s).name, T0 + 2000)).toBe(a);
    const b = giveUp(a, "Bo", T0 + 3000);
    expect(b.gaveUp).toEqual(["Bo"]);
    expect(b.phase).toBe("guess");
    const c = guess(b, "Cy", cur(s).name, T0 + 11000 + 0);
    expect(c.phase).toBe("reveal");
    expect(c.points.Cy).toBe(speedPoints(11000));
    expect(c.history[0]!.winner).toBe("Ann");
    expect(tick(c, c.phaseAt + REVEAL_MS)).toBe(c);
    expect(tick(c, c.phaseAt + REVEAL_ALL_MS).round).toBe(1);
  });
  it("solo reveal uses REVEAL_MS", () => {
    const s = mk("all", ["Ann"]);
    const r = guess(s, "Ann", cur(s).name, T0 + 100);
    expect(r.phase).toBe("reveal");
    expect(tick(r, r.phaseAt + REVEAL_MS).round).toBe(1);
  });
  it("drinks: slowest correct and each miss get a sip", () => {
    let s = mk("all", ["Ann", "Bo", "Cy", "Di"]);
    s = guess(s, "Ann", cur(s).name, T0 + 1000);
    s = guess(s, "Bo", cur(s).name, T0 + 5000);
    s = giveUp(s, "Cy", T0 + 6000);
    expect(s.drinks!.calls).toHaveLength(0);
    s = tick(s, T0 + GUESS_MS);
    expect(s.phase).toBe("reveal");
    const to = s.drinks!.calls.filter((c) => c.sips === 1).map((c) => c.to).sort();
    expect(to).toEqual(["Bo", "Cy", "Di"]);
  });
  it("no slowest drink when only one got it", () => {
    let s = mk("all", ["Ann", "Bo"]);
    s = guess(s, "Ann", cur(s).name, T0 + 1000);
    s = giveUp(s, "Bo", T0 + 2000);
    expect(s.drinks!.calls.map((c) => c.to)).toEqual(["Bo"]);
  });
  it("first mode has no drinks", () => {
    expect(mk("first").drinks).toBeUndefined();
  });
});

describe("winners", () => {
  it("most points, ties share", () => {
    const s = { ...mk(), points: { Ann: 2, Bo: 2, Cy: 1 } };
    expect(winners(s)).toEqual(["Ann", "Bo"]);
  });
});

describe("redactFor", () => {
  it("hides current and later words while guessing", () => {
    let s = mk("first", ["Ann", "Bo"], 3);
    s = guess(s, "Ann", cur(s).name, T0 + 1);
    s = tick(s, s.phaseAt + REVEAL_MS); // round 1, guess
    const r = redactFor(s, "Ann");
    expect(r.words).toHaveLength(2);
    expect(r.words[1]!.name).toBe("");
    expect(r.words[1]!.also).toEqual([]);
    expect(r.words[1]!.puzzle).toBe(s.words[1]!.puzzle);
    expect(r.words[0]!.name).toBe(s.words[0]!.name);
    expect(r.total).toBe(3);
    expect(r.seed).toBe(0);
    expect(redactFor(s, null).words[1]!.name).toBe("");
    expect(JSON.stringify(redactFor(s, "Bo"))).not.toContain(s.words[1]!.name);
    expect(JSON.stringify(redactFor(s, "Bo"))).not.toContain(s.words[2]!.name);
  });
  it("shows the name in reveal and everything when done", () => {
    let s = mk("first", ["Ann", "Bo"], 2);
    s = guess(s, "Ann", cur(s).name, T0 + 1);
    const r = redactFor(s, "Bo");
    expect(r.words).toHaveLength(1);
    expect(r.words[0]!.name).toBe(cur(s).name);
    s = tick(tick(s, s.phaseAt + REVEAL_MS), T0 + 99_000);
    s = tick(s, s.phaseAt + REVEAL_MS);
    expect(s.done).toBe(true);
    expect(redactFor(s, null).words).toEqual(s.words);
  });
  it("shows only the words played once a head to head ends early, so unplayed names never go out", () => {
    let s = mk("duel", ["Ann", "Bo"], 3);
    for (let i = 0; i < DUEL_LEAD; i++) {
      s = guess(s, "Ann", cur(s).name, s.phaseAt + 1);
      if (i < DUEL_LEAD - 1) s = tick(s, s.phaseAt + REVEAL_MS);
    }
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(DUEL_LEAD);
    const r = redactFor(s, null);
    expect(r.words).toEqual(s.words.slice(0, DUEL_LEAD));
    const out = JSON.stringify(r);
    for (const w of s.words.slice(DUEL_LEAD)) expect(r.words.map((x) => x.name)).not.toContain(w.name);
    expect(out).not.toContain(`"name":"${s.words[DUEL_LEAD]!.name}"`);
  });
  it("hides the word in play when a forfeit ends the game", () => {
    let s = mk("duel", ["Ann", "Bo"], 3);
    s = settle(s, ["Bo"], s.phaseAt + 5);
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(0);
    expect(redactFor(s, null).words).toEqual([]);
  });
});

const mkV = (mode: VPMode = "first", players = ["Ann", "Bo", "Cy"], count = 3): VPState =>
  init({ players, topic, mode, answer: "voice", count, seed: 7, now: T0 });
const at = (s: VPState, ms: number) => s.phaseAt + ms;

describe("late guess agrees with tick", () => {
  it("guess at exactly GUESS_MS is refused, as tick ends the word there", () => {
    const s = mk();
    expect(guess(s, "Ann", cur(s).name, T0 + GUESS_MS - 1)).not.toBe(s);
    expect(guess(s, "Ann", cur(s).name, T0 + GUESS_MS)).toBe(s);
    expect(tick(s, T0 + GUESS_MS).phase).toBe("reveal");
  });
});

describe("voice", () => {
  it("refuses typed guesses; buzz goes to speak; second buzz refused", () => {
    const s = mkV();
    expect(guess(s, "Ann", cur(s).name, T0 + 5)).toBe(s);
    const b = buzz(s, "Bo", T0 + 100);
    expect(b.phase).toBe("speak");
    expect(b.buzzer).toBe("Bo");
    expect(buzz(b, "Cy", T0 + 200)).toBe(b);
    expect(buzz(mk(), "Ann", T0 + 1)).toEqual(mk());
  });
  it("only the buzzer can spoke; tick after SPEAK_MS also moves to judge", () => {
    const b = buzz(mkV(), "Bo", T0 + 100);
    expect(spoke(b, "Ann", T0 + 200)).toBe(b);
    expect(spoke(b, "Bo", T0 + 200).phase).toBe("judge");
    expect(tick(b, at(b, SPEAK_MS - 1))).toBe(b);
    expect(tick(b, at(b, SPEAK_MS)).phase).toBe("judge");
  });
  const judging = (mode: VPMode = "first", players = ["Ann", "Bo", "Cy"]) => spoke(buzz(mkV(mode, players), "Bo", T0 + 100), "Bo", T0 + 200);
  it("buzzer can't mark; one mark each; all marked resolves", () => {
    const j = judging();
    expect(mark(j, "Bo", "right", T0 + 300)).toBe(j);
    const a = mark(j, "Ann", "wrong", T0 + 300);
    expect(a.phase).toBe("judge");
    expect(mark(a, "Ann", "right", T0 + 301)).toBe(a);
    const c = mark(a, "Cy", "right", T0 + 302);
    expect(c.phase).toBe("reveal");
  });
  it("more wrong than right is wrong; a tie or no marks is right", () => {
    const j = judging("first", ["Ann", "Bo", "Cy", "Di"]);
    const w = mark(mark(mark(j, "Ann", "wrong", T0 + 1), "Cy", "wrong", T0 + 2), "Di", "right", T0 + 3);
    expect(w.history[0]!.wrongBuzz).toBe("Bo");
    expect(w.points.Bo).toBe(0);
    const tie = mark(mark(mark(j, "Ann", "wrong", T0 + 1), "Cy", "right", T0 + 2), "Di", "right", T0 + 3);
    expect(tie.points.Bo).toBe(1);
    const none = tick(j, at(j, JUDGE_MS));
    expect(none.phase).toBe("reveal");
    expect(none.points.Bo).toBe(1);
    expect(tick(j, at(j, JUDGE_MS - 1))).toBe(j);
    const twoTie = mark(mark(judging("first", ["Ann", "Bo", "Cy"]), "Ann", "wrong", T0 + 1), "Cy", "right", T0 + 2);
    expect(twoTie.points.Bo).toBe(1);
  });
  it("wrong in first takes a point, never below 0, and ends the word", () => {
    const j = { ...judging(), points: { Ann: 0, Bo: 2, Cy: 0 } };
    const w = mark(mark(j, "Ann", "wrong", T0 + 1), "Cy", "wrong", T0 + 2);
    expect(w.points.Bo).toBe(1);
    expect(w.phase).toBe("reveal");
    expect(w.history[0]!.winner).toBeNull();
    const z = mark(mark(judging(), "Ann", "wrong", T0 + 1), "Cy", "wrong", T0 + 2);
    expect(z.points.Bo).toBe(0);
  });
  it("right gives 1 and records the winner", () => {
    const r = mark(mark(judging(), "Ann", "right", T0 + 1), "Cy", "right", T0 + 2);
    expect(r.points.Bo).toBe(1);
    expect(r.history[0]!.winner).toBe("Bo");
  });
  it("no buzz in GUESS_MS reveals with no winner", () => {
    const s = tick(mkV(), T0 + GUESS_MS);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.winner).toBeNull();
    expect(buzz(mkV(), "Ann", T0 + GUESS_MS)).toEqual(mkV());
  });
  it("redactFor hides the name in speak for everyone, shows it in judge", () => {
    const sp = buzz(mkV(), "Bo", T0 + 1);
    for (const me of ["Bo", "Ann", null]) expect(JSON.stringify(redactFor(sp, me))).not.toContain(cur(sp).name);
    const j = spoke(sp, "Bo", T0 + 2);
    for (const me of ["Bo", "Ann", null]) expect(redactFor(j, me).words[0]!.name).toBe(cur(sp).name);
  });
});

describe("duel", () => {
  const duel = (answer: "voice" | "type" = "voice") => init({ players: ["Ann", "Bo"], topic, mode: "duel", answer, count: 10, seed: 7, now: T0 });
  const rightBuzz = (s: VPState, by: string, now: number) => {
    const opp = by === "Ann" ? "Bo" : "Ann";
    return mark(spoke(buzz(s, by, now), by, now + 1), opp, "right", now + 2);
  };
  it("a win moves the rope towards the winner; wrong buzz towards the opponent", () => {
    const a = rightBuzz(duel(), "Ann", T0 + 10);
    expect(a.rope).toBe(1);
    const j = spoke(buzz(duel(), "Ann", T0 + 10), "Ann", T0 + 11);
    expect(mark(j, "Ann", "right", T0 + 12)).toBe(j);
    const w = mark(j, "Bo", "wrong", T0 + 12);
    expect(w.rope).toBe(-1);
    const bw = mark(spoke(buzz(duel(), "Bo", T0 + 10), "Bo", T0 + 11), "Ann", "wrong", T0 + 12);
    expect(bw.rope).toBe(1);
    expect(bw.points).toEqual(duel().points);
  });
  it("a wrong buzz can end the game at the lead", () => {
    const s = { ...duel(), rope: DUEL_LEAD - 1 };
    const j = spoke(buzz(s, "Bo", T0 + 10), "Bo", T0 + 11);
    const r = mark(j, "Ann", "wrong", T0 + 12);
    expect(r.rope).toBe(DUEL_LEAD);
    expect(r.done).toBe(true);
    expect(winners(r)).toEqual(["Ann"]);
    const lose = mark(spoke(buzz({ ...duel(), rope: -(DUEL_LEAD - 1) }, "Ann", T0 + 10), "Ann", T0 + 11), "Bo", "wrong", T0 + 12);
    expect(lose.done).toBe(true);
    expect(winners(lose)).toEqual(["Bo"]);
  });
  it("a win at the lead ends it; 30 words end it; winners by rope or both if level", () => {
    const r = rightBuzz({ ...duel(), rope: -(DUEL_LEAD - 1) }, "Bo", T0 + 10);
    expect(r.done).toBe(true);
    expect(winners(r)).toEqual(["Bo"]);
    let s = duel();
    expect(s.total).toBe(DUEL_WORDS);
    s = { ...s, round: s.total - 1 };
    s = tick(tick(s, T0 + GUESS_MS), T0 + GUESS_MS + REVEAL_MS);
    expect(s.done).toBe(true);
    expect(winners(s)).toEqual(["Ann", "Bo"]);
    expect(winners({ ...s, rope: 2 })).toEqual(["Ann"]);
  });
  it("typed: the first right guess moves the rope, the second does not", () => {
    const s = duel("type");
    const r = guess(s, "Bo", cur(s).name, T0 + 10);
    expect(r.rope).toBe(-1);
    expect(r.phase).toBe("reveal");
    expect(guess(r, "Ann", cur(s).name, T0 + 11)).toBe(r);
    expect(guess(s, "Ann", "zzzzqx", T0 + 10)).toBe(s);
  });
  it("two right guesses in a row credit only the first in first mode too", () => {
    const s = mk();
    const r = guess(s, "Ann", cur(s).name, T0 + 5);
    expect(guess(r, "Bo", cur(s).name, T0 + 5)).toBe(r);
    expect(r.points).toEqual({ Ann: 1, Bo: 0, Cy: 0 });
  });
});

describe("settle", () => {
  const speaking = () => buzz(mkV(), "Bo", T0 + 10);
  const judging = () => spoke(speaking(), "Bo", T0 + 11);
  it("returns the same object when nothing changes", () => {
    const s = mk();
    expect(settle(s, [], T0 + 1)).toBe(s);
    expect(settle(s, ["Ann"], T0 + 1)).toBe(s);
    expect(settle(speaking(), ["Ann"], T0 + 1)).toEqual(speaking());
    const sp = speaking();
    expect(settle(sp, ["Ann"], T0 + 1)).toBe(sp);
    const j = judging();
    expect(settle(j, ["Zed"], T0 + 1)).toBe(j);
  });
  it("a departed buzzer ends the word at once with no point", () => {
    for (const s of [speaking(), judging()]) {
      const r = settle(s, ["Bo"], T0 + 50);
      expect(r.phase).toBe("reveal");
      expect(r.points).toEqual(s.points);
      expect(r.history[0]!.winner).toBeNull();
      expect(r.history[0]!.wrongBuzz).toBeUndefined();
    }
  });
  it("departed judges don't count: the rest marking resolves; none left resolves to the speaker", () => {
    const j = mark(judging(), "Ann", "right", T0 + 20);
    const r = settle(j, ["Cy"], T0 + 21);
    expect(r.phase).toBe("reveal");
    expect(r.points.Bo).toBe(1);
    const w = settle(mark(judging(), "Ann", "wrong", T0 + 20), ["Cy"], T0 + 21);
    expect(w.points.Bo).toBe(0);
    const all = settle(judging(), ["Ann", "Cy"], T0 + 21);
    expect(all.phase).toBe("reveal");
    expect(all.points.Bo).toBe(1);
    const waiting = judging();
    expect(settle(waiting, ["Cy"], T0 + 21)).toBe(waiting);
  });
  it("everyone-competes: departed players don't hold up the word", () => {
    let s = mk("all");
    s = guess(s, "Ann", cur(s).name, T0 + 100);
    s = giveUp(s, "Bo", T0 + 200);
    const r = settle(s, ["Cy"], T0 + 300);
    expect(r.phase).toBe("reveal");
    expect(r.drinks!.calls.map((c) => c.to)).toEqual(["Bo"]);
  });
  it("duel with one player left is done with forfeit and the other wins", () => {
    const s = init({ players: ["Ann", "Bo"], topic, mode: "duel", answer: "voice", count: 10, seed: 7, now: T0 });
    const r = settle(s, ["Ann"], T0 + 5);
    expect(r.done).toBe(true);
    expect(r.forfeit).toBe("Ann");
    expect(winners(r)).toEqual(["Bo"]);
    expect(settle(r, ["Ann"], T0 + 6)).toBe(r);
  });
});
