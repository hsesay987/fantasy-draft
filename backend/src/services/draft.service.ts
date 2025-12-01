// src/services/draft.service.ts
import prisma from "../lib/prisma";
import {
  scoreNbaPlayer,
  NbaStatLine,
  NbaEraContext,
  TeamFitContext,
  NbaPosition,
} from "../lib/scoring/nba";

export type DraftRules = {
  hallRule?: "any" | "only" | "none";
  maxPpgCap?: number | null;
  overallCap?: number | null;
  multiTeamOnly?: boolean;
  playedWithPlayerId?: string | null;
  peakMode?: "peak" | "average";

  participants?: number; // 1–5
  playersPerTeam?: number; // 5–12

  // timer + autopick
  pickTimerSeconds?: number | null;
  autoPickEnabled?: boolean;

  // allow re-spin before pick? (for casual/creative)
  allowRespinsWithoutPick?: boolean;
};

export interface ScoreResponse {
  draftId: string;
  teamScore: number;
  avgScore: number;
  totalPpg: number;
  perPlayerScores: {
    pickId: string;
    playerId: string;
    name: string;
    position: NbaPosition;
    seasonUsed?: number;
    ppg: number;
    score: number;
    slot?: number;
    ownerIndex?: number;
    threeRate?: number | null;
    heightInches?: number;
  }[];
  teams?: {
    participant: number;
    teamScore: number;
    totalPpg: number;
    totalRating: number;
    picks: ScoreResponse["perPlayerScores"];
  }[];
  winner?: number;
  ruleWarnings: string[];
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function jsonSafe<T>(obj: T): T {
  // ensure prisma Json accepts this safely
  return JSON.parse(JSON.stringify(obj));
}

function getParticipantsAndPlayersPerTeam(draft: any, rules: DraftRules) {
  const participants = rules.participants || draft.participants || 1;
  const playersPerTeam =
    rules.playersPerTeam && rules.playersPerTeam > 0
      ? rules.playersPerTeam
      : draft.playersPerTeam;

  return { participants, playersPerTeam };
}

function chooseSeasonForScoring(
  player: any,
  rules: DraftRules,
  era: NbaEraContext
): { statLine: NbaStatLine; seasonUsed?: number } | null {
  const stats = player.seasonStats || [];
  if (!stats.length) return null;

  const filtered =
    era.eraFrom || era.eraTo
      ? stats.filter((s: any) => {
          if (era.eraFrom && s.season < era.eraFrom) return false;
          if (era.eraTo && s.season > era.eraTo) return false;
          return true;
        })
      : stats;

  const pool = filtered.length ? filtered : stats;

  if (rules.peakMode === "average") {
    const n = pool.length;
    const agg = pool.reduce(
      (acc: any, s: any) => {
        acc.ppg += s.ppg;
        acc.apg += s.apg;
        acc.rpg += s.rpg;
        acc.spg += s.spg;
        acc.bpg += s.bpg;
        acc.tsPct += s.tsPct ?? 0;
        acc.threeRate += s.threeRate ?? 0;
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

    return {
      statLine: {
        ppg: agg.ppg / n,
        apg: agg.apg / n,
        rpg: agg.rpg / n,
        spg: agg.spg / n,
        bpg: agg.bpg / n,
        tsPct: agg.tsPct / n,
        threeRate: agg.threeRate / n,
      },
      seasonUsed: undefined,
    };
  }

  // peak mode: pick highest PPG season
  const best = pool.reduce((a: any, b: any) => (a.ppg > b.ppg ? a : b));

  return {
    statLine: {
      ppg: best.ppg,
      apg: best.apg,
      rpg: best.rpg,
      spg: best.spg,
      bpg: best.bpg,
      tsPct: best.tsPct,
      threeRate: best.threeRate,
    },
    seasonUsed: best.season,
  };
}

// ---------------------------------------------------------------------
// CREATE DRAFT
// ---------------------------------------------------------------------

export async function createDraft(data: any) {
  const rules: DraftRules = data.rules || {};
  const rulesJson = jsonSafe(rules);

  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    { participants: rules.participants, playersPerTeam: rules.playersPerTeam },
    rules
  );

  return prisma.draft.create({
    data: {
      title: data.title || null,
      league: data.league,
      mode: data.mode, // "default" | "casual" | "free"
      randomEra: data.randomEra,
      eraFrom: data.eraFrom ?? null,
      eraTo: data.eraTo ?? null,
      randomTeam: data.randomTeam,
      teamConstraint: data.teamConstraint ?? null,
      maxPlayers: data.maxPlayers,
      requirePositions: data.requirePositions,
      scoringMethod: data.scoringMethod, // "system" | "user" | "public"
      rules: rulesJson,
      participants,
      playersPerTeam,
    },
  });
}

// ---------------------------------------------------------------------
// GET DRAFT
// ---------------------------------------------------------------------

export async function getDraft(id: string) {
  return prisma.draft.findUnique({
    where: { id },
    include: {
      picks: {
        include: {
          player: { include: { seasonStats: true } },
        },
        orderBy: { slot: "asc" },
      },
      votes: true,
    },
  });
}

// ---------------------------------------------------------------------
// UPDATE PICK — enforce turn order & no overwrite
// ---------------------------------------------------------------------

export async function updatePick(
  draftId: string,
  data: { slot: number; playerId: string; position: string }
) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { picks: true },
  });
  if (!draft) throw new Error("Draft not found");

  const rules = (draft.rules || {}) as DraftRules;
  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    draft,
    rules
  );

  // Turn logic: P1, P2, ... PN, P1, ...
  const totalPicks = draft.picks.length;
  const activeParticipant =
    totalPicks < draft.maxPlayers ? (totalPicks % participants) + 1 : undefined;

  if (!activeParticipant) {
    throw new Error("Draft is already full");
  }

  // Slot must belong to the active participant
  const slotParticipant = Math.floor((data.slot - 1) / playersPerTeam) + 1;
  if (slotParticipant !== activeParticipant) {
    throw new Error(
      `It's Player ${activeParticipant}'s turn. You cannot pick in Player ${slotParticipant}'s slot.`
    );
  }

  // Does this slot already have a pick?
  const existing = await prisma.draftPick.findUnique({
    where: {
      draftId_slot: {
        draftId,
        slot: data.slot,
      },
    },
  });

  if (existing && existing.playerId !== data.playerId) {
    // force Undo if they want to change
    throw new Error("Slot already filled. Undo this pick before changing it.");
  }

  if (!existing) {
    return prisma.draftPick.create({
      data: {
        draftId,
        slot: data.slot,
        playerId: data.playerId,
        position: data.position,
        ownerIndex: activeParticipant,
      },
    });
  }

  // Update (only allowed if same player, e.g. changing position)
  return prisma.draftPick.update({
    where: {
      draftId_slot: {
        draftId,
        slot: data.slot,
      },
    },
    data: {
      playerId: data.playerId,
      position: data.position,
      ownerIndex: activeParticipant,
    },
  });
}

