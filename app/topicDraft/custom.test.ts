import { describe, it, expect } from "vitest";
import { applyAction, buildTeams, currentTurn, initGame, isDone, type GameState } from "./core";
import { checkCustom, customItems, customMissions, customSetup, customStatName, customSummary, customText, CUSTOM_KINDS, type CustomDraft, type CustomGameData } from "./custom";
import * as B from "./formats/blind";
import * as A from "./formats/auction";
import * as J from "./formats/jeopardy";
import * as F from "./formats/feud";
import type { FormatId, GameSetup } from "../play/types";

const draft = (over: Partial<CustomDraft> = {}) => ({
  kind: "draft", title: "Pizza toppings", description: "Settle it.",
  content: {
    noun: "Toppings", stats: ["Flavour", "Crunch", "Mess"],
    items: Array.from({ length: 12 }, (_, i) => ({ name: `Topping ${i + 1}`, group: i % 2 ? "Veg" : "Meat", values: [10 + i * 7, 95 - i * 6, (i * 37) % 100] })),
    lenses: [{ title: "Date night", blurb: "Tidy and tasty.", weights: [3, 1, 0] }, { title: "Game night", weights: [1, 3, 2] }],
    ...over,
  },
});
const summit = () => ({
  kind: "summit", title: "Our office", description: "",
  content: { categories: Array.from({ length: 4 }, (_, c) => ({ name: `Category ${c + 1}`, clues: Array.from({ length: 4 }, (_, q) => ({ q: `Question ${c}-${q}?`, right: `Right ${c}-${q}`, wrong: ["Wrong A", "Wrong B", "Wrong C"] })) })) },
});
const hotair = () => ({
  kind: "hotair", title: "Family answers", description: "",
  content: { surveys: Array.from({ length: 5 }, (_, s) => ({ q: `Name something ${s}`, answers: ["Alpha", "Bravo", "Charlie", "Delta"] })) },
});
const ok = (input: unknown): CustomGameData => { const r = checkCustom(input); if (!r.ok) throw new Error(r.errors.join(" | ")); return r.data; };

describe("checking a custom game", () => {
  it("accepts a well-formed game of every kind", () => {
    for (const g of [draft(), summit(), hotair()]) expect(checkCustom(g).ok).toBe(true);
    expect(CUSTOM_KINDS.map((k) => k.kind)).toEqual(["draft", "summit", "hotair"]);
  });

  it("says what is wrong in the author's terms", () => {
    const errs = (g: unknown) => { const r = checkCustom(g); return r.ok ? [] : r.errors; };
    expect(errs({ kind: "nope" })[0]).toMatch(/kind/);
    expect(errs({ ...draft(), title: "a" }).join()).toMatch(/title/);
    expect(errs(draft({ items: [{ name: "Only one", values: [1, 2, 3] }] })).join()).toMatch(/between 8 and 120/);
    expect(errs(draft({ stats: ["Flavour", "flavour "] })).join()).toMatch(/share a name/);
    expect(errs(draft({ lenses: [{ title: "Nothing", weights: [0, 0, 0] }] })).join()).toMatch(/does not weigh/);
    const same = draft(); same.content.items.forEach((i) => (i.values[1] = 50));
    expect(errs(same).join()).toMatch(/same Crunch/);
    const twice = draft(); twice.content.items[1]!.name = "topping 1";
    expect(errs(twice).join()).toMatch(/listed twice/);
    const s = summit(); s.content.categories[0]!.clues[2]!.wrong = ["Right 0-2", "x", "y"];
    expect(errs(s).join()).toMatch(/wrong answers that all differ/);
    const h = hotair(); h.content.surveys[0]!.answers = ["One"];
    expect(errs(h).join()).toMatch(/at least 3 answers/);
  });

  it("cleans what it keeps: trims, clamps and drops control characters", () => {
    const g = draft(); g.title = "  Pizza\u0007  toppings  "; g.content.items[0]!.values = [999, -5, Number.NaN];
    const d = ok(g);
    expect(d.title).toBe("Pizza toppings");
    expect((d.content as CustomDraft).items[0]!.values).toEqual([100, 0, 0]);
  });

  it("never throws on junk", () => {
    for (const junk of [null, undefined, 5, "x", [], { kind: "draft", content: { items: "no", stats: 7, lenses: null } }, { kind: "summit", content: { categories: [{ name: "a", clues: [null, 3] }] } }]) expect(checkCustom(junk).ok).toBe(false);
  });

  it("lists every written word for moderation, and summarises the size", () => {
    const d = ok(draft());
    expect(customText(d)).toEqual(expect.arrayContaining(["Pizza toppings", "Flavour", "Topping 3", "Date night", "Tidy and tasty."]));
    expect(customText(ok(summit()))).toContain("Wrong B");
    expect(customSummary(d)).toBe("12 picks · 3 stats · 2 lenses");
    expect(customSummary(ok(summit()))).toBe("4 categories · 16 clues");
    expect(customSummary(ok(hotair()))).toBe("5 questions");
  });
});

