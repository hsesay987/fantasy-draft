// src/routes/draft.route.ts
import { Router } from "express";
import * as DraftController from "../controllers/draft.controller";

const router = Router();

router.get("/", DraftController.listDrafts);
router.post("/", DraftController.createDraft);
router.get("/:id", DraftController.getDraft);
router.patch("/:id", DraftController.updatePick);
router.post("/:id/save", DraftController.saveDraft);
router.get("/:id/suggestions", DraftController.getDraftSuggestions);
router.get("/:id/score", DraftController.scoreDraft);
router.delete("/:id/picks/:slot", DraftController.undoPick);
router.delete("/:id", DraftController.cancelDraft);
router.post("/:id/vote", DraftController.voteDraft);

export default router;
