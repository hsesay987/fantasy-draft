// Pure rules for Common Thread: which raw categories are good enough, which six picks become the clues, which seven
// other categories become the wrong options, and how a topic is split into daily and practice sets.
import { shuffle } from "../app/topicDraft/rng";
import type { ThreadCategory, ThreadClue, ThreadTopic } from "../app/commonthread/types";

export type RawMember = { name: string; q?: string; fame: number };
export type RawCategory = { label: string; kind: string; members: RawMember[] };

export const MIN_MEMBERS = 6;
/** A category may hold at most this share of the topic's pool, or it is a catch-all. */
export const MAX_SHARE = 0.25;
export const CLUES = 6;
export const WRONG = 7;
export const DAILY_TARGET = 60;
export const PRACTICE_TARGET = 20;

export function usable(c: RawCategory, poolSize: number): boolean {
  const n = new Set(c.members.map((m) => m.name)).size;
  return n >= MIN_MEMBERS && n <= poolSize * MAX_SHARE;
}

/** Members by name (the most famous entry wins a duplicate), least famous first. */
function sortedMembers(c: RawCategory): RawMember[] {
  const best = new Map<string, RawMember>();
  for (const m of c.members) {
    const cur = best.get(m.name);
    if (!cur || m.fame > cur.fame) best.set(m.name, m);
  }
  return [...best.values()].sort((a, b) => a.fame - b.fame || (a.name < b.name ? -1 : 1));
}

/** Six clues spread across the category from least to most famous. The last is the most famous member. */
export function orderClues(c: RawCategory): ThreadClue[] {
  const m = sortedMembers(c);
  if (m.length < CLUES) throw new Error(`category "${c.label}" has fewer than ${CLUES} members`);
  const out: ThreadClue[] = [];
  for (let i = 0; i < CLUES; i++) {
    const x = m[Math.round((i * (m.length - 1)) / (CLUES - 1))]!;
    out.push(x.q ? { name: x.name, q: x.q } : { name: x.name });
  }
  return out;
}

/**
 * Up to seven labels of other categories that none of this category's clues belong to, mixing fact kinds so the
 * options do not reveal the answer's type. Fewer than seven come back when the topic cannot supply them.
 */
export function pickWrong(c: RawCategory, others: RawCategory[], seed: number): string[] {
  const clueNames = new Set(orderClues(c).map((x) => x.name));
  const seen = new Set<string>([c.label]);
  const eligible: RawCategory[] = [];
  for (const o of others) {
    if (seen.has(o.label) || o.members.some((m) => clueNames.has(m.name))) continue;
    seen.add(o.label);
    eligible.push(o);
  }
  const [mixed] = shuffle(eligible, seed);
  const byKind = new Map<string, string[]>();
  for (const o of mixed) byKind.set(o.kind, [...(byKind.get(o.kind) ?? []), o.label]);
  const queues = [...byKind.values()];
  const out: string[] = [];
  for (let round = 0; out.length < WRONG && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (out.length < WRONG && q[round] !== undefined) out.push(q[round]!);
  }
  return out;
}

export const slug = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** How well known the category's best members are, so the closing clues are ones players recognise. */
function score(c: RawCategory): number {
  const top = sortedMembers(c).slice(-3).map((m) => m.fame);
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/**
 * Chooses about 80 usable categories spread over the fact kinds, checks each has seven wrong options among the
 * others that were chosen, and splits them into a daily set and a separate practice set.
 */
export function assemble(pool: string, cats: RawCategory[], seed: number): ThreadTopic {
  const poolSize = new Set(cats.flatMap((c) => c.members.map((m) => m.name))).size;
  const seenLabel = new Set<string>();
  const seenId = new Set<string>();
  const good: RawCategory[] = [];
  for (const c of cats) {
    if (!usable(c, poolSize) || seenLabel.has(c.label) || seenId.has(slug(c.label))) continue;
    seenLabel.add(c.label);
    seenId.add(slug(c.label));
    good.push(c);
  }
  good.sort((a, b) => score(b) - score(a) || (a.label < b.label ? -1 : 1));

  // Pass one deals kind by kind with a cap per kind; pass two tops up from what is left.
  const target = DAILY_TARGET + PRACTICE_TARGET;
  const cap = Math.ceil(target * 0.3);
  const byKind = new Map<string, RawCategory[]>();
  for (const c of good) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const picked = new Set<RawCategory>();
  const queues = [...byKind.values()];
  for (let round = 0; round < cap && picked.size < target; round++) {
    for (const q of queues) if (picked.size < target && q[round]) picked.add(q[round]!);
  }
  for (const c of good) if (picked.size < target) picked.add(c);

  // Drop any category without enough wrong options, then re-check, since each drop removes options for the rest.
  let chosen = [...picked];
  for (;;) {
    const keep = chosen.filter((c, i) => pickWrong(c, chosen, seed + i * 7919).length === WRONG);
    if (keep.length === chosen.length) break;
    chosen = keep;
  }

  const [order] = shuffle(chosen, seed);
  const nPractice = Math.round(order.length * (PRACTICE_TARGET / target));
  const toCat = (c: RawCategory): ThreadCategory => {
    const clues = orderClues(c);
    const i = chosen.indexOf(c);
    return { id: slug(c.label), label: c.label, clues, wrong: pickWrong(c, chosen, seed + i * 7919), members: sortedMembers(c).map((m) => m.name) };
  };
  const all = order.map(toCat);
  return { pool, practice: all.slice(0, nPractice), daily: all.slice(nPractice) };
}
