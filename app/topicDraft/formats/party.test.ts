import { describe, expect, it } from "vitest";
import * as IM from "./imposter";
import * as V from "./vote";
import { DECKS } from "../party/decks";
import { getCatalog } from "../catalogs";
import { addCalls, DRINK_CARD_MS, initDrinks } from "../party/drinks";

const players = ["Ana", "Ben", "Cy", "Di"];
const start = (ending: IM.Ending = "guess") => IM.init({ players, pool: getCatalog("superheroes"), topic: "Superheroes", rounds: 1, ending, seed: 7, now: 0 });
const crew = (s: IM.ImposterState) => players.filter((p) => p !== s.imposter);
const giveClues = (s: IM.ImposterState) => {
  for (let i = 0; i < s.order.length; i++) s = IM.clue(s, IM.turnPlayer(s)!, `clue ${i}`, 1);
  return s;
};

describe("imposter", () => {
  it("deals a secret from the topic, an imposter, and options that include the secret", () => {
    const s = start();
    expect(players).toContain(s.imposter);
    expect(s.options).toContain(s.secret);
    expect(s.options).toHaveLength(IM.OPTION_COUNT);
  });

  it("takes clues in turn order and moves to the vote after every round", () => {
    let s = start();
    const first = IM.turnPlayer(s)!;
    const other = players.find((p) => p !== first)!;
    expect(IM.clue(s, other, "nope", 1)).toBe(s);
    s = giveClues(s);
    expect(s.phase).toBe("vote");
  });

  it("rejects a crew clue that gives the secret away", () => {
    let s = start();
    while (IM.turnPlayer(s) === s.imposter) s = IM.clue(s, s.imposter, "hmm", 1);
    const who = IM.turnPlayer(s)!;
    expect(IM.clue(s, who, `it is ${s.secret}`, 1)).toBe(s);
    expect(IM.givesAway("web slinger", "Spider-Man")).toBe(false);
    expect(IM.givesAway("big spider energy", "Spider-Man")).toBe(true);
  });

  it("a clear vote for the imposter catches them; in guess mode they get a last guess", () => {
    let s = giveClues(start("guess"));
    for (const p of players) s = IM.accuse(s, p, p === s.imposter ? crew(s)[0]! : s.imposter, 2);
    expect(s.caught).toBe(true);
    expect(s.phase).toBe("guess");
    const won = IM.guess(s, s.imposter, s.secret, 3);
    expect(won.winner).toBe("imposter");
    expect(won.points[s.imposter]).toBe(3);
    const lost = IM.guess(s, s.imposter, s.options.find((o) => o !== s.secret)!, 3);
    expect(lost.winner).toBe("crew");
  });

  it("in vote mode catching the imposter ends it for the crew; a split vote lets them escape", () => {
    let s = giveClues(start("vote"));
    const caught = players.reduce((x, p) => IM.accuse(x, p, p === x.imposter ? crew(x)[0]! : x.imposter, 2), s);
    expect(caught.winner).toBe("crew");
    expect(caught.points[crew(caught)[0]!]).toBe(2);
    const c = crew(s);
    s = IM.accuse(s, c[0]!, c[1]!, 2);
    s = IM.accuse(s, c[1]!, c[0]!, 2);
    s = IM.accuse(s, c[2]!, s.imposter, 2);
    s = IM.accuse(s, s.imposter, c[2]!, 2);
    expect(s.winner).toBe("imposter");
  });

  it("the imposter can guess early only in guess mode", () => {
    const g = start("guess");
    expect(IM.guess(g, g.imposter, g.secret, 1).winner).toBe("imposter");
    const v = start("vote");
    expect(IM.guess(v, v.imposter, v.secret, 1)).toBe(v);
  });

  it("hides the secret from the imposter and the imposter from the crew", () => {
    const s = start();
    expect(IM.redactFor(s, s.imposter).secret).toBe("");
    expect(IM.redactFor(s, crew(s)[0]!).imposter).toBe("");
    expect(IM.redactFor(s, crew(s)[0]!).secret).toBe(s.secret);
  });

  it("a slow clue passes so the game never stalls", () => {
    const s = IM.tick(start(), IM.CLUE_MS + 1);
    expect(s.clues[0]!.text).toBe("(passed)");
  });
});

