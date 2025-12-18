// src/routes/draft.route.ts
import { Router } from "express";
import { authOptional, authRequired, AuthedRequest } from "../middleware/auth";
import * as DraftController from "../controllers/draft.controller";
import * as draftService from "../services/draft.service";
import prisma from "../lib/prisma";
import * as DraftStyleController from "../controllers/draftStyle.controller";

const router = Router();

router.get("/", DraftController.listDrafts);
router.get("/my", authRequired, DraftController.getMyDrafts);
router.get("/styles", authOptional, DraftStyleController.listStyles);
router.get("/:id", DraftController.getDraft);
// use authOptional so NFL drafts can verify premium access when a token is sent
router.post("/", authOptional, DraftController.createDraft);
router.post("/styles", authRequired, DraftStyleController.createStyle);
router.post("/styles/:id/thumb", authOptional, DraftStyleController.thumbStyle);
router.post("/styles/:id/play", DraftStyleController.markPlayed);
router.patch("/:id", authRequired, DraftController.updatePick);
router.post("/:id/save", authRequired, async (req: AuthedRequest, res) => {
  try {
    const draftId = req.params.id;
    const userId = req.userId!;

    const draft = await prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    if (draft.ownerId && draft.ownerId !== userId) {
      const rules = (draft.rules || {}) as any;
      const seatAssignments: string[] | undefined = rules.seatAssignments;
      const isOnlineParticipant =
        rules.online &&
        seatAssignments &&
        seatAssignments.length &&
        seatAssignments.includes(userId);
      if (!isOnlineParticipant) {
        return res
          .status(403)
          .json({ error: "Only the owner can save this draft" });
      }
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
