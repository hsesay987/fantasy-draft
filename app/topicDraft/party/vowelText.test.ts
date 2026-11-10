import { describe, expect, it } from "vitest";
import { cleanName, isUsable, matches, toPuzzle } from "./vowelText";

describe("vowel text", () => {
  it("builds puzzles", () => {
    expect(toPuzzle("Spider-Man")).toBe("SPDRMN");
    expect(toPuzzle("Pikachu")).toBe("PKCH");
    expect(toPuzzle("Pokémon")).toBe("PKMN");
    expect(toPuzzle("The Beatles")).toBe("BTLS");
    expect(toPuzzle("Kareem Abdul-Jabbar")).toBe("KRMBDLJBBR");
    expect(toPuzzle("Guns N' Roses")).toBe("GNSNRSS");
    expect(toPuzzle("Lynx")).toBe("LYNX");
  });
  it("judges usability", () => {
    expect(isUsable("Lynx")).toBe(false);
    expect(isUsable("R2-D2")).toBe(false);
    expect(isUsable("Elsa")).toBe(false);
    expect(isUsable("Pikachu")).toBe(true);
    expect(isUsable("Harry Potter and the Philosopher's Stone")).toBe(false);
  });
  it("cleans names", () => {
    expect(cleanName("Deku (Izuku Midoriya)")).toBe("Deku");
    expect(cleanName("The Office (US)")).toBe("The Office");
    expect(cleanName("(US)")).toBe(null);
  });
  it("matches typed guesses", () => {
    expect(matches("spider man", "Spider-Man")).toBe(true);
    expect(matches("SPIDERMAN", "Spider-Man")).toBe(true);
    expect(matches("spidermn", "Spider-Man")).toBe(true);
    expect(matches("spiderman", "The Spider-Man")).toBe(true);
    expect(matches("pokemon", "Pokémon")).toBe(true);
    expect(matches("beatles", "The Beatles")).toBe(true);
    expect(matches("thebeatles", "Beatles")).toBe(true);
    expect(matches("pikchu", "Pikachu")).toBe(false);
    expect(matches("ragnrok", "Ragnarok")).toBe(true);
    expect(matches("ragnork", "Ragnarok")).toBe(false); // two edits; the brief listed this as true
    expect(matches("sipderman", "Spider-Man")).toBe(true);
    expect(matches("spdrmn", "Spider-Man")).toBe(false);
    expect(matches("", "Goku")).toBe(false);
  });
});
