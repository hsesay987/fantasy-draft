import { describe, it, expect } from "vitest";
import { init, open, placeBid, settle, validateBid, maxBid, aiBid, currentItem, slotsLeft } from "./auction";

const ids = Array.from({ length: 30 }, (_, i) => `i${i}`);
const mk = () => init({ players: ["A", "B"], budget: 20, teamSize: 3, poolIds: ids, seed: 7 });

describe("auction", () => {
  it("queue is a random subset and a lot opens with a deadline", () => {
    const s = open(mk(), 1000);
    expect(s.queue.length).toBeLessThanOrEqual(30);
    expect(currentItem(s)).toBeTruthy();
    expect(s.deadline).toBe(1000 + s.baseMs);
  });

  it("bids must beat the high bid and the reserve keeps $1 per empty slot", () => {
    let s = open(mk(), 0);
    expect(maxBid(s, "A")).toBe(18);
    expect(validateBid(s, "A", 19).ok).toBe(false);
    s = placeBid(s, "A", 5, 100);
    expect(s.bid).toEqual({ amount: 5, by: "A" });
    expect(validateBid(s, "B", 5).ok).toBe(false);
    expect(validateBid(s, "A", 6).ok).toBe(false); // already high bidder
    expect(validateBid(s, "B", 6).ok).toBe(true);
  });

  it("a bid resets the clock to at least bumpMs", () => {
    let s = open(mk(), 0);
    s = placeBid(s, "A", 1, s.baseMs - 1000);
    expect(s.deadline).toBe(s.baseMs - 1000 + s.bumpMs);
  });

  it("settles to the high bidder and charges them; unsold lots are skipped", () => {
    let s = open(mk(), 0);
    const first = currentItem(s)!;
    s = placeBid(s, "B", 4, 10);
    s = settle(s, s.deadline! + 1);
    expect(s.rosters.B![0]).toEqual({ itemId: first, price: 4 });
    expect(s.budgets.B).toBe(16);
    expect(s.bid.by).toBeNull();
    const second = currentItem(s)!;
    s = settle(s, s.deadline! + 1); // nobody bid
    expect(s.rosters.A!.length + s.rosters.B!.length).toBe(1);
    expect(currentItem(s)).not.toBe(second);
  });

  it("does not settle before the deadline", () => {
    const s = open(mk(), 0);
    expect(settle(s, 1)).toBe(s);
  });

  it("always ends with full rosters, even if nobody bids", () => {
    let s = open(mk(), 0);
    let guard = 0;
    while (!s.done && guard++ < 200) s = settle(s, (s.deadline ?? 0) + 1);
    expect(s.done).toBe(true);
    for (const p of ["A", "B"]) expect(slotsLeft(s, p)).toBe(0);
    const all = [...s.rosters.A!, ...s.rosters.B!].map((r) => r.itemId);
    expect(new Set(all).size).toBe(all.length);
  });

  it("AI never bids above its value or its max, and passes when outbid cap reached", () => {
    let s = open(mk(), 0);
    expect(aiBid(s, "B", 0)).toBeNull();
    const b = aiBid(s, "B", 6)!;
    expect(b.amount).toBeGreaterThanOrEqual(1);
    expect(b.amount).toBeLessThanOrEqual(6);
    s = placeBid(s, "A", 6, 0);
    expect(aiBid(s, "B", 6)).toBeNull();
  });

  it("spending never exceeds budget over a full random-bid game", () => {
    let s = open(mk(), 0);
    let t = 0;
    let guard = 0;
    while (!s.done && guard++ < 500) {
      for (const p of s.players) {
        const b = aiBid(s, p, 6);
        if (b) s = placeBid(s, p, b.amount, t);
      }
      t = (s.deadline ?? t) + 1;
      s = settle(s, t);
    }
    for (const p of s.players) {
      expect(s.budgets[p]!).toBeGreaterThanOrEqual(0);
      expect(slotsLeft(s, p)).toBe(0);
    }
  });
});
