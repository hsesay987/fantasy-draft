import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assemble, orderClues, pickWrong, usable, type RawCategory } from "../../scripts/commonThreadRules";
import { PINPOINT_TOPICS } from "../pinpoint/topics";
import type { ThreadTopic } from "./types";

/** A category of `n` members named `${label}-m0..`, fame rising with the index. */
const cat = (label: string, n: number, kind = "k", prefix = label): RawCategory => ({
  label,
  kind,
  members: Array.from({ length: n }, (_, i) => ({ name: `${prefix}-m${i}`, fame: 10 + i * 3 })),
});

describe("Common Thread rules", () => {
  it("rejects small and catch-all categories", () => {
    expect(usable(cat("x", 5), 200)).toBe(false);
    expect(usable(cat("x", 60), 200)).toBe(false);
    expect(usable(cat("x", 10), 200)).toBe(true);
    expect(usable(cat("x", 6), 200)).toBe(true);
    expect(usable(cat("x", 50), 200)).toBe(true);
  });

  it("orders clues from least to most famous, ending on the most famous", () => {
    const c = cat("x", 30);
    const shuffled = { ...c, members: [...c.members].reverse() };
    const clues = orderClues(shuffled);
    expect(clues).toHaveLength(6);
    expect(clues[5]!.name).toBe("x-m29");
    const fame = (n: string) => c.members.find((m) => m.name === n)!.fame;
    const f = clues.map((x) => fame(x.name));
    expect(f).toEqual([...f].sort((a, b) => a - b));
    expect(fame(clues[0]!.name)).toBeLessThan(fame(clues[5]!.name));
    expect(new Set(clues.map((x) => x.name)).size).toBe(6);
    // spread, not just the top six
    expect(fame(clues[0]!.name)).toBeLessThan(fame("x-m10"));
  });

  it("keeps the image lookup on a clue", () => {
    const c = cat("x", 8);
    c.members[7]!.q = "Some Page";
    expect(orderClues(c)[5]).toEqual({ name: "x-m7", q: "Some Page" });
    expect(orderClues(c)[4]).toEqual({ name: "x-m6" });
  });

  it("picks 7 wrong labels, none containing a clue, across more than one kind", () => {
    const target = cat("target", 12, "director");
    const clueNames = new Set(orderClues(target).map((c) => c.name));
    const others: RawCategory[] = [
      ...Array.from({ length: 6 }, (_, i) => cat(`dir${i}`, 8, "director")),
      ...Array.from({ length: 6 }, (_, i) => cat(`gen${i}`, 8, "genre")),
      ...Array.from({ length: 4 }, (_, i) => cat(`dec${i}`, 8, "decade")),
    ];
    // two decoys that DO hold a clue
    const bad1 = { ...cat("bad1", 8, "genre"), members: [{ name: [...clueNames][2]!, fame: 1 }, ...cat("bad1", 7).members] };
    const bad2 = { ...cat("bad2", 8, "decade"), members: [{ name: [...clueNames][5]!, fame: 1 }, ...cat("bad2", 7).members] };
    const wrong = pickWrong(target, [...others, bad1, bad2], 7);
    expect(wrong).toHaveLength(7);
    expect(new Set(wrong).size).toBe(7);
    expect(wrong).not.toContain("bad1");
    expect(wrong).not.toContain("bad2");
    expect(wrong).not.toContain("target");
    const kinds = new Set([...others, bad1, bad2].filter((o) => wrong.includes(o.label)).map((o) => o.kind));
    expect(kinds.size).toBeGreaterThan(1);
    for (const w of wrong) {
      const o = others.find((x) => x.label === w)!;
      for (const m of o.members) expect(clueNames.has(m.name)).toBe(false);
    }
  });

  it("is repeatable for a seed and varies across seeds", () => {
    const target = cat("target", 12, "a");
    const others = Array.from({ length: 30 }, (_, i) => cat(`o${i}`, 8, `k${i % 3}`));
    expect(pickWrong(target, others, 5)).toEqual(pickWrong(target, others, 5));
    expect(pickWrong(target, others, 5)).not.toEqual(pickWrong(target, others, 6));
  });

  it("returns fewer than 7 when the topic cannot supply them", () => {
    const target = cat("target", 12, "a");
    expect(pickWrong(target, [cat("o1", 8, "b"), cat("o2", 8, "c")], 1)).toHaveLength(2);
  });

  it("keeps daily and practice separate, and a label never appears in both", () => {
    const cats: RawCategory[] = [];
    // distinct members per category so that no clue fits another category
    for (let i = 0; i < 120; i++) cats.push(cat(`Cat ${i}`, 8, `kind${i % 4}`, `c${i}`));
    const t = assemble("films", cats, 3);
    expect(t.pool).toBe("films");
    expect(t.daily.length).toBeGreaterThan(40);
    expect(t.practice.length).toBeGreaterThan(10);
    const d = new Set(t.daily.map((c) => c.label));
    for (const c of t.practice) expect(d.has(c.label)).toBe(false);
    expect(new Set([...t.daily, ...t.practice].map((c) => c.label)).size).toBe(t.daily.length + t.practice.length);
    for (const c of [...t.daily, ...t.practice]) {
      expect(c.clues).toHaveLength(6);
      expect(c.wrong).toHaveLength(7);
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("drops unusable categories and categories with too few wrong options", () => {
    const cats = [cat("Big", 400, "a"), cat("Tiny", 3, "a"), cat("Lonely", 8, "a")];
    const t = assemble("films", cats, 1);
    expect([...t.daily, ...t.practice]).toHaveLength(0);
  });

  it("is deterministic for a seed", () => {
    const cats: RawCategory[] = [];
    for (let i = 0; i < 100; i++) cats.push(cat(`Cat ${i}`, 8, `kind${i % 5}`, `c${i}`));
    expect(assemble("films", cats, 9)).toEqual(assemble("films", cats, 9));
  });
});

const dir = path.resolve(__dirname, "data");
const load = (pool: string): ThreadTopic => JSON.parse(fs.readFileSync(path.join(dir, `${pool}.json`), "utf8"));

describe("Common Thread data", () => {
  it.each(PINPOINT_TOPICS.map((t) => t.id))("%s has enough good categories", (pool) => {
    const t = load(pool);
    expect(t.pool).toBe(pool);
    expect(t.daily.length).toBeGreaterThanOrEqual(50);
    expect(t.practice.length).toBeGreaterThanOrEqual(15);
    const all = [...t.daily, ...t.practice];
    expect(new Set(all.map((c) => c.label)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.clues).toHaveLength(6);
      expect(new Set(c.clues.map((x) => x.name)).size).toBe(6);
      for (const clue of c.clues) expect(c.members).toContain(clue.name);
      expect(c.wrong).toHaveLength(7);
      expect(new Set(c.wrong).size).toBe(7);
      expect(c.wrong).not.toContain(c.label);
      for (const w of c.wrong) {
        const other = all.find((x) => x.label === w)!;
        expect(other).toBeTruthy();
        for (const clue of c.clues) expect(other.members).not.toContain(clue.name);
      }
    }
    const dl = new Set(t.daily.map((c) => c.label));
    for (const c of t.practice) expect(dl.has(c.label)).toBe(false);
  });

  it("has a file for every topic and nothing extra", () => {
    const ids = PINPOINT_TOPICS.map((t) => t.id).sort();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(files).toEqual(ids);
  });
});
