// Trivia bank for Jeopardy and Family Feud. Most of it is built offline from real data (Wikidata, PokéAPI; see
// src/trivia and scripts/ingestTrivia.ts), plus hand-written seeds. The AI can add more, cross-checked by a second model
// and moderated, but live generation is off unless TRIVIA_LIVE_AI=1: games read only from the stored bank.
// Selection rotates through the bank so a category does not keep coming back.
import { moderate } from "../lib/moderation";
import { captureError } from "../lib/monitoring";
import { allClients, extractJson, type LLM } from "./judge.service";
import { bundledCategories, surveysFor, TRIVIA_POOLS } from "../shared/topicDraft/trivia";
import { catalogMeta } from "../shared/topicDraft/catalogs";
import type { Clue, Survey, TriviaCategory } from "../shared/topicDraft/trivia/types";

export type StoredCategory = TriviaCategory & { uses: number; lastUsedAt: number | null; source: string };
export type StoredSurvey = Survey & { uses: number; lastUsedAt: number | null; source: string };

export interface TriviaStore {
  categories(pool: string): Promise<StoredCategory[]>;
  addCategory(pool: string, c: TriviaCategory, source: string): Promise<boolean>;
  touchCategories(pool: string, names: string[]): Promise<void>;
  surveys(pool: string): Promise<StoredSurvey[]>;
  addSurvey(pool: string, s: Survey, source: string): Promise<boolean>;
  touchSurveys(pool: string, qs: string[]): Promise<void>;
}

export const isTriviaPool = (pool: unknown): pool is string => typeof pool === "string" && TRIVIA_POOLS.includes(pool);

// ---------- text helpers ----------
export const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// ---------- validation of AI output ----------
/**
 * Accepts a category with at least four usable clues (the writer is asked for six so a clue that fails the
 * fact-check can be dropped). Clues that are malformed or give the answer away are skipped individually.
 */
export function validateCategory(raw: any, existing: { names: Set<string>; questions: Set<string> }): TriviaCategory | null {
  const name = str(raw?.name, 40);
  if (name.length < 3 || existing.names.has(fold(name))) return null;
  const arr = Array.isArray(raw?.clues) ? raw.clues.slice(0, 8) : [];
  const clues: Clue[] = [];
  const seenQ = new Set<string>();
  for (const c of arr) {
    const q = str(c?.q, 170);
    const right = str(c?.right, 45);
    const wrong = (Array.isArray(c?.wrong) ? c.wrong : []).map((w: unknown) => str(w, 45)).filter(Boolean);
    if (q.length < 15 || !right || wrong.length !== 3) continue;
    if (new Set([right, ...wrong].map(fold)).size !== 4) continue;
    if (existing.questions.has(fold(q)) || seenQ.has(fold(q))) continue;
    if (fold(right).length > 3 && fold(q).includes(fold(right))) continue; // the clue gives the answer away
    seenQ.add(fold(q));
    clues.push({ q, right, wrong });
  }
  return clues.length >= 4 ? { name, clues } : null;
}

export function validateSurvey(raw: any, existingQs: Set<string>): Survey | null {
  const q = str(raw?.q, 120);
  if (q.length < 12 || existingQs.has(fold(q))) return null;
  const answers = (Array.isArray(raw?.answers) ? raw.answers : []).map((a: unknown) => str(a, 40)).filter(Boolean);
  const decoys = (Array.isArray(raw?.decoys) ? raw.decoys : []).map((a: unknown) => str(a, 40)).filter(Boolean);
  if (answers.length !== 5 || decoys.length < 4) return null;
  const all = [...answers, ...decoys].map(fold);
  if (new Set(all).size !== all.length) return null;
  return { q, answers, decoys };
}

