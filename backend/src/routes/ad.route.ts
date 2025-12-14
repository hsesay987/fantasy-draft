// backend/src/routes/ad.route.ts
import { Router } from "express";
import {
  adminList,
  listApproved,
  submitAd,
  updateStatus,
  telemetry,
} from "../controllers/communityAd.controller";
import { adminRequired, authRequired } from "../middleware/auth";

const router = Router();

router.get("/community", listApproved);
router.post("/community", authRequired, submitAd);

router.get("/community/admin", authRequired, adminRequired, adminList);
router.patch("/community/:id", authRequired, adminRequired, updateStatus);
router.post("/telemetry", telemetry);

export default router;
