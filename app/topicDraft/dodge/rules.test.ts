import { describe, expect, it } from "vitest";
import { close, matchKey } from "./rules";
import { DODGE_DECKS, DODGE_DECK_IDS } from "./decks";

describe("matchKey", () => {
  it("folds case, spaces, punctuation and accents", () => {
    expect(matchKey("  Pepperoni ")).toBe(matchKey("pepperoni"));
    expect(matchKey("Coca-Cola")).toBe(matchKey("coca cola"));
    expect(matchKey("Jalapeño")).toBe(matchKey("jalapeno"));
  });
  it("drops the, a and an", () => {
    expect(matchKey("The Lion King")).toBe(matchKey("lion king"));
    expect(matchKey("an apple")).toBe(matchKey("apple"));
    expect(matchKey("a banana")).toBe(matchKey("Banana"));
  });
  it("treats simple plurals as the same word", () => {
    expect(matchKey("Mushrooms")).toBe(matchKey("mushroom"));
    expect(matchKey("cherries")).toBe(matchKey("cherry"));
    expect(matchKey("tomatoes")).toBe(matchKey("tomato"));
    expect(matchKey("glasses")).toBe(matchKey("glass"));
    expect(matchKey("shoes")).toBe(matchKey("shoe"));
    expect(matchKey("boxes")).toBe(matchKey("box"));
  });
  it("keeps different words apart", () => {
    expect(matchKey("ham")).not.toBe(matchKey("jam"));
    expect(matchKey("pineapple")).not.toBe(matchKey("apple"));
  });
  it("is empty for a blank or only filler words", () => {
    expect(matchKey("   ")).toBe("");
    expect(matchKey("the")).toBe("");
    expect(matchKey("!!")).toBe("");
  });
});

describe("close", () => {
  it("is false for exact matches and blanks", () => {
    expect(close("Cheese", "cheese")).toBe(false);
    expect(close("", "cheese")).toBe(false);
  });
  it("catches small typos", () => {
    expect(close("pepperoni", "peperoni")).toBe(true);
    expect(close("brocolli", "broccoli")).toBe(true);
  });
  it("catches one answer inside the other", () => {
    expect(close("pepperoni", "pepperoni pizza")).toBe(true);
    expect(close("Coke", "Diet Coke")).toBe(true);
  });
  it("leaves unrelated answers alone", () => {
    expect(close("ham", "cheese")).toBe(false);
    expect(close("dog", "cat")).toBe(false);
    expect(close("ham", "jam")).toBe(false); // short words need an exact match
  });
});

describe("decks", () => {
  it("has about 200 categories, none repeated", () => {
    const all = DODGE_DECKS.flatMap((d) => d.categories);
    expect(all.length).toBeGreaterThanOrEqual(195);
    expect(new Set(all.map((c) => c.toLowerCase())).size).toBe(all.length);
  });
  it("has unique deck ids, each with enough categories for a lap of 12", () => {
    expect(new Set(DODGE_DECK_IDS).size).toBe(DODGE_DECK_IDS.length);
    for (const d of DODGE_DECKS) expect(d.categories.length).toBeGreaterThanOrEqual(12);
  });
});
