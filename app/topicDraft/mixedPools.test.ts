import { describe, expect, it } from "vitest";
import { initGame } from "./core";
import { DEFAULT_OPTS, type GameSetup } from "../play/types";
import { DECKS } from "./party/decks";
import { INSYNC_DECKS } from "./party/insyncDecks";
import { VOWEL_TOPICS, wordsFor } from "./party/vowelWords";
import { getCatalog } from "./catalogs";
import { bundledCategories } from "./trivia";
import type { VoteState } from "./formats/vote";
import type { InSyncState } from "./formats/insync";
import type { ImposterState } from "./formats/imposter";
import type { VPState } from "./formats/vowelplay";
import type { PTState } from "./formats/partytrivia";
import { PECKING_LISTS, PECKING_LIST_IDS } from "./pecking/lists";
import { poolIdsFor } from "./party/pools";
import type { PeckState } from "./formats/pecking";
import { redactFor } from "./formats/vowelplay";
import "./sayless/words";
import { SAY_DECK_IDS } from "./sayless/decks";
import { wordsOf } from "./sayless/source";
import type { SLState } from "./formats/sayless";

const setup = (format: GameSetup["format"], pools: string[], opts: Partial<GameSetup["opts"]> = {}, seed = 3): GameSetup => ({
  id: "t", format, pool: pools[0]!, pools, players: ["A", "B", "C", "D"], aiPlayers: [], mission: { id: "party", title: "t", blurb: "", weights: { fun: 1 } },
  mystery: false, loadout: null, roles: [], opts: { ...DEFAULT_OPTS, ...opts }, seed,
});

describe("vote and in-sync mix decks", () => {
  const decks = [DECKS[0]!, DECKS[1]!];
  const ids = (d: { cards: { id: string }[] }[]) => new Set(d.flatMap((x) => x.cards.map((c) => c.id)));
  it("vote deals only cards of the picked decks, and both appear across seeds", () => {
    const all = ids(decks), from = new Set<number>();
    for (let seed = 1; seed < 30; seed++) {
      const s = initGame(setup("vote", decks.map((d) => d.id), { teamSize: 15 }, seed), 0) as VoteState;
      for (const c of s.cards) {
        expect(all.has(c.id)).toBe(true);
        from.add(decks.findIndex((d) => d.cards.some((x) => x.id === c.id)));
      }
    }
    expect(from.size).toBe(2);
  });
  it("vote keeps unseen-first over the union", () => {
    const seen = decks[0]!.cards.map((c) => c.id);
    const s = initGame(setup("vote", decks.map((d) => d.id), { teamSize: 10, avoid: seen }), 0) as VoteState;
    expect(s.cards.every((c) => !seen.includes(c.id))).toBe(true);
  });
  it("in-sync draws pairs from the union, unseen first", () => {
    const [a, b] = [INSYNC_DECKS[0]!, INSYNC_DECKS[1]!];
    const all = new Set([...a.pairs, ...b.pairs].map((p) => p.id));
    const seen = a.pairs.map((p) => p.id);
    const s = initGame(setup("insync", [a.id, b.id], { avoid: seen }), 0) as InSyncState;
    expect(s.pairs.length).toBeGreaterThan(0);
    expect(s.pairs.every((p) => all.has(p.id) && !seen.includes(p.id))).toBe(true);
    const got = new Set<number>();
    for (let seed = 1; seed < 30; seed++) for (const p of (initGame(setup("insync", [a.id, b.id], {}, seed), 0) as InSyncState).pairs) got.add(a.pairs.some((x) => x.id === p.id) ? 0 : 1);
    expect(got.size).toBe(2);
  });
});

describe("imposter mixes topics by round", () => {
  it("secret and every option come from the round's single topic", () => {
    const topics = ["superheroes", "villains"];
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const s = initGame(setup("imposter", topics, {}, seed), 0) as ImposterState;
      expect(topics).toContain(s.topicId);
      seen.add(s.topicId!);
      const names = new Set(getCatalog(s.topicId!).map((i) => i.name));
      expect(names.has(s.secret)).toBe(true);
      expect(s.options.every((n) => names.has(n))).toBe(true);
    }
    expect(seen.size).toBe(2);
  });
  it("one topic plays exactly as before", () => {
    const s = initGame(setup("imposter", ["superheroes"]), 0) as ImposterState;
    expect(s.topicId).toBeUndefined();
  });
});