// ---------- AI generation ----------
const CAT_SYSTEM = `You write Jeopardy categories for a trivia game. Reply with ONLY a JSON object:
{"name":string,"clues":[{"q":string,"right":string,"wrong":[string,string,string]}, ... exactly 6 clues]}
Rules: the six clues get steadily harder (the first two easy, the middle two medium, the last two hard but fair). Every clue is a multiple-choice question with exactly one correct answer and three plausible wrong answers of the same kind. Answers are short (under 45 characters). Use only facts you are completely certain of, such as famous, well documented ones; if you are unsure of any detail (a year, a name, a number), choose a different fact. Never use opinions, rankings, or facts that changed recently. The clue must not contain its own answer. Family-friendly. The category is a NARROW, coherent theme and every clue is about that exact theme: good names are "Sith Lords", "Pixar Villains", "Gym Leaders", "Ghibli Directors' Films"; bad names are broad ones like "Famous Heroes", "Fun Facts" or "Starter Picks". The name is 2 to 4 words and the clues never mention the category name's answer.`;

const SURVEY_SYSTEM = `You write Family Feud surveys for a trivia game. Reply with ONLY a JSON object:
{"q":string,"answers":[5 strings, most popular first],"decoys":[5 strings]}
Rules: "q" is a survey question like "Name a famous Pixar sidekick" about the given topic. "answers" are the five most likely answers people would give, ranked, short (under 40 characters). "decoys" are plausible but WRONG answers that do not fit the question at all (for example things from a different franchise). Nothing may appear twice. Family-friendly.`;

async function ask(llm: LLM, system: string, user: string): Promise<any | null> {
  try {
    return extractJson(await llm.complete(system, user));
  } catch {
    return null;
  }
}

/** Second model answers the clue without seeing the key; the clue is kept only if it agrees with the stored answer. */
export async function verifyClue(llm: LLM, clue: Clue, rand = Math.random): Promise<boolean> {
  const options = [clue.right, ...clue.wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  const letters = ["A", "B", "C", "D"];
  const prompt = `${clue.q}\n${options.map((o, i) => `${letters[i]}) ${o}`).join("\n")}`;
  try {
    const out = await llm.complete("You answer multiple-choice trivia. Reply with ONLY the single letter of the correct option.", prompt);
    const m = out.toUpperCase().match(/\b([A-D])\b/);
    return !!m && options[letters.indexOf(m[1]!)] === clue.right;
  } catch {
    return false;
  }
}

async function yesNo(llm: LLM, question: string): Promise<boolean | null> {
  try {
    const out = (await llm.complete("Reply with ONLY yes or no.", question)).toLowerCase();
    return /\byes\b/.test(out) ? true : /\bno\b/.test(out) ? false : null;
  } catch {
    return null;
  }
}

export type Gen = { writer: LLM; checker: LLM };
/** Tries each model in order, moving on when one errors (rate limit, outage). */
export function failover(models: LLM[]): LLM {
  return {
    async complete(system, user, onUsage) {
      let last: unknown = new Error("no models");
      for (const m of models) {
        try {
          return await m.complete(system, user, onUsage);
        } catch (e) {
          last = e;
        }
      }
      throw last;
    },
  };
}

/** The writer prefers the first model; the checker prefers a different one so a model never grades its own work. */
/** What games use at runtime: no AI unless it is switched on, so a game never waits on (or pays for) a model call. */
export const liveGen = (): Gen | null => (process.env.TRIVIA_LIVE_AI === "1" ? defaultGen() : null);

export function defaultGen(): Gen | null {
  const c = allClients();
  if (!c.length) return null;
  return { writer: failover(c), checker: failover([...c.slice(1), c[0]!]) };
}

const topicOf = (pool: string) => {
  const m = catalogMeta(pool);
  return m ? `${m.title}: ${m.blurb}` : pool;
};

