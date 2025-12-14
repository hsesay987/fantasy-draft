import { Response } from "express";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";

const FEEDBACK_TYPES = new Set(["feedback", "bug"]);

export async function submitFeedback(req: AuthedRequest, res: Response) {
  const { type, category, message, url } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  const normalizedType = FEEDBACK_TYPES.has(type) ? type : "feedback";

  const feedback = await prisma.feedback.create({
    data: {
      userId: req.userId ?? null,
      type: normalizedType,
      category: category || null,
      message: message.slice(0, 2000),
      url: url || null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null,
    },
  });

  return res.status(201).json({ feedback });
}

export async function listFeedback(_req: AuthedRequest, res: Response) {
  const feedback = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.json({ feedback });
}

export async function deleteFeedback(req: AuthedRequest, res: Response) {
  const { id } = req.params;

  if (!id) return res.status(400).json({ error: "Missing feedback id" });

  try {
    await prisma.feedback.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete feedback", err);
    res.status(404).json({ error: "Feedback not found" });
  }
}
