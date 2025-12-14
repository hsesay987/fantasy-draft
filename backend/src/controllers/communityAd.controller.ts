// backend/src/controllers/communityAd.controller.ts
import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";

export async function submitAd(req: AuthedRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ error: "Login required" });

  const { title, body, imageUrl, targetUrl, category, placement } = req.body;
  if (!title || !targetUrl) {
    return res.status(400).json({ error: "Title and target URL are required" });
  }

  const ad = await prisma.communityAd.create({
    data: {
      title,
      body,
      imageUrl,
      targetUrl,
      category,
      placement: placement || "rail",
      status: "pending",
      submittedById: req.userId,
    },
  });

  return res.status(201).json({ ad, message: "Ad submitted for review." });
}

export async function listApproved(req: Request, res: Response) {
  const placement = (req.query.placement as string) || undefined;
  const now = new Date();

  const ads = await prisma.communityAd.findMany({
    where: {
      status: "approved",
      placement: placement || undefined,
      OR: [
        { startsAt: null, endsAt: null },
        {
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return res.json({ ads });
}

export async function adminList(_req: AuthedRequest, res: Response) {
  const ads = await prisma.communityAd.findMany({
    orderBy: { createdAt: "desc" },
    include: { submittedBy: { select: { email: true, id: true } } },
  });
  return res.json({ ads });
}

export async function updateStatus(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!status || !["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const ad = await prisma.communityAd.update({
    where: { id },
    data: { status },
  });

  return res.json({ ad });
}

export async function telemetry(req: Request, res: Response) {
  const { type, placement, amountCents, userId } = req.body as {
    type?: string;
    placement?: string;
    amountCents?: number;
    userId?: string;
  };

  if (!type) return res.status(400).json({ error: "Missing telemetry type" });

  await prisma.revenueEvent.create({
    data: {
      source: "adsense",
      type,
      amountCents: amountCents || 0,
      currency: "usd",
      metadata: { placement },
      userId: userId || undefined,
    },
  });

  res.json({ ok: true });
}