export async function generateCategory(pool: string, store: TriviaStore, gen: Gen): Promise<TriviaCategory | null> {
  const cats = await store.categories(pool);
  const existing = { names: new Set(cats.map((c) => fold(c.name))), questions: new Set(cats.flatMap((c) => c.clues.map((x) => fold(x.q)))) };
  const avoid = cats.map((c) => c.name).slice(-60).join("; ");
  const raw = await ask(gen.writer, CAT_SYSTEM, `Topic: ${topicOf(pool)}\nCategories that already exist (do not repeat or closely resemble): ${avoid || "none"}\nWrite one new category.`);
  const cat = validateCategory(raw, existing);
  if (!cat) return null;
  // Fact-check one clue at a time (the free tiers rate-limit bursts) and keep the first four the second model agrees with.
  const kept: Clue[] = [];
  for (const clue of cat.clues) {
    if (await verifyClue(gen.checker, clue)) kept.push(clue);
    if (kept.length === 4) break;
    if (cat.clues.length - cat.clues.indexOf(clue) - 1 + kept.length < 4) return null; // cannot reach four any more
  }
  if (kept.length < 4) return null;
  cat.clues = kept;
  const mod = await moderate([cat.name, ...cat.clues.flatMap((c) => [c.q, c.right, ...c.wrong])]);
  if (!mod.ok) return null;
  return (await store.addCategory(pool, cat, "ai")) ? cat : null;
}

export async function generateSurvey(pool: string, store: TriviaStore, gen: Gen): Promise<Survey | null> {
  const all = await store.surveys(pool);
  const raw = await ask(gen.writer, SURVEY_SYSTEM, `Topic: ${topicOf(pool)}\nSurveys that already exist (do not repeat): ${all.map((s) => s.q).slice(-50).join(" | ") || "none"}\nWrite one new survey.`);
  const sv = validateSurvey(raw, new Set(all.map((s) => fold(s.q))));
  if (!sv) return null;
  // The second model confirms the ranked answers fit and drops any decoy that would actually count.
  const fits = await Promise.all(sv.answers.map((a) => yesNo(gen.checker, `Survey question: "${sv.q}"\nWould "${a}" be a reasonable answer?`)));
  if (fits.filter((x) => x === true).length < 4) return null;
  const decoyOk = await Promise.all(sv.decoys.map((d) => yesNo(gen.checker, `Survey question: "${sv.q}"\nWould "${d}" be a reasonable answer?`)));
  const decoys = sv.decoys.filter((_, i) => decoyOk[i] === false);
  if (decoys.length < 3) return null;
  const out = { ...sv, decoys };
  const mod = await moderate([out.q, ...out.answers, ...out.decoys]);
  if (!mod.ok) return null;
  return (await store.addSurvey(pool, out, "ai")) ? out : null;
}

// ---------- growth limits (the free AI tiers are small, and the endpoints are public) ----------
const POOL_PER_HOUR = Number(process.env.TRIVIA_GEN_PER_POOL_HOUR) || 8;
const GLOBAL_PER_HOUR = Number(process.env.TRIVIA_GEN_PER_HOUR) || 40;
const gens: { at: number; pool: string }[] = [];
const inflight = new Set<string>();

export function genBudget(pool: string, now = Date.now()): number {
  while (gens.length && now - gens[0]!.at > 3_600_000) gens.shift();
  return Math.max(0, Math.min(POOL_PER_HOUR - gens.filter((g) => g.pool === pool).length, GLOBAL_PER_HOUR - gens.length));
}
const spend = (pool: string) => gens.push({ at: Date.now(), pool });
export const resetBudget = () => { gens.length = 0; inflight.clear(); };

const WAIT_MS = Number(process.env.TRIVIA_WAIT_MS) || 14_000;

/** Make up to `n` new items, in parallel, within budget. Returns how many were stored. */
async function grow(pool: string, kind: "cat" | "survey", n: number, store: TriviaStore, gen: Gen, waitMs = Infinity): Promise<number> {
  const k = Math.min(n, genBudget(pool));
  if (k <= 0) return 0;
  for (let i = 0; i < k; i++) spend(pool);
  // Each item gets two attempts: small free models often write a clue that fails the fact-check.
  const make = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await (kind === "cat" ? generateCategory(pool, store, gen) : generateSurvey(pool, store, gen));
        if (r) return r;
      } catch (e) {
        captureError(e, { where: "trivia_gen", pool, kind });
      }
    }
    return null;
  };
  const all = Promise.all(Array.from({ length: k }, make)).then((r) => r.filter(Boolean).length);
  // Generation keeps running in the background after we stop waiting; whatever finishes is stored for later games.
  return waitMs === Infinity ? all : Promise.race([all, new Promise<number>((r) => setTimeout(() => r(0), waitMs))]);
}

