import { describe, expect, it } from "vitest";
import { pickProducts, type CostRow, type CostStore } from "./costimation.service";

const row = (i: number, uses = 0): CostRow => ({ id: `p${i}`, name: `P${i}`, country: "US", countryName: "United States", store: "Walmart", currency: "USD", price: 3, kind: "box", uses });
const fake = (rows: CostRow[]): CostStore & { touched: string[] } => ({
  touched: [],
  async find(where, take) { return rows.filter((r) => (!where.country || r.country === where.country) && (!where.store || r.store === where.store)).slice(0, take); },
  async touch(ids) { this.touched.push(...ids); },
});

describe("pickProducts", () => {
  it("prefers products that were played least", async () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => row(i, 9)), ...Array.from({ length: 5 }, (_, i) => row(100 + i, 0))];
    const got = await pickProducts(fake(rows), { n: 5 });
    expect(got.map((p) => p.id).sort()).toEqual(["p100", "p101", "p102", "p103", "p104"]);
  });
  it("counts the products it hands out as played and hides the counter", async () => {
    const s = fake([row(1), row(2)]);
    const got = await pickProducts(s, { n: 10 });
    expect(s.touched.sort()).toEqual(["p1", "p2"]);
    expect(got[0]).not.toHaveProperty("uses");
  });
  it("caps the size of one request", async () => {
    const rows = Array.from({ length: 700 }, (_, i) => row(i));
    expect((await pickProducts(fake(rows), { n: 9999 })).length).toBe(600);
  });
});
