// src/services/player.service.ts
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

export type HallRule = "any" | "only" | "none";

export type SearchPlayersInput = {
  q?: string;
  position?: string;
  eraFrom?: number;
  eraTo?: number;
  team?: string; // modern code like BOS, GSW, SAC, OKC, etc.
  hallRule?: HallRule;
  multiTeamOnly?: boolean;
  limit?: number;
  offset?: number;
  eligiblePositions?: string; // NEW: filter by eligiblePositions text search
  imaegeUrl?: string; // NEW: filter by imageUrl presence
};

/* -------------------------------------------------------
   TEAM NORMALIZATION (historical → modern franchises)
------------------------------------------------------- */
function normalizeFranchise(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.toUpperCase();

  if (t === "TOT") return null;

  switch (t) {
    case "PHW":
    case "SFW":
    case "GSW":
      return "GSW";

    case "FTW":
    case "DET":
      return "DET";

    case "ROC":
    case "CIN":
    case "KCO":
    case "KCK":
    case "SAC":
      return "SAC";

    case "SYR":
    case "PHI":
      return "PHI";

    case "TRI":
    case "MLH":
    case "STL":
    case "ATL":
      return "ATL";

    case "CHP":
    case "CHZ":
    case "BAL":
    case "CAP":
    case "WSB":
    case "WAS":
      return "WAS";

    case "SDR":
    case "HOU":
      return "HOU";

    case "BUF":
    case "SDC":
    case "LAC":
      return "LAC";

    case "NOJ":
    case "UTA":
      return "UTA";

    case "MNL":
    case "LAL":
      return "LAL";

    case "SEA":
    case "OKC":
      return "OKC";

    case "NYA":
    case "NYN":
    case "NJN":
    case "BRK":
    case "BKN":
      return "BKN";

    case "CHH":
    case "CHO":
    case "CHA":
      return "CHA";

    case "NOH":
    case "NOK":
    case "NOP":
      return "NOP";

    case "VAN":
    case "MEM":
      return "MEM";

    default:
      return t;
  }
}

/* -------------------------------------------------------
   PICK BEST SEASON BASED ON ERA + TEAM
------------------------------------------------------- */
function pickBestSeasonForPlayer(
  p: {
    seasonStats: {
      season: number;
      team: string;
      ppg: number;
      apg: number;
      rpg: number;
    }[];
  },
  eraFrom?: number,
  eraTo?: number,
  team?: string
) {
  const targetTeam = team ? normalizeFranchise(team) : null;
  const eraFromInclusive = eraFrom ? eraFrom - 1 : undefined; // allow prior season (e.g., 2009-10 counts for 2010)

  const candid = p.seasonStats.filter((s) => {
    if (eraFromInclusive && s.season < eraFromInclusive) return false;
    if (eraTo && s.season > eraTo) return false;

    if (targetTeam) {
      const sCode = normalizeFranchise(s.team);
      if (!sCode || sCode !== targetTeam) return false;
    }
    return true;
  });

  if (targetTeam && !candid.length) return null;

  const pool = candid.length ? candid : p.seasonStats;
  if (!pool.length) return null;

  return pool.reduce((best, s) => (!best || s.ppg > best.ppg ? s : best));
}

/* -------------------------------------------------------
   MAIN SEARCH (with full type-safety)
------------------------------------------------------- */
export async function searchPlayers(input: SearchPlayersInput) {
  const {
    q,
    position,
    eraFrom,
    eraTo,
    team,
    hallRule = "any",
    multiTeamOnly,
    limit = 50,
    offset = 0,
  } = input;

  const andFilters: Prisma.NBAPlayerWhereInput[] = [];

  if (q) {
    andFilters.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (position) {
    const pos = position.toUpperCase();

    let positionSet: string[] = [pos];

    if (pos === "PG" || pos === "SG") {
      positionSet = ["PG", "SG", "G", "G-F", "F-G"];
    } else if (pos === "SF" || pos === "PF") {
      positionSet = ["SF", "PF", "F", "F-C", "C-F", "F-G", "G-F"];
    } else if (pos === "C") {
      positionSet = ["C", "C-F", "F-C"];
    }

    andFilters.push({
      OR: [
        { position: { in: positionSet } },
        { eligiblePositions: { contains: pos, mode: "insensitive" } },
      ],
    });
  }

  if (multiTeamOnly) {
    andFilters.push({ totalTeams: { gt: 1 } });
  }

  if (hallRule === "only") {
    andFilters.push({ isHallOfFamer: true });
  } else if (hallRule === "none") {
    andFilters.push({ isHallOfFamer: false });
  }

  const where: Prisma.NBAPlayerWhereInput = andFilters.length
    ? { AND: andFilters }
    : {};

  // Only restrict by season range inside the JOIN
  const eraFromInclusive = eraFrom ? eraFrom - 1 : undefined;
  const seasonWhere: Prisma.NBAPlayerSeasonStatWhereInput =
    eraFromInclusive || eraTo
      ? {
          season: {
            ...(eraFromInclusive ? { gte: eraFromInclusive } : {}),
            ...(eraTo ? { lte: eraTo } : {}),
          },
        }
      : {};

  const rawLimit = Math.max(limit, 1);
  const queryLimit = Math.min(rawLimit * 3, 300);

  const players = await prisma.nBAPlayer.findMany({
    where,
    include: {
      seasonStats: {
        where: seasonWhere,
      },
    },
    orderBy: { name: "asc" },
    skip: offset,
    take: queryLimit,
  });

  /* --------------------------------------------
     POST-PROCESS RESULTS (team + era filter)
  -------------------------------------------- */
  const results = [];

  for (const p of players) {
    if (!p.seasonStats.length) continue;

    const best = pickBestSeasonForPlayer(p, eraFrom, eraTo, team);

    if (team && !best) continue;

    results.push({
      id: p.id,
      name: p.name,
      position: p.position,
      eligiblePositions: p.eligiblePositions,
      imageUrl: p.imageUrl,
      primaryTeam: p.primaryTeam,
      primaryEraFrom: p.primaryEraFrom,
      primaryEraTo: p.primaryEraTo,
      isHallOfFamer: p.isHallOfFamer,
      totalTeams: p.totalTeams,
      heightInches: p.heightInches,
      bestSeason: best
        ? {
            season: best.season,
            team: best.team,
            ppg: best.ppg,
            apg: best.apg,
            rpg: best.rpg,
          }
        : null,
    });
  }

  return results.slice(0, rawLimit);
}
