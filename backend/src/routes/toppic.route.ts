import { Router } from "express";
import { authRequired } from "../middleware/auth";
import {
  handlePromptDeck,
  handleReportPrompt,
  handleResponseCards,
  handleSetupTopPic,
} from "../controllers/toppic.controller";

const router = Router();

router.post("/setup", authRequired, handleSetupTopPic);
router.get("/prompts", handlePromptDeck);
router.get("/responses", authRequired, handleResponseCards);
router.post("/report", handleReportPrompt);

export default router;
