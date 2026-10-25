// Costimation product bank: shelf products with typical prices, filled offline from Open Prices (scripts/ingestPrices.ts).
// A game reads from this table only; it never calls Open Prices.
export type CostProductDto = {
  id: string; name: string; brand?: string; quantity?: string; category?: string; imageUrl?: string;
  country: string; countryName: string; store: string; currency: string; price: number; kind: string;
};

export type CostRow = CostProductDto & { uses: number };

export interface CostStore {
  find(where: { country?: string; store?: string }, take: number): Promise<CostRow[]>;
  touch(ids: string[]): Promise<void>;
}

/** Up to `n` products, least-played first so the bank rotates, shuffled within that so games differ. */
export async function pickProducts(store: CostStore, opts: { country?: string; store?: string; n?: number }, rand = Math.random): Promise<CostProductDto[]> {
  const n = Math.max(1, Math.min(opts.n ?? 400, 600));
  const rows = await store.find({ country: opts.country, store: opts.store }, n * 3);
  const sorted = [...rows].map((r) => ({ r, k: r.uses + rand() * 3 })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.r);
  await store.touch(sorted.map((r) => r.id));
  return sorted.map(({ uses: _uses, ...p }) => p);
}

// Loaded on first use so importing this file (and its tests) never needs a database connection.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = () => require("../lib/prisma").default as typeof import("../lib/prisma").default;

export const prismaCostStore: CostStore = {
  async find(where, take) {
    const rows = await db().costProduct.findMany({ where: { ...(where.country ? { country: where.country } : {}), ...(where.store ? { store: where.store } : {}) }, orderBy: { uses: "asc" }, take });
    return rows.map((r) => ({
      id: r.id, name: r.name, brand: r.brand ?? undefined, quantity: r.quantity ?? undefined, category: r.category ?? undefined, imageUrl: r.imageUrl ?? undefined,
      country: r.country, countryName: r.countryName, store: r.store, currency: r.currency, price: r.price, kind: r.kind, uses: r.uses,
    }));
  },
  async touch(ids) {
    if (ids.length) await db().costProduct.updateMany({ where: { id: { in: ids } }, data: { uses: { increment: 1 } } });
  },
};
