import { Router } from "express";
import { captureError } from "../lib/monitoring";
import { pickProducts, prismaCostStore, type CostProductDto } from "../services/costimation.service";
import {
  createNpatDailyCap, dayKey, dayNumber, isDailyGame, npatOverlay, npatPlays, npatRescore, npatPuzzle, peckingPuzzle, prismaDailyStore, puzzleFor, recordNpatDaily, statsOf,
  submitResult, topicFor, type DailyGame, type NpatPuzzle,
} from "../services/daily.service";
import { DIG_CATEGORIES } from "../shared/topicDraft/npat/rules";
import { cachedVerdict } from "../services/npatJudge.instance";
import type { NpatHistoryStore } from "../services/npatHistory.service";
import { getFeud, getJeopardy } from "../services/trivia.service";

const router = Router();

/** The NPAT answer counts the rooms use too (the server sets it at start): the daily's tier overlay and its plays. */
let npatHistory: NpatHistoryStore | null = null;
const npatCap = createNpatDailyCap();
export function setDailyNpatHistory(h: NpatHistoryStore | null) {
  npatHistory = h;
}

/** The saved NPAT puzzle for a day, or the one the day would build if none was saved (or it is malformed). */
async function npatOf(day: string): Promise<NpatPuzzle> {
  const saved = (await prismaDailyStore.puzzle("npat", day)) as Partial<NpatPuzzle> | null;
  return validNpat(saved) ?? npatPuzzle(day);
}

/** A saved NPAT puzzle only if it is a dig's: a letter and exactly five categories (a four-category one saved before the dig shipped is rebuilt). */
function validNpat(c: unknown): NpatPuzzle | null {
  const p = c as Partial<NpatPuzzle> | null;
  return p && typeof p.letter === "string" && Array.isArray(p.categories) && p.categories.length === DIG_CATEGORIES ? { letter: p.letter, categories: p.categories } : null;
}

const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 40) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/** Five products for the day, from different countries where possible, preferring ones with a photo. */
function pickFive(all: CostProductDto[]): CostProductDto[] {
  const withPhoto = [...all.filter((p) => p.imageUrl), ...all.filter((p) => !p.imageUrl)];
  const out: CostProductDto[] = [];
  for (const p of withPhoto) if (out.length < 5 && !out.some((o) => o.country === p.country)) out.push(p);
  for (const p of withPhoto) if (out.length < 5 && !out.includes(p)) out.push(p);
  return out;
}

async function build(game: DailyGame, day: string) {
  if (game === "summit" || game === "toprung") { const pool = topicFor(game, day); return { pool, categories: await getJeopardy(pool, []) }; }
  if (game === "pecking") return peckingPuzzle(day);
  if (game === "npat") return npatPuzzle(day);
  if (game === "hotair") { const pool = topicFor(game, day); return { pool, surveys: await getFeud(pool, 5, []) }; }
  return { products: pickFive(await pickProducts(prismaCostStore, { n: 120 })) };
}

/** Today's puzzle for a game: the same for everyone, all day. */
router.get("/:game", async (req, res) => {
  const game = req.params.game;
  if (!isDailyGame(game)) return res.status(404).json({ error: "Unknown daily game" });
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const day = dayKey();
  try {
    let content = await puzzleFor(prismaDailyStore, game, day, () => build(game, day));
    if (game === "npat") content = validNpat(content) ?? npatPuzzle(day);
    // NPAT's tiers move with the answer counts, so the overlay is worked out fresh, never saved with the puzzle.
    const store = npatHistory;
    const extra = game === "npat" ? { overlay: store ? npatOverlay(content as NpatPuzzle, (c, a) => store.lookup(c, a)) : {} } : {};
    res.json({ game, day, number: dayNumber(day), content: { ...(content as object), ...extra } });
  } catch (e) {
    captureError(e, { where: "daily_puzzle", game });
    res.status(500).json({ error: "Couldn't load today's puzzle" });
  }
});

/** Save a result (the first one counts) and get the day's stats back. */
router.post("/:game/result", async (req, res) => {
  const game = req.params.game;
  if (!isDailyGame(game)) return res.status(404).json({ error: "Unknown daily game" });
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const player = typeof req.body?.player === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(req.body.player) ? req.body.player : null;
  const score = Number(req.body?.score);
  const day = typeof req.body?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.day) ? req.body.day : dayKey();
  if (!player || !(score >= 0 && score <= 1)) return res.status(400).json({ error: "player and a score from 0 to 1 are required" });
  // Results only count for today (or yesterday, for someone who started before midnight UTC).
  const today = dayKey(), yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (day !== today && day !== yesterday) return res.status(400).json({ error: "That puzzle is closed" });
  const detail = req.body?.detail && JSON.stringify(req.body.detail).length < 4000 ? req.body.detail : undefined;
  try {
    // NPAT sends its answers too: re-checked here, they add to the answer counts on the player's first result of the day.
    const puzzle = game === "npat" ? await npatOf(day) : null;
    const plays = puzzle ? npatPlays(puzzle, req.body?.answers ?? []) : [];
    if (!plays) return res.status(400).json({ error: "answers must be up to 5 of today's categories, each at most 40 characters" });
    // The browser's score is never trusted: the server re-scores the typed answers from the lists and the stored verdicts.
    let counted = score;
    if (puzzle) {
      const store = npatHistory;
      let overlay = {};
      try { overlay = store ? npatOverlay(puzzle, (c, a) => store.lookup(c, a)) : {}; } catch { overlay = {}; }
      const typed = (req.body?.answers ?? []) as { category: string; text: string }[];
      counted = Math.min(score, (await npatRescore(puzzle, typed, cachedVerdict, overlay)).score);
    }
    const { added, ...result } = await submitResult(prismaDailyStore, { game, day, player, score: counted, detail });
    // Player ids are self-issued, so history writes are also capped per IP and day (see createNpatDailyCap).
    if (added && plays.length && npatCap.allow(req.ip ?? "anon", day)) await recordNpatDaily(npatHistory, day, player, plays);
    res.json(result);
  } catch (e) {
    captureError(e, { where: "daily_result", game });
    res.status(500).json({ error: "Couldn't save your result" });
  }
});

/** The day's stats, for a player who already played. */
router.get("/:game/stats", async (req, res) => {
  const game = req.params.game;
  if (!isDailyGame(game)) return res.status(404).json({ error: "Unknown daily game" });
  const day = typeof req.query.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : dayKey();
  const score = req.query.score != null ? Number(req.query.score) : undefined;
  try {
    res.json({ day, stats: statsOf(await prismaDailyStore.scores(game, day), score != null && score >= 0 && score <= 1 ? score : undefined) });
  } catch (e) {
    captureError(e, { where: "daily_stats", game });
    res.status(500).json({ error: "Couldn't load stats" });
  }
});

export default router;