// ---------------------------------------------------------------------
// UNDO PICK — clear slot
// ---------------------------------------------------------------------

export async function undoPick(draftId: string, slot: number) {
  await prisma.draftPick.delete({
    where: {
      draftId_slot: {
        draftId,
        slot,
      },
    },
  });
  return getDraft(draftId);
}

// ---------------------------------------------------------------------
// SCORE DRAFT
// ---------------------------------------------------------------------

export async function scoreDraft(draftId: string): Promise<ScoreResponse> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Draft not found");

  const rules = (draft.rules || {}) as DraftRules;
  const eraCtx: NbaEraContext = {
    eraFrom: draft.eraFrom ?? undefined,
    eraTo: draft.eraTo ?? undefined,
  };

  const ruleWarnings = new Set<string>();
  const { participants } = getParticipantsAndPlayersPerTeam(draft, rules);

  const perPickBase = draft.picks.map((p: any) =>
    chooseSeasonForScoring(p.player, rules, eraCtx)
  );

  // group picks into teams by ownerIndex
  const teamsMap = new Map<
    number,
    {
      heights: number[];
      shooters: number;
      picks: ScoreResponse["perPlayerScores"];
    }
  >();

  draft.picks.forEach((pick: any, idx: number) => {
    const choice = perPickBase[idx];
    if (!choice) return;

    const ownerIndex = pick.ownerIndex || ((pick.slot - 1) % participants) + 1;
    const team = teamsMap.get(ownerIndex) || {
      heights: [],
      shooters: 0,
      picks: [],
    };

    const base = choice.statLine;
    const rawPos = pick.position as string;
    const pos: NbaPosition =
      rawPos === "PG" ||
      rawPos === "SG" ||
      rawPos === "SF" ||
      rawPos === "PF" ||
      rawPos === "C"
        ? rawPos
        : "SF";

    const heightInches = pick.player.heightInches ?? 78;
    const threeRate = base.threeRate ?? 0;

    team.heights.push(heightInches);
    if (threeRate >= 0.33) team.shooters++;

    team.picks.push({
      pickId: pick.id,
      playerId: pick.player.id,
      name: pick.player.name,
      position: pos,
      seasonUsed: choice.seasonUsed,
      ppg: base.ppg,
      score: 0,
      slot: pick.slot,
      ownerIndex,
      threeRate,
      heightInches,
    });

    teamsMap.set(ownerIndex, team);
  });

  const perPlayerScores: ScoreResponse["perPlayerScores"] = [];
  const teams: ScoreResponse["teams"] = [];

  let totalScore = 0;
  let totalPpg = 0;

  for (const [ownerIndex, t] of teamsMap.entries()) {
    let teamScore = 0;
    let teamPpg = 0;
    let teamRating = 0;

    for (const p of t.picks) {
      const stat: NbaStatLine = {
        ppg: p.ppg,
        apg: 0,
        rpg: 0,
        spg: 0,
        bpg: 0,
        tsPct: undefined,
        threeRate: p.threeRate ?? 0,
      };

      const fit: TeamFitContext = {
        position: p.position,
        heightInches: p.heightInches ?? 78,
        teamHeights: t.heights,
        teamShooters: t.shooters,
      };

      const score = scoreNbaPlayer(stat, p.position, eraCtx, fit);

      const withScore = { ...p, score };
      perPlayerScores.push(withScore);

      teamScore += score;
      teamPpg += p.ppg;
      teamRating += score;
    }

    totalScore += teamScore;
    totalPpg += teamPpg;

    teams.push({
      participant: ownerIndex,
      teamScore,
      totalPpg: teamPpg,
      totalRating: teamRating,
      picks: t.picks.map(
        (p) => perPlayerScores.find((s) => s.pickId === p.pickId)!
      ),
    });
  }

  // PPG / rating caps — ONLY MAX caps
  const maxPpgCap = rules.maxPpgCap ?? null;
  const maxOverallCap = rules.overallCap ?? null;

  if (teams && teams.length) {
    for (const t of teams) {
      if (maxPpgCap && t.totalPpg > maxPpgCap) {
        ruleWarnings.add(
          `Player ${t.participant} exceeds team PPG cap (${t.totalPpg.toFixed(
            1
          )} > ${maxPpgCap}).`
        );
      }

      if (maxOverallCap && t.totalRating > maxOverallCap) {
        ruleWarnings.add(
          `Player ${
            t.participant
          } exceeds team rating cap (${t.totalRating.toFixed(
            1
          )} > ${maxOverallCap}).`
        );
      }
    }
  }

  const winner =
    teams.length > 1
      ? teams.reduce((best, t) => (t.teamScore > best.teamScore ? t : best))
          .participant
      : undefined;

  return {
    draftId,
    teamScore: totalScore,
    avgScore: totalScore / (perPlayerScores.length || 1),
    totalPpg,
    perPlayerScores,
    teams,
    winner,
    ruleWarnings: [...ruleWarnings],
  };
}

