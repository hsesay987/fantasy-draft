import { describe, expect, it } from "vitest";
import * as IM from "./imposter";
import * as V from "./vote";
import { DECKS } from "../party/decks";
import { getCatalog } from "../catalogs";

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