describe("imposter drinking", () => {
  const begin = (ending: IM.Ending = "vote", drinking = true) => IM.init({ players, pool: getCatalog("superheroes"), topic: "Superheroes", rounds: 1, ending, drinking, seed: 7, now: 0 });
  /** Everyone votes the imposter out, except crew members listed in `wrong`, who pick another crew member. */
  const voteOut = (s: IM.ImposterState, wrong: string[] = []) => {
    const c = crew(s);
    s = giveClues(s);
    for (const p of c) s = IM.accuse(s, p, wrong.includes(p) ? c.find((x) => x !== p)! : s.imposter, 2);
    return IM.accuse(s, s.imposter, c[0]!, 2);
  };

  it("a crew win calls 2 sips for the imposter and 1 for each player who voted wrong", () => {
    const start0 = begin();
    const wrongOne = crew(start0)[0]!;
    const s = voteOut(start0, [wrongOne]);
    expect(s.winner).toBe("crew");
    expect(s.drinks!.calls).toHaveLength(2);
    expect(s.drinks!.calls[0]).toMatchObject({ to: s.imposter, sips: 2 });
    expect(s.drinks!.calls[1]).toMatchObject({ to: wrongOne, sips: 1 });
    expect(s.drinks!.totals[s.imposter]).toBe(2);
    expect(s.drinks!.seq).toBe(1);
  });

  it("the imposter's own bluff vote does not add a wrong-vote sip", () => {
    const s = voteOut(begin());
    expect(s.drinks!.calls.map((c) => c.to)).toEqual([s.imposter]);
  });

  it("an imposter who names the secret before any vote hands out 3, and nobody counts as voting wrong", () => {
    const g = begin("guess");
    const s = IM.guess(g, g.imposter, g.secret, 1);
    expect(s.winner).toBe("imposter");
    expect(s.drinks!.calls).toHaveLength(1);
    expect(s.drinks!.calls[0]).toMatchObject({ to: s.imposter, sips: 3, handsOut: true });
    expect(s.drinks!.totals[s.imposter]).toBe(0);
  });

  it("when the vote misses, the imposter hands out 3 and each crew member who voted wrong sips 1", () => {
    let s = giveClues(begin());
    const c = crew(s);
    s = IM.accuse(s, c[0]!, c[1]!, 2);
    s = IM.accuse(s, c[1]!, c[0]!, 2);
    s = IM.accuse(s, c[2]!, s.imposter, 2); // voted right: no sip
    s = IM.accuse(s, s.imposter, c[2]!, 2); // the imposter's bluff: no sip
    expect(s.winner).toBe("imposter");
    expect(s.drinks!.calls).toHaveLength(3);
    expect(s.drinks!.calls[0]).toMatchObject({ to: s.imposter, sips: 3, handsOut: true });
    expect(s.drinks!.calls.slice(1).map((x) => [x.to, x.sips]).sort()).toEqual([[c[0]!, 1], [c[1]!, 1]].sort());
    expect(s.drinks!.totals[s.imposter]).toBe(0);
  });

  it("a caught imposter who steals the win still leaves the wrong voters with 1 each", () => {
    const start0 = begin("guess");
    const wrongOne = crew(start0)[0]!;
    const caught = voteOut(start0, [wrongOne]);
    expect(caught.phase).toBe("guess");
    expect(caught.drinks!.calls).toEqual([]);
    const s = IM.guess(caught, caught.imposter, caught.secret, 3);
    expect(s.winner).toBe("imposter");
    expect(s.drinks!.calls.map((x) => [x.to, x.sips, !!x.handsOut])).toEqual([[s.imposter, 3, true], [wrongOne, 1, false]]);
  });

  it("a wrong guess before any vote is a crew win with only the imposter sipping", () => {
    const g = begin("guess");
    const s = IM.guess(g, g.imposter, g.options.find((o) => o !== g.secret)!, 1);
    expect(s.winner).toBe("crew");
    expect(s.drinks!.calls.map((c) => [c.to, c.sips])).toEqual([[s.imposter, 2]]);
  });

  it("has no drinks with drinking off, and none called before the game ends", () => {
    const off = begin("vote", false);
    expect(off.drinks).toBeUndefined();
    expect(voteOut(off).drinks).toBeUndefined();
    expect(begin().drinks!.calls).toEqual([]);
  });
});

