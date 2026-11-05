// Common Thread: six clues share one hidden fact. Clues run from obscure to obvious, and the sooner you name the fact
// from the eight options, the more you score. Pure rules plus the saved daily run; the topic data is loaded per topic
// by topics.ts and never imported here, so one topic's file stays out of every other page.
import type { ThreadCategory, ThreadTopic } from "./types";

export const CLUES = 6;
export type ThreadRun = { catId: string; shown: number; removed: string[]; won: boolean; over: boolean };

export const seedOf = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

/** The daily schedule walks a topic's own list, so nothing repeats until the whole list has been played. */
export const dailyCategory = (t: ThreadTopic, day: number): ThreadCategory => t.daily[(day - 1) % t.daily.length]!;

export const practiceCategory = (t: ThreadTopic, rand: number): ThreadCategory => {
  const i = Math.floor((Number.isFinite(rand) ? rand : 0) * t.practice.length);
  return t.practice[Math.max(0, Math.min(t.practice.length - 1, i))]!;
};

/** A small seeded generator (mulberry32): even neighbouring seeds come out unrelated. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** The eight labels, shuffled: the same seed keeps them in place across a refresh, and the answer's slot tells nothing. */
export const options = (c: ThreadCategory, seed: number): string[] => {
  const out = [c.label, ...c.wrong];
  const rand = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

export function startRun(c: ThreadCategory): ThreadRun {
  return { catId: c.id, shown: 1, removed: [], won: false, over: false };
}

export function nextClue(r: ThreadRun): ThreadRun {
  return r.over || r.shown >= CLUES ? r : { ...r, shown: r.shown + 1 };
}

export function guess(r: ThreadRun, c: ThreadCategory, label: string): ThreadRun {
  if (r.over || c.id !== r.catId || r.removed.includes(label)) return r;
  if (label === c.label) return { ...r, won: true, over: true };
  if (!c.wrong.includes(label)) return r;
  const removed = [...r.removed, label];
  return r.shown >= CLUES ? { ...r, removed, over: true } : { ...r, removed, shown: r.shown + 1 };
}

export const score = (r: ThreadRun): number => (r.won ? CLUES + 1 - r.shown : 0);

/**
 * One square per clue. A run keeps how many clues were skipped and how many guesses missed, not their order, so the
 * misses come first: red a wrong guess, black a clue asked for, green the right guess, white a clue never needed.
 */
export const shareGrid = (r: ThreadRun, title: string): string => {
  const wrong = r.removed.length;
  const skipped = r.shown - wrong - (r.won ? 1 : 0);
  const row = "🟥".repeat(wrong) + "⬛".repeat(Math.max(0, skipped)) + (r.won ? "🟩" : "") + "⬜".repeat(CLUES - r.shown);
  return [`${title} ${r.won ? score(r) : "X"}/${CLUES}`, row, "toppicgames.com/commonthread"].join("\n");
};

const key = (pool: string, day: number) => `toppic:commonthread:${pool}:${day}`;

/** Only a run these rules could have produced counts; anything else in storage is treated as no run at all. */
function isRun(v: unknown): v is ThreadRun {
  if (typeof v !== "object" || v === null) return false;
  const { catId, shown, removed, won, over } = v as Partial<ThreadRun>;
  if (typeof catId !== "string" || typeof won !== "boolean" || typeof over !== "boolean") return false;
  if (typeof shown !== "number" || !Number.isInteger(shown) || shown < 1 || shown > CLUES) return false;
  if (!Array.isArray(removed) || !removed.every((l) => typeof l === "string")) return false;
  if (won && !over) return false;
  if (over && !won) return shown === CLUES && removed.length >= 1 && removed.length <= CLUES;
  return removed.length <= shown - 1;
}

/** Today's saved run for a topic, whichever category it is for: the hub reads this without loading the topic. */
export function savedRun(pool: string, day: number): ThreadRun | null {
  try {
    const raw = localStorage.getItem(key(pool, day));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isRun(v) ? v : null;
  } catch {
    return null;
  }
}

export function loadRun(pool: string, day: number, catId: string): ThreadRun | null {
  const r = savedRun(pool, day);
  return r?.catId === catId ? r : null;
}

export function saveRun(pool: string, day: number, r: ThreadRun): void {
  try {
    localStorage.setItem(key(pool, day), JSON.stringify(r));
  } catch {
    /* storage unavailable */
  }
}
