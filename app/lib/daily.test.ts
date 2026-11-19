import { beforeEach, describe, expect, it } from "vitest";
import { bandOf, DAILY_POINTS, isDailyGame, myStats, npatSquare, remember, shareText, untilNext, type Played } from "./daily";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
});
const p = (day: string, score: number): Played => ({ day, number: 1, score, history: [], grid: "🟩", checkpoint: "Eagle Rock" });

describe("daily history", () => {
  it("counts the current streak through today or yesterday, and the best streak", () => {
    for (const d of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"]) remember("summit", p(d, 0.5));
    expect(myStats("summit", "2026-11-06")).toMatchObject({ played: 5, streak: 2, bestStreak: 3 });
    expect(myStats("summit", "2026-11-07").streak).toBe(2); // not played yet today: yesterday still counts
    expect(myStats("summit", "2026-11-08").streak).toBe(0);
  });
  it("keeps games apart and averages scores", () => {
    remember("hotair", p("2026-11-01", 0.2));
    remember("hotair", p("2026-11-02", 0.6));
    expect(myStats("hotair", "2026-11-02")).toMatchObject({ played: 2, best: 0.6, average: 0.4 });
    expect(myStats("summit", "2026-11-02").played).toBe(0);
  });
  it("counts down to midnight UTC", () => {
    expect(untilNext(Date.parse("2026-11-01T23:59:30Z"))).toBe("0:00:30");
    expect(untilNext(Date.parse("2026-11-01T12:00:00Z"))).toBe("12:00:00");
  });
  it("shares the game, number, checkpoint, score and grid", () => {
    expect(shareText("summit", { ...p("2026-11-02", 0.62), number: 2 })).toBe("TopPic Summit #2\nEagle Rock · 62%\n🟩\ntoppicgames.com/trivia");
  });
  it("shares Pecking Order as points out of 500, as its stats show", () => {
    expect(shareText("pecking", { ...p("2026-11-02", 0.84), checkpoint: "Top perch" })).toBe("TopPic Pecking Order #1\nTop perch · 420/500\n🟩\ntoppicgames.com/trivia");
  });
  it("shares NPAT as points out of 500, with one square per category", () => {
    expect(shareText("npat", { ...p("2026-11-18", 0.5), number: 19, grid: "🟩🟨🟥🟥🟥", checkpoint: "Sharp pencil" })).toBe("TopPic Name Place Animal Thing #19\nSharp pencil · 250/500\n🟩🟨🟥🟥🟥\ntoppicgames.com/trivia");
  });
});

describe("NPAT daily", () => {
  it("is a daily, out of 500 points", () => {
    expect(isDailyGame("npat")).toBe(true);
    expect(DAILY_POINTS.npat).toBe(500);
  });
  it("squares: green from 60 points, yellow from 30, red below", () => {
    expect([100, 60, 59, 30, 29, 10, 0].map(npatSquare).join("")).toBe("🟩🟩🟨🟨🟥🟥🟥");
  });
  it("names a result by its band, and Pecking Order's bands are unchanged", () => {
    expect(bandOf("npat", 0)).toBe("Blank page");
    expect(bandOf("npat", 1)).toBe("Full marks");
    expect(bandOf("pecking", 0.84)).toBe("Top of the pecking order");
  });
});
