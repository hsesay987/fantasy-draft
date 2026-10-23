import { describe, it, expect } from "vitest";
import { init, open, placeBid, settle, pass, validateBid, maxBid, aiAct, currentItem, slotsLeft, opener, nominate, nominator, aiNominate } from "./auction";

const ids = Array.from({ length: 30 }, (_, i) => `i${i}`);
const mk = (players = ["A", "B"]) => init({ players, budget: 20, teamSize: 3, poolIds: ids, seed: 7 });

describe("auction", () => {
  it("queue is a random subset and a lot opens with an opening-turn deadline", () => {
    const s = open(mk(), 1000);
    expect(currentItem(s)).toBeTruthy();
    expect(s.deadline).toBe(1000 + s.openMs);
  });

  it("only the opener may place the first bid, and the opener rotates each lot", () => {
    let s = open(mk(), 0);
    expect(opener(s)).toBe("A");
    expect(validateBid(s, "B", 1).ok).toBe(false);
    s = placeBid(s, "A", 2, 10);
    expect(s.bid).toEqual({ amount: 2, by: "A" });
    expect(s.deadline).toBe(10 + s.baseMs);
    s = pass(s, "B", 20); // B concedes -> A wins immediately
    expect(s.rosters.A!.length).toBe(1);
    expect(opener(s)).toBe("B"); // next lot opens with B
  });

  it("passing the opening turn hands it to the next player; all passing leaves the lot unsold", () => {
    let s = open(mk(["A", "B", "C"]), 0);
    s = pass(s, "A", 5);
    expect(opener(s)).toBe("B");
    expect(s.deadline).toBe(5 + s.openMs);
    s = pass(s, "B", 6);
    expect(opener(s)).toBe("C");
    const first = currentItem(s);
    s = pass(s, "C", 7);
    expect(currentItem(s)).not.toBe(first);
    expect(s.lastSold).toMatchObject({ by: null });
    expect(s.openTurn).toBe(0);
  });

  it("a timed-out opening turn counts as a pass", () => {
    let s = open(mk(), 0);
    s = settle(s, s.deadline! + 1);
    expect(opener(s)).toBe("B");
  });

  it("raising is open to everyone after the first bid; passing is final for that lot", () => {
    let s = open(mk(["A", "B", "C"]), 0);
    s = placeBid(s, "A", 1, 1);
    s = placeBid(s, "B", 2, 2);
    s = pass(s, "C", 3);
    expect(validateBid(s, "C", 5).ok).toBe(false);
    expect(s.rosters.A!.length + s.rosters.B!.length).toBe(0); // A hasn't passed yet
    s = pass(s, "A", 4); // everyone else is out -> B wins at $2
    expect(s.rosters.B![0]!.price).toBe(2);
    expect(s.budgets.B).toBe(18);
  });

  it("the high bidder cannot pass, and bids need to beat the current amount", () => {
    let s = open(mk(), 0);
    s = placeBid(s, "A", 5, 1);
    expect(pass(s, "A", 2)).toBe(s);
    expect(validateBid(s, "B", 5).ok).toBe(false);
    expect(validateBid(s, "B", 6).ok).toBe(true);
  });

  it("the budget reserve keeps $1 per empty slot", () => {
    const s = open(mk(), 0);
    expect(maxBid(s, "A")).toBe(18);
    expect(validateBid(s, "A", 19).ok).toBe(false);
  });

  it("a late raise resets the clock to bumpMs", () => {
    let s = open(mk(), 0);
    s = placeBid(s, "A", 1, 1000);
    const near = s.deadline! - 1000; // 1s left
    s = placeBid(s, "B", 2, near);
    expect(s.deadline).toBe(near + s.bumpMs);
  });

  it("does not settle before the deadline", () => {
    const s = open(mk(), 0);
    expect(settle(s, 1)).toBe(s);
  });

  it("always ends with full, unique rosters even if everyone passes", () => {
    let s = open(mk(), 0);
    let guard = 0;
    while (!s.done && guard++ < 300) s = settle(s, (s.deadline ?? 0) + 1);
    expect(s.done).toBe(true);
    for (const p of ["A", "B"]) expect(slotsLeft(s, p)).toBe(0);
    const all = [...s.rosters.A!, ...s.rosters.B!].map((r) => r.itemId);
    expect(new Set(all).size).toBe(all.length);
  });

  it("AI opens only on its turn, passes when it values the lot at nothing, and never overbids", () => {
    let s = open(mk(), 0);
    expect(aiAct(s, "B", 8)).toBeNull(); // not B's opening turn
    expect(aiAct(s, "A", 0)).toEqual({ type: "pass" });
    const o = aiAct(s, "A", 8)!;
    expect(o.type).toBe("bid");
    if (o.type === "bid") {
      expect(o.amount).toBeGreaterThanOrEqual(1);
      expect(o.amount).toBeLessThanOrEqual(8);
      s = placeBid(s, "A", o.amount, 1);
    }
    expect(aiAct(s, "A", 8)).toBeNull(); // high bidder waits
    expect(aiAct(s, "B", 0)).toEqual({ type: "pass" });
  });

  it("full random game with bots ends within budget and full rosters", () => {
    let s = open(mk(["A", "B", "C"]), 0);
    let t = 0;
    let guard = 0;
    while (!s.done && guard++ < 2000) {
      t += 300;
      for (const p of s.players) {
        const m = aiAct(s, p, 6);
        if (!m) continue;
        s = m.type === "bid" ? placeBid({ ...s, seed: m.seed }, p, m.amount, t) : pass(s, p, t);
      }
      s = settle(s, t);
    }
    expect(s.done).toBe(true);
    for (const p of s.players) {
      expect(s.budgets[p]!).toBeGreaterThanOrEqual(0);
      expect(slotsLeft(s, p)).toBe(0);
    }
  });

  describe("nominate (random roll) mode", () => {
    const mkN = (players = ["A", "B"]) => open(init({ players, budget: 20, teamSize: 3, poolIds: ids, seed: 7, nominate: { n: 3 } }), 0);

    it("rolls N lots for the nominator; nothing is biddable until one is chosen", () => {
      const s = mkN();
      expect(s.nominate!.offer!.length).toBe(3);
      expect(currentItem(s)).toBeNull();
      expect(nominator(s)).toBe("A");
      expect(validateBid(s, "A", 1)).toMatchObject({ ok: false });
      expect(pass(s, "A", 5)).toBe(s);
    });

    it("only the nominator can choose, and only from the roll; the choice goes up for bid", () => {
      let s = mkN();
      const [a, b] = s.nominate!.offer!;
      expect(nominate(s, "B", a!, 1)).toBe(s);
      expect(nominate(s, "A", "i-not-offered", 1)).toBe(s);
      s = nominate(s, "A", b!, 1);
      expect(currentItem(s)).toBe(b);
      expect(s.nominate!.offer).toBeNull();
      expect(s.deadline).toBe(1 + s.openMs);
      expect(new Set(s.queue).size).toBe(s.queue.length); // swap, never duplicate
      s = placeBid(s, "A", 2, 2);
      expect(s.bid.by).toBe("A");
    });

    it("an idle nominator is auto-nominated on timeout; the next lot rolls a fresh offer for the next player", () => {
      let s = mkN();
      const first = s.nominate!.offer![0]!;
      s = settle(s, s.deadline! + 1);
      expect(currentItem(s)).toBe(first);
      s = placeBid(s, "A", 1, s.deadline! - 100);
      s = pass(s, "B", s.deadline! - 50); // sold to A
      expect(s.nominate!.offer!.length).toBe(3);
      expect(nominator(s)).toBe("B");
      const pick = aiNominate(s, "B", (id) => (id === s.nominate!.offer![2] ? 9 : 1));
      expect(pick).toBe(s.nominate!.offer![2]);
      expect(aiNominate(s, "A", () => 1)).toBeNull();
    });

    it("full game with bots in nominate mode ends with full rosters", () => {
      let s = mkN(["A", "B", "C"]);
      let t = 0;
      let guard = 0;
      while (!s.done && guard++ < 3000) {
        t += 300;
        const nom = nominator(s);
        if (nom) s = nominate(s, nom, aiNominate(s, nom, () => 1)!, t);
        for (const p of s.players) {
          const m = aiAct(s, p, 6);
          if (!m) continue;
          s = m.type === "bid" ? placeBid({ ...s, seed: m.seed }, p, m.amount, t) : pass(s, p, t);
        }
        s = settle(s, t);
      }
      expect(s.done).toBe(true);
      for (const p of s.players) expect(slotsLeft(s, p)).toBe(0);
    });
  });
});
