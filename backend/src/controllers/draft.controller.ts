// src/controllers/draft.controller.ts
import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";
import * as DraftService from "../services/draft.service";

export async function listDrafts(req: Request, res: Response) {
  const drafts = await prisma.draft.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return res.json(drafts);
}

export async function createDraft(req: AuthedRequest, res: Response) {
  const ownerId = req.userId ?? null;

  const league = (req.body?.league || "NBA").toUpperCase();
  const rules = req.body?.rules;

  if (league === "NFL" && (!rules?.lineup || !rules.lineup.length)) {
    return res.status(400).json({
      error: "NFL drafts require a lineup definition",
    });
  }

  try {
    const draft = await DraftService.createDraft(req.body, ownerId);
    res.status(201).json(draft);
  } catch (e: any) {
    console.error(e);
    const message = e?.message || "Failed to create draft";
    const status = message.toLowerCase().includes("premium") ? 403 : 500;
    res.status(status).json({ error: message });
  }
}

export async function getDraft(req: Request, res: Response) {
  const draft = await DraftService.getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  return res.json(draft);
}

export async function cancelDraft(req: Request, res: Response) {
  try {
    const result = await DraftService.cancelDraft(req.params.id);
    return res.json(result);
  } catch (e: any) {
    console.error(e);
    return res
      .status(400)
      .json({ error: e.message || "Failed to cancel draft" });
  }
}

export async function saveDraft(req: Request, res: Response) {
  try {
    const { savedState, status } = req.body || {};
    const draft = await DraftService.saveDraftState(
      req.params.id,
      savedState ?? {},
      status
    );
    return res.json(draft);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message || "Failed to save draft" });
  }
}

export async function updatePick(req: AuthedRequest, res: Response) {
  const draftId = req.params.id;
  const {
    slot,
    playerId,
    position,
    teamLandedOn,
    eraFrom,
    eraTo,
    cartoonShowId,
    cartoonCharacterId,
  } = req.body;
  const userId = req.userId || null;

  try {
    const pick = await DraftService.updatePick(draftId, {
      slot,
      playerId,
      position,
      userId,
      teamOverride: teamLandedOn,
      eraFromOverride: eraFrom,
      eraToOverride: eraTo,
      cartoonShowId,
      cartoonCharacterId,
    });
    res.json(pick);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Pick failed" });
  }
}

export async function undoPick(req: Request, res: Response) {
  try {
    const slot = Number(req.params.slot);
    const draft = await DraftService.undoPick(req.params.id, slot);
    return res.json(draft);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message || "Failed to undo pick" });
  }
}

export async function scoreDraft(req: Request, res: Response) {
  try {
    const result = await DraftService.scoreDraft(req.params.id);
    return res.json(result);
  } catch (e: any) {
    console.error(e);
    return res
      .status(400)
      .json({ error: e.message || "Failed to score draft" });
  }
}

export async function voteDraft(req: Request, res: Response) {
  try {
    const { value = 1 } = req.body;
    const vote = await DraftService.addVote(req.params.id, Number(value) || 1);
    return res.json(vote);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message || "Failed to vote" });
  }
}

export async function getDraftSuggestions(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit) || 5;
    const suggestions = await DraftService.getDraftSuggestions(
      req.params.id,
      limit
    );
    return res.json(suggestions);
  } catch (e: any) {
    console.error(e);
    return res
      .status(400)
      .json({ error: e.message || "Failed to get suggestions" });
  }
}

export async function getMyDrafts(req: AuthedRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const drafts = await DraftService.getDraftsByOwner(userId);
  res.json(drafts);
}
