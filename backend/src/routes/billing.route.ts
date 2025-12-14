// backend/src/routes/billing.route.ts
import { Router } from "express";
import {
  createCheckoutSession,
  createPortalSession,
  getStatus,
  webhook,
} from "../controllers/billing.controller";
import { authRequired } from "../middleware/auth";

const router = Router();

router.get("/status", authRequired, getStatus);
router.post("/checkout", authRequired, createCheckoutSession);
router.post("/portal", authRequired, createPortalSession);
router.post("/webhook", webhook);

export default router;
