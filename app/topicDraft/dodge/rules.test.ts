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
  it("never drops the e of a bare singular", () => {
    for (const [x, y] of [["Cape", "Cap"], ["Kite", "Kit"], ["Wine", "Win"], ["Plane", "Plan"], ["Rose", "Ros"]]) expect(matchKey(x!)).not.toBe(matchKey(y!));
    expect(matchKey("roses")).toBe(matchKey("rose"));
    expect(matchKey("cakes")).toBe(matchKey("cake"));
  });
  it("gives -ie and -ies the same stem", () => {
    for (const [x, y] of [["Cookie", "Cookies"], ["Movie", "Movies"], ["Brownie", "Brownies"], ["zombie", "zombies"], ["Smoothie", "smoothies"], ["berry", "berries"]]) expect(matchKey(x!)).toBe(matchKey(y!));
  });
  it("leaves words that only look plural alone", () => {
    expect(matchKey("tennis")).not.toBe(matchKey("tenni"));
    expect(matchKey("octopus")).toBe("octopus");
    expect(matchKey("dishes")).toBe(matchKey("dish"));
    expect(matchKey("kiwis")).toBe(matchKey("kiwi"));
  });
  it("folds spaces and hyphens inside an answer", () => {
    expect(matchKey("Spider-Man")).toBe(matchKey("Spiderman"));
    expect(matchKey("Ice cream")).toBe(matchKey("Icecream"));
    expect(matchKey("Bat man")).toBe(matchKey("Batman"));
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
    expect(all.length).toBeGreaterThanOrEqual(200);
    expect(new Set(all.map((c) => c.toLowerCase())).size).toBe(all.length);
  });
  it("has unique deck ids, each with enough categories for a lap of 12", () => {
    expect(new Set(DODGE_DECK_IDS).size).toBe(DODGE_DECK_IDS.length);
    for (const d of DODGE_DECKS) expect(d.categories.length).toBeGreaterThanOrEqual(12);
  });
  it("speaks US English and asks for things, not phrases or actions", () => {
    const text = DODGE_DECKS.flatMap((d) => [d.title, d.blurb, ...d.categories]).join(" | ");
    for (const uk of [/colour/i, /flavour/i, /on holiday/i, /\bsweets\b/i, /petrol/i, /high street/i, /handbag/i, /\bsofa\b/i, /fizzy/i, /cinema/i, /funfair/i, /football/i, /\bfilms?\b/i, /chocolate bars/i])
      expect(text).not.toMatch(uk);
    for (const c of DODGE_DECKS.flatMap((d) => d.categories))
      expect(c).not.toMatch(/^(Ways to|Excuses|Things you (do|say)|Things that are fast|Things with buttons|Hobbies$|Jobs$|Things that grow)/);
  });
  it("keeps one of each overlapping pair", () => {
    const all = new Set(DODGE_DECKS.flatMap((d) => d.categories));
    for (const pair of [["Things that fly", "Things with wings"], ["Countries", "Countries in Europe"], ["Sports", "Sports with a ball", "Olympic sports"], ["Things on a farm", "Farm animals"], ["Places you go on vacation", "Things you pack in a suitcase"], ["Things in a first aid kit", "Things in a medicine cabinet"]])
      expect(pair.filter((c) => all.has(c)).length).toBeLessThanOrEqual(1);
    for (const gone of ["Famous wizards", "Things in a fairy tale", "Marvel heroes", "Board game pieces"]) expect(all.has(gone)).toBe(false);
  });
});
