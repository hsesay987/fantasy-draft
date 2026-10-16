// "Golden pairs": relative orderings that must always hold, so stat edits can't silently break balance.
// Add a pair whenever someone disputes a rating; the test then guards it forever.
import { describe, it, expect } from "vitest";
import { getCatalog } from "./index";

type Pair = [pool: string, bigger: string, smaller: string, stat: string];

const PAIRS: Pair[] = [
  // Superheroes / villains
  ["superheroes", "Hulk", "Batman", "power"],
  ["superheroes", "Thor", "Spider-Man (Peter Parker)", "durability"],
  ["superheroes", "Superman", "Batman", "speed"],
  ["superheroes", "Superman", "Batman", "power"],
  ["superheroes", "Batman", "Hulk", "intellect"],
  ["superheroes", "Batman", "Superman", "combat"],
  ["superheroes", "Captain America", "Hulk", "combat"],
  ["superheroes", "Iron Man", "Black Widow", "power"],
  ["superheroes", "Mr. Fantastic", "Hawkeye", "intellect"],
  ["superheroes", "Doctor Strange", "Hulk", "intellect"],
  ["superheroes", "The Flash", "Captain America", "speed"],
  ["superheroes", "Wolverine", "Black Widow", "durability"],
  ["superheroes", "Wonder Woman", "Green Arrow", "power"],
  ["superheroes", "Professor X", "Captain America", "intellect"],
  ["superheroes", "Captain America", "Hawkeye", "teamwork"],
  ["superheroes", "Hulk", "Black Widow", "durability"],
  ["villains", "Thanos", "Joker", "power"],
  ["villains", "Lex Luthor", "Bane", "intellect"],
  ["villains", "Bane", "Lex Luthor", "combat"],
  ["villains", "Darth Vader", "Hannibal Lecter", "power"],
  ["villains", "Hannibal Lecter", "Jason Voorhees", "intellect"],
  ["villains", "Jason Voorhees", "Hannibal Lecter", "durability"],
  ["villains", "Frieza", "Joker", "speed"],
  ["villains", "Joker", "Jason Voorhees", "intellect"],
  ["villains", "Sephiroth", "Gaston", "combat"],
  ["villains", "Mr. Burns", "Bowser", "intellect"],
  ["villains", "Bowser", "Mr. Burns", "power"],
  // Pokémon (official base stats)
  ["pokemon", "Mewtwo", "Pikachu", "power"],
  ["pokemon", "Snorlax", "Pikachu", "durability"],
  ["pokemon", "Pikachu", "Snorlax", "speed"],
  ["pokemon", "Garchomp", "Eevee", "power"],
  ["pokemon", "Rayquaza", "Jigglypuff", "power"],
  // Anime
  ["anime", "Saitama", "Naruto Uzumaki", "power"],
  ["anime", "Gojo Satoru", "Ichigo Kurosaki", "power"],
  ["anime", "L Lawliet", "Goku", "intellect"],
  ["anime", "Goku", "L Lawliet", "combat"],
  // History
  ["history", "Napoleon Bonaparte", "Albert Einstein", "strategy"],
  ["history", "Albert Einstein", "Napoleon Bonaparte", "intellect"],
  ["history", "Joan of Arc", "Isaac Newton", "courage"],
  ["history", "Sun Tzu", "Mozart", "strategy"],
  // Movies / games
  ["movies", "Godzilla", "John Wick", "power"],
  ["movies", "John Wick", "Forrest Gump", "combat"],
  ["videogames", "Kratos", "Pac-Man", "power"],
  ["videogames", "Sonic", "Mario", "speed"],
  ["disney", "Hercules", "Olaf", "power"],
  ["disney", "Maleficent", "Mickey Mouse", "power"],
];

describe("golden stat pairs", () => {
  it.each(PAIRS)("%s: %s > %s on %s", (pool, bigger, smaller, stat) => {
    const items = getCatalog(pool);
    const a = items.find((i) => i.name === bigger);
    const b = items.find((i) => i.name === smaller);
    expect(a, `${bigger} missing from ${pool}`).toBeDefined();
    expect(b, `${smaller} missing from ${pool}`).toBeDefined();
    expect(a!.stats[stat], `${bigger}.${stat}=${a!.stats[stat]} vs ${smaller}.${stat}=${b!.stats[stat]}`).toBeGreaterThan(b!.stats[stat]!);
  });
});

describe("rating distributions", () => {
  it("every pool uses the full range sensibly (no pool is uniformly inflated)", () => {
    for (const pool of ["superheroes", "villains", "pokemon", "anime", "disney", "movies", "videogames", "history"]) {
      const items = getCatalog(pool);
      for (const k of Object.keys(items[0]!.stats)) {
        const vals = items.map((i) => i.stats[k]!);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        expect(mean, `${pool}.${k} mean ${mean.toFixed(0)}`).toBeGreaterThan(15);
        expect(mean, `${pool}.${k} mean ${mean.toFixed(0)}`).toBeLessThan(88);
        expect(Math.max(...vals) - Math.min(...vals), `${pool}.${k} spread`).toBeGreaterThan(30);
      }
    }
  });
});