export async function getDraftScore(draftId: string) {
  return scoreDraft(draftId);
}

// ---------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------

export async function addVote(draftId: string, value: number) {
  return prisma.vote.create({
    data: { draftId, value },
  });
}

// // src/services/draft.service.ts
// import prisma from "../lib/prisma";
// import {
//   scoreNbaPlayer,
//   NbaStatLine,
//   NbaEraContext,
//   TeamFitContext,
//   NbaPosition,
// } from "../lib/scoring/nba";

// export type DraftRules = {
//   hallRule?: "any" | "only" | "none";
//   maxPpgCap?: number | null;
//   overallCap?: number | null;
//   multiTeamOnly?: boolean;
//   playedWithPlayerId?: string | null;
//   peakMode?: "peak" | "average";

//   participants?: number;
//   playersPerTeam?: number;

//   // timer + autopick
//   pickTimerSeconds?: number | null;
//   autoPickEnabled?: boolean;

//   // allow re-spin before pick? (for casual/creative)
//   allowRespinsWithoutPick?: boolean;
// };

// export interface ScoreResponse {
//   draftId: string;
//   teamScore: number;
//   avgScore: number;
//   totalPpg: number;
//   perPlayerScores: {
//     pickId: string;
//     playerId: string;
//     name: string;
//     position: NbaPosition;
//     seasonUsed?: number;
//     ppg: number;
//     score: number;
//     slot?: number;
//     ownerIndex?: number;
//     threeRate?: number | null;
//     heightInches?: number;
//   }[];
//   teams?: {
//     participant: number;
//     teamScore: number;
//     totalPpg: number;
//     totalRating: number;
//     picks: ScoreResponse["perPlayerScores"];
//   }[];
//   winner?: number;
//   ruleWarnings: string[];
// }

