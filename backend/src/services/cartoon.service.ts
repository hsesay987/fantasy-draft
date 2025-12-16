import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

export type CartoonShowFilters = {
  q?: string;
  channel?: string | null;
  category?: string | null;
  ageRating?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  limit?: number;
  offset?: number;
};

export type CartoonCharacterFilters = {
  q?: string;
  showId?: string;
  gender?: string | null;
  isSuperhero?: boolean;
  ageRating?: string | null;
  channel?: string | null;
  fitTopPicEligible?: boolean;
  limit?: number;
  offset?: number;
};

export async function listShows(filters: CartoonShowFilters) {
  const where: Prisma.CartoonShowWhereInput = {};

  if (filters.q) {
    where.name = { contains: filters.q, mode: "insensitive" };
  }
  if (filters.channel) {
    where.channel = filters.channel as any;
  }
  if (filters.category) {
    where.category = filters.category as any;
  }
  if (filters.ageRating) {
    where.ageRating = filters.ageRating as any;
  }
  if (filters.yearFrom) {
    where.yearFrom = { gte: filters.yearFrom };
  }
  if (filters.yearTo) {
    where.OR = [
      { yearTo: { lte: filters.yearTo } },
      { yearTo: null },
    ];
  }

  return prisma.cartoonShow.findMany({
    where,
    orderBy: { name: "asc" },
    take: filters.limit ?? 50,
    skip: filters.offset ?? 0,
  });
}

export async function listCharacters(filters: CartoonCharacterFilters) {
  const where: Prisma.CartoonCharacterWhereInput = {};
  if (filters.q) {
    where.name = { contains: filters.q, mode: "insensitive" };
  }
  if (filters.gender) {
    where.gender = filters.gender as any;
  }
  if (filters.isSuperhero !== undefined) {
    where.isSuperhero = filters.isSuperhero;
  }
  if (filters.fitTopPicEligible !== undefined) {
    where.fitTopPicEligible = filters.fitTopPicEligible;
  }
  if (filters.showId) {
    where.showId = filters.showId;
  }

  const showFilter: Prisma.CartoonShowWhereInput = {};
  if (filters.channel) {
    showFilter.channel = filters.channel as any;
  }
  if (filters.ageRating) {
    showFilter.ageRating = filters.ageRating as any;
  }

  return prisma.cartoonCharacter.findMany({
    where: {
      ...where,
      show: Object.keys(showFilter).length ? showFilter : undefined,
    },
    include: { show: true },
    orderBy: { name: "asc" },
    take: filters.limit ?? 50,
    skip: filters.offset ?? 0,
  });
}

export async function reportCharacter(
  characterId: string,
  message?: string,
  userId?: string | null
) {
  const character = await prisma.cartoonCharacter.findUnique({
    where: { id: characterId },
    include: { show: true },
  });
  if (!character) {
    throw new Error("Character not found");
  }

  return prisma.feedback.create({
    data: {
      type: "cartoon_report",
      category: characterId,
      message:
        message ||
        `Report submitted for ${character.name} (${character.show?.name})`,
      userId: userId || undefined,
    },
  });
}

export async function updateCharacterEligibility(id: string, eligible: boolean) {
  return prisma.cartoonCharacter.update({
    where: { id },
    data: { fitTopPicEligible: eligible },
  });
}

export async function deleteCharacter(id: string) {
  await prisma.cartoonDraftPick.deleteMany({
    where: { characterId: id },
  });
  return prisma.cartoonCharacter.delete({ where: { id } });
}

export async function deleteShow(id: string) {
  await prisma.cartoonDraftPick.deleteMany({
    where: {
      OR: [{ showId: id }, { character: { showId: id } }],
    },
  });
  await prisma.cartoonCharacter.deleteMany({ where: { showId: id } });
  return prisma.cartoonShow.delete({ where: { id } });
}
