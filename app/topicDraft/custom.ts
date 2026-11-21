// Custom mode: a player writes their own version of a game, publishes it, and anyone can play it.
// This file is the whole contract: what a custom game holds, what makes it valid, and how it becomes a normal
// GameSetup the existing engines can run. The browser editor and the server both use it, so they cannot disagree.
import type { Item, Scenario } from "./types";
import type { QuizData } from "./trivia/types";
import { DEFAULT_OPTS, type FormatId, type GameSetup } from "../play/types";

export type CustomKind = "draft" | "summit" | "hotair";

/** A draft pool: things to pick, the stats they are rated on, and the lenses a draft can be judged through. */
export type CustomDraft = {
  /** What the things are called, for headings: "Pizza toppings". */
  noun: string;
  /** Two to six stat names, written by the author: "Crunch". */
  stats: string[];
  items: { name: string; group?: string; values: number[] }[];
  /** How a draft is judged. `weights` lines up with `stats`. At least one. */
  lenses: { title: string; blurb?: string; weights: number[] }[];
};
/** A Summit board: categories of four multiple-choice clues, easiest first. */
export type CustomSummit = { categories: { name: string; clues: { q: string; right: string; wrong: string[] }[] }[] };
/** Hot Air surveys: a question and its answers, most popular first. */
export type CustomHotAir = { surveys: { q: string; answers: string[] }[] };

export type CustomContent = CustomDraft | CustomSummit | CustomHotAir;
export type CustomGameData = { kind: CustomKind; title: string; description: string; content: CustomContent };

export const CUSTOM_KINDS: { kind: CustomKind; title: string; blurb: string; formats: FormatId[] }[] = [
  { kind: "draft", title: "Draft pool", blurb: "Your own things to draft, rated on stats you choose, judged through lenses you write.", formats: ["spin", "snake", "auction", "blind", "keep"] },
  { kind: "summit", title: "Summit board", blurb: "Your own trivia categories, four clues each, easy to hard.", formats: ["jeopardy"] },
  { kind: "hotair", title: "Hot Air surveys", blurb: "Your own “name something…” questions with ranked answers.", formats: ["feud"] },
];
export const customKind = (kind: string) => CUSTOM_KINDS.find((k) => k.kind === kind);

export const LIMITS = {
  title: 60, description: 240, noun: 30, stat: 20, name: 50, group: 30, lensTitle: 50, lensBlurb: 120, question: 160, answer: 50, category: 40,
  stats: [2, 6], items: [8, 120], lenses: [1, 6], categories: [4, 8], clues: 4, wrong: 3, surveys: [5, 20], answers: [3, 5],
} as const;

const text = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const dupes = (xs: string[]) => { const seen = new Set<string>(); return xs.filter((x) => { const k = fold(x); if (seen.has(k)) return true; seen.add(k); return false; }); };
const between = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type Checked = { ok: true; data: CustomGameData } | { ok: false; errors: string[] };

/**
 * Clean a custom game and say everything that is wrong with it, in words an author can act on.
 * Nothing here trusts its input: the server runs it on whatever a client sends.
 */
