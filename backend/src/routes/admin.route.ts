import { Router } from "express";
import { getAdminStats } from "../controllers/admin.controller";
import {
  deleteFeedback,
  listFeedback,
} from "../controllers/feedback.controller";
import { adminRequired, authRequired } from "../middleware/auth";

const router = Router();

// All admin routes require authentication + admin flag
router.use(authRequired, adminRequired);

router.get("/stats", getAdminStats);
router.get("/feedback", listFeedback);
router.delete("/feedback/:id", deleteFeedback);

export default router;
