// NPAT question style: each round the reel draws a letter and one open question appears ("Something you'd bring to a
// beach"); everyone types one answer starting with the letter in 20 seconds. It is a dig whose `categories` are the
// questions and whose `letters` hold one letter per round, so it plays, judges, scores and redacts with npatDig's
// functions; only the setup and the seen keys live here. It never reads the answer lists: the judge decides every answer.
import { shuffle } from "../rng";
import { QUESTION_LETTERS, QUESTION_MAX_ROUNDS, QUESTION_MIN_ROUNDS, QUESTION_DEFAULT_ROUNDS } from "../npat/rules";
import { NPAT_QUESTIONS, questionByText, questionOf } from "../npat/questions";
import { init as digInit, type DigState } from "./npatDig";

export function init(o: {
  players: string[]; rounds: number; teams: number; teamMap: Record<string, number>; avoid?: string[];
  /** Fixed question ids and letters, e.g. for a test or a replay; unknown ones are dropped. */
  questions?: string[]; letters?: string[];
  strict?: boolean; drinking?: boolean; seed: number; now: number;
}): DigState {
  const asked = Math.floor(Number.isFinite(o.rounds) ? o.rounds : QUESTION_DEFAULT_ROUNDS);
  const rounds = Math.min(QUESTION_MAX_ROUNDS, Math.max(QUESTION_MIN_ROUNDS, asked));
  const avoid = new Set(o.avoid ?? []);
  let seed = o.seed;
  // Unseen first, then seen, so a long session repeats as late as it can.
  const draw = <T>(all: T[], seen: (x: T) => boolean): T[] => {
    const [fresh, s1] = shuffle(all.filter((x) => !seen(x)), seed);
    const [old, s2] = shuffle(all.filter(seen), s1);
    seed = s2;
    return [...fresh, ...old];
  };
  const fixedQ = (o.questions ?? []).flatMap((id) => questionOf(id) ?? []);
  const questions = fixedQ.length ? fixedQ : draw(NPAT_QUESTIONS, (q) => avoid.has(`nq:${q.id}`)).slice(0, rounds);
  const fixedL = (o.letters ?? []).map((l) => String(l).toUpperCase()).filter((l) => QUESTION_LETTERS.includes(l));
  const pool = draw(QUESTION_LETTERS, (l) => avoid.has(`np:${l}`));
  // More rounds than letters (never with the defaults) wraps round the drawn order.
  const letters = questions.map((_, i) => fixedL[i] ?? pool[i % pool.length]!);
  const base = digInit({
    players: o.players, categories: questions.map((q) => q.text), letters, teams: o.teams, teamMap: o.teamMap,
    strict: o.strict, drinking: o.drinking, seed, now: o.now,
  });
  return base;
}

/** `nq:<question id>` for each question asked and `np:<letter>` for each letter: what a later game's `avoid` takes. */
export function seenKeys(s: DigState): string[] {
  return [
    ...s.categories.flatMap((t) => { const q = questionByText(t); return q ? [`nq:${q.id}`] : []; }),
    ...(s.letters ?? [s.letter]).map((l) => `np:${l}`),
  ];
}
