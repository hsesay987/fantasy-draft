import { Response } from "express";
import prisma from "../lib/prisma";
import { AuthedRequest } from "../middleware/auth";

export async function getAdminStats(_req: AuthedRequest, res: Response) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalUsers, totalGames, gamesPlayedToday, totalFeedback, revenueAll] =
    await Promise.all([
      prisma.user.count(),
      prisma.game.count(),
      prisma.gameResult.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.feedback.count(),
      prisma.revenueEvent.groupBy({
        by: ["source"],
        _sum: { amountCents: true },
      }),
    ]);

  const stripeRevenue =
    revenueAll.find((r) => r.source === "stripe")?._sum.amountCents || 0;
  const adsenseRevenue =
    revenueAll.find((r) => r.source === "adsense")?._sum.amountCents || 0;

  res.json({
    stats: {
      totalUsers,
      totalGames,
      gamesPlayedToday,
      totalFeedback,
      stripeRevenue,
      adsenseRevenue,
    },
  });
}