describe("vote games", () => {
  const deck = DECKS.find((d) => d.id === "icks")!;
  const happen = DECKS.find((d) => d.id === "happen")!;

  it("every deck has enough cards and every fact card has an answer", () => {
    for (const d of DECKS) expect(d.cards.length).toBeGreaterThanOrEqual(15);
    for (const c of happen.cards) expect(c.answer).toBeDefined();
    expect(new Set(DECKS.flatMap((d) => d.cards.map((c) => c.id))).size).toBe(DECKS.reduce((n, d) => n + d.cards.length, 0));
  });

  const opinionCards = deck.cards;
  const three = ["A", "B", "C"];
  const begin = (o: Partial<Parameters<typeof V.init>[0]> = {}) => V.init({ players: three, deck: "icks", cards: opinionCards, rounds: 3, showVotes: true, seed: 1, now: 0, ...o });
  const allVote = (s: V.VoteState, sides: Record<string, string>) => Object.keys(sides).reduce((x, p) => V.vote(x, p, sides[p]!, 0), s);

  it("scores right guesses, and gives the point to someone nobody read", () => {
    let s = allVote(begin(), { A: "a", B: "b", C: "b" });
    expect(s.phase).toBe("guess");
    s = V.guessVote(s, "B", "A", "b", 0); // wrong
    s = V.guessVote(s, "C", "A", "b", 0); // wrong
    s = V.guessVote(s, "A", "B", "b", 0); // right
    s = V.guessVote(s, "C", "B", "a", 0); // wrong
    s = V.guessVote(s, "A", "C", "b", 0); // right
    s = V.guessVote(s, "B", "C", "b", 0); // right
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ A: 3, B: 1, C: 0 }); // A: 2 right guesses + nobody got A; B: 1 right guess
    expect(s.history[0]!.nobodyGot).toEqual(["A"]);
    expect(s.history[0]!.gained).toEqual({ A: 3, B: 1, C: 0 });
  });

  it("adds +1 for a true vote on Did That Happen", () => {
    const real = happen.cards.find((c) => c.answer === "a")!;
    let s = allVote(begin({ deck: "happen", cards: [real, real, real] }), { A: "a", B: "b", C: "b" });
    for (const [by, t] of [["A", "B"], ["A", "C"], ["B", "A"], ["B", "C"], ["C", "A"], ["C", "B"]] as const) s = V.guessVote(s, by, t, "b", 0);
    // A is read as "b" by both (wrong, so +1 nobody got A) and votes the truth (+1); A guesses B and C right (+2)
    expect(s.points.A).toBe(4);
    expect(s.points.B).toBe(1); // B read C right, A wrong
    expect(s.points.C).toBe(1);
  });

  it("guessTargets gives everyone all others up to 6 players, and 3 evenly from 7", () => {
    expect(V.guessTargets(["A", "B", "C"], 1).A!.sort()).toEqual(["B", "C"]);
    const seven = V.guessTargets(["A", "B", "C", "D", "E", "F", "G"], 1);
    const count = Object.values(seven).flat().reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
    expect(Object.values(seven).every((t) => t.length === 3)).toBe(true);
    expect(Object.values(count).every((n) => n === 3)).toBe(true);
    for (const [p, t] of Object.entries(seven)) expect(t).not.toContain(p);
  });

  it("a player who voted, but whom nobody guessed at all, gets no free point", () => {
    let s = allVote(begin(), { A: "a", B: "b", C: "b" });
    s = V.tick(s, V.GUESS_MS + 1);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ A: 0, B: 0, C: 0 });
    expect(s.history[0]!.nobodyGot).toEqual([]);
  });

  it("a player who did not vote cannot be guessed or score the nobody point", () => {
    let s = allVote(begin(), { A: "a", B: "b" });
    s = V.tick(s, V.VOTE_MS + 1);
    expect(s.phase).toBe("guess");
    expect(Object.keys(s.targets).sort()).toEqual(["A", "B"]);
    expect(Object.values(s.targets).flat()).not.toContain("C");
    expect(V.guessVote(s, "C", "A", "a", 1)).toBe(s);
    expect(V.guessVote(s, "A", "C", "a", 1)).toBe(s);
    s = V.guessVote(s, "A", "B", "a", 1);
    s = V.guessVote(s, "B", "A", "b", 1);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ A: 1, B: 1, C: 0 }); // both guessed wrong, both unread: +1 each, C gets nothing
  });

  it("ignores guessing yourself, a non-target, a bad side, or a repeat", () => {
    const s = allVote(begin(), { A: "a", B: "b", C: "b" });
    expect(V.guessVote(s, "A", "A", "a", 1)).toBe(s);
    expect(V.guessVote(s, "A", "Z", "a", 1)).toBe(s);
    expect(V.guessVote(s, "A", "B", "c", 1)).toBe(s);
    expect(V.guessVote(s, "A", "B", "__proto__", 1)).toBe(s);
    const once = V.guessVote(s, "A", "B", "a", 1);
    expect(V.guessVote(once, "A", "B", "b", 1)).toBe(once);
    expect(V.vote(s, "A", "a", 1)).toBe(s); // voting is over
    expect(V.vote(begin(), "Zed", "a", 1).votes).toEqual({});
  });

  it("with fewer than 2 voters the card goes straight to the reveal", () => {
    const s = V.tick(V.vote(begin(), "A", "a", 1), V.VOTE_MS + 2);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("timers end the vote and guess phases when someone has left", () => {
    let s = allVote(begin(), { A: "a", B: "b" });
    s = V.tick(s, V.VOTE_MS + 1);
    expect(s.phase).toBe("guess");
    s = V.tick(s, V.VOTE_MS + 1 + V.GUESS_MS + 1);
    expect(s.phase).toBe("reveal");
    s = V.tick(s, V.VOTE_MS + V.GUESS_MS + V.REVEAL_MS + 3);
    expect(s.round).toBe(1);
  });

  it("reuses seen cards when unseen cards run short", () => {
    const s = begin({ avoid: opinionCards.map((c) => c.id), rounds: 5 });
    expect(s.cards.length).toBe(5);
    const mixed = begin({ avoid: opinionCards.slice(1).map((c) => c.id), rounds: 3 });
    expect(mixed.cards[0]!.id).toBe(opinionCards[0]!.id);
    expect(mixed.cards.length).toBe(3);
  });

  it("with drinking on and Show votes off, only group toasts appear", () => {
    let s = allVote(begin({ drinking: true, showVotes: false }), { A: "a", B: "b", C: "b" });
    s = V.tick(s, V.GUESS_MS + 1);
    expect(s.drinks!.calls.length).toBeGreaterThan(0);
    expect(s.drinks!.calls.every((c) => c.to === "all")).toBe(true);
  });

  it("with drinking on and Show votes on, nobody-got-you hands out and the worst guesser sips", () => {
    let s = allVote(begin({ drinking: true }), { A: "a", B: "b", C: "b" });
    s = V.guessVote(s, "B", "A", "b", 0);
    s = V.guessVote(s, "C", "A", "b", 0);
    s = V.guessVote(s, "A", "B", "a", 0); // wrong
    s = V.guessVote(s, "C", "B", "b", 0);
    s = V.guessVote(s, "A", "C", "a", 0); // wrong
    s = V.guessVote(s, "B", "C", "b", 0);
    const calls = s.drinks!.calls;
    expect(calls).toContainEqual(expect.objectContaining({ to: "A", sips: 1, handsOut: true }));
    expect(calls).toContainEqual(expect.objectContaining({ to: "A", sips: 1, reason: "Worst read of the card" }));
  });

  it("guessVote ignores anyone who is not a player, whatever their name", () => {
    const s = allVote(begin(), { A: "a", B: "b", C: "b" });
    expect(s.phase).toBe("guess");
    for (const by of ["Zed", "constructor", "__proto__"]) expect(V.guessVote(s, by, "A", "a", 0)).toBe(s);
    expect(V.guessVote({ ...s, targets: { ...s.targets, Zed: ["A"] } }, "Zed", "A", "a", 0).guesses.Zed).toBeUndefined();
  });

  it("leaves drinks off unless asked", () => {
    expect(begin().drinks).toBeUndefined();
  });

  it("redacts votes and guesses until the reveal, and keeps them secret all game with Show votes off", () => {
    const s = allVote(begin(), { A: "a", B: "b", C: "b" });
    expect(V.redactFor(s, "A").votes).toEqual({ A: "a", B: "?", C: "?" });
    const g = V.guessVote(s, "B", "A", "b", 0);
    expect(V.redactFor(g, "A").guesses).toEqual({});
    expect(V.redactFor(g, "B").guesses).toEqual({ B: { A: "b" } });
    const hidden = V.tick(begin({ showVotes: false }), 0);
    expect(V.redactFor(hidden, "A", true).points).toEqual(hidden.points);
  });

  it("clocks reveal a slow vote and move on after the reveal", () => {
    let s = V.init({ players, deck: "icks", cards: deck.cards, rounds: 3, seed: 1, now: 0 });
    s = V.tick(s, V.VOTE_MS + 1);
    expect(s.phase).toBe("reveal"); // nobody voted
    s = V.tick(s, V.VOTE_MS + V.REVEAL_MS + 2);
    expect(s.round).toBe(1);
  });
});