describe("vowel play mixes topics", () => {
  const topics = ["food", "films"];
  it("each word carries its topic, its name is in that topic, no repeats", () => {
    const s = initGame(setup("vowelplay", topics, { teamSize: 20 }), 0) as VPState;
    expect(new Set(s.words.map((w) => w.name)).size).toBe(s.words.length);
    for (const w of s.words) {
      expect(topics).toContain(w.topic);
      expect(wordsFor(w.topic!)).toContain(w.name);
    }
    expect(new Set(s.words.map((w) => w.topic)).size).toBe(2);
  });
  it("one topic marks every word with it", () => {
    const s = initGame(setup("vowelplay", ["food"]), 0) as VPState;
    expect(s.words.every((w) => w.topic === "food")).toBe(true);
  });
  it("redaction shows the topic but not the name before the reveal", () => {
    const s = initGame(setup("vowelparty", topics), 0) as VPState;
    for (const me of ["A", "Z", null]) {
      const w = redactFor(s, me).words[0]!;
      expect(w.name).toBe("");
      expect(w.also).toEqual([]);
      expect(topics).toContain(w.topic);
    }
  });
  it("knows every topic it can mix", () => {
    expect(VOWEL_TOPICS.length).toBeGreaterThan(1);
  });
});

describe("party trivia fallback", () => {
  it("mixes the bundled boards of every picked topic", () => {
    const s = initGame(setup("partytrivia", ["superheroes", "villains"], { teamSize: 20 }), 0) as PTState;
    const bundled = new Set(["superheroes", "villains"].flatMap((p) => bundledCategories(p).flatMap((c) => c.clues.map((x) => x.q))));
    expect(s.questions.length).toBeGreaterThan(0);
    expect(s.questions.every((q) => bundled.has(q.q))).toBe(true);
  });
});

describe("pecking pools", () => {
  it("poolIdsFor lists every ranked list", () => {
    expect(poolIdsFor("pecking")).toEqual(PECKING_LIST_IDS);
  });
  it("a mixed setup draws questions from every chosen list", () => {
    const ids = PECKING_LISTS.slice(0, 2).map((l) => l.id);
    const seen = new Set<string>();
    for (let seed = 1; seed < 20; seed++) {
      const s = initGame(setup("pecking", ids, { teamSize: 6, peckMode: "rank" }, seed), 0) as PeckState;
      expect(s.questions.length).toBe(6);
      for (const q of s.questions) {
        expect(ids).toContain(q.list);
        seen.add(q.list);
      }
    }
    expect(seen.size).toBe(2);
  });
  it("drops unknown list ids", () => {
    const s = initGame(setup("pecking", [PECKING_LIST_IDS[0]!, "nope"], { teamSize: 3 }), 0) as PeckState;
    expect(s.questions.every((q) => q.list === PECKING_LIST_IDS[0])).toBe(true);
  });
});

describe("sayless pools", () => {
  it("poolIdsFor lists every deck", () => {
    expect(poolIdsFor("sayless")).toEqual(SAY_DECK_IDS);
  });
  it("a mixed setup deals words from every chosen deck", () => {
    const ids = ["easy", "hard"];
    const names = (d: string) => new Set(wordsOf(d).map((w) => w.name));
    const from = new Set<string>();
    for (let seed = 1; seed < 20; seed++) {
      const s = initGame(setup("sayless", ids, { saylessRounds: 3, saylessWords: 5 }, seed), 0) as SLState;
      for (const w of s.deal.flat()) {
        const hit = ids.filter((d) => names(d).has(w.name));
        expect(hit.length).toBeGreaterThan(0);
        hit.forEach((d) => from.add(d));
      }
    }
    expect([...from].sort()).toEqual(["easy", "hard"]);
  });
  it("applies the setup options", () => {
    const s = initGame(setup("sayless", ["easy"], { saylessRounds: 1, saylessWords: 4, saylessGuard: true, answer: "buzz" }), 0) as SLState;
    expect(s.wordsPerTurn).toBe(4);
    expect(s.guard).toBe(true);
    expect(s.answerMode).toBe("buzz");
    expect(s.turns.length).toBe(4);
    const d = initGame(setup("sayless", ["easy"]), 0) as SLState;
    expect([d.wordsPerTurn, d.guard, d.answerMode, d.turns.length]).toEqual([3, false, "type", 8]);
  });
});
