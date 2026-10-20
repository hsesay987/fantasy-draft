import { Router } from "express";
import { captureError } from "../lib/monitoring";
import { getFeud, getJeopardy, isTriviaPool } from "../services/trivia.service";

const router = Router();

const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

const avoidList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-400).map((x) => x.slice(0, 160)) : []);

router.post("/jeopardy", async (req, res) => {
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  if (!isTriviaPool(req.body?.pool)) return res.status(400).json({ error: "Unknown topic" });
  try {
    res.json({ categories: await getJeopardy(req.body.pool, avoidList(req.body?.avoid)) });
  } catch (e) {
    captureError(e, { where: "trivia_jeopardy" });
    res.status(500).json({ error: "Couldn't build a board" });
  }
});

router.post("/feud", async (req, res) => {
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  if (!isTriviaPool(req.body?.pool)) return res.status(400).json({ error: "Unknown topic" });
  const rounds = Math.max(3, Math.min(5, Number(req.body?.rounds) || 5));
  try {
    res.json({ surveys: await getFeud(req.body.pool, rounds, avoidList(req.body?.avoid)) });
  } catch (e) {
    captureError(e, { where: "trivia_feud" });
    res.status(500).json({ error: "Couldn't build the surveys" });
  }
});

export default router;