export function checkCustom(input: unknown): Checked {
  const raw = (input ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const kind = String(raw.kind) as CustomKind;
  if (!customKind(kind)) return { ok: false, errors: ["Choose what kind of game this is."] };
  const title = text(raw.title, LIMITS.title), description = text(raw.description, LIMITS.description);
  if (title.length < 3) errors.push("Give your game a title of at least 3 letters.");
  const c = (raw.content ?? {}) as Record<string, unknown>;
  let content: CustomContent;

  if (kind === "draft") {
    const stats = list(c.stats).map((s) => text(s, LIMITS.stat)).filter(Boolean);
    if (!between(stats.length, LIMITS.stats)) errors.push(`Add between ${LIMITS.stats[0]} and ${LIMITS.stats[1]} stats.`);
    if (dupes(stats).length) errors.push(`Two stats share a name: ${dupes(stats)[0]}.`);
    const items = list(c.items).map((i) => {
      const o = (i ?? {}) as Record<string, unknown>;
      return { name: text(o.name, LIMITS.name), group: text(o.group, LIMITS.group) || undefined, values: stats.map((_, k) => Math.round(Math.min(100, Math.max(0, Number(list(o.values)[k]) || 0)))) };
    }).filter((i) => i.name);
    if (!between(items.length, LIMITS.items)) errors.push(`Add between ${LIMITS.items[0]} and ${LIMITS.items[1]} things to draft (you have ${items.length}).`);
    const twice = dupes(items.map((i) => i.name));
    if (twice.length) errors.push(`"${twice[0]}" is listed twice.`);
    const flat = stats.findIndex((_, k) => items.length > 1 && items.every((i) => i.values[k] === items[0]!.values[k]));
    if (flat >= 0) errors.push(`Everything has the same ${stats[flat]}. Vary it, or remove that stat.`);
    const lenses = list(c.lenses).map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return { title: text(o.title, LIMITS.lensTitle), blurb: text(o.blurb, LIMITS.lensBlurb) || undefined, weights: stats.map((_, k) => Math.min(3, Math.max(0, Number(list(o.weights)[k]) || 0))) };
    }).filter((l) => l.title);
    if (!between(lenses.length, LIMITS.lenses)) errors.push(`Add between ${LIMITS.lenses[0]} and ${LIMITS.lenses[1]} ways to judge a draft.`);
    const dead = lenses.find((l) => l.weights.every((w) => w === 0));
    if (dead) errors.push(`"${dead.title}" does not weigh any stat.`);
    content = { noun: text(c.noun, LIMITS.noun) || "Picks", stats, items, lenses };
  } else if (kind === "summit") {
    const categories = list(c.categories).map((cat) => {
      const o = (cat ?? {}) as Record<string, unknown>;
      return {
        name: text(o.name, LIMITS.category),
        clues: list(o.clues).slice(0, LIMITS.clues).map((cl) => {
          const q = (cl ?? {}) as Record<string, unknown>;
          return { q: text(q.q, LIMITS.question), right: text(q.right, LIMITS.answer), wrong: list(q.wrong).map((w) => text(w, LIMITS.answer)).filter(Boolean).slice(0, LIMITS.wrong) };
        }),
      };
    }).filter((cat) => cat.name);
    if (!between(categories.length, LIMITS.categories)) errors.push(`Add between ${LIMITS.categories[0]} and ${LIMITS.categories[1]} categories.`);
    if (dupes(categories.map((x) => x.name)).length) errors.push(`Two categories share a name: ${dupes(categories.map((x) => x.name))[0]}.`);
    for (const cat of categories) {
      if (cat.clues.length !== LIMITS.clues || cat.clues.some((cl) => !cl.q || !cl.right)) { errors.push(`"${cat.name}" needs ${LIMITS.clues} clues, each with a question and a right answer.`); continue; }
      const bad = cat.clues.find((cl) => cl.wrong.length !== LIMITS.wrong || dupes([cl.right, ...cl.wrong]).length);
      if (bad) errors.push(`In "${cat.name}", "${bad.q}" needs ${LIMITS.wrong} wrong answers that all differ from the right one.`);
    }
    content = { categories };
  } else {
    const surveys = list(c.surveys).map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { q: text(o.q, LIMITS.question), answers: list(o.answers).map((a) => text(a, LIMITS.answer)).filter(Boolean).slice(0, LIMITS.answers[1]) };
    }).filter((s) => s.q);
    if (!between(surveys.length, LIMITS.surveys)) errors.push(`Add between ${LIMITS.surveys[0]} and ${LIMITS.surveys[1]} questions.`);
    for (const s of surveys) {
      if (s.answers.length < LIMITS.answers[0]) errors.push(`"${s.q}" needs at least ${LIMITS.answers[0]} answers, most popular first.`);
      else if (dupes(s.answers).length) errors.push(`"${s.q}" lists "${dupes(s.answers)[0]}" twice.`);
    }
    content = { surveys };
  }
  return errors.length ? { ok: false, errors: [...new Set(errors)].slice(0, 8) } : { ok: true, data: { kind, title, description, content } };
}

/** Every piece of text a player wrote, for the moderation check before publishing. */
export function customText(g: CustomGameData): string[] {
  const c = g.content as Partial<CustomDraft & CustomSummit & CustomHotAir>;
  return [
    g.title, g.description, c.noun ?? "", ...(c.stats ?? []),
    ...(c.items ?? []).flatMap((i) => [i.name, i.group ?? ""]),
    ...(c.lenses ?? []).flatMap((l) => [l.title, l.blurb ?? ""]),
    ...(c.categories ?? []).flatMap((cat) => [cat.name, ...cat.clues.flatMap((cl) => [cl.q, cl.right, ...cl.wrong])]),
    ...(c.surveys ?? []).flatMap((s) => [s.q, ...s.answers]),
  ].filter(Boolean);
}

