import { Router } from "express";
import { authOptional } from "../middleware/auth";
import * as CartoonController from "../controllers/cartoon.controller";

const router = Router();

router.get("/shows", CartoonController.listShows);
router.get("/characters", CartoonController.listCharacters);
router.post(
  "/characters/:id/report",
  authOptional,
  CartoonController.reportCharacter
);

export default router;
