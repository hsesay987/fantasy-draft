// Turns raw Open Prices rows (https://prices.openfoodfacts.org, crowd-sourced shelf prices, ODbL) into one clean record
// per product and store. Pure: no network, so the cleaning rules are testable.

export type PriceRow = {
  price: number;
  currency: string;
  price_per?: string | null;
  price_is_discounted?: boolean;
  date?: string;
  product?: { code?: string; product_name?: string | null; brands?: string | null; quantity?: string | null; image_url?: string | null; categories_tags?: string[] } | null;
  location?: { osm_name?: string | null; osm_brand?: string | null; osm_address_country_code?: string | null; osm_address_country?: string | null } | null;
};

export type CostRecord = {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  category: string | null;
  imageUrl: string | null;
  kind: "drink" | "snack" | "can" | "box";
  country: string;
  countryName: string;
  store: string;
  currency: string;
  price: number;
  samples: number;
  priceDate: Date | null;
};

/** Rough dollar value of one unit of each currency, only to throw away absurd prices. */
const USD_PER: Record<string, number> = { USD: 1, EUR: 1.09, GBP: 1.27, JPY: 0.0067, CAD: 0.74, AUD: 0.66, INR: 0.012, MXN: 0.059, BRL: 0.2, CHF: 1.14 };
export const SUPPORTED = Object.keys(USD_PER);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function kindOf(tags: string[] = []): CostRecord["kind"] {
  const t = tags.join(" ");
  if (/beverage|drink|water|juice|soda|milk|wine|beer/.test(t)) return "drink";
  if (/canned|can-|tins?\b|conserve/.test(t)) return "can";
  if (/snack|chocolate|biscuit|candy|sweet|chips|bread|cereal-bar|dessert/.test(t)) return "snack";
  return "box";
}

const pretty = (tag: string) => tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Median shelf price per (product, store, currency). Drops discounts, per-kilo prices, absurd values and thin evidence. */
export function aggregate(rows: PriceRow[], minSamples = 1): CostRecord[] {
  const groups = new Map<string, PriceRow[]>();
  for (const r of rows) {
    const code = r.product?.code, name = r.product?.product_name, loc = r.location;
    const store = clean(loc?.osm_brand || loc?.osm_name || ""), country = (loc?.osm_address_country_code || "").toUpperCase();
    if (!code || !name || !store || country.length !== 2 || !(r.currency in USD_PER)) continue;
    if (r.price_per && r.price_per !== "UNIT") continue;
    if (r.price_is_discounted) continue;
    const usd = r.price * USD_PER[r.currency]!;
    if (!(r.price > 0) || usd < 0.25 || usd > 60) continue;
    const key = `${code}|${store}|${r.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: CostRecord[] = [];
  for (const g of groups.values()) {
    if (g.length < minSamples) continue;
    const prices = g.map((r) => r.price);
    // Prices for the same product at the same store that disagree by more than 2x are mistakes or different pack sizes.
    if (Math.max(...prices) / Math.min(...prices) > 2) continue;
    const first = g[0]!, p = first.product!, loc = first.location!;
    const name = clean(p.product_name!);
    if (name.length < 3 || name.length > 70) continue;
    const dates = g.map((r) => r.date).filter(Boolean).sort();
    const cats = (p.categories_tags ?? []).map(pretty).filter((c) => c.length > 2);
    const cat = cats[cats.length - 1];
    out.push({
      code: p.code!, name, brand: p.brands ? clean(p.brands.split(",")[0]!) : null, quantity: p.quantity && clean(p.quantity).replace(/[?()]/g, "").length > 1 ? clean(p.quantity) : null,
      category: cat ?? null, imageUrl: p.image_url ?? null, kind: kindOf(p.categories_tags),
      country: loc.osm_address_country_code!.toUpperCase(), countryName: loc.osm_address_country || loc.osm_address_country_code!.toUpperCase(),
      store: clean(loc.osm_brand || loc.osm_name!), currency: first.currency, price: Math.round(median(prices) * 100) / 100, samples: g.length,
      priceDate: dates.length ? new Date(dates[dates.length - 1]!) : null,
    });
  }
  return out;
}
