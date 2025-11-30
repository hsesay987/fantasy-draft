import { Request, Response } from "express";
import prisma from "../lib/prisma";
import * as DraftService from "../services/draft.service";

export async function listDrafts(req: Request, res: Response) {
  const drafts = await prisma.draft.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return res.json(drafts);
}

export async function createDraft(req: Request, res: Response) {
  const draft = await DraftService.createDraft(req.body);
  return res.status(201).json(draft);
}

export async function getDraft(req: Request, res: Response) {
  const draft = await DraftService.getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  return res.json(draft);
}

export async function updatePick(req: Request, res: Response) {
  const pick = await DraftService.updatePick(req.params.id, req.body);
  return res.json(pick);
}

export async function scoreDraft(req: Request, res: Response) {
  try {
    const result = await DraftService.getDraftScore(req.params.id);
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
