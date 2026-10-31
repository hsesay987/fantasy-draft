import { API_URL } from "../play/onlineApi";
import { filterProducts, type Filters, type Product } from "./game";

export type Place = { code: string; name: string; stores: string[] };

const s = (id: string, name: string, country: string, countryName: string, store: string, currency: string, price: number, kind: Product["kind"], quantity?: string): Product => ({ id, name, country, countryName, store, currency, price, kind, quantity });

/** Used only when the live bank cannot be reached. Approximate shelf prices, so the game still works offline. */
export const SAMPLE_PRODUCTS: Product[] = [
  s("s1", "Cheerios", "US", "United States", "Walmart", "USD", 5.48, "box", "18 oz"),
  s("s2", "Heinz Tomato Ketchup", "US", "United States", "Walmart", "USD", 3.98, "drink", "32 oz"),
  s("s3", "Coca-Cola", "US", "United States", "Walmart", "USD", 7.98, "can", "12 x 12 fl oz"),
  s("s4", "Oreo Family Size", "US", "United States", "Target", "USD", 5.99, "snack", "18.71 oz"),
  s("s5", "Barilla Spaghetti", "US", "United States", "Target", "USD", 1.99, "box", "16 oz"),
  s("s6", "Nutella", "US", "United States", "Target", "USD", 7.49, "drink", "26.5 oz"),
  s("s7", "Pringles Original", "US", "United States", "Kroger", "USD", 2.49, "can", "5.5 oz"),
  s("s8", "Folgers Classic Roast", "US", "United States", "Kroger", "USD", 10.99, "can", "25.9 oz"),
  s("s9", "Heinz Baked Beans", "GB", "United Kingdom", "Tesco", "GBP", 2.6, "can", "4 x 415 g"),
  s("s10", "Hovis Wholemeal Loaf", "GB", "United Kingdom", "Tesco", "GBP", 1.45, "snack", "750 g"),
  s("s11", "Cadbury Dairy Milk", "GB", "United Kingdom", "Tesco", "GBP", 2.25, "snack", "180 g"),
  s("s12", "PG Tips Tea Bags", "GB", "United Kingdom", "Sainsbury's", "GBP", 3.1, "box", "80 bags"),
  s("s13", "Walkers Ready Salted Crisps", "GB", "United Kingdom", "Sainsbury's", "GBP", 1.9, "snack", "6 x 25 g"),
  s("s14", "Nutella", "FR", "France", "Carrefour", "EUR", 4.99, "drink", "750 g"),
  s("s15", "Evian Water", "FR", "France", "Carrefour", "EUR", 4.25, "drink", "6 x 1.5 L"),
  s("s16", "Milka Alpenmilch", "DE", "Germany", "Aldi", "EUR", 1.29, "snack", "100 g"),
  s("s17", "Haribo Goldbären", "DE", "Germany", "Aldi", "EUR", 1.19, "snack", "200 g"),
  s("s18", "Kraft Dinner", "CA", "Canada", "Loblaws", "CAD", 4.99, "box", "3 x 225 g"),
  s("s19", "Tim Hortons Original Coffee", "CA", "Canada", "Loblaws", "CAD", 12.99, "can", "930 g"),
];

export function placesOf(products: Product[]): Place[] {
  const m = new Map<string, Place>();
  for (const p of products) {
    const e = m.get(p.country) ?? { code: p.country, name: p.countryName, stores: [] };
    if (!e.stores.includes(p.store)) e.stores.push(p.store);
    m.set(p.country, e);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type Bank = { products: Product[]; places: Place[]; live: boolean };

/** Loads the stored product bank from the API. Falls back to the bundled samples if it is empty or unreachable. */
export async function loadBank(signal?: AbortSignal): Promise<Bank> {
  try {
    const res = await fetch(`${API_URL}/costimation/products?n=400`, { signal });
    if (res.ok) {
      const data = (await res.json()) as { products?: Product[] };
      if (data.products && data.products.length >= 8) return { products: data.products, places: placesOf(data.products), live: true };
    }
  } catch {
    /* fall through to the bundled samples */
  }
  return { products: SAMPLE_PRODUCTS, places: placesOf(SAMPLE_PRODUCTS), live: false };
}

/** Products for the chosen filters, widening to everything if the filters leave too few for a wheel. */
export function poolFor(bank: Bank, f: Filters, min = 4): { pool: Product[]; widened: boolean } {
  const pool = filterProducts(bank.products, f);
  return pool.length >= min ? { pool, widened: false } : { pool: bank.products, widened: true };
}
