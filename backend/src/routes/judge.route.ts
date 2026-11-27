import { Router } from "express";
import { AuthedRequest } from "../middleware/auth";
import { moderate } from "../lib/moderation";
import { bossIdeas, judge } from "../services/judge.service";
import { writeStory } from "../services/story.service";

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

// The play-by-play under a draft result. 204 when there is no story (no AI, budget spent, or a reply that failed the checks).
router.post("/story", async (req: AuthedRequest, res) => {
  if (limited(req.userId ?? req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const b = req.body;
  if (!b?.scenario || !Array.isArray(b?.teams) || !b?.verdict?.winner || !Array.isArray(b?.verdict?.teams)) return res.status(400).json({ error: "scenario, teams and verdict are required" });
  const teams = b.teams.slice(0, 12).map((t: any) => ({ player: String(t?.player ?? "").slice(0, 40), items: (Array.isArray(t?.items) ? t.items : []).slice(0, 12).map((i: any) => ({
    name: String(i?.name ?? "").slice(0, 80),
    ...(i?.role ? { role: String(i.role).slice(0, 30) } : {}),
    ...(i?.archetype ? { archetype: String(i.archetype).slice(0, 40) } : {}),
    ...(i?.universe ? { universe: String(i.universe).slice(0, 40) } : {}),
    ...(i?.stats && typeof i.stats === "object" ? { stats: Object.fromEntries(Object.entries(i.stats).slice(0, 8).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [String(k).slice(0, 24), Math.round(Number(v))])) } : {}),
  })) }));
  const mod = await moderate([b.scenario?.title, b.scenario?.blurb, ...teams.flatMap((t: any) => [t.player, ...t.items.flatMap((i: any) => [i.name, i.archetype, i.universe])])].filter(Boolean));
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const story = await writeStory({ scenario: { title: String(b.scenario.title ?? "").slice(0, 80), blurb: String(b.scenario.blurb ?? "").slice(0, 200) }, teams, verdict: { winner: String(b.verdict.winner).slice(0, 40), teams: b.verdict.teams.slice(0, 12), statsTable: Array.isArray(b.verdict.statsTable) ? b.verdict.statsTable.slice(0, 8) : [] } });
  if (!story) return res.status(204).end();
  res.json(story);
});

router.post("/boss", async (req: AuthedRequest, res) => {
  if (limited(req.userId ?? req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const mod = await moderate([req.body?.name]);
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  res.json(await bossIdeas(String(req.body?.name ?? "")));
});

export default router;
