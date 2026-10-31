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
import { reviewItems, setRetiredById } from "../services/triviaRatings.service";

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

/** Rated trivia, worst first, so an admin can decide what to keep. */
router.get("/trivia/review", async (req, res) => {
  const kind = req.query.kind === "survey" ? "survey" : "category";
  const sort = req.query.sort === "best" ? "best" : req.query.sort === "votes" ? "votes" : "worst";
  const pool = typeof req.query.pool === "string" && req.query.pool ? req.query.pool.slice(0, 40) : undefined;
  const items = await reviewItems({ pool, kind, sort, retired: req.query.retired === "1", limit: Math.min(200, Number(req.query.limit) || 100) });
  res.json({ items });
});

/** Take an item out of play, or put it back. */
router.post("/trivia/retire", async (req, res) => {
  const kind = req.body?.kind === "survey" ? "survey" : req.body?.kind === "category" ? "category" : null;
  if (!kind || typeof req.body?.id !== "string") return res.status(400).json({ error: "kind and id are required" });
  await setRetiredById(kind, req.body.id, req.body.retired === true);
  res.json({ ok: true });
});

export default router;
