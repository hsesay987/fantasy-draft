import { describe, expect, it } from "vitest";
import { DECKS, cardLabels, deckOf, deckOfCard } from "./decks";

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
  it("only the wrong deck carries ask and tag", () => {
    for (const d of DECKS) {
      const hit = deckOfCard(d.cards[0]!.id)!;
      if (d.id === "wrong") expect(hit.ask && hit.tag).toBeTruthy();
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