describe("vote games when someone leaves", () => {
  const P4 = ["A", "B", "C", "D"];
  const cards = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, prompt: `P${i}`, a: "yes", b: "no" }));
  const make = (players = P4, extra: Partial<Parameters<typeof V.init>[0]> = {}) => V.init({ players, deck: "x", cards, rounds: 4, seed: 3, now: 0, ...extra });
  const voteAll = (s: V.VoteState, who: string[]) => who.reduce((x, p) => V.vote(x, p, "a", 1), s);

  it("closes the vote once everyone still here has voted, and not before", () => {
    const three = voteAll(make(), ["A", "B", "C"]);
    expect(three.phase).toBe("vote");
    expect(V.settle(three, [], 2)).toBe(three);
    const moved = V.settle(three, ["D"], 2);
    expect(moved.phase).toBe("guess");
    expect(Object.keys(moved.targets).sort()).toEqual(["A", "B", "C"]);
    const two = voteAll(make(), ["A", "B"]);
    expect(V.settle(two, ["D"], 2)).toBe(two);
  });

  it("doesn't wait for the guesses of a voter who then left", () => {
    let s = voteAll(make(), P4);
    expect(s.phase).toBe("guess");
    for (const by of ["A", "B", "C"]) for (const t of P4.filter((x) => x !== by)) s = V.guessVote(s, by, t, "a", 2);
    expect(s.phase).toBe("guess");
    const done = V.settle(s, ["D"], 3);
    expect(done.phase).toBe("reveal");
    expect(done.history).toHaveLength(1);
  });

  it("waits for a guesser who is still here", () => {
    const s = voteAll(make(), P4);
    expect(V.settle(s, ["D"], 3)).toBe(s);
  });

  it("does nothing in a reveal or a finished game, or with nobody left", () => {
    const s = voteAll(make(), P4);
    expect(V.settle(s, P4, 3)).toBe(s);
    const rev = V.tick(s, V.GUESS_MS + 10);
    expect(V.settle(rev, ["D"], V.GUESS_MS + 11)).toBe(rev);
  });
});

