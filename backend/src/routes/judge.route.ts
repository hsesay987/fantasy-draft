import { Router } from "express";
import { AuthedRequest } from "../middleware/auth";
import { moderate } from "../lib/moderation";
import { bossIdeas, judge } from "../services/judge.service";

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

// Guests can play solo; rate limit per user or IP instead of requiring login.
router.post("/", async (req: AuthedRequest, res) => {
  if (limited(req.userId ?? req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const body = req.body;
  if (!body?.scenario || !Array.isArray(body?.teams)) {
    return res.status(400).json({ error: "scenario and teams are required" });
  }
  const mod = await moderate([body.scenario?.title, body.scenario?.blurb, ...body.teams.flatMap((t: any) => [t?.player, ...(Array.isArray(t?.items) ? t.items.map((i: any) => i?.name) : [])])]);
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const verdict = await judge(body);
  res.json(verdict);
});

router.post("/boss", async (req: AuthedRequest, res) => {
  if (limited(req.userId ?? req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const mod = await moderate([req.body?.name]);
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  res.json(await bossIdeas(String(req.body?.name ?? "")));
});

export default router;
