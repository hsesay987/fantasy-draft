import { describe, expect, it } from "vitest";
import { aggregate, kindOf, type PriceRow } from "./aggregate";

const row = (over: Partial<PriceRow> & { code?: string; store?: string } = {}): PriceRow => ({
  price: 2.5, currency: "GBP", price_per: "UNIT", date: "2026-10-01",
  product: { code: over.code ?? "111", product_name: "Baked beans", brands: "Heinz, Other", quantity: "415 g", image_url: "https://x/y.jpg", categories_tags: ["en:canned-foods", "en:beans"] },
  location: { osm_brand: over.store ?? "Tesco", osm_address_country_code: "gb", osm_address_country: "United Kingdom" },
  ...over,
});

describe("aggregate", () => {
  it("takes the median price per product and store", () => {
    const [r] = aggregate([row({ price: 2 }), row({ price: 2.4 }), row({ price: 2.2 })]);
    expect(r).toMatchObject({ price: 2.2, samples: 3, country: "GB", store: "Tesco", brand: "Heinz", kind: "can", currency: "GBP" });
  });
  it("keeps stores and currencies apart", () => {
    expect(aggregate([row(), row({ store: "Aldi" })])).toHaveLength(2);
  });
  it("drops per-kilo prices, discounts, unknown currencies and absurd values", () => {
    expect(aggregate([row({ price_per: "KILOGRAM" }), row({ price_is_discounted: true }), row({ currency: "XXX" }), row({ price: 900 }), row({ price: 0.01 })])).toEqual([]);
  });
  it("drops products whose prices disagree by more than double", () => {
    expect(aggregate([row({ price: 1 }), row({ price: 2.5 })])).toEqual([]);
  });
  it("needs a name, a store and a country", () => {
    expect(aggregate([row({ product: { code: "1", product_name: null } }), row({ location: { osm_address_country_code: "GB" } })])).toEqual([]);
  });
  it("guesses a pixel icon from the categories", () => {
    expect(kindOf(["en:beverages"])).toBe("drink");
    expect(kindOf(["en:chocolates"])).toBe("snack");
    expect(kindOf(["en:pasta"])).toBe("box");
  });
});
