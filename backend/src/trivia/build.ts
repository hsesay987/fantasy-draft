// Turns structured facts into Jeopardy categories and Family Feud surveys. Pure: no network, no database, and no AI.
// Because every answer comes from the source data, a clue can only be wrong if the source is wrong.
import type { Clue, Survey, TriviaCategory } from "../shared/topicDraft/trivia/types";
import type { Entity, Spec, SurveyDef, Template } from "./model";

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Small seedable generator so a build can be repeated and tested. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function shuffle<T>(a: T[], rand: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const one = (e: Entity, fact: string) => (e.facts[fact]?.length === 1 ? e.facts[fact]![0]! : null);
export const decade = (year: string | undefined) => (year && /^\d{4}$/.test(year) ? `${year.slice(0, 3)}0s` : null);

/** Drops entities whose name is shared with another entity: "Crash" or "It" would make a clue ambiguous. */
export function uniqueNames(entities: Entity[]): Entity[] {
  const count = new Map<string, number>();
  for (const e of entities) count.set(fold(e.label), (count.get(fold(e.label)) ?? 0) + 1);
  return entities.filter((e) => count.get(fold(e.label)) === 1);
}

function wrongYears(right: number, rand: () => number): string[] {
  const now = new Date().getFullYear();
  const pool = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6].map((d) => right + d).filter((y) => y <= now);
  const near = pool.filter((y) => Math.abs(y - right) <= 3);
  const pick = shuffle(near, rand).slice(0, 2);
  pick.push(...shuffle(pool.filter((y) => !pick.includes(y)), rand).slice(0, 3 - pick.length));
  return pick.map(String);
}

/** Four clues from one group, easiest (best known) first, taken at spread-out points of the group's fame ranking. */
function board(t: Template, members: Entity[], rand: () => number): Clue[] | null {
  const ranked = [...members].sort((a, b) => b.pop - a.pop);
  if (ranked.length < 8) return null;
  const answers = [...new Set(ranked.map((e) => one(e, t.fact)!))];
  if (!t.year && answers.length < 6) return null;
  const clues: Clue[] = [];
  const used = new Set<string>();
  // Only the better-known half of a group is used, so a board never asks about something almost nobody has heard of.
  for (const at of [0.04, 0.15, 0.3, 0.5]) {
    const start = Math.floor(at * ranked.length);
    const e = ranked.slice(start).concat(ranked.slice(0, start)).find((x) => !used.has(x.id) && !used.has(one(x, t.fact)!));
    if (!e) return null;
    const right = one(e, t.fact)!;
    used.add(e.id);
    if (!t.year) used.add(right); // never two clues with the same answer on one board
    const q = t.ask(e);
    if (fold(right).length > 3 && fold(q).includes(fold(right))) return null;
    let wrong: string[];
    if (t.year) wrong = wrongYears(Number(right), rand);
    else {
      // Wrong options are real answers from entities of similar fame, so they sound as plausible as the right one.
      const own = new Set((e.facts[t.fact] ?? []).map(fold));
      const near = ranked.slice(Math.max(0, start - 6), start + 7).map((x) => one(x, t.fact)!);
      // A wrong option must not share a word with the right answer ("Nintendo" next to "Nintendo EAD" is a trap, not a clue).
      const words = (x: string) => fold(x).split(" ").filter((w) => w.length >= 4);
      const rw = new Set(words(right));
      const cand = [...new Set([...near, ...answers])].filter((a) => !own.has(fold(a)) && fold(a) !== fold(right) && !words(a).some((w) => rw.has(w)));
      const front = shuffle(cand.filter((a) => near.includes(a)), rand);
      wrong = [...front, ...shuffle(cand.filter((a) => !near.includes(a)), rand)].slice(0, 3);
    }
    if (wrong.length !== 3 || new Set([right, ...wrong].map(fold)).size !== 4) return null;
    clues.push({ q, right, wrong });
  }
  return clues;
}

export function buildCategories(entities: Entity[], spec: Spec, rand = seeded(1)): TriviaCategory[] {
  const out: TriviaCategory[] = [];
  const all = uniqueNames(entities);
  const names = new Set(entities.map((e) => fold(e.label)));
  for (const t of spec.templates) {
    const groups = new Map<string, Entity[]>();
    const times = new Map<string, number>();
    if (t.shared) for (const e of all) for (const v of e.facts[t.fact] ?? []) times.set(v, (times.get(v) ?? 0) + 1);
    for (const e of all) {
      const a = one(e, t.fact);
      if (!a || (!t.entityAnswer && !t.year && names.has(fold(a))) || (t.shared && (times.get(a) ?? 0) < 2)) continue;
      const g = t.group(e);
      if (g) groups.set(g, [...(groups.get(g) ?? []), e]);
    }
    for (const [g, members] of groups) {
      const clues = board(t, members, rand);
      if (clues) out.push({ name: t.name(g).slice(0, 40), clues });
    }
  }
  return out;
}

/** "Name a film directed by Steven Spielberg": the five best-known members are the answers; decoys are famous things outside the group. */
export function buildSurveys(entities: Entity[], spec: Spec, rand = seeded(2)): Survey[] {
  const out: Survey[] = [];
  const all = uniqueNames(entities);
  const byFame = [...all].sort((a, b) => b.pop - a.pop);
  for (const def of spec.surveys as SurveyDef[]) {
    const groups = new Map<string, Entity[]>();
    for (const e of all) for (const v of e.facts[def.fact] ?? []) groups.set(v, [...(groups.get(v) ?? []), e]);
    for (const [value, members] of groups) {
      if (members.length < 5 || members.length > (def.max ?? 12) || (def.ok && !def.ok(value))) continue;
      const top = [...members].sort((a, b) => b.pop - a.pop).slice(0, 5);
      const ids = new Set(members.map((m) => m.id));
      const names = new Set(members.map((m) => fold(m.label)));
      // Decoys come from the well-known half of everything else, so they look like real answers to the question.
      const decoys = shuffle(byFame.slice(0, 120).filter((e) => !ids.has(e.id) && !names.has(fold(e.label)) && (e.facts[def.fact]?.length ?? 0) > 0), rand).slice(0, 5).map((e) => e.label);
      if (decoys.length < 4) continue;
      const answers = top.map((e) => e.label);
      if (new Set([...answers, ...decoys].map(fold)).size !== answers.length + decoys.length) continue;
      out.push({ q: def.ask(value).slice(0, 120), answers, decoys });
    }
  }
  return out;
}
