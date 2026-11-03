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

  it("opinion cards score the majority and reveal once everyone voted", () => {
    let s = V.init({ players, deck: "icks", cards: deck.cards, rounds: 5, seed: 1, now: 0 });
    s = V.vote(s, "Ana", "a", 1);
    s = V.vote(s, "Ben", "a", 1);
    s = V.vote(s, "Cy", "b", 1);
    expect(s.phase).toBe("vote");
    expect(V.redactFor(s, "Ana").votes.Ben).toBe("?");
    s = V.vote(s, "Di", "a", 1);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ Ana: 1, Ben: 1, Cy: 0, Di: 1 });
    s = V.nextCard(s, 2);
    expect(s.round).toBe(1);
  });

  it("a tie scores nobody; fact cards score the right answer", () => {
    expect(V.scoringSide(deck.cards[0]!, { Ana: "a", Ben: "b" })).toBeNull();
    const real = happen.cards.find((c) => c.answer === "a")!;
    expect(V.scoringSide(real, { Ana: "b", Ben: "b" })).toBe("a");
  });

  it("clocks reveal a slow vote and move on after the reveal", () => {
    let s = V.init({ players, deck: "icks", cards: deck.cards, rounds: 3, seed: 1, now: 0 });
    s = V.tick(s, V.VOTE_MS + 1);
    expect(s.phase).toBe("reveal");
    s = V.tick(s, V.VOTE_MS + V.REVEAL_MS + 2);
    expect(s.round).toBe(1);
  });
});