// // ---------------------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------------------

// function jsonSafe<T>(obj: T): T {
//   // ensure prisma Json accepts this safely
//   return JSON.parse(JSON.stringify(obj));
// }

// function getParticipantsAndPlayersPerTeam(draft: any, rules: DraftRules) {
//   const participants = rules.participants || draft.participants || 1;
//   const playersPerTeam =
//     rules.playersPerTeam && rules.playersPerTeam > 0
//       ? rules.playersPerTeam
//       : draft.playersPerTeam;

//   return { participants, playersPerTeam };
// }

// function chooseSeasonForScoring(
//   player: any,
//   rules: DraftRules,
//   era: NbaEraContext
// ): { statLine: NbaStatLine; seasonUsed?: number } | null {
//   const stats = player.seasonStats || [];
//   if (!stats.length) return null;

//   const filtered =
//     era.eraFrom || era.eraTo
//       ? stats.filter((s: any) => {
//           if (era.eraFrom && s.season < era.eraFrom) return false;
//           if (era.eraTo && s.season > era.eraTo) return false;
//           return true;
//         })
//       : stats;

//   const pool = filtered.length ? filtered : stats;

//   if (rules.peakMode === "average") {
//     const n = pool.length;
//     const agg = pool.reduce(
//       (acc: any, s: any) => {
//         acc.ppg += s.ppg;
//         acc.apg += s.apg;
//         acc.rpg += s.rpg;
//         acc.spg += s.spg;
//         acc.bpg += s.bpg;
//         acc.tsPct += s.tsPct ?? 0;
//         acc.threeRate += s.threeRate ?? 0;
//         return acc;
//       },
//       {
//         ppg: 0,
//         apg: 0,
//         rpg: 0,
//         spg: 0,
//         bpg: 0,
//         tsPct: 0,
//         threeRate: 0,
//       }
//     );

//     return {
//       statLine: {
//         ppg: agg.ppg / n,
//         apg: agg.apg / n,
//         rpg: agg.rpg / n,
//         spg: agg.spg / n,
//         bpg: agg.bpg / n,
//         tsPct: agg.tsPct / n,
//         threeRate: agg.threeRate / n,
//       },
//       seasonUsed: undefined,
//     };
//   }

//   // peak mode: pick highest PPG season
//   const best = pool.reduce((a: any, b: any) => (a.ppg > b.ppg ? a : b));

//   return {
//     statLine: {
//       ppg: best.ppg,
//       apg: best.apg,
//       rpg: best.rpg,
//       spg: best.spg,
//       bpg: best.bpg,
//       tsPct: best.tsPct,
//       threeRate: best.threeRate,
//     },
//     seasonUsed: best.season,
//   };
// }

// // ---------------------------------------------------------------------
// // CREATE DRAFT
// // ---------------------------------------------------------------------

// export async function createDraft(data: any) {
//   const rules: DraftRules = data.rules || {};
//   const rulesJson = jsonSafe(rules);

//   const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
//     { participants: rules.participants, playersPerTeam: rules.playersPerTeam },
//     rules
//   );

