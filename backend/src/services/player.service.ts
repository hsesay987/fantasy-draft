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
};

// --- Team normalization -----------------------------------------------------
// Map Basketball-Reference historical codes → modern franchises.
function normalizeFranchise(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.toUpperCase();

  if (t === "TOT") return null; // multi-team season, not tied to 1 franchise

  switch (t) {
    // Warriors
    case "PHW": // Philadelphia Warriors
    case "SFW": // San Francisco Warriors
    case "GSW":
      return "GSW";

    // Pistons
    case "FTW": // Fort Wayne Pistons
    case "DET":
      return "DET";

    // Kings (Royals → Kings)
    case "ROC": // Rochester Royals
    case "CIN": // Cincinnati Royals
    case "KCO": // Kansas City-Omaha Kings
    case "KCK": // Kansas City Kings
    case "SAC":
      return "SAC";

    // 76ers (Syracuse Nationals)
    case "SYR":
    case "PHI":
      return "PHI";

    // Hawks (Tri-Cities / Milwaukee / St. Louis)
    case "TRI": // Tri-Cities Blackhawks
    case "MLH": // Milwaukee Hawks
    case "STL": // St. Louis Hawks
    case "ATL":
      return "ATL";

    // Bullets/Wizards
    case "CHP": // Chicago Packers
    case "CHZ": // Chicago Zephyrs
    case "BAL": // Baltimore Bullets
    case "CAP": // Capital Bullets
    case "WSB": // Washington Bullets
    case "WAS":
      return "WAS";

    // Rockets
    case "SDR": // San Diego Rockets
    case "HOU":
      return "HOU";

    // Clippers
    case "BUF": // Buffalo Braves
    case "SDC": // San Diego Clippers
    case "LAC":
      return "LAC";

    // Jazz
    case "NOJ": // New Orleans Jazz
    case "UTA":
      return "UTA";

    // Lakers (Minneapolis)
    case "MNL": // Minneapolis Lakers
    case "LAL":
      return "LAL";

    // Thunder (Sonics)
    case "SEA": // Seattle SuperSonics
    case "OKC":
      return "OKC";

    // Nets
    case "NYA":
    case "NYN":
    case "NJN":
    case "BRK":
    case "BKN":
      return "BKN";

    // Hornets / Bobcats (modern CHA)
    case "CHH": // original Charlotte Hornets
    case "CHA": // current Charlotte Hornets
    case "CHO": // alt code
      return "CHA";

    // Pelicans
    case "NOH": // New Orleans Hornets
    case "NOK": // NO/OKC Hornets
    case "NOP":
      return "NOP";

    // Grizzlies
    case "VAN": // Vancouver Grizzlies
    case "MEM":
      return "MEM";

    default:
      // For normal modern codes (BOS, NYK, CHI, etc.) just return uppercased
      return t;
  }
}

// Pick the best season for this player respecting era + team constraints.
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
  team?: string // modern team code
) {
  const targetTeamCode = team ? normalizeFranchise(team) : null;

  const candid = p.seasonStats.filter((s) => {
    // Era window
    if (eraFrom && s.season < eraFrom) return false;
    if (eraTo && s.season > eraTo) return false;

    // Team filter (modern franchise match)
    if (targetTeamCode) {
      const sCode = normalizeFranchise(s.team);
      if (!sCode || sCode !== targetTeamCode) return false;
    }

    return true;
  });

  // If team+era filter yields nothing, the player is invalid for this search.
  if (targetTeamCode && !candid.length) return null;

  const pool = candid.length ? candid : p.seasonStats;
  if (!pool.length) return null;

  // Highest PPG season as "best"
  return pool.reduce((best, s) => (!best || s.ppg > best.ppg ? s : best));
}

// --- Main search ------------------------------------------------------------

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

  const where: Prisma.PlayerWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(position ? { position } : {}),
    ...(multiTeamOnly ? { totalTeams: { gt: 1 } } : {}),
    ...(hallRule === "only"
      ? { isHallOfFamer: true }
      : hallRule === "none"
      ? { isHallOfFamer: false }
      : {}),
  };

  // Only restrict by season range in the DB; team filter is done in JS via normalizeFranchise
  const seasonWhere: Prisma.PlayerSeasonStatWhereInput = {
    ...(eraFrom || eraTo
      ? {
          season: {
            ...(eraFrom ? { gte: eraFrom } : {}),
            ...(eraTo ? { lte: eraTo } : {}),
          },
        }
      : {}),
  };

  const rawLimit = Math.max(limit, 1);
  const queryLimit = Math.min(rawLimit * 3, 300); // over-fetch a bit so team+era filter doesn't empty results

  const players = await prisma.player.findMany({
    where,
    include: {
      seasonStats: {
        where: seasonWhere,
      },
    },
    orderBy: {
      name: "asc",
    },
    skip: offset,
    take: queryLimit,
  });

  const results: {
    id: string;
    name: string;
    position: string;
    primaryTeam: string | null;
    primaryEraFrom: number | null;
    primaryEraTo: number | null;
    isHallOfFamer: boolean;
    totalTeams: number;
    heightInches: number;
    bestSeason: {
      season: number;
      team: string;
      ppg: number;
      apg: number;
      rpg: number;
    } | null;
  }[] = [];

  for (const p of players) {
    if (!p.seasonStats.length) continue;

    const best = pickBestSeasonForPlayer(
      p,
      eraFrom,
      eraTo,
      team // modern code from query
    );

    // If a team is specified and this player never matches that franchise in that era, skip.
    if (team && !best) continue;

    const bestSeason = best && {
      season: best.season,
      team: best.team,
      ppg: best.ppg,
      apg: best.apg,
      rpg: best.rpg,
    };

    results.push({
      id: p.id,
      name: p.name,
      position: p.position,
      primaryTeam: p.primaryTeam ?? null,
      primaryEraFrom: p.primaryEraFrom ?? null,
      primaryEraTo: p.primaryEraTo ?? null,
      isHallOfFamer: p.isHallOfFamer,
      totalTeams: p.totalTeams,
      heightInches: p.heightInches,
      bestSeason,
    });
  }

  return results.slice(0, rawLimit);
}

