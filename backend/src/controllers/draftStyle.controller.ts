import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";

async function isPremiumUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      isFounder: true,
      subscriptionTier: true,
      subscriptionEnds: true,
    },
  });
  if (!user) return false;
  return (
    user.isAdmin ||
    user.isFounder ||
    (!!user.subscriptionTier &&
      (!user.subscriptionEnds || user.subscriptionEnds.getTime() > Date.now()))
  );
}

export async function listStyles(req: AuthedRequest, res: Response) {
  const scope = (req.query.scope as string) || "community";
  if (scope === "mine") {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const styles = await prisma.draftStyle.findMany({
      where: { ownerId: req.userId },
      orderBy: { updatedAt: "desc" },
    });
    return res.json(styles);
  }

  // community
  const styles = await prisma.draftStyle.findMany({
    where: { visibility: "public" },
    orderBy: [
      { plays: "desc" },
      { thumbsUp: "desc" },
      { createdAt: "desc" },
    ],
    take: 50,
  });
  return res.json(styles);
}

export async function createStyle(req: AuthedRequest, res: Response) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const premium = await isPremiumUser(userId);
  if (!premium) {
    return res.status(403).json({ error: "Premium membership required" });
  }

  const { name, description, visibility = "private", settings } = req.body || {};
  if (!name || !settings) {
    return res.status(400).json({ error: "Name and settings are required" });
  }
  if (settings.mode === "classic") {
    return res
      .status(400)
      .json({ error: "Saving styles is only allowed for casual/free drafts" });
  }

  const style = await prisma.draftStyle.create({
    data: {
      ownerId: userId,
      name,
      description: description || null,
      visibility: visibility === "public" ? "public" : "private",
      settings,
    },
  });
  return res.status(201).json(style);
}

export async function thumbStyle(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const { value } = req.body || {};
  const delta =
    Number(value) === -1
      ? { thumbsDown: { increment: 1 } }
      : { thumbsUp: { increment: 1 } };

  const updated = await prisma.draftStyle.update({
    where: { id },
    data: delta,
  });
  return res.json(updated);
}

export async function markPlayed(req: Request, res: Response) {
  const { id } = req.params;
  const updated = await prisma.draftStyle.update({
    where: { id },
    data: { plays: { increment: 1 } },
  });
  return res.json(updated);
}
