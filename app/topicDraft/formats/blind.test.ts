import { describe, it, expect } from "vitest";
import { init, place, turnPlayer, currentItemId, revealIndex, trueOrder, accuracy, aiPlace, freeRanks } from "./blind";
import { getCatalog } from "../catalogs";

const pool = getCatalog("superheroes");
const weights = { power: 1 };
const byId = (id: string) => pool.find((i) => i.id === id)!;
const mk = (players = ["A", "B"]) => init({ players, poolIds: pool.map((i) => i.id), size: 5, weights, seed: 9 });

describe("blind rank", () => {
  it("both players rank the same reveal in turn, then it moves on", () => {
    let s = mk();
    const first = currentItemId(s)!;
    expect(turnPlayer(s)).toBe("A");
    s = place(s, 0);
    expect(turnPlayer(s)).toBe("B");
    expect(currentItemId(s)).toBe(first);
    s = place(s, 4);
    expect(revealIndex(s)).toBe(1);
    expect(currentItemId(s)).not.toBe(first);
  });

  it("occupied or out-of-range ranks are rejected and placement is permanent", () => {
    let s = mk(["A"]);
    s = place(s, 2);
    const t = place(s, 2);
    expect(t.ranks.A![2]).not.toBeNull();
    expect(place(s, 9)).toBe(s);
    expect(place(s, -1)).toBe(s);
  });

  it("ends after players*size placements with every rank filled", () => {
    let s = mk();
    while (!s.done) s = place(s, freeRanks(s, turnPlayer(s))[0]!);
    for (const p of ["A", "B"]) expect(s.ranks[p]!.every((x) => x != null)).toBe(true);
  });

  it("perfect order scores 100 and reversed order scores low", () => {
    const s = mk(["A"]);
    const truth = trueOrder(s.queue.map(byId), weights);
    expect(accuracy(truth, truth)).toBe(100);
    expect(accuracy([...truth].reverse(), truth)).toBeLessThan(25);
    expect(accuracy(Array(5).fill(null), truth)).toBe(0);
  });

  it("the AI usually beats random placement", () => {
    let aiTotal = 0;
    let randTotal = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let ai = init({ players: ["AI"], poolIds: pool.map((i) => i.id), size: 8, weights, seed });
      const truth = trueOrder(ai.queue.map(byId), weights);
      while (!ai.done) {
        const { rank, seed: ns } = aiPlace(ai, byId(currentItemId(ai)!));
        ai = { ...place(ai, rank), seed: ns };
      }
      aiTotal += accuracy(ai.ranks.AI!, truth);
      randTotal += accuracy([...truth].sort((a, b) => ((a.charCodeAt(0) * seed) % 7) - ((b.charCodeAt(0) * seed) % 7)), truth);
    }
    expect(aiTotal).toBeGreaterThan(randTotal);
  });
});
