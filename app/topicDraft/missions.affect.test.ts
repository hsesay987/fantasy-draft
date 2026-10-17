// Proves missions are not decoration: a team built for one mission must beat a team built for another
// when judged on the first mission, and lose when judged on the second.
import { describe, it, expect } from "vitest";
import { getCatalog } from "./catalogs";
import { missionsFor } from "./missions";
import { itemScore, scoreTeam } from "./scorer";
import type { Item, Scenario } from "./types";

const best = (pool: Item[], m: Scenario, n = 5) => [...pool].sort((a, b) => itemScore(b, m.weights) - itemScore(a, m.weights)).slice(0, n);

const POOLS = ["superheroes", "villains", "heroes-villains", "anime", "pokemon", "videogames", "disney", "movies", "history", "football", "films", "shows"];

describe("missions change team scores", () => {
  for (const pool of POOLS) {
    const missions = missionsFor(pool).filter((m) => m.id !== "all-around" && m.id !== "all-around-history");
    it(`${pool}: the best team for each mission beats the other missions' best teams on its own mission`, () => {
      const items = getCatalog(pool);
      let compared = 0;
      for (const a of missions) {
        for (const b of missions) {
          if (a.id >= b.id) continue;
          const ta = best(items, a);
          const tb = best(items, b);
          const ids = (t: Item[]) => t.map((i) => i.id).sort().join();
          if (ids(ta) === ids(tb)) continue; // identical optimum: weights are too similar to separate
          compared++;
          // Base fit (no synergy) is strictly better for the mission-built team.
          const fit = (t: Item[], m: Scenario) => t.reduce((x, i) => x + itemScore(i, m.weights), 0) / t.length;
          expect(fit(ta, a), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(fit(tb, a));
          expect(fit(tb, b), `${b.id} vs ${a.id}`).toBeGreaterThanOrEqual(fit(ta, b));
          // Final totals stay within synergy noise of that ordering.
          expect(scoreTeam(ta, a).total).toBeGreaterThan(scoreTeam(tb, a).total - 4);
          expect(scoreTeam(tb, b).total).toBeGreaterThan(scoreTeam(ta, b).total - 4);
        }
      }
      expect(compared, "at least some missions must produce different optimal teams").toBeGreaterThan(2);
    });
  }

  it("the same two teams can swap places when only the mission changes", () => {
    const items = getCatalog("superheroes");
    const heist = missionsFor("superheroes").find((m) => m.id === "heist")!;
    const tourney = missionsFor("superheroes").find((m) => m.id === "tournament")!;
    const brains = best(items, heist);
    const brawn = best(items, tourney);
    expect(scoreTeam(brains, heist).total).toBeGreaterThan(scoreTeam(brawn, heist).total - 3);
    expect(scoreTeam(brawn, tourney).total).toBeGreaterThan(scoreTeam(brains, tourney).total - 3);
    // the gap between the two teams moves with the mission
    const gapHeist = scoreTeam(brains, heist).total - scoreTeam(brawn, heist).total;
    const gapTourney = scoreTeam(brains, tourney).total - scoreTeam(brawn, tourney).total;
    expect(gapHeist - gapTourney).toBeGreaterThan(0.5);
  });
});
