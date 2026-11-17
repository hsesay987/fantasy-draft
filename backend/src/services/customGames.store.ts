// Postgres storage for custom games (see customGames.service.ts for the rules).
import prisma from "../lib/prisma";
import type { CustomStore, Row } from "./customGames.service";

const withAuthor = { author: { select: { name: true } } } as const;
const row = (g: any): Row => ({ ...g, authorName: g.author?.name ?? null });

export const prismaCustomStore: CustomStore = {
  create: async (data) => row(await prisma.customGame.create({ data: { ...data, content: data.content as object }, include: withAuthor })),
  update: async (id, patch) => row(await prisma.customGame.update({ where: { id }, data: { ...(patch as object), ...(patch.content === undefined ? {} : { content: patch.content as object }) }, include: withAuthor })),
  byId: async (id) => { const g = await prisma.customGame.findUnique({ where: { id }, include: withAuthor }); return g ? row(g) : null; },
  bySlug: async (slug) => { const g = await prisma.customGame.findUnique({ where: { slug }, include: withAuthor }); return g ? row(g) : null; },
  byAuthor: async (authorId) => (await prisma.customGame.findMany({ where: { authorId }, orderBy: { updatedAt: "desc" }, include: withAuthor })).map(row),
  countByAuthor: (authorId) => prisma.customGame.count({ where: { authorId, status: { not: "removed" } } }),
  list: async ({ kind, sort, q, skip, take, hideReportedAt }) =>
    (await prisma.customGame.findMany({
      where: { status: "published", visibility: "public", reports: { lt: hideReportedAt }, ...(kind ? { kind } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: sort === "new" ? [{ publishedAt: "desc" }] : sort === "top" ? [{ likes: "desc" }, { plays: "desc" }] : [{ plays: "desc" }, { publishedAt: "desc" }],
      skip, take, include: withAuthor,
    })).map(row),
  addPlay: async (id) => { await prisma.customGame.update({ where: { id }, data: { plays: { increment: 1 } } }); },
  // The totals are recounted from the votes inside one transaction, so they cannot drift from the rows.
  rate: (id, voter, value) =>
    prisma.$transaction(async (tx) => {
      await tx.customGameRating.upsert({ where: { gameId_voter: { gameId: id, voter } }, create: { gameId: id, voter, value }, update: { value } });
      const [likes, dislikes] = await Promise.all([tx.customGameRating.count({ where: { gameId: id, value: 1 } }), tx.customGameRating.count({ where: { gameId: id, value: -1 } })]);
      await tx.customGame.update({ where: { id }, data: { likes, dislikes } });
      return { likes, dislikes };
    }),
  report: (id, reporter, reason) =>
    prisma.$transaction(async (tx) => {
      if (await tx.customGameReport.findUnique({ where: { gameId_reporter: { gameId: id, reporter } } })) return false;
      await tx.customGameReport.create({ data: { gameId: id, reporter, reason } });
      await tx.customGame.update({ where: { id }, data: { reports: { increment: 1 } } });
      return true;
    }),
  reported: async (min) => (await prisma.customGame.findMany({ where: { reports: { gte: min }, status: { not: "removed" } }, orderBy: { reports: "desc" }, take: 100, include: withAuthor })).map(row),
};
