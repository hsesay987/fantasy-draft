import { describe, expect, it } from "vitest";
import { ANY, BOTS, botGuess, BULLSEYE, closeness, currencyFor, digitsHint, filterProducts, money, priceIn, rangeHint, roundGain, segmentAt, spinTarget, wheelFor, type Product } from "./game";

const p = (id: string, over: Partial<Product> = {}): Product => ({ id, name: id, country: "US", countryName: "United States", store: "Walmart", currency: "USD", price: 10, ...over });

describe("closeness and progress", () => {
  it("is 1 when exact and falls to 0 when off by the whole price", () => {
    expect(closeness(10, 10)).toBe(1);
    expect(closeness(15, 10)).toBeCloseTo(0.5);
    expect(closeness(0, 10)).toBe(0);
    expect(closeness(25, 10)).toBe(0);
  });
  it("treats bad input as no progress", () => {
    expect(closeness(NaN, 10)).toBe(0);
    expect(closeness(5, 0)).toBe(0);
  });
  it("closer guesses always drive further, and hints cost progress", () => {
    expect(roundGain(0.9, 0, 5)).toBeGreaterThan(roundGain(0.6, 0, 5));
    expect(roundGain(0.9, 2, 5)).toBeLessThan(roundGain(0.9, 0, 5));
    expect(roundGain(1, 0, 5)).toBeCloseTo(0.2);
    expect(roundGain(1, 9, 5)).toBeGreaterThan(0); // the penalty is capped
  });
  it("a bullseye is within five percent", () => {
    expect(closeness(10.4, 10)).toBeGreaterThan(BULLSEYE);
    expect(closeness(11, 10)).toBeLessThan(BULLSEYE);
  });
});

describe("currency", () => {
  const eu = p("a", { currency: "EUR", price: 2.5, country: "FR" });
  it("keeps the shelf price in its own currency and converts through dollars otherwise", () => {
    expect(priceIn(eu, "EUR")).toBe(2.5);
    expect(priceIn(eu, "USD")).toBeCloseTo(2.5 / 0.92);
    expect(priceIn(eu, "JPY")).toBeCloseTo((2.5 / 0.92) * 150);
  });
  it("picks local, a fixed currency or a random one", () => {
    expect(currencyFor("local", eu)).toBe("EUR");
    expect(currencyFor("GBP", eu)).toBe("GBP");
    expect(currencyFor("nonsense", eu)).toBe("EUR");
    expect(currencyFor("random", eu, () => 0)).toBe("USD");
  });
  it("formats without decimals for yen and big numbers", () => {
    expect(money(1234.5, "USD")).toBe("$1,235");
    expect(money(3.5, "USD")).toBe("$3.50");
    expect(money(450, "JPY")).toContain("450");
  });
});

describe("hints and bots", () => {
  it("range hint contains the price", () => {
    for (let i = 0; i < 50; i++) { const [lo, hi] = rangeHint(4.99, Math.random); expect(lo).toBeLessThan(4.99); expect(hi).toBeGreaterThan(4.99); }
  });
  it("digit hint counts whole digits", () => {
    expect(digitsHint(4.99)).toBe(1);
    expect(digitsHint(129)).toBe(3);
  });
  it("bots miss by at most their skill", () => {
    for (const b of BOTS) for (const r of [0, 0.5, 0.999]) expect(Math.abs(botGuess(10, b.skill, () => r) - 10)).toBeLessThanOrEqual(10 * b.skill * 2);
  });
});

describe("filters and wheel", () => {
  const all = [p("1"), p("2", { country: "GB", store: "Tesco" }), p("3", { store: "Target" })];
  it("filters by country and store", () => {
    expect(filterProducts(all, { country: ANY, store: ANY })).toHaveLength(3);
    expect(filterProducts(all, { country: "US", store: ANY })).toHaveLength(2);
    expect(filterProducts(all, { country: "US", store: "Target" }).map((x) => x.id)).toEqual(["3"]);
  });
  it("wheel never repeats a played product while fresh ones remain", () => {
    const pool = Array.from({ length: 12 }, (_, i) => p(String(i)));
    const w = wheelFor(pool, new Set(["0", "1", "2", "3"]), 8);
    expect(w).toHaveLength(8);
    expect(w.some((x) => ["0", "1", "2", "3"].includes(x.id))).toBe(false);
    expect(wheelFor(pool.slice(0, 3), new Set(["0", "1", "2"]), 8)).toHaveLength(3);
  });
  it("a spin lands the chosen segment under the pointer", () => {
    for (const n of [3, 5, 8]) for (let i = 0; i < n; i++) for (const from of [0, 77, 400]) {
      const to = spinTarget(from, i, n, 6, 0);
      expect(to).toBeGreaterThan(from + 360 * 5);
      expect(segmentAt(to, n)).toBe(i);
    }
  });
});