//   return prisma.draft.create({
//     data: {
//       title: data.title || null,
//       league: data.league,
//       mode: data.mode, // "default" | "casual" | "free"
//       randomEra: data.randomEra,
//       eraFrom: data.eraFrom ?? null,
//       eraTo: data.eraTo ?? null,
//       randomTeam: data.randomTeam,
//       teamConstraint: data.teamConstraint ?? null,
//       maxPlayers: data.maxPlayers,
//       requirePositions: data.requirePositions,
//       scoringMethod: data.scoringMethod, // "system" | "user" | "public"
//       rules: rulesJson,
//       participants,
//       playersPerTeam,
//     },
//   });
// }

// // ---------------------------------------------------------------------
// // GET DRAFT
// // ---------------------------------------------------------------------

// export async function getDraft(id: string) {
//   return prisma.draft.findUnique({
//     where: { id },
//     include: {
//       picks: {
//         include: {
//           player: { include: { seasonStats: true } },
//         },
//         orderBy: { slot: "asc" },
//       },
//       votes: true,
//     },
//   });
// }

// // ---------------------------------------------------------------------
// // UPDATE PICK — no overwriting a different player
// // ---------------------------------------------------------------------

// export async function updatePick(
//   draftId: string,
//   data: { slot: number; playerId: string; position: string }
// ) {
//   const draft = await prisma.draft.findUnique({ where: { id: draftId } });
//   if (!draft) throw new Error("Draft not found");

//   const rules = (draft.rules || {}) as DraftRules;
//   const { participants } = getParticipantsAndPlayersPerTeam(draft, rules);

//   // TURN LOGIC: slot 1->P1, 2->P2,..., N->PN, N+1->P1 etc.
//   const ownerIndex = ((data.slot - 1) % participants) + 1;

//   const existing = await prisma.draftPick.findUnique({
//     where: {
//       draftId_slot: {
//         draftId,
//         slot: data.slot,
//       },
//     },
//   });

//   if (existing && existing.playerId !== data.playerId) {
//     // force Undo if they want to change a filled slot
//     throw new Error("Slot already filled. Undo this pick before changing it.");
//   }

//   if (!existing) {
//     return prisma.draftPick.create({
//       data: {
//         draftId,
//         slot: data.slot,
//         playerId: data.playerId,
//         position: data.position,
//         ownerIndex,
//       },
//     });
//   }

//   // Update same slot/player (or position tweak)
//   return prisma.draftPick.update({
//     where: {
//       draftId_slot: {
//         draftId,
//         slot: data.slot,
//       },
//     },
//     data: {
//       playerId: data.playerId,
//       position: data.position,
//       ownerIndex,
//     },
//   });
// }

// // ---------------------------------------------------------------------
// // UNDO PICK — clear slot
// // ---------------------------------------------------------------------

// export async function undoPick(draftId: string, slot: number) {
//   await prisma.draftPick.delete({
//     where: {
//       draftId_slot: {
//         draftId,
//         slot,
//       },
//     },
//   });
//   return getDraft(draftId);
// }

// // ---------------------------------------------------------------------
// // SCORE DRAFT
// // ---------------------------------------------------------------------

// export async function scoreDraft(draftId: string): Promise<ScoreResponse> {
//   const draft = await getDraft(draftId);
//   if (!draft) throw new Error("Draft not found");

//   const rules = (draft.rules || {}) as DraftRules;
//   const eraCtx: NbaEraContext = {
//     eraFrom: draft.eraFrom ?? undefined,
//     eraTo: draft.eraTo ?? undefined,
//   };

//   const ruleWarnings = new Set<string>();
//   const { participants } = getParticipantsAndPlayersPerTeam(draft, rules);

//   const perPickBase = draft.picks.map((p: any) =>
//     chooseSeasonForScoring(p.player, rules, eraCtx)
//   );

//   // group picks into teams by ownerIndex
//   const teamsMap = new Map<
//     number,
//     {
//       heights: number[];
//       shooters: number;
//       picks: ScoreResponse["perPlayerScores"];
//     }
//   >();

//   draft.picks.forEach((pick: any, idx: number) => {
//     const choice = perPickBase[idx];
//     if (!choice) return;

