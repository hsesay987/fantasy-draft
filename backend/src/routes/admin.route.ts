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

export default router;
