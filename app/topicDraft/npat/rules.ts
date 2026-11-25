import { normName } from "../pecking/normName";

export type Tier = "common" | "obvious" | "solid" | "rare" | "deep" | "unicorn";

export const TIER_POINTS: Record<Tier, number> = { common: 10, obvious: 15, solid: 30, rare: 60, deep: 85, unicorn: 100 };
export const TIER_NAMES: Record<Tier, string> = {
  common: "Common", obvious: "Too Obvious", solid: "Solid", rare: "Rare", deep: "Deep Cut", unicorn: "Unicorn",
};

export const ROUND_MS = { 45: 45_000, 60: 60_000, 90: 90_000 } as const;
export const DEFAULT_ROUND_S = 60;
export const VOTE_MS = 8_000;
export const REVEAL_MS = 6_000;
/**
 * Answers still count for this long after the write deadline, so typing sent as the clock runs out isn't lost on the way.
 * Clocks show the deadline without it; the engine closes writing at the deadline plus this.
 */
export const WRITE_GRACE_MS = 500;
export const ANSWER_MAX = 40;
export const HARD_LETTERS = ["Q", "X", "Z", "Y"];

export const normAnswer = (text: unknown): string => (typeof text === "string" ? normName(text) : "");

export const startsWith = (letter: string, answer: string, also: string[] = []): boolean => {
  const l = normAnswer(letter);
  if (!l) return false;
  return [answer, ...also].some((a) => normAnswer(a).startsWith(l));
};

export const sharedPoints = (points: number, sharers: number): number =>
  sharers <= 1 ? points : Math.ceil(points / 2);

/** Familiarity ladder; "obvious" is only ever produced by the history rule, so it steps down to common. */
const ORDER: Tier[] = ["common", "common", "solid", "rare", "deep", "unicorn"];

/** History rule: an answer many players already give is less rare than its list rank says. */
export const adjustTier = (base: Tier, share: number, plays: number): Tier => {
  if (plays < 30 || share < 0.05) return base;
  if (base === "rare" || base === "deep" || base === "unicorn") return "obvious";
  const i = ORDER.indexOf(base);
  return ORDER[Math.max(0, i - 1)];
};

/** Rank 0 = most familiar. Top 20% common, then solid 20, rare 20, deep 15, bottom 25 unicorn. */
export const bandTier = (rank: number, size: number): Tier => {
  const p = (rank * 100) / Math.max(1, size);
  if (p < 20) return "common";
  if (p < 40) return "solid";
  if (p < 60) return "rare";
  if (p < 75) return "deep";
  return "unicorn";
};

export const lettersFor = (hard: boolean): string[] =>
  Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).filter((c) => hard || !HARD_LETTERS.includes(c));

// NPAT v2 "Dig": one letter, five categories, one at a time, each answer judged on the spot.
export const DIG_CATEGORIES = 5;
/** A room dig may ask more: the host ticks 5 to 10. Dailies always ask exactly DIG_CATEGORIES. */
export const DIG_MAX_CATEGORIES = 10;
export const digCountOk = (n: number): boolean => n >= DIG_CATEGORIES && n <= DIG_MAX_CATEGORIES;
export const DIG_ANSWER_MS = 20_000;
export const REEL_MS = 2_600;
export const JUDGE_MS = 5_000;
export const VERDICT_MS = 3_500;
export const METRES_PER_POINT = 10;
export const DIG_MAX_M = 5_000;

/** Gem per tier (mockup colours: `dark` is the shadow side, `light` the lit side). */
export const GEMS: Record<Tier, { name: string; dark: string; light: string }> = {
  common: { name: "Coal", dark: "#3a3446", light: "#6b6478" },
  obvious: { name: "Quartz", dark: "#d9d4c6", light: "#f4f1e8" },
  solid: { name: "Amethyst", dark: "#6d45a8", light: "#9b6bd6" },
  rare: { name: "Sapphire", dark: "#2c45b8", light: "#4c6ef5" },
  deep: { name: "Emerald", dark: "#2f7a4a", light: "#4fb36a" },
  unicorn: { name: "Diamond", dark: "#4fb4c8", light: "#7fd6e6" },
};

export const ZONES: { m: number; name: string }[] = [
  { m: 0, name: "Topsoil" }, { m: 400, name: "Root tangle" }, { m: 1000, name: "Clay beds" }, { m: 1800, name: "Bedrock" },
  { m: 2600, name: "Fossil seam" }, { m: 3400, name: "Crystal caves" }, { m: 4200, name: "Magma line" }, { m: 5000, name: "The core" },
];

export const depthOf = (points: number): number =>
  Math.min(DIG_MAX_M, Math.max(0, Math.round((Number.isFinite(points) ? points : 0) * METRES_PER_POINT)));

/** Tier for an AI-accepted answer from its niche estimate (0 = everyone knows it, 100 = obscure); never above rare. */
export const aiTier = (niche: number): Tier => {
  const n = Number.isFinite(niche) ? Math.min(100, Math.max(0, niche)) : 0;
  return n < 20 ? "common" : n < 45 ? "solid" : "rare";
};

// NPAT question style: each round draws a letter and asks one open question (npat/questions.ts), 20 s to answer.
export const QUESTION_MIN_ROUNDS = 3;
export const QUESTION_MAX_ROUNDS = 12;
export const QUESTION_DEFAULT_ROUNDS = 8;
/** Letters a question round can draw: the hard four plus U and V leave too few answers for an open question. */
export const QUESTION_LETTERS = lettersFor(false).filter((l) => l !== "U" && l !== "V");
/** Every accepted answer is worth the same: 10, or 5 when someone else gave it too (TIER_POINTS.common, halved). */
export const QUESTION_TIER: Tier = "common";

/**
 * A question-style answer as the letter check and the grouping see it. `text` drops a leading "a", "an", "the" or
 * "some" (answers to "Something you'd bring..." invite "a towel"); `key` also folds simple plurals, so "Sandwich" and
 * "sandwiches" are the same answer. A rough fold, not a stemmer: it only has to make obvious twins meet.
 */
export function questionAnswer(raw: string): { text: string; key: string } {
  const text = raw.trim().replace(/^(?:a|an|the|some)\s+(?=\S)/i, "");
  let k = normAnswer(text);
  if (k.length > 4 && k.endsWith("ies")) k = `${k.slice(0, -3)}y`;
  else if (k.length > 3 && k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  if (k.length > 3 && k.endsWith("e")) k = k.slice(0, -1);
  return { text, key: k };
}
