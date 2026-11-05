// Pure rules for Common Thread: which raw categories are good enough, which six picks become the clues, which seven
// other categories become the wrong options, and how a topic is split into daily and practice sets.
import { shuffle } from "../app/topicDraft/rng";
import type { ThreadCategory, ThreadClue, ThreadTopic } from "../app/commonthread/types";

export type RawMember = { name: string; q?: string; fame: number };
/**
 * `exclusive`: the kind's values rule each other out (a decade, a continent). Other kinds overlap, and Wikidata's
 * membership is incomplete, so a category of that kind is never offered as a wrong option for its own kind.
 * `answerOnly`: the kind is too patchy to ever be a wrong option (a dish's ingredients, a flag's symbols); it can only be an answer.
 */
export type RawCategory = { label: string; kind: string; members: RawMember[]; exclusive?: boolean; answerOnly?: boolean; country?: boolean };

export const MIN_MEMBERS = 6;
/** A category may hold at most this share of the topic's pool, or it is a catch-all. */
export const MAX_SHARE = 0.25;
export const CLUES = 6;
export const WRONG = 7;
/** Wrong options taken from the answer's own kind when that kind is mutually exclusive. */
export const SAME_KIND = 3;
/** A name may close at most this many categories of one topic. */
export const MAX_LAST_USES = 6;
/** Two kept categories may share at most this many clues minus one, and less than this member overlap. */
export const TWIN_CLUES = 4;
export const TWIN_JACCARD = 0.6;
export const DAILY_TARGET = 60;
export const PRACTICE_TARGET = 20;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** True when the whole name appears in the label as separate words, so the label gives the clue away. */
export const nameInLabel = (name: string, label: string): boolean => {
  const n = name.trim();
  if (!n) return false;
  const edge = "[\\p{L}\\p{N}]";
  return new RegExp(`(?<!${edge})${escapeRe(n)}(?!${edge})`, "iu").test(label);
};

/** Adjectives for names whose stem differs from the demonym. */
const DEMONYMS: Record<string, string[]> = {
  france: ["french"], netherlands: ["dutch"], spain: ["spanish"], greece: ["greek"], denmark: ["danish"], sweden: ["swedish"], finland: ["finnish"],
  poland: ["polish"], turkey: ["turkish"], switzerland: ["swiss"], china: ["chinese"], ireland: ["irish"], england: ["english"], philippines: ["filipino"],
  thailand: ["thai"], iceland: ["icelandic"], "czech republic": ["czech"], wales: ["welsh"], scotland: ["scottish"], "united kingdom": ["british"],
  "united states": ["american"], japan: ["japanese"], vietnam: ["vietnamese"], lebanon: ["lebanese"], nepal: ["nepali", "nepalese"], malta: ["maltese"],
  "new zealand": ["kiwi"], norway: ["norwegian"], germany: ["german"], israel: ["israeli"], iran: ["iranian", "persian"], iraq: ["iraqi"], mexico: ["mexican"],
};

/** The label names the clue: the whole name as words, a demonym, or a shared 5-letter stem ("Australia" in "Australian dollar"). */
export function givesAway(name: string, label: string, country = false): boolean {
  if (nameInLabel(name, label)) return true;
  // Demonyms and stems only matter where the clue is a country: elsewhere a shared 5-letter start is just a shared word.
  if (!country) return false;
  const n = name.toLowerCase().replace(/^the\s+/, "").trim();
  for (const d of DEMONYMS[n] ?? []) if (nameInLabel(d, label)) return true;
  const first = n.split(/[^\p{L}]+/u).find((w) => w.length > 0) ?? "";
  if (first.length < 5) return false;
  const stem = first.slice(0, 5);
  return label.toLowerCase().split(/[^\p{L}]+/u).some((w) => w.startsWith(stem));
}

