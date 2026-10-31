import { Router } from "express";
import { getAdminStats } from "../controllers/admin.controller";
import {
  deleteFeedback,
  listFeedback,
} from "../controllers/feedback.controller";
import {
  removeCharacter,
  removeShow,
  setCharacterEligibility,
} from "../controllers/cartoon.controller";
import { adminRequired, authRequired } from "../middleware/auth";
import { parseRating, prismaRatingStore, recordAdminRating, reviewItems, setFlaggedById, setRetiredById } from "../services/triviaRatings.service";

const router = Router();

// All admin routes require authentication + admin flag
router.use(authRequired, adminRequired);

router.get("/stats", getAdminStats);
router.get("/feedback", listFeedback);
router.delete("/feedback/:id", deleteFeedback);
router.patch(
  "/cartoons/characters/:id/eligibility",
  setCharacterEligibility
);
router.delete("/cartoons/characters/:id", removeCharacter);
router.delete("/cartoons/shows/:id", removeShow);

/** Trivia for review: players' votes next to the admin's own. Filter by topic, status or text; unrated items can be included. */
router.get("/trivia/review", async (req: any, res) => {
  const q = req.query;
  const status = ["retired", "flagged", "all"].includes(q.status) ? q.status : "active";
  const items = await reviewItems({
    kind: q.kind === "survey" ? "survey" : "category",
    sort: q.sort === "best" ? "best" : q.sort === "votes" ? "votes" : "worst",
    status, unrated: q.unrated === "1",
    pool: typeof q.pool === "string" && q.pool ? q.pool.slice(0, 40) : undefined,
    search: typeof q.search === "string" ? q.search.slice(0, 80) : undefined,
    limit: Math.min(200, Number(q.limit) || 100), adminId: req.userId,
  });
  res.json({ items });
});

/** The admin's own rating of a category, clue or survey. Marking the answer wrong takes the item out of play at once. */
router.post("/trivia/rate", async (req: any, res) => {
  const r = parseRating({ ...req.body, voter: "admin-placeholder" });
  if (!r) return res.status(400).json({ error: "Not a valid rating" });
  const { voter: _voter, ...rest } = r;
  res.json(await recordAdminRating(prismaRatingStore, req.userId, rest));
});

/** Mark an item for review (or clear the mark) without taking it out of play. */
router.post("/trivia/flag", async (req, res) => {
  const kind = req.body?.kind === "survey" ? "survey" : req.body?.kind === "category" ? "category" : null;
  if (!kind || typeof req.body?.id !== "string") return res.status(400).json({ error: "kind and id are required" });
  await setFlaggedById(kind, req.body.id, req.body.flagged === true);
  res.json({ ok: true });
});

/** Take an item out of play, or put it back. */
router.post("/trivia/retire", async (req, res) => {
  const kind = req.body?.kind === "survey" ? "survey" : req.body?.kind === "category" ? "category" : null;
  if (!kind || typeof req.body?.id !== "string") return res.status(400).json({ error: "kind and id are required" });
  await setRetiredById(kind, req.body.id, req.body.retired === true);
  res.json({ ok: true });
});

export default router;
