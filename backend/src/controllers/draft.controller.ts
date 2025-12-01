// src/controllers/draft.controller.ts
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
  try {
    const pick = await DraftService.updatePick(req.params.id, {
      slot: Number(req.body.slot),
      playerId: req.body.playerId,
      position: req.body.position,
    });
    return res.json(pick);
  } catch (e: any) {
    console.error(e);
    return res
      .status(400)
      .json({ error: e.message || "Failed to update pick" });
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

// import { Request, Response } from "express";
// import * as DraftService from "../services/draft.service";

// // export async function listDrafts(req: Request, res: Response) {
// //   const drafts = await DraftService.listDrafts?.() ?? [];
// //   return res.json(drafts);
// // }

// export async function listDrafts(req: Request, res: Response) {
//   const drafts = await prisma.draft.findMany({
//     orderBy: { createdAt: "desc" },
//     take: 20,
//   });
//   return res.json(drafts);
// }

// export async function createDraft(req: Request, res: Response) {
//   const draft = await DraftService.createDraft(req.body);
//   return res.status(201).json(draft);
// }

// export async function getDraft(req: Request, res: Response) {
//   const draft = await DraftService.getDraft(req.params.id);
//   if (!draft) return res.status(404).json({ error: "Draft not found" });
//   return res.json(draft);
// }

// export async function updatePick(req: Request, res: Response) {
//   try {
//     const pick = await DraftService.updatePick(req.params.id, {
//       slot: req.body.slot,
//       playerId: req.body.playerId,
//       position: req.body.position,
//     });
//     return res.json(pick);
//   } catch (e: any) {
//     return res.status(400).json({ error: e.message });
//   }
// }

// export async function scoreDraft(req: Request, res: Response) {
//   try {
//     const result = await DraftService.scoreDraft(req.params.id);
//     return res.json(result);
//   } catch (e: any) {
//     return res.status(400).json({ error: e.message });
//   }
// }

// export async function voteDraft(req: Request, res: Response) {
//   try {
//     const value = Number(req.body.value ?? 1);
//     const vote = await DraftService.addVote(req.params.id, value);
//     return res.json(vote);
//   } catch (e: any) {
//     return res.status(400).json({ error: e.message });
//   }
// }
