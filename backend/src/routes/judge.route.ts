import { Router } from "express";
import { authRequired, AuthedRequest } from "../middleware/auth";
import { judge } from "../services/judge.service";

const router = Router();

const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const LIMIT = 10;

function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

router.post("/", authRequired, async (req: AuthedRequest, res) => {
  if (limited(req.userId!)) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const body = req.body;
  if (!body?.scenario || !Array.isArray(body?.teams)) {
    return res.status(400).json({ error: "scenario and teams are required" });
  }
  const verdict = await judge(body);
  res.json(verdict);
});

export default router;
