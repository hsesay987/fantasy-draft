// Fill the Costimation product bank from Open Prices (https://prices.openfoodfacts.org, crowd-sourced shelf prices, ODbL).
//   npm run prices:ingest -- --dry              fetch and clean, print a sample, write nothing
//   npm run prices:ingest                       store every country below
//   npm run prices:ingest -- GB FR --pages 20   only these countries, more pages
// Rows are cleaned by costimation/aggregate.ts (median per product and store, no discounts or per-kilo prices).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { aggregate, type CostRecord, type PriceRow } from "../costimation/aggregate";
import { getJson } from "../costimation/http";

/** Country code and the currency its shelf prices are in. */
const COUNTRIES: [string, string][] = [["US", "USD"], ["GB", "GBP"], ["FR", "EUR"], ["DE", "EUR"], ["ES", "EUR"], ["IT", "EUR"], ["BE", "EUR"], ["NL", "EUR"], ["CA", "CAD"], ["AU", "AUD"], ["CH", "CHF"], ["MX", "MXN"], ["BR", "BRL"], ["IN", "INR"], ["JP", "JPY"]];
const BASE = "https://prices.openfoodfacts.org/api/v1/prices";

async function fetchCountry(code: string, currency: string, pages: number): Promise<PriceRow[]> {
  const rows: PriceRow[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${BASE}?location_osm_address_country_code=${code}&currency=${currency}&price_per=UNIT&include_product=true&order_by=-date&size=100&page=${page}`;
    const data = await getJson<{ items: PriceRow[]; pages?: number }>(url);
    rows.push(...data.items);
    if (!data.items.length || page >= (data.pages ?? page)) break;
  }
  return rows;
}

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const pagesAt = args.indexOf("--pages");
  const pages = pagesAt >= 0 ? Number(args[pagesAt + 1]) || 12 : 12;
  const picked = args.filter((a) => /^[A-Za-z]{2}$/.test(a)).map((a) => a.toUpperCase());
  const targets = picked.length ? COUNTRIES.filter(([c]) => picked.includes(c)) : COUNTRIES;
  const all: CostRecord[] = [];
  for (const [code, currency] of targets) {
    const rows = await fetchCountry(code, currency, pages);
    const recs = aggregate(rows);
    console.log(`${code} ${currency}: ${rows.length} prices -> ${recs.length} products at ${new Set(recs.map((r) => r.store)).size} stores`);
    all.push(...recs);
  }
  if (dry) {
    for (const r of all.slice(0, 8)) console.log("  ", `${r.name} (${r.quantity ?? "?"}) at ${r.store}, ${r.countryName}: ${r.price} ${r.currency} [${r.kind}${r.imageUrl ? ", photo" : ""}]`);
    return process.exit(0);
  }
  const prisma = (await import("../lib/prisma")).default;
  let stored = 0;
  for (const r of all) {
    const data = { name: r.name, brand: r.brand, quantity: r.quantity, category: r.category, imageUrl: r.imageUrl, kind: r.kind, country: r.country, countryName: r.countryName, price: r.price, samples: r.samples, priceDate: r.priceDate };
    await prisma.costProduct.upsert({ where: { code_store_currency: { code: r.code, store: r.store, currency: r.currency } }, create: { code: r.code, store: r.store, currency: r.currency, ...data }, update: data });
    stored++;
  }
  console.log(`stored ${stored} products`);
  process.exit(0);
})();