//     const ownerIndex = pick.ownerIndex || ((pick.slot - 1) % participants) + 1;
//     const team = teamsMap.get(ownerIndex) || {
//       heights: [],
//       shooters: 0,
//       picks: [],
//     };

//     const base = choice.statLine;
//     const rawPos = pick.position as string;
//     const pos: NbaPosition =
//       rawPos === "PG" ||
//       rawPos === "SG" ||
//       rawPos === "SF" ||
//       rawPos === "PF" ||
//       rawPos === "C"
//         ? rawPos
//         : "SF";

//     const heightInches = pick.player.heightInches ?? 78;
//     const threeRate = base.threeRate ?? 0;

//     team.heights.push(heightInches);
//     if (threeRate >= 0.33) team.shooters++;

//     team.picks.push({
//       pickId: pick.id,
//       playerId: pick.player.id,
//       name: pick.player.name,
//       position: pos,
//       seasonUsed: choice.seasonUsed,
//       ppg: base.ppg,
//       score: 0,
//       slot: pick.slot,
//       ownerIndex,
//       threeRate,
//       heightInches,
//     });

//     teamsMap.set(ownerIndex, team);
//   });

//   const perPlayerScores: ScoreResponse["perPlayerScores"] = [];
//   const teams: ScoreResponse["teams"] = [];

//   let totalScore = 0;
//   let totalPpg = 0;

//   for (const [ownerIndex, t] of teamsMap.entries()) {
//     let teamScore = 0;
//     let teamPpg = 0;
//     let teamRating = 0;

//     for (const p of t.picks) {
//       const stat: NbaStatLine = {
//         ppg: p.ppg,
//         apg: 0,
//         rpg: 0,
//         spg: 0,
//         bpg: 0,
//         tsPct: undefined,
//         threeRate: p.threeRate ?? 0,
//       };

//       const fit: TeamFitContext = {
//         position: p.position,
//         heightInches: p.heightInches ?? 78,
//         teamHeights: t.heights,
//         teamShooters: t.shooters,
//       };

//       const score = scoreNbaPlayer(stat, p.position, eraCtx, fit);

//       const withScore = { ...p, score };
//       perPlayerScores.push(withScore);

//       teamScore += score;
//       teamPpg += p.ppg;
//       teamRating += score;
//     }

//     totalScore += teamScore;
//     totalPpg += teamPpg;

//     teams.push({
//       participant: ownerIndex,
//       teamScore,
//       totalPpg: teamPpg,
//       totalRating: teamRating,
//       picks: t.picks.map(
//         (p) => perPlayerScores.find((s) => s.pickId === p.pickId)!
//       ),
//     });
//   }

//   // PPG / rating caps
//   // Only MAX caps matter; minimum values are NOT enforced.
//   const maxPpgCap = rules.maxPpgCap ?? null;
//   const maxOverallCap = rules.overallCap ?? null;

//   if (teams && teams.length) {
//     for (const t of teams) {
//       if (maxPpgCap && t.totalPpg > maxPpgCap) {
//         ruleWarnings.add(
//           `Player ${t.participant} exceeds team PPG cap (${t.totalPpg.toFixed(
//             1
//           )} > ${maxPpgCap}).`
//         );
//       }

//       if (maxOverallCap && t.totalRating > maxOverallCap) {
//         ruleWarnings.add(
//           `Player ${
//             t.participant
//           } exceeds team rating cap (${t.totalRating.toFixed(
//             1
//           )} > ${maxOverallCap}).`
//         );
//       }
//     }
//   }

//   const winner =
//     teams.length > 1
//       ? teams.reduce((best, t) => (t.teamScore > best.teamScore ? t : best))
//           .participant
//       : undefined;

//   return {
//     draftId,
//     teamScore: totalScore,
//     avgScore: totalScore / (perPlayerScores.length || 1),
//     totalPpg,
//     perPlayerScores,
//     teams,
//     winner,
//     ruleWarnings: [...ruleWarnings],
//   };
// }

// export async function getDraftScore(draftId: string) {
//   return scoreDraft(draftId);
// }

// // ---------------------------------------------------------------------
// // Votes
// // ---------------------------------------------------------------------

// export async function addVote(draftId: string, value: number) {
//   return prisma.vote.create({
//     data: { draftId, value },
//   });
// }
