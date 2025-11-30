import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { scoreNbaPlayer } from "../lib/scoring/nba";

type HallRule = "any" | "only" | "none";
type PeakMode = "peak" | "average";

interface DraftRules {
  maxPpgCap?: number | null;
  overallCap?: number | null;
  hallRule?: HallRule;
  multiTeamOnly?: boolean;
  playedWithPlayerId?: string | null;
  peakMode?: PeakMode;
}

type CreateDraftInput = {
  title?: string;
  league?: string;
  mode?: string;
  rules?: Prisma.InputJsonValue;
  randomEra?: boolean;
  eraFrom?: number;
  eraTo?: number;
  randomTeam?: boolean;
  teamConstraint?: string | null;
  maxPlayers?: number;
  requirePositions?: boolean;
  scoringMethod?: string;
};

export async function createDraft(data: CreateDraftInput) {
  const {
    randomEra,
    eraFrom,
    eraTo,
    league,
    mode,
    rules,
    title,
    randomTeam,
    teamConstraint,
    maxPlayers,
    requirePositions,
    scoringMethod,
  } = data;

  let finalEraFrom = eraFrom;
  let finalEraTo = eraTo;

  if (randomEra && (!eraFrom || !eraTo)) {
    const decades = [
      [1960, 1969],
      [1970, 1979],
      [1980, 1989],
      [1990, 1999],
      [2000, 2009],
      [2010, 2019],
    ];
    const choice = decades[Math.floor(Math.random() * decades.length)];
    finalEraFrom = choice[0];
    finalEraTo = choice[1];
  }

  const draft = await prisma.draft.create({
    data: {
      title,
      league: league ?? "NBA",
      mode: mode ?? "standard",
      rules: rules ?? {},
      randomEra: randomEra ?? true,
      eraFrom: finalEraFrom,
      eraTo: finalEraTo,
      randomTeam: randomTeam ?? true,
      teamConstraint: teamConstraint ?? null,
      maxPlayers: maxPlayers ?? 5,
      requirePositions: requirePositions ?? true,
      scoringMethod: scoringMethod ?? "system",
    },
  });

  return draft;
}

export async function getDraft(id: string) {
  return prisma.draft.findUnique({
    where: { id },
    include: {
      picks: {
        include: { player: true },
        orderBy: { slot: "asc" },
      },
    },
  });
}

export async function updatePick(
  draftId: string,
  data: { slot: any; playerId: any; position: any }
) {
  const { slot, playerId, position } = data;

  const draft = await prisma.draft.findUnique({ where: { id: draftId } });

  if (!draft) throw new Error("Draft not found");

  // Enforce lineup size
  if (slot < 1 || slot > draft.maxPlayers)
    throw new Error("Slot exceeds lineup");

  // Upsert
  const existing = await prisma.draftPick.findFirst({
    where: { draftId, slot },
  });

  if (existing) {
    return prisma.draftPick.update({
      where: { id: existing.id },
      data: { playerId, position },
    });
  } else {
    return prisma.draftPick.create({
      data: { draftId, slot, playerId, position },
    });
  }
}

