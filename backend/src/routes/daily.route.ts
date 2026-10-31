import { Router } from "express";
import { captureError } from "../lib/monitoring";
import { pickProducts, prismaCostStore, type CostProductDto } from "../services/costimation.service";
import { dayKey, dayNumber, isDailyGame, prismaDailyStore, puzzleFor, statsOf, submitResult, topicFor, type DailyGame } from "../services/daily.service";
import { getFeud, getJeopardy } from "../services/trivia.service";

const router = Router();

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
  if (game === "summit") { const pool = topicFor(game, day); return { pool, categories: await getJeopardy(pool, []) }; }
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
    const content = await puzzleFor(prismaDailyStore, game, day, () => build(game, day));
    res.json({ game, day, number: dayNumber(day), content });
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
    res.json(await submitResult(prismaDailyStore, { game, day, player, score, detail }));
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