describe("vote reveal time", () => {
  const cards = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, prompt: `P${i}`, a: "yes", b: "no" }));
  const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
  const inReveal = (n: number, drinking = false) => {
    const s = V.init({ players: names(n), deck: "x", cards, rounds: 4, drinking, seed: 3, now: 0 });
    return { ...s, phase: "reveal" as const, phaseAt: 0 };
  };

  it("is 9 seconds up to 6 players, then 1 more per player", () => {
    expect(V.revealMs(inReveal(3))).toBe(9_000);
    expect(V.revealMs(inReveal(6))).toBe(9_000);
    expect(V.revealMs(inReveal(7))).toBe(10_000);
    expect(V.revealMs(inReveal(12))).toBe(15_000);
  });

  it("adds the sip card's time when drinking is on, so the card doesn't eat the reading time", () => {
    expect(V.revealMs(inReveal(6, true))).toBe(9_000 + DRINK_CARD_MS);
  });

  it("the clock follows it", () => {
    const s = inReveal(12);
    expect(V.tick(s, 14_000).phase).toBe("reveal");
    expect(V.tick(s, 15_001).round).toBe(1);
  });
});

describe("what a vote seat is sent", () => {
  const cards = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, prompt: `P${i}`, a: "It happened", b: "Made up", answer: "a" as const, note: `N${i}` }));
  const make = (showVotes = true) => V.init({ players: ["A", "B", "C"], deck: "x", cards, rounds: 4, showVotes, seed: 3, now: 0 });
  const toReveal = (s: V.VoteState) => {
    for (const p of s.players) s = V.vote(s, p, "b", 1);
    return V.tick(s, s.phaseAt + V.GUESS_MS + 1);
  };

  it.each([[true], [false]])("withholds this card's answer and every later card until the reveal (show votes %s)", (show) => {
    const s = make(show);
    for (const me of ["A", null]) {
      const v = V.redactFor(s, me);
      expect(v.cards).toHaveLength(1);
      expect(v.cards[0]).toEqual({ id: s.cards[0]!.id, prompt: s.cards[0]!.prompt, a: "It happened", b: "Made up" });
      expect(v.total).toBe(4);
      expect(v.seed).toBe(0);
    }
  });

  it.each([[true], [false]])("opens the answer at the reveal, and keeps it for later cards (show votes %s)", (show) => {
    const rev = toReveal(make(show));
    expect(rev.phase).toBe("reveal");
    const open = V.redactFor(rev, "A");
    expect(open.cards).toHaveLength(1);
    expect(open.cards[0]).toMatchObject({ answer: "a", note: rev.cards[0]!.note });
    const next = V.redactFor(V.nextCard(rev, 100), "A");
    expect(next.cards).toHaveLength(2);
    expect(next.cards[0]).toMatchObject({ answer: "a" });
    expect(next.cards[1]!.answer).toBeUndefined();
    expect(next.cards[1]!.note).toBeUndefined();
    expect(next.total).toBe(4);
  });

  it("sends the whole game once it is over, with history and points intact", () => {
    let s = make();
    for (let i = 0; i < 4; i++) s = V.nextCard(toReveal(s), 100);
    expect(s.done).toBe(true);
    const v = V.redactFor(s, "A", true);
    expect(v.cards).toHaveLength(4);
    expect(v.cards[3]).toMatchObject({ answer: "a" });
    expect(v.history).toHaveLength(4);
    expect(v.points).toEqual(s.points);
    expect(v.seed).toBe(s.seed);
  });

  it("has a public per-game key, since the seed is hidden", () => {
    expect(make().startedAt).toBe(0);
    expect(V.redactFor(V.init({ players: ["A", "B", "C"], deck: "x", cards, rounds: 4, seed: 3, now: 55 }), "A").startedAt).toBe(55);
  });
});