/** Play a whole game with simple bots, only ever using public actions. */
function play(setup: GameSetup): GameState {
  let s = initGame(setup, 0), now = 0, guard = 0;
  while (!isDone(setup, s) && guard++ < 800) {
    now += 400;
    const who = currentTurn(setup, s);
    if (setup.format === "blind") s = applyAction(setup, s, { type: "place", by: who!, rank: B.freeRanks(s as B.BlindState, who!)[0]! }, now);
    else if (setup.format === "auction") {
      const a = s as A.AuctionState, o = A.opener(a)!;
      s = applyAction(setup, s, guard % 2 ? { type: "bid", by: o, amount: 1 } : { type: "pass", by: o }, now);
      s = applyAction(setup, s, { type: "tick" }, a.deadline ?? now + 99999);
    } else if (setup.format === "keep") s = applyAction(setup, s, { type: "answer", by: who!, choice: guard % 3 ? "keep" : "delete" }, now);
    else s = applyAction(setup, s, { type: "auto", by: who! }, now);
  }
  return s;
}

describe("playing a custom game", () => {
  const d = ok(draft());
  const content = d.content as CustomDraft;

  it("turns the author's stats and lenses into items and missions the engine scores", () => {
    const items = customItems(content), missions = customMissions(content);
    expect(items).toHaveLength(12);
    expect(new Set(items.map((i) => i.id)).size).toBe(12);
    expect(Object.keys(items[0]!.stats)).toEqual(["c0-flavour", "c1-crunch", "c2-mess"]);
    expect(missions[0]!.weights).toEqual({ "c0-flavour": 3, "c1-crunch": 1 });
    expect(customStatName(content, "c1-crunch")).toBe("Crunch");
  });

  it.each(["spin", "snake", "auction", "blind", "keep"] as FormatId[])("a custom pool plays %s to the end and scores every team", (format) => {
    const setup = customSetup(d, "abc123", { format, players: ["Ann", "Bob"], aiPlayers: [], lens: 1, seed: 7, id: "t" });
    expect(setup.pool).toBe("custom:abc123");
    expect(setup.mission.title).toBe("Game night");
    const s = play(setup);
    expect(isDone(setup, s)).toBe(true);
    const { teams } = buildTeams(setup, s);
    expect(teams.map((t) => t.player)).toEqual(["Ann", "Bob"]);
    for (const t of teams) {
      expect(t.items.length).toBeGreaterThan(0);
      expect(t.items.every((i) => i.custom)).toBe(true);
      expect(t.baseline).toBeGreaterThan(0);
      expect(t.baseline).toBeLessThanOrEqual(100);
    }
  });

  it("a format the kind does not support falls back to its first one", () => {
    expect(customSetup(d, "x", { format: "mafia", players: ["A"], aiPlayers: [], seed: 1, id: "t" }).format).toBe("spin");
    expect(customSetup(ok(summit()), "x", { format: "spin", players: ["A"], aiPlayers: [], seed: 1, id: "t" }).format).toBe("jeopardy");
  });

  it("a custom Summit board uses exactly the author's categories and clues", () => {
    const setup = customSetup(ok(summit()), "s1", { format: "jeopardy", players: ["Ann", "Bob"], aiPlayers: [], seed: 3, id: "t" });
    const s = initGame(setup, 0) as J.JeopardyState;
    expect([...s.cats].sort()).toEqual(["Category 1", "Category 2", "Category 3", "Category 4"]);
    expect(s.cells.map((c) => c.q)).toContain("Question 2-3?");
    expect(isDone(setup, s)).toBe(false);
  });

  it("custom Hot Air surveys play with the author's answers on the board", () => {
    const setup = customSetup(ok(hotair()), "h1", { format: "feud", players: ["Ann", "Bob"], aiPlayers: [], seed: 3, id: "t" });
    let s = initGame(setup, 0) as F.FeudState;
    expect(s.rounds).toHaveLength(5);
    expect(s.rounds[0]!.board).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    s = applyAction(setup, s, { type: "answer", by: F.turnPlayer(s)!, choice: "alpha" }, 1) as F.FeudState;
    expect(Object.values(s.points).some((p) => p === 50)).toBe(true);
  });
});