export async function getDraftScore(draftId: string) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      picks: {
        include: {
          player: {
            include: { seasonStats: true },
          },
        },
      },
    },
  });

  if (!draft) throw new Error("Draft not found");

  const rules = (draft.rules || {}) as DraftRules;
  const eraFrom = draft.eraFrom ?? 1980;
  const eraTo = draft.eraTo ?? 2024;
  const peakMode: PeakMode = rules.peakMode || "peak";

  // Basic team context for fit
  const teamHeights = draft.picks.map((p) => p.player.heightInches);
  const teamShooters = draft.picks.filter((p) =>
    ["SG", "SF"].includes(p.position)
  ).length;

  let teamScore = 0;
  let totalPpg = 0;

  const perPlayerScores: {
    pickId: string;
    playerId: string;
    name: string;
    position: string;
    seasonUsed?: number;
    ppg: number;
    score: number;
  }[] = [];

  for (const pick of draft.picks) {
    // Filter seasons in era
    const seasonsInEra = pick.player.seasonStats.filter(
      (s) => s.season >= eraFrom && s.season <= eraTo
    );

    if (!seasonsInEra.length) continue;

    let seasonStat;

    if (peakMode === "peak") {
      seasonStat = seasonsInEra.reduce((best, s) =>
        s.ppg > best.ppg ? s : best
      );
    } else {
      // approximate average by simple mean
      const avg = seasonsInEra.reduce(
        (acc, s) => {
          acc.ppg += s.ppg;
          acc.apg += s.apg;
          acc.rpg += s.rpg;
          acc.spg += s.spg;
          acc.bpg += s.bpg;
          acc.tsPct += s.tsPct || 0;
          acc.threeRate += s.threeRate || 0;
          return acc;
        },
        {
          ppg: 0,
          apg: 0,
          rpg: 0,
          spg: 0,
          bpg: 0,
          tsPct: 0,
          threeRate: 0,
        }
      );
      const n = seasonsInEra.length;
      seasonStat = {
        ...seasonsInEra[0],
        ppg: avg.ppg / n,
        apg: avg.apg / n,
        rpg: avg.rpg / n,
        spg: avg.spg / n,
        bpg: avg.bpg / n,
        tsPct: avg.tsPct / n,
        threeRate: avg.threeRate / n,
      };
    }

    const score = scoreNbaPlayer(
      {
        ppg: seasonStat.ppg,
        apg: seasonStat.apg,
        rpg: seasonStat.rpg,
        spg: seasonStat.spg,
        bpg: seasonStat.bpg,
        tsPct: seasonStat.tsPct,
        threeRate: seasonStat.threeRate,
      },
      pick.position as any,
      { eraFrom, eraTo },
      {
        position: pick.position as any,
        heightInches: pick.player.heightInches,
        teamHeights,
        teamShooters,
      }
    );

    teamScore += score;
    totalPpg += seasonStat.ppg;

    perPlayerScores.push({
      pickId: pick.id,
      playerId: pick.playerId,
      name: pick.player.name,
      position: pick.position,
      seasonUsed: seasonStat.season,
      ppg: seasonStat.ppg,
      score,
    });
  }

  const avgScore = draft.picks.length ? teamScore / draft.picks.length : 0;

  // Rule check summary (we don't block here, just report)
  const ruleWarnings: string[] = [];

  if (rules.maxPpgCap && totalPpg > rules.maxPpgCap) {
    ruleWarnings.push(
      `Max PPG cap ${rules.maxPpgCap} exceeded: team PPG = ${totalPpg.toFixed(
        1
      )}`
    );
  }

  if (rules.overallCap && avgScore > rules.overallCap) {
    ruleWarnings.push(
      `Overall rating cap ${
        rules.overallCap
      } exceeded: team avg = ${avgScore.toFixed(1)}`
    );
  }

  // HOF rule
  if (rules.hallRule === "none") {
    const hofGuys = draft.picks.filter((p) => p.player.isHallOfFamer);
    if (hofGuys.length) {
      ruleWarnings.push("Hall-of-Famers not allowed, but present on roster.");
    }
  } else if (rules.hallRule === "only") {
    const nonHof = draft.picks.filter((p) => !p.player.isHallOfFamer);
    if (nonHof.length) {
      ruleWarnings.push(
        "Only Hall-of-Famers allowed, but non-HOF players present."
      );
    }
  }

  // multi-team rule
  if (rules.multiTeamOnly) {
    const violators = draft.picks.filter((p) => p.player.totalTeams <= 1);
    if (violators.length) {
      ruleWarnings.push(
        "Multi-team rule: some players have only 1 team in their career."
      );
    }
  }

  // played-with rule (rough: check overlapping team+season)
  if (rules.playedWithPlayerId) {
    const starId = rules.playedWithPlayerId;
    const starSeasons = await prisma.playerSeasonStat.findMany({
      where: { playerId: starId },
    });

    const teamSeasonSet = new Set(
      starSeasons.map((s) => `${s.team}_${s.season}`)
    );

    const notTeammates = [];
    for (const pick of draft.picks) {
      if (pick.playerId === starId) continue;
      const seasons = await prisma.playerSeasonStat.findMany({
        where: { playerId: pick.playerId },
      });
      const everTeammate = seasons.some((s) =>
        teamSeasonSet.has(`${s.team}_${s.season}`)
      );
      if (!everTeammate) notTeammates.push(pick.player.name);
    }

    if (notTeammates.length) {
      ruleWarnings.push(
        `Played-with rule: some players never overlapped with required player (${notTeammates.join(
          ", "
        )}).`
      );
    }
  }

  return {
    draftId,
    teamScore,
    avgScore,
    totalPpg,
    perPlayerScores,
    ruleWarnings,
  };
}
// export async function getDraftScore(id: string) {
//   const draft = await prisma.draft.findUnique({
//     where: { id },
//     include: {
//       picks: {
//         include: { player: true },
//       },
//     },
//   });

//   if (!draft) throw new Error("Not found");

//   // compute team-wide context once
//   const heights = draft.picks.map(
//     (p: { player: { heightInches: any } }) => p.player.heightInches
//   );
//   const shooters = draft.picks.filter(
//     (p: { player: { position: string } }) =>
//       p.player.position === "SG" || p.player.position === "SF"
//   ).length;

//   // scoring by season stats — pseudocode until data wired:
//   let teamScore = 0;

//   for (const p of draft.picks) {
//     const stat = await prisma.playerSeasonStat.findFirst({
//       where: {
//         playerId: p.playerId,
//         season: { gte: draft.eraFrom!, lte: draft.eraTo! }, // pick best year in era?
//       },
//       orderBy: {
//         ppg: "desc", // best scoring season in era
//       },
//     });

//     if (!stat) continue;

//     const score = scoreNbaPlayer(
//       {
//         ppg: stat.ppg,
//         apg: stat.apg,
//         rpg: stat.rpg,
//         spg: stat.spg,
//         bpg: stat.bpg,
//         tsPct: stat.tsPct,
//         threeRate: stat.threeRate,
//       },
//       p.position as any,
//       {
//         eraFrom: draft.eraFrom,
//         eraTo: draft.eraTo,
//       },
//       {
//         position: p.position as any,
//         heightInches: p.player.heightInches,
//         teamHeights: heights,
//         teamShooters: shooters,
//       }
//     );

//     teamScore += score;
//   }

//   return {
//     teamScore,
//     avgScore: teamScore / draft.picks.length,
//   };
// }

export async function addVote(draftId: string, value: number) {
  return prisma.vote.create({
    data: {
      draftId,
      value,
    },
  });
}
