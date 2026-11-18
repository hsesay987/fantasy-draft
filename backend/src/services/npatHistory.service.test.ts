import { describe, expect, it } from "vitest";
import { adjustTier } from "../shared/topicDraft/npat/rules";
import { createNpatHistory, type NpatAnswerDb, type NpatAnswerRow } from "./npatHistory.service";

const fakeDb = (rows: NpatAnswerRow[] = []): NpatAnswerDb & { rows: Map<string, number>; fail: boolean } => {
  const m = new Map(rows.map((r) => [`${r.category}|${r.answer}`, r.count]));
  return {
    rows: m,
    fail: false,
    async all() { return [...m.entries()].map(([k, count]) => { const [category, answer] = k.split("|"); return { category: category!, answer: answer!, count }; }); },
    async increment(c, a) { if (this.fail) throw new Error("db down"); m.set(`${c}|${a}`, (m.get(`${c}|${a}`) ?? 0) + 1); },
  };
};

describe("createNpatHistory", () => {
  it("loads counts and sums a category's plays", async () => {
    const h = createNpatHistory(fakeDb([{ category: "animal", answer: "zebra", count: 6 }, { category: "animal", answer: "cat", count: 94 }]));
    await h.load();
    expect(h.lookup("animal", "zebra")).toEqual({ count: 6, plays: 100 });
    expect(h.lookup("animal", "dog")).toBeNull();
  });
  it("counts a player's answer once per day, then again on a new day", async () => {
    const db = fakeDb();
    const h = createNpatHistory(db);
    await h.record("2026-11-18", "p1", [{ category: "animal", answer: "Zebra" }]);
    await h.record("2026-11-18", "p1", [{ category: "animal", answer: "zebra" }]);
    expect(h.lookup("animal", "zebra")?.count).toBe(1);
    await h.record("2026-11-18", "p2", [{ category: "animal", answer: "zebra" }]);
    expect(h.lookup("animal", "zebra")?.count).toBe(2);
    await h.record("2026-11-19", "p1", [{ category: "animal", answer: "zebra" }]);
    expect(h.lookup("animal", "zebra")?.count).toBe(3);
    expect(db.rows.get("animal|zebra")).toBe(3);
  });
  it("normalises the stored answer to match tierOf's key", async () => {
    const db = fakeDb();
    await createNpatHistory(db).record("d", "p", [{ category: "animal", answer: "  The Zebra " }]);
    expect([...db.rows.keys()]).toEqual(["animal|zebra"]);
  });
  it("keeps review rows out of plays and tiers", async () => {
    const db = fakeDb();
    const h = createNpatHistory(db);
    await h.record("d", "p1", [{ category: "animal", answer: "cat" }, { category: "review:animal", answer: "wolpertinger" }]);
    expect(db.rows.get("review:animal|wolpertinger")).toBe(1);
    expect(h.lookup("animal", "cat")).toEqual({ count: 1, plays: 1 });
    for (let i = 0; i < 40; i++) await h.record("d", `q${i}`, [{ category: "review:animal", answer: "wolpertinger" }]);
    expect(h.lookup("animal", "cat")?.plays).toBe(1);
    expect(adjustTier("rare", 1 / (h.lookup("animal", "cat")?.plays ?? 1), h.lookup("animal", "cat")!.plays)).toBe("rare"); // under 30 plays
  });
  it("forgets a play whose write failed so it can be retried", async () => {
    const db = fakeDb();
    const h = createNpatHistory(db);
    db.fail = true;
    await expect(h.record("d", "p", [{ category: "animal", answer: "cat" }])).rejects.toThrow("db down");
    db.fail = false;
    await h.record("d", "p", [{ category: "animal", answer: "cat" }]);
    expect(h.lookup("animal", "cat")?.count).toBe(1);
  });
});
