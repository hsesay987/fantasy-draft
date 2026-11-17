// Custom mode: write your own version of a game, publish it, and let anyone play it.
import { Router, type Response } from "express";
import { captureError } from "../lib/monitoring";
import { moderate } from "../lib/moderation";
import { rateLimit } from "../lib/rateLimit";
import { adminRequired, authRequired, type AuthedRequest } from "../middleware/auth";
import * as C from "../services/customGames.service";
import { prismaCustomStore as store } from "../services/customGames.store";

const router = Router();
const reads = rateLimit({ max: 120 });
const writes = rateLimit({ max: 30 });
const votes = rateLimit({ max: 40 });

/** Run a service call and send its result; service failures carry their own status and message. */
async function send(res: Response, where: string, run: () => Promise<{ ok: true } | C.Fail | object>) {
  try {
    const r = (await run()) as { ok?: boolean; status?: number; error?: string; errors?: string[] };
    if (r.ok === false) return res.status(r.status ?? 400).json({ error: r.error, errors: r.errors });
    res.json(r);
  } catch (e) {
    captureError(e, { where });
    res.status(500).json({ error: "Something went wrong on our side. Try again." });
  }
}

router.get("/", reads, (req, res) => send(res, "custom_browse", () => C.browse(store, req.query as Record<string, unknown>)));
router.get("/mine", authRequired, (req: AuthedRequest, res) => send(res, "custom_mine", async () => ({ games: await C.mine(store, req.userId!) })));
router.get("/reported", authRequired, adminRequired, (_req, res) => send(res, "custom_reported", async () => ({ games: (await store.reported(1)).map((r) => ({ ...C.card(r), id: r.id, reports: r.reports })) })));
router.get("/:slug", reads, (req: AuthedRequest, res) => send(res, "custom_open", () => C.open(store, req.params.slug, req.userId)));

router.post("/", writes, authRequired, (req: AuthedRequest, res) => send(res, "custom_create", () => C.save(store, req.userId!, req.body)));
router.put("/:id", writes, authRequired, (req: AuthedRequest, res) => send(res, "custom_save", () => C.save(store, req.userId!, req.body, req.params.id)));
router.post("/:id/publish", writes, authRequired, (req: AuthedRequest, res) => send(res, "custom_publish", () => C.publish(store, moderate, req.userId!, req.params.id, req.body?.visibility)));
router.post("/:id/unpublish", writes, authRequired, (req: AuthedRequest, res) => send(res, "custom_unpublish", () => C.unpublish(store, req.userId!, req.params.id)));
router.delete("/:id", writes, authRequired, (req: AuthedRequest, res) => send(res, "custom_delete", () => C.remove(store, req.userId!, req.params.id)));
router.delete("/:id/admin", authRequired, adminRequired, (req: AuthedRequest, res) => send(res, "custom_admin_delete", () => C.remove(store, req.userId!, req.params.id, true)));

router.post("/:slug/play", votes, (req, res) => send(res, "custom_play", () => C.played(store, req.params.slug)));
router.post("/:slug/rate", votes, (req: AuthedRequest, res) => send(res, "custom_rate", () => C.rate(store, req.params.slug, req.userId ?? req.body?.voter, req.body?.value)));
router.post("/:slug/report", votes, (req: AuthedRequest, res) => send(res, "custom_report", () => C.report(store, req.params.slug, req.userId ?? req.body?.voter, req.body?.reason)));

export default router;
