// src/routes/draft.route.ts
import { Router } from "express";
import { authRequired, AuthedRequest } from "../middleware/auth";
import * as DraftController from "../controllers/draft.controller";
import * as draftService from "../services/draft.service";
import prisma from "../lib/prisma";

const router = Router();

router.get("/", DraftController.listDrafts);
router.get("/:id", DraftController.getDraft);
router.post("/", DraftController.createDraft);
router.get("/my", authRequired, DraftController.getMyDrafts);
router.patch("/:id", DraftController.updatePick);
router.post("/:id/save", authRequired, async (req: AuthedRequest, res) => {
  try {
    const draftId = req.params.id;
    const userId = req.userId!;

    const draft = await prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.ownerId && draft.ownerId !== userId) {
      return res
        .status(403)
        .json({ error: "Only the owner can save this draft" });
    }

    // If draft has no owner but user is logged in, claim ownership
    if (!draft.ownerId) {
      await prisma.draft.update({
        where: { id: draftId },
        data: { ownerId: userId },
      });
    }

    const updated = await draftService.saveDraftState(
      draftId,
      req.body.savedState || {},
      (req.body.status as any) || "saved"
    );

    res.json(updated);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to save draft" });
  }
});
router.get("/:id/suggestions", DraftController.getDraftSuggestions);
router.get("/:id/score", DraftController.scoreDraft);
router.delete("/:id/picks/:slot", DraftController.undoPick);
router.delete("/:id", DraftController.cancelDraft);
router.post("/:id/vote", DraftController.voteDraft);

export default router;