/** How much is in it, for a card: "24 picks · 3 lenses". */
export function customSummary(g: Pick<CustomGameData, "kind" | "content">): string {
  const c = g.content as Partial<CustomDraft & CustomSummit & CustomHotAir>;
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  if (g.kind === "draft") return `${n(c.items?.length ?? 0, "pick")} · ${n(c.stats?.length ?? 0, "stat")} · ${n(c.lenses?.length ?? 0, "lens", "lenses")}`;
  if (g.kind === "summit") return `${n(c.categories?.length ?? 0, "category", "categories")} · ${(c.categories?.length ?? 0) * LIMITS.clues} clues`;
  return n(c.surveys?.length ?? 0, "question");
}

const slugOf = (s: string) => fold(s).replace(/ /g, "-") || "x";
/** Stat keys are made from the author's names, so two games never collide with each other or the built-in stats. */
const statKey = (name: string, i: number) => `c${i}-${slugOf(name)}`;

export const POOL_PREFIX = "custom:";
export const isCustomPool = (pool: string) => pool.startsWith(POOL_PREFIX);

/** The draft pool as engine items. Stat keys carry their position so the judge can show the author's own names. */
export function customItems(d: CustomDraft): Item[] {
  return d.items.map((i, n) => ({
    id: `cu-${n}-${slugOf(i.name)}`, name: i.name, universe: i.group ?? d.noun, archetype: d.noun,
    stats: Object.fromEntries(d.stats.map((s, k) => [statKey(s, k), i.values[k] ?? 0])), tags: [], custom: true,
  }));
}
export function customMissions(d: CustomDraft): Scenario[] {
  return d.lenses.map((l, n) => ({ id: `lens-${n}`, title: l.title, blurb: l.blurb ?? "", weights: Object.fromEntries(d.stats.map((s, k) => [statKey(s, k), l.weights[k] ?? 0]).filter(([, w]) => (w as number) > 0)) }));
}
/** The author's name for a custom stat key ("c0-crunch" reads "Crunch"). */
export const customStatName = (d: CustomDraft, key: string) => d.stats[Number(/^c(\d+)-/.exec(key)?.[1] ?? -1)] ?? key;

export function customQuiz(g: CustomGameData): QuizData | undefined {
  if (g.kind === "summit") return { categories: (g.content as CustomSummit).categories.map((c) => ({ name: c.name, clues: c.clues })) };
  if (g.kind === "hotair") return { surveys: (g.content as CustomHotAir).surveys.map((s) => ({ q: s.q, answers: s.answers, decoys: [] })) };
  return undefined;
}

export type CustomPlay = { format: FormatId; players: string[]; aiPlayers: string[]; lens?: number; seed: number; id: string };

/** Turn a published custom game into a setup the normal engines run. `slug` only labels the pool. */
export function customSetup(g: CustomGameData, slug: string, play: CustomPlay): GameSetup {
  const meta = customKind(g.kind)!;
  const format = meta.formats.includes(play.format) ? play.format : meta.formats[0]!;
  const base = { id: play.id, format, pool: `${POOL_PREFIX}${slug}`, players: play.players, aiPlayers: play.aiPlayers, mystery: false, loadout: null, roles: [], seed: play.seed };
  if (g.kind !== "draft") {
    const quiz = customQuiz(g)!;
    const rounds = g.kind === "summit" ? quiz.categories!.length : Math.min(8, quiz.surveys!.length);
    return { ...base, mission: { id: "quiz", title: g.title, blurb: g.description, weights: {} }, opts: { ...DEFAULT_OPTS, teamSize: rounds, timerSeconds: null }, quiz };
  }
  const d = g.content as CustomDraft;
  const items = customItems(d), missions = customMissions(d);
  const perPlayer = Math.floor(items.length / Math.max(play.players.length, 1));
  const teamSize = Math.max(2, Math.min(5, perPlayer));
  return {
    ...base,
    mission: missions[Math.min(play.lens ?? 0, missions.length - 1)]!,
    opts: { ...DEFAULT_OPTS, customItems: items, teamSize, rankSize: Math.max(3, Math.min(8, items.length)), budget: teamSize * 5, timerSeconds: null },
  };
}