/** Keep the bank growing in the background as people play, without making anyone wait. */
function topUp(pool: string, kind: "cat" | "survey", have: number, target: number, store: TriviaStore, gen: Gen | null) {
  const key = `${pool}:${kind}`;
  if (!gen || have >= target || inflight.has(key)) return;
  inflight.add(key);
  grow(pool, kind, 3, store, gen).finally(() => inflight.delete(key));
}

// ---------- selection ----------
function rotate<T extends { uses: number; lastUsedAt: number | null }>(items: T[], rand: () => number): T[] {
  return [...items].map((x) => ({ x, r: rand() })).sort((a, b) => a.x.uses - b.x.uses || (a.x.lastUsedAt ?? 0) - (b.x.lastUsedAt ?? 0) || a.r - b.r).map((e) => e.x);
}

/** Items built from real data or written by hand come first; AI-written ones only fill the gap when too few of those are unseen. */
export function preferTrusted<T extends { source: string }>(items: T[], seen: (x: T) => boolean, need: number): T[] {
  const trusted = items.filter((x) => x.source !== "ai");
  return trusted.filter((x) => !seen(x)).length >= need ? trusted : items;
}

/** Least-used first, never one the player just saw unless there is nothing else. */
export function pickFresh<T extends { uses: number; lastUsedAt: number | null }>(items: T[], seen: (x: T) => boolean, n: number, rand = Math.random): T[] {
  const fresh = rotate(items.filter((x) => !seen(x)), rand);
  const stale = rotate(items.filter((x) => seen(x)), rand);
  return [...fresh, ...stale].slice(0, n);
}

const CAT_TARGET = 30;
const SURVEY_TARGET = 30;
const seeded = new Set<string>();

export async function ensureSeeded(pool: string, store: TriviaStore) {
  if (seeded.has(pool)) return;
  if (!(await store.categories(pool)).length) for (const c of bundledCategories(pool)) await store.addCategory(pool, c, "seed");
  if (!(await store.surveys(pool)).length) for (const s of surveysFor(pool)) await store.addSurvey(pool, s, "seed");
  seeded.add(pool);
}
export const resetSeeded = () => seeded.clear();

export async function getJeopardy(pool: string, avoid: string[], store: TriviaStore = prismaStore, gen: Gen | null = liveGen(), rand = Math.random, count = 4): Promise<TriviaCategory[]> {
  await ensureSeeded(pool, store);
  const avoidSet = new Set(avoid);
  const seen = (c: StoredCategory) => avoidSet.has(`cat:${c.name}`);
  let all = await store.categories(pool);
  const fresh = all.filter((c) => !seen(c)).length;
  // Not enough unseen categories: write new ones now (the player waits a few seconds rather than getting repeats).
  if (gen && fresh < count) {
    await grow(pool, "cat", count - fresh, store, gen, WAIT_MS);
    all = await store.categories(pool);
  }
  const chosen = pickFresh(preferTrusted(all, seen, count), seen, count, rand);
  await store.touchCategories(pool, chosen.map((c) => c.name));
  topUp(pool, "cat", all.length, CAT_TARGET, store, gen);
  if (gen && all.filter((c) => !seen(c)).length - chosen.filter((c) => !seen(c)).length < count) topUp(pool, "cat", 0, CAT_TARGET, store, gen);
  return chosen.map(({ id, name, clues }) => ({ id, name, clues }));
}

