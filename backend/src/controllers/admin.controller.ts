import { Response } from "express";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";

export async function getAdminStats(_req: AuthedRequest, res: Response) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalUsers, totalGames, gamesPlayedToday, totalFeedback] =
    await Promise.all([
      prisma.user.count(),
      prisma.game.count(),
      prisma.gameResult.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.feedback.count(),
    ]);

  res.json({
    stats: {
      totalUsers,
      totalGames,
      gamesPlayedToday,
      totalFeedback,
    },
  });
}
