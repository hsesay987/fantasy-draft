import { describe, expect, it } from "vitest";
import sourced from "./sourced.json";
import { bundledCategories, questionsFor, surveysFor } from "./index";
import type { Survey, TriviaCategory } from "./types";

const S = sourced as Record<string, { source: string; categories: TriviaCategory[]; surveys: Survey[] }>;

describe("trivia built from public data", () => {
  it("is shaped like a board: four clues with four distinct options each", () => {
    for (const [pool, set] of Object.entries(S)) {
      expect(["wikidata", "pokeapi"], pool).toContain(set.source);
      for (const c of set.categories) {
        expect(c.clues, `${pool} ${c.name}`).toHaveLength(4);
        for (const k of c.clues) expect(new Set([k.right, ...k.wrong]).size, k.q).toBe(4);
      }
      for (const sv of set.surveys) expect(sv.answers.length, sv.q).toBe(5);
    }
  });

  it("joins each topic's own questions, and its boards come out in the same order", () => {
    const music = S.music!;
    expect(surveysFor("music").length).toBeGreaterThanOrEqual(music.surveys.length + 1);
    const board = bundledCategories("music").find((c) => c.name === music.categories[0]!.name)!;
    expect(board.clues.map((k) => k.q)).toEqual(music.categories[0]!.clues.map((k) => k.q));
    expect(questionsFor("music").filter((q) => q.cat === music.categories[0]!.name).map((q) => q.level)).toEqual([2, 3, 4, 4]);
  });

  it("feeds a combined pool from its members", () => {
    expect(surveysFor("heroes-villains").length).toBeGreaterThanOrEqual(S.superheroes!.surveys.length);
  });

  it("never repeats a board name within a topic", () => {
    for (const [pool, set] of Object.entries(S)) expect(new Set(set.categories.map((c) => c.name)).size, pool).toBe(set.categories.length);
  });
});
