import { describe, expect, it } from "vitest";
import { closestAnswer, distance } from "./spelling";

describe("distance", () => {
  it("counts inserts, deletes, swaps of one letter and adjacent transpositions", () => {
    expect(distance("krillion", "krillin")).toBe(1);
    expect(distance("lino", "lion")).toBe(1);
    expect(distance("cat", "cat")).toBe(0);
    expect(distance("kitten", "sitting")).toBe(3);
  });
});

describe("closestAnswer", () => {
  it("suggests Krillin for krillion", () => {
    expect(closestAnswer("krillion", ["Goku", "Krillin", "Vegeta"])).toBe("Krillin");
  });

  it("allows 1 edit for 4 to 8 letters and 2 for 9 or more", () => {
    expect(closestAnswer("lien", ["Lion"])).toBe("Lion");
    expect(closestAnswer("loen", ["Lion"])).toBeNull(); // 2 edits on a 4-letter answer
    expect(closestAnswer("elefant", ["Elephant"])).toBeNull(); // 2 edits on 8 letters
    expect(closestAnswer("elephnt", ["Elephant"])).toBe("Elephant");
    expect(closestAnswer("pikachoo", ["Pikachu"])).toBeNull();
    expect(closestAnswer("spidermon", ["Spider-Man"])).toBe("Spider-Man"); // 9 letters once folded
    expect(closestAnswer("sprdrman", ["Spider-Man"])).toBe("Spider-Man");
    expect(closestAnswer("sprdrmn", ["Spider-Man"])).toBeNull();
  });

  it("gives nothing for answers under 4 letters", () => {
    expect(closestAnswer("cst", ["Cat"])).toBeNull();
    expect(closestAnswer("ca", ["Cat"])).toBeNull();
  });

  it("folds case, accents, punctuation, spaces and articles", () => {
    expect(closestAnswer("THE POKEMN", ["Pokémon"])).toBe("Pokémon");
    expect(closestAnswer("ice crem", ["Ice-cream"])).toBe("Ice-cream");
  });

  it("picks the nearest, first in the list on a tie, and nothing for blank text", () => {
    expect(closestAnswer("bart", ["Bard", "Barts", "Bart Simpson"])).toBe("Bard");
    expect(closestAnswer("cart", ["Card", "Cars"])).toBe("Card");
    expect(closestAnswer("   ", ["Lion"])).toBeNull();
    expect(closestAnswer("lion", [])).toBeNull();
  });
});
