// src/routes/auth.route.ts
import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authRequired } from "../middleware/auth";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

// Password guessing and sign-up floods: 10 a minute per IP. Mail senders are tighter so nobody can spam an inbox.
const strict = rateLimit({ max: 10 });
const mail = rateLimit({ max: 3 });

router.post("/signup", strict, authController.signup);
router.post("/login", strict, authController.login);
router.get("/me", authController.me);
router.put("/me", authRequired, authController.updateProfile);
router.get("/verify", authController.verifyEmail);
router.post("/forgot-password", mail, authController.forgotPassword);
router.post("/reset-password", strict, authController.resetPassword);
router.post("/google", strict, authController.googleAuth);
router.post(
  "/resend-verification",
  mail,
  authController.resendVerification
);
router.post(
  "/change-password",
  authRequired,
  authController.changePassword
);

export default router;