export async function getFeud(pool: string, rounds: number, avoid: string[], store: TriviaStore = prismaStore, gen: Gen | null = liveGen(), rand = Math.random): Promise<Survey[]> {
  await ensureSeeded(pool, store);
  const avoidSet = new Set(avoid);
  const seen = (s: StoredSurvey) => avoidSet.has(s.q);
  let all = await store.surveys(pool);
  const fresh = all.filter((s) => !seen(s)).length;
  if (gen && fresh < rounds) {
    await grow(pool, "survey", rounds - fresh, store, gen, WAIT_MS);
    all = await store.surveys(pool);
  }
  const chosen = pickFresh(preferTrusted(all, seen, rounds), seen, rounds, rand);
  await store.touchSurveys(pool, chosen.map((s) => s.q));
  topUp(pool, "survey", all.length, SURVEY_TARGET, store, gen);
  return chosen.map(({ id, q, answers, decoys }) => ({ id, q, answers, decoys }));
}

// ---------- stores ----------
// Loaded on first use so importing this file (and its tests) never needs a database connection.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = () => require("../lib/prisma").default as typeof import("../lib/prisma").default;
export const prismaStore: TriviaStore = {
  async categories(pool) {
    const rows = await db().triviaCategory.findMany({ where: { pool, retired: false } });
    return rows.map((r) => ({ id: r.id, name: r.name, clues: r.clues as unknown as Clue[], uses: r.uses, lastUsedAt: r.lastUsedAt?.getTime() ?? null, source: r.source }));
  },
  async addCategory(pool, c, source) {
    try {
      await db().triviaCategory.create({ data: { pool, name: c.name, clues: c.clues as any, source } });
      return true;
    } catch {
      return false; // unique name already stored
    }
  },
  async touchCategories(pool, names) {
    if (names.length) await db().triviaCategory.updateMany({ where: { pool, name: { in: names } }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } });
  },
  async surveys(pool) {
    const rows = await db().triviaSurvey.findMany({ where: { pool, retired: false } });
    return rows.map((r) => ({ id: r.id, q: r.q, answers: r.answers, decoys: r.decoys, uses: r.uses, lastUsedAt: r.lastUsedAt?.getTime() ?? null, source: r.source }));
  },
  async addSurvey(pool, s, source) {
    try {
      await db().triviaSurvey.create({ data: { pool, q: s.q, answers: s.answers, decoys: s.decoys, source } });
      return true;
    } catch {
      return false;
    }
  },
  async touchSurveys(pool, qs) {
    if (qs.length) await db().triviaSurvey.updateMany({ where: { pool, q: { in: qs } }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } });
  },
};

export function memoryStore(): TriviaStore & { cats: Map<string, StoredCategory[]>; svs: Map<string, StoredSurvey[]> } {
  const cats = new Map<string, StoredCategory[]>();
  const svs = new Map<string, StoredSurvey[]>();
  const get = <T,>(m: Map<string, T[]>, k: string) => m.get(k) ?? (m.set(k, []), m.get(k)!);
  return {
    cats, svs,
    async categories(pool) { return [...get(cats, pool)]; },
    async addCategory(pool, c, source) {
      const l = get(cats, pool);
      if (l.some((x) => x.name === c.name)) return false;
      l.push({ ...c, id: `c${l.length}`, uses: 0, lastUsedAt: null, source });
      return true;
    },
    async touchCategories(pool, names) { for (const c of get(cats, pool)) if (names.includes(c.name)) { c.uses++; c.lastUsedAt = Date.now(); } },
    async surveys(pool) { return [...get(svs, pool)]; },
    async addSurvey(pool, s, source) {
      const l = get(svs, pool);
      if (l.some((x) => x.q === s.q)) return false;
      l.push({ ...s, id: `s${l.length}`, uses: 0, lastUsedAt: null, source });
      return true;
    },
    async touchSurveys(pool, qs) { for (const s of get(svs, pool)) if (qs.includes(s.q)) { s.uses++; s.lastUsedAt = Date.now(); } },
  };
}