// import { Prisma } from "@prisma/client";
// import prisma from "../lib/prisma";

// type HallRule = "any" | "only" | "none";

// type SearchPlayersInput = {
//   q?: string;
//   position?: string;
//   eraFrom?: number;
//   eraTo?: number;
//   team?: string;
//   hallRule?: HallRule;
//   multiTeamOnly?: boolean;
//   limit?: number;
//   offset?: number;
// };

// const DEFAULT_LIMIT = 25;
// const MAX_LIMIT = 100;

// export async function searchPlayers(input: SearchPlayersInput) {
//   const {
//     q,
//     position,
//     eraFrom,
//     eraTo,
//     team,
//     hallRule = "any",
//     multiTeamOnly,
//     limit,
//     offset,
//   } = input;

//   const take = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
//   const skip = Math.max(offset ?? 0, 0);

//   const and: Prisma.PlayerWhereInput[] = [];

//   if (q) {
//     and.push({
//       OR: [
//         { name: { contains: q, mode: "insensitive" } },
//         { firstName: { contains: q, mode: "insensitive" } },
//         { lastName: { contains: q, mode: "insensitive" } },
//       ],
//     });
//   }

//   if (position) {
//     const pos = position.toUpperCase();
//     // Support combined positions like "PG-SG" by using contains
//     and.push({
//       OR: [
//         { position: pos },
//         { position: { contains: pos, mode: "insensitive" } },
//         { position: { startsWith: pos[0], mode: "insensitive" } },
//       ],
//     });
//   }

//   if (hallRule === "only") {
//     and.push({ isHallOfFamer: true });
//   } else if (hallRule === "none") {
//     and.push({ isHallOfFamer: false });
//   }

//   if (multiTeamOnly) {
//     and.push({ totalTeams: { gt: 1 } });
//   }

//   const gte = eraFrom ?? 0;
//   const lte = eraTo ?? 9999;

//   if (team) {
//     const t = team.toUpperCase();
//     and.push({
//       seasonStats: {
//         some: {
//           team: t,
//           season: {
//             gte,
//             lte,
//           },
//         },
//       },
//     });
//   } else if (eraFrom || eraTo) {
//     and.push({
//       seasonStats: {
//         some: {
//           season: {
//             gte,
//             lte,
//           },
//         },
//       },
//     });
//   }

//   const where: Prisma.PlayerWhereInput = and.length ? { AND: and } : {};

//   const players = await prisma.player.findMany({
//     where,
//     take,
//     skip,
//     orderBy: [
//       { isHallOfFamer: "desc" },
//       { primaryEraFrom: "desc" },
//       { name: "asc" },
//     ],
//     include: {
//       seasonStats: {
//         where: {
//           season: {
//             gte: eraFrom ?? 0,
//             lte: eraTo ?? 9999,
//           },
//         },
//         orderBy: { ppg: "desc" },
//         take: 1,
//         select: {
//           season: true,
//           team: true,
//           ppg: true,
//           apg: true,
//           rpg: true,
//         },
//       },
//     },
//   });

//   return players.map((p) => ({
//     id: p.id,
//     name: p.name,
//     position: p.position,
//     primaryTeam: p.primaryTeam,
//     primaryEraFrom: p.primaryEraFrom,
//     primaryEraTo: p.primaryEraTo,
//     isHallOfFamer: p.isHallOfFamer,
//     totalTeams: p.totalTeams,
//     bestSeason: p.seasonStats[0]
//       ? {
//           season: p.seasonStats[0].season,
//           team: p.seasonStats[0].team,
//           ppg: p.seasonStats[0].ppg,
//           apg: p.seasonStats[0].apg,
//           rpg: p.seasonStats[0].rpg,
//         }
//       : null,
//   }));
// }