describe("players named after built-in object properties", () => {
  const odd = ["constructor", "toString", "__proto__", "valueOf"];
  const cards = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, prompt: `P${i}`, a: "yes", b: "no" }));
  const voteGame = () => V.init({ players: odd, deck: "x", cards, rounds: 3, seed: 3, now: 0 });

  it("can vote and guess in vote games, and are scored like anyone else", () => {
    let s = voteGame();
    for (const p of odd) {
      const after = V.vote(s, p, "a", 1);
      expect(after).not.toBe(s);
      s = after;
    }
    expect(s.phase).toBe("guess");
    for (const by of odd) for (const t of odd.filter((x) => x !== by)) {
      const after = V.guessVote(s, by, t, "a", 2);
      expect(after).not.toBe(s);
      s = after;
    }
    expect(s.phase).toBe("reveal");
    for (const p of odd) expect(s.points[p]).toBe(3);
  });

  it("isn't taken for a guesser or a voter when they aren't one", () => {
    let s = voteGame();
    s = V.vote(s, "toString", "a", 1);
    s = V.vote(s, "valueOf", "a", 1);
    s = V.tick(s, V.VOTE_MS + 2); // constructor and __proto__ never voted, so they have no targets
    expect(s.phase).toBe("guess");
    expect(V.guessVote(s, "constructor", "toString", "a", 2)).toBe(s);
    expect(V.redactFor(s, "constructor").guesses).toEqual({});
    const rev = V.guessVote(V.guessVote(s, "toString", "valueOf", "b", 3), "valueOf", "toString", "b", 3);
    expect(rev.history[0]!.nobodyGot.sort()).toEqual(["toString", "valueOf"]);
  });

  it("can accuse in Imposter, and be counted", () => {
    let s = IM.init({ players: odd, pool: getCatalog("superheroes"), topic: "Superheroes", rounds: 1, ending: "vote", seed: 7, now: 0 });
    s = giveClues(s);
    expect(s.phase).toBe("vote");
    const target = odd.find((p) => p !== s.imposter)!;
    for (const by of odd) {
      const after = IM.accuse(s, by, by === s.imposter ? target : s.imposter, 2);
      expect(after).not.toBe(s);
      s = after;
    }
    expect(s.caught).toBe(true);
    expect(s.winner).toBe("crew");
  });

  it("drinks get real numbers, whatever the name", () => {
    const d = addCalls(initDrinks(odd), odd.map((p) => ({ to: p, sips: 2, reason: "x" })), odd);
    expect(d.calls.map((c) => c.sips)).toEqual([2, 2, 2, 2]);
    expect(Object.values(d.totals)).toEqual([2, 2, 2, 2]);
  });
});

