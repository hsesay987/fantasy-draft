// src/routes/auth.route.ts
import { Router } from "express";
import * as authController from "../controllers/auth.controller";

const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/me", authController.me);
router.get("/verify", authController.verifyEmail);

export default router;
