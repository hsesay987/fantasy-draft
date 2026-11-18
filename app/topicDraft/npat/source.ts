// Where the NPAT engine gets its accepted-answer lists. The engine is shared with the room screens on phones, and the
// lists (the answers) must never ship there, so the engine asks this module and only the places that really score
// answers (the server and solo play) fill it in, by importing lists.ts, which registers the full lists here.
import { lettersFor, normAnswer, type Tier } from "./rules";

export type NpatEntry = { name: string; also?: string[]; tier: Tier };

/** A letter is only drawn when every chosen category has at least this many accepted answers for it. */
export const MIN_PER_LETTER = 15;

let source: ((category: string) => NpatEntry[]) | null = null;
const indexes = new WeakMap<NpatEntry[], Map<string, NpatEntry>>();
const letterCounts = new WeakMap<NpatEntry[], Map<string, number>>();

export function setListSource(f: (category: string) => NpatEntry[]): void {
  source = f;
}

/** The accepted answers for a category, most familiar first; empty for an unknown category. Throws if no lists were
 * loaded, so a missing import can't pass as a game where every answer is unknown. */
export function entriesOf(category: string): NpatEntry[] {
  if (!source) throw new Error("NPAT lists not loaded: import npat/lists where answers are scored");
  return source(category);
}

/** The entry a typed answer means, by its name or an alias (case, accents and a leading "the" ignored). A name wins
 * over another entry's alias, and a shared alias goes to the more familiar entry. */
export function lookup(category: string, text: unknown): NpatEntry | null {
  const k = normAnswer(text);
  if (!k) return null;
  const list = entriesOf(category);
  let idx = indexes.get(list);
  if (!idx) {
    idx = new Map();
    for (const e of list) for (const a of e.also ?? []) { const ak = normAnswer(a); if (ak && !idx.has(ak)) idx.set(ak, e); }
    for (const e of [...list].reverse()) idx.set(normAnswer(e.name), e);
    indexes.set(list, idx);
  }
  return idx.get(k) ?? null;
}

/** How many entries of a list can be answered with each letter (by name or alias). */
function countsOf(list: NpatEntry[]): Map<string, number> {
  let counts = letterCounts.get(list);
  if (!counts) {
    counts = new Map();
    for (const e of list) {
      const firsts = new Set([e.name, ...(e.also ?? [])].map((a) => normAnswer(a).charAt(0).toUpperCase()).filter((c) => c >= "A" && c <= "Z"));
      for (const c of firsts) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    letterCounts.set(list, counts);
  }
  return counts;
}

/** The letters a round can use: every category has at least MIN_PER_LETTER answers starting with it. Hard letters
 * (Q, X, Z, Y) only when `hard` is on. Alphabetical. */
export function lettersAvailable(categories: string[], hard: boolean): string[] {
  const counts = categories.map((c) => countsOf(entriesOf(c)));
  return lettersFor(hard).filter((l) => counts.every((m) => (m.get(l) ?? 0) >= MIN_PER_LETTER));
}