export function usable(c: RawCategory, poolSize: number): boolean {
  const n = new Set(c.members.map((m) => m.name)).size;
  if (n < MIN_MEMBERS || n > poolSize * MAX_SHARE) return false;
  return clueCandidates(c).length >= CLUES;
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

/** Members that may be a clue: not named in the label, and not in `banned`. Least famous first. */
function clueCandidates(c: RawCategory, banned: ReadonlySet<string> = new Set()): RawMember[] {
  return sortedMembers(c).filter((m) => !banned.has(m.name) && !givesAway(m.name, c.label, c.country));
}

/**
 * Six clues spread across the category from least to most famous. The last is the most famous eligible member.
 * Names in `banned` (a name already used as a last clue too often) and names that appear in the label are skipped.
 */
export function orderClues(c: RawCategory, banned: ReadonlySet<string> = new Set()): ThreadClue[] {
  const m = clueCandidates(c, banned);
  if (m.length < CLUES) throw new Error(`category "${c.label}" has fewer than ${CLUES} usable clue members`);
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
export function pickWrong(c: RawCategory, others: RawCategory[], seed: number, clues: ThreadClue[] = orderClues(c)): string[] {
  const clueNames = new Set(clues.map((x) => x.name));
  const seen = new Set<string>([c.label]);
  const eligible: RawCategory[] = [];
  for (const o of others) {
    if (o.answerOnly || seen.has(o.label) || o.members.some((m) => clueNames.has(m.name))) continue;
    // Overlapping kinds are incomplete on Wikidata, so a sibling might secretly be true of a clue.
    if (o.kind === c.kind && !c.exclusive) continue;
    seen.add(o.label);
    eligible.push(o);
  }
  const [mixed] = shuffle(eligible, seed);
  const out: string[] = [];
  // A mutually exclusive kind tempts best with siblings: about three of the seven.
  if (c.exclusive) for (const o of mixed) if (o.kind === c.kind && out.length < SAME_KIND) out.push(o.label);
  const rest = mixed.filter((o) => !out.includes(o.label) && !(c.exclusive && o.kind === c.kind));
  const byKind = new Map<string, string[]>();
  for (const o of rest) byKind.set(o.kind, [...(byKind.get(o.kind) ?? []), o.label]);
  const queues = [...byKind.values()];
  for (let round = 0; out.length < WRONG && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (out.length < WRONG && q[round] !== undefined) out.push(q[round]!);
  }
  // Too few other kinds: fill from the answer's own exclusive kind.
  if (c.exclusive) for (const o of mixed) if (out.length < WRONG && !out.includes(o.label)) out.push(o.label);
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

  // Pass one deals kind by kind with a cap per kind; pass two tops up from what is left. A category is kept only if
  // it has six clues that do not repeat a closing clue too often and it is not a twin of one already kept.
  const target = DAILY_TARGET + PRACTICE_TARGET;
  const cap = Math.ceil(target * 0.3);
  const byKind = new Map<string, RawCategory[]>();
  for (const c of good) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const kept = new Map<RawCategory, ThreadClue[]>();
  const keptNames = new Map<RawCategory, Set<string>>();
  const lastUses = new Map<string, number>();
  const tried = new Set<RawCategory>();
  const tryAdd = (c: RawCategory) => {
    if (kept.size >= target || tried.has(c)) return;
    tried.add(c);
    const banned = new Set([...lastUses].filter(([, n]) => n >= MAX_LAST_USES).map(([name]) => name));
    if (clueCandidates(c, banned).length < CLUES) return;
    const clues = orderClues(c, banned);
    const names = new Set(c.members.map((m) => m.name));
    for (const [k, kc] of kept) {
      const shared = clues.filter((x) => kc.some((y) => y.name === x.name)).length;
      if (shared >= TWIN_CLUES) return;
      const other = keptNames.get(k)!;
      let inter = 0;
      for (const n of names) if (other.has(n)) inter++;
      if (inter / (names.size + other.size - inter) >= TWIN_JACCARD) return;
    }
    kept.set(c, clues);
    keptNames.set(c, names);
    const last = clues[CLUES - 1]!.name;
    lastUses.set(last, (lastUses.get(last) ?? 0) + 1);
  };
  const queues = [...byKind.values()];
  for (let round = 0; round < cap && kept.size < target; round++) for (const q of queues) if (q[round]) tryAdd(q[round]!);
  for (const c of good) tryAdd(c);

  // Drop any category without enough wrong options, then re-check, since each drop removes options for the rest.
  let chosen = [...kept.keys()];
  for (;;) {
    const keep = chosen.filter((c, i) => pickWrong(c, chosen, seed + i * 7919, kept.get(c)).length === WRONG);
    if (keep.length === chosen.length) break;
    chosen = keep;
  }

  const [order] = shuffle(chosen, seed);
  // About a quarter practice, but never at the cost of the daily floor of 50 when there are enough categories for both floors.
  const nPractice = Math.max(Math.min(15, order.length), Math.min(Math.round(order.length * (PRACTICE_TARGET / target)), order.length - 50));
  const toCat = (c: RawCategory): ThreadCategory => {
    const clues = kept.get(c)!;
    const i = chosen.indexOf(c);
    return { id: slug(c.label), label: c.label, clues, wrong: pickWrong(c, chosen, seed + i * 7919, clues), members: sortedMembers(c).map((m) => m.name) };
  };
  const all = order.map(toCat);
  return { pool, practice: all.slice(0, nPractice), daily: all.slice(nPractice) };
}
