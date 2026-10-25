// Costimation: guess what a product costs. The closer the guess, the further the car drives.
// Pure logic only (no React, no network) so it can be tested and reused.
export type Product = {
  id: string;
  name: string;
  brand?: string;
  quantity?: string;
  category?: string;
  imageUrl?: string;
  /** Two-letter country code, for example "US". */
  country: string;
  countryName: string;
  store: string;
  /** Currency the shelf price is in, for example "USD". */
  currency: string;
  /** Shelf price in `currency`. */
  price: number;
  /** Rough shape of the product, used to pick a pixel icon when there is no photo. */
  kind?: "drink" | "snack" | "can" | "box";
};

/** Units of each currency per 1 US dollar. Approximate and fixed: good enough to make a guessing game fair, not for money. */
export const RATES: Record<string, { perUsd: number; symbol: string }> = {
  USD: { perUsd: 1, symbol: "$" },
  EUR: { perUsd: 0.92, symbol: "€" },
  GBP: { perUsd: 0.79, symbol: "£" },
  JPY: { perUsd: 150, symbol: "¥" },
  CAD: { perUsd: 1.36, symbol: "C$" },
  AUD: { perUsd: 1.52, symbol: "A$" },
  INR: { perUsd: 83, symbol: "₹" },
  MXN: { perUsd: 17, symbol: "MX$" },
  BRL: { perUsd: 5, symbol: "R$" },
  CHF: { perUsd: 0.88, symbol: "CHF " },
};
export const CURRENCIES = Object.keys(RATES);
export const isKnownCurrency = (c: string) => c in RATES;

export type CurrencyChoice = "local" | "random" | string;

/** Price of a product in another currency. */
export function priceIn(p: Product, currency: string): number {
  if (currency === p.currency) return p.price;
  return (p.price / RATES[p.currency]!.perUsd) * RATES[currency]!.perUsd;
}

/** Pick the currency for one round. "local" uses the shop's own, "random" any supported one. */
export function currencyFor(choice: CurrencyChoice, p: Product, rand = Math.random): string {
  if (choice === "local") return p.currency;
  if (choice === "random") return CURRENCIES[Math.floor(rand() * CURRENCIES.length)]!;
  return isKnownCurrency(choice) ? choice : p.currency;
}

export function money(amount: number, currency: string): string {
  const digits = currency === "JPY" || amount >= 1000 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(amount);
  } catch {
    return `${RATES[currency]?.symbol ?? ""}${amount.toFixed(digits)}`;
  }
}

/** 1 for a perfect guess, falling to 0 when the guess is off by the whole price or more. */
export function closeness(guess: number, truth: number): number {
  if (!(truth > 0) || !Number.isFinite(guess)) return 0;
  return Math.max(0, 1 - Math.abs(guess - truth) / truth);
}

export const BULLSEYE = 0.95;
export const HINT_COST = 0.2;

/** Progress a car gains in one round: the closer the guess the further it drives, minus a cut for every hint used. */
export function roundGain(close: number, hintsUsed: number, rounds: number): number {
  return (Math.pow(close, 1.4) * Math.max(0.4, 1 - hintsUsed * HINT_COST)) / rounds;
}

/** What a bot guesses: the truth off by a random amount. `skill` is the largest relative miss. */
export function botGuess(truth: number, skill: number, rand = Math.random): number {
  return Math.max(0, truth * (1 + (rand() - 0.45) * 2 * skill));
}

export const BOTS = [{ name: "AVA", skill: 0.25 }, { name: "MAX", skill: 0.45 }];

/** A band that contains the price: wide enough to stay a puzzle, narrow enough to help. */
export function rangeHint(truth: number, rand = Math.random): [number, number] {
  const lo = truth * (0.55 + rand() * 0.15), hi = truth * (1.35 + rand() * 0.2);
  const nice = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 100) / 100);
  return [nice(lo), nice(hi)];
}
export const digitsHint = (truth: number) => String(Math.floor(truth)).length;

export type Filters = { country: string; store: string };
export const ANY = "any";
export function filterProducts(all: Product[], f: Filters): Product[] {
  return all.filter((p) => (f.country === ANY || p.country === f.country) && (f.store === ANY || p.store === f.store));
}

export function shuffle<T>(a: T[], rand = Math.random): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The products on the wheel for one round, never repeating a product that has already been played. */
export function wheelFor(pool: Product[], played: Set<string>, n = 8, rand = Math.random): Product[] {
  const fresh = shuffle(pool.filter((p) => !played.has(p.id)), rand);
  const rest = shuffle(pool.filter((p) => played.has(p.id)), rand);
  return [...fresh, ...rest].slice(0, n);
}

/** Which wheel segment a pointer at the top sits on, given the wheel's rotation in degrees. */
export function segmentAt(rotation: number, segments: number): number {
  const a = (((360 - (rotation % 360)) % 360) + 360) % 360;
  return Math.min(segments - 1, Math.floor(a / (360 / segments)));
}

/** Rotation that lands segment `index` under the pointer, a few full turns on from `from`. */
export function spinTarget(from: number, index: number, segments: number, turns = 6, jitter = 0): number {
  const seg = 360 / segments;
  const want = 360 - ((index + 0.5) * seg + jitter);
  const base = ((from % 360) + 360) % 360;
  return from + 360 * turns + ((((want - base) % 360) + 360) % 360);
}
