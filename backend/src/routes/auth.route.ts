// src/routes/auth.route.ts
import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authRequired } from "../middleware/auth";

const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/me", authController.me);
router.put("/me", authRequired, authController.updateProfile);
router.get("/verify", authController.verifyEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/google", authController.googleAuth);
router.post(
  "/resend-verification",
  authController.resendVerification
);
router.post(
  "/change-password",
  authRequired,
  authController.changePassword
);

export default router;