describe("imposter when someone leaves", () => {
  const voting = () => giveClues(start());

  it("counts the votes once everyone still here has voted", () => {
    let s = voting();
    const [a, b, c, d] = players as [string, string, string, string];
    s = IM.accuse(IM.accuse(IM.accuse(s, a, b, 2), b, a, 2), c, a, 2);
    expect(s.phase).toBe("vote");
    expect(IM.settle(s, [], 3)).toBe(s);
    expect(IM.settle(s, [d], 3).phase).not.toBe("vote");
    const two = IM.accuse(IM.accuse(voting(), a, b, 2), b, a, 2);
    expect(IM.settle(two, [d], 3)).toBe(two);
  });

  it("passes a departed player's clue at once, however many are gone", () => {
    const s = start();
    const [first, second] = s.order as [string, string];
    const moved = IM.settle(s, [first, second], 1);
    expect(moved.clues.map((c) => c.text)).toEqual(["(passed)", "(passed)"]);
    expect(IM.turnPlayer(moved)).toBe(s.order[2]);
    expect(IM.settle(s, [s.order[2]!], 1)).toBe(s);
  });

  it("ends the last guess when the caught imposter has gone", () => {
    let s = voting();
    for (const p of crew(s)) s = IM.accuse(s, p, s.imposter, 2);
    s = IM.accuse(s, s.imposter, crew(s)[0]!, 2);
    expect(s.phase).toBe("guess");
    expect(IM.settle(s, [crew(s)[0]!], 3)).toBe(s);
    const over = IM.settle(s, [s.imposter], 3);
    expect(over.done).toBe(true);
    expect(over.winner).toBe("crew");
  });
});

describe("what an imposter seat is sent", () => {
  it("a viewer with no seat gets neither the secret nor the imposter", () => {
    const v = IM.redactFor(start(), null);
    expect(v.secret).toBe("");
    expect(v.secretId).toBe("");
    expect(v.imposter).toBe("");
  });

  it("the seed is 0 for everyone until the game is done, and then opens", () => {
    let s = start();
    expect(s.seed).not.toBe(0);
    for (const me of [...players, null]) expect(IM.redactFor(s, me).seed).toBe(0);
    s = giveClues(s);
    for (const me of [...players, null]) expect(IM.redactFor(s, me).seed).toBe(0);
    for (const p of players) s = IM.accuse(s, p, players.find((x) => x !== p)!, 2);
    s = s.done ? s : IM.tick(s, s.phaseAt + IM.GUESS_MS + 1);
    expect(s.done).toBe(true);
    expect(IM.redactFor(s, null).seed).toBe(s.seed);
    expect(IM.redactFor(s, null).secret).toBe(s.secret);
    expect(IM.redactFor(s, null).imposter).toBe(s.imposter);
  });

  it("has a public per-game key instead, the same for every seat", () => {
    const s = IM.init({ players, pool: getCatalog("superheroes"), topic: "Superheroes", rounds: 1, ending: "guess", seed: 7, now: 77 });
    expect(s.startedAt).toBe(77);
    for (const me of [...players, null]) expect(IM.redactFor(s, me).startedAt).toBe(77);
  });
});
