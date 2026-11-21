import { describe, expect, it } from "vitest";
import { DECKS, cardLabels, deckOf, deckOfCard, namesPlayers } from "./decks";
import { init, namePlayers } from "../formats/vote";

describe("deckOfCard", () => {
  it("resolves a card from each deck to its own deck", () => {
    for (const id of ["wrong", "icks", "ultimatum", "happen"]) {
      const card = deckOf(id)!.cards[0]!;
      expect(deckOfCard(card.id)?.id).toBe(id);
    }
  });
  it("resolves every card id to the deck that holds it", () => {
    for (const d of DECKS) for (const c of d.cards) expect(deckOfCard(c.id)).toBe(d);
  });
  it("is undefined for an unknown id", () => {
    expect(deckOfCard("nope-999")).toBeUndefined();
  });
  it("only the decks that ask a question of their own carry ask and tag", () => {
    for (const d of DECKS) {
      const hit = deckOfCard(d.cards[0]!.id)!;
      if (["wrong", "whowins", "whowins-room"].includes(d.id)) expect(hit.ask && hit.tag).toBeTruthy();
      else { expect(hit.ask).toBeUndefined(); expect(hit.tag).toBeUndefined(); }
    }
  });
});

describe("cardLabels", () => {
  it("labels a mixed game's icks card as Icks, not Who's Wrong", () => {
    const card = deckOf("icks")!.cards[0]!;
    const l = cardLabels(card, "wrong");
    expect(l.title).toBe(deckOf("icks")!.title);
    expect(l.title).not.toBe("Who's Wrong?");
    expect(l.ask).toBeUndefined();
    expect(l.tag).toBeUndefined();
  });
  it("gives a wrong card its ask and tag", () => {
    const l = cardLabels(deckOf("wrong")!.cards[0]!, "icks");
    expect(l).toMatchObject({ title: "Who's Wrong?", ask: "Who's in the wrong?", tag: "In the wrong" });
  });
  it("falls back to the stored deck for an unknown card", () => {
    expect(cardLabels({ id: "x" }, "ultimatum").title).toBe(deckOf("ultimatum")!.title);
  });
});

describe("new decks", () => {
  it("has Who Would Win, The Room and Princess Treatment, each with enough unique cards", () => {
    for (const id of ["whowins", "whowins-room", "princess"]) {
      const d = deckOf(id)!;
      expect(d.cards.length, id).toBeGreaterThanOrEqual(15);
      expect(new Set(d.cards.map((c) => `${c.prompt}|${c.a}|${c.b}`)).size, id).toBe(d.cards.length);
    }
    expect(new Set(DECKS.flatMap((d) => d.cards.map((c) => c.id))).size).toBe(DECKS.reduce((n, d) => n + d.cards.length, 0));
  });

  it("Who Would Win covers fictional, historical, mythological and animal matchups", () => {
    const kinds = new Set(deckOf("whowins")!.cards.map((c) => c.prompt.split(" · ")[0]));
    for (const k of ["Fictional characters", "Historical figures", "Mythological figures", "Animals"]) expect(kinds.has(k), k).toBe(true);
  });

  it("every Room card names someone at the table", () => {
    expect(deckOf("whowins-room")!.cards.every(namesPlayers)).toBe(true);
    expect(DECKS.filter((d) => d.id !== "whowins-room").flatMap((d) => d.cards).some(namesPlayers)).toBe(false);
  });
});

describe("naming players on Room cards", () => {
  const room = deckOf("whowins-room")!.cards;
  const players = ["Ana", "Ben", "Cal", "Dee"];

  it("fills both slots with two different players and leaves no slot behind", () => {
    for (const c of namePlayers(room, players, 9)) {
      const text = `${c.prompt} ${c.a} ${c.b}`;
      expect(text).not.toMatch(/\{p[12]\}/);
      if (players.includes(c.a) && players.includes(c.b)) expect(c.a).not.toBe(c.b);
      expect(players.includes(c.a)).toBe(true);
    }
  });

  it("names everyone before naming anyone twice", () => {
    const first = namePlayers(room.slice(0, 4), players, 3).map((c) => c.a);
    expect(new Set(first).size).toBe(4);
  });

  it("leaves other cards alone, and a game fills names when it starts", () => {
    const plain = deckOf("princess")!.cards;
    expect(namePlayers(plain, players, 1)).toEqual(plain);
    const s = init({ players, deck: "whowins-room", cards: room, rounds: 6, seed: 4, now: 0 });
    expect(s.cards).toHaveLength(6);
    expect(s.cards.every((c) => players.includes(c.a))).toBe(true);
  });

  it("drops Room cards when there is nobody else to pit", () => {
    const s = init({ players: ["Solo"], deck: "whowins-room", cards: [...room, ...deckOf("princess")!.cards], rounds: 6, seed: 4, now: 0 });
    expect(s.cards.some((c) => c.id.startsWith("whowinsroom"))).toBe(false);
  });
});
