// src/services/draft.service.ts
import prisma from "../lib/prisma";
import {
  scoreNbaPlayer,
  NbaStatLine,
  NbaEraContext,
  TeamFitContext,
  NbaPosition,
} from "../lib/scoring/nba";

/* -------------------------------------------------------------------------- */
/*                               NORMALIZE TEAM                               */
/* -------------------------------------------------------------------------- */

function normalizeFranchise(team: string) {
  const map: Record<string, string> = {
    // Lakers
    LAL: "LAL",
    MIN: "LAL",
    MNL: "LAL",

    // Warriors
    GSW: "GSW",
    PHW: "GSW",
    SFW: "GSW",

    // Kings
    SAC: "SAC",
    KCO: "SAC",
    KCK: "SAC",
    ROC: "SAC",

    // Nets
    BKN: "BKN",
    NJN: "BKN",
    NYA: "BKN",

    // Clippers
    LAC: "LAC",
    SDC: "LAC",

    // Hawks
    ATL: "ATL",
    STB: "ATL",
    MLI: "ATL",

    // Wizards
    WAS: "WAS",
    BAL: "WAS",
    CHI: "WAS",
    WSB: "WAS",

    // Thunder
    OKC: "OKC",
    SEA: "OKC",

    // Pelicans
    NOP: "NOP",
    NOH: "NOP",
    NOK: "NOP",

    // Hornets
    CHA: "CHA",
    CHH: "CHA",

    // fallback
  };
  return map[team] ?? team;
}

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type DraftRules = {
  hallRule?: "any" | "only" | "none";
  maxPpgCap?: number | null;
  overallCap?: number | null;
  multiTeamOnly?: boolean;
  playedWithPlayerId?: string | null;

  /** scoring algorithm selection */
  peakMode?: "peak" | "average";
  mode?: string; // "default" | "classic" | "casual"

  /** participants */
  participants?: number;
  playersPerTeam?: number;

  /** timer */
  pickTimerSeconds?: number | null;
  autoPickEnabled?: boolean;

  /** respin */
  allowRespinsWithoutPick?: boolean;

  /** spin locks */
  eraFrom?: number;
  eraTo?: number;
  teamLandedOn?: string;

  /** UI saved state */
  savedState?: any;
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
    position: string;
    seasonUsed?: number;
    ppg: number;
    score: number;
    slot?: number;
    ownerIndex?: number;
    threeRate?: number | null;
    heightInches?: number;
    usgPct?: number;
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

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

function jsonSafe<T>(obj: T): T {
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

/* -------------------------------------------------------------------------- */
/*                        CHOOSE SEASON FOR SCORING                           */
/* -------------------------------------------------------------------------- */

function chooseSeasonForScoring(
  player: any,
  rules: DraftRules,
  era: NbaEraContext
) {
  if (!player || !player.seasonStats?.length) return null;

  const stats = player.seasonStats;

  // resolve era
  const eraFrom = rules.eraFrom ?? era.eraFrom;
  const eraTo = rules.eraTo ?? era.eraTo;
  const eraFromInclusive = eraFrom ? eraFrom - 1 : undefined; // allow prior season (e.g., 1979-80 counts for 1980)

  const spunTeam = rules.teamLandedOn
    ? normalizeFranchise(rules.teamLandedOn)
    : null;

  const eraFilter = (s: any) => {
    if (eraFromInclusive && s.season < eraFromInclusive) return false;
    if (eraTo && s.season > eraTo) return false;
    return true;
  };

  const teamFilter = (s: any) =>
    spunTeam ? normalizeFranchise(s.team) === spunTeam : true;

  const byEra = stats.filter(eraFilter);
  const byTeam = stats.filter(teamFilter);
  const byEraTeam = stats.filter((s: any) => eraFilter(s) && teamFilter(s));

  const mode = rules.mode || rules.peakMode || "peak";

  const peak = (list: any[]) => {
    if (!list.length) return null;
    const best = list.reduce((a, b) => (a.ppg > b.ppg ? a : b));
    return {
      statLine: {
        ppg: best.ppg,
        apg: best.apg,
        rpg: best.rpg,
        spg: best.spg,
        bpg: best.bpg,
        threeRate: best.threeRate ?? 0,
        usgPct: best.usgPct ?? 20,
      },
      seasonUsed: best.season,
    };
  };

  const average = (list: any[]) => {
    if (!list.length) return null;
    const n = list.length;
    const sum = list.reduce(
      (acc: any, s: any) => {
        acc.ppg += s.ppg;
        acc.apg += s.apg;
        acc.rpg += s.rpg;
        acc.spg += s.spg;
        acc.bpg += s.bpg;
        acc.threeRate += s.threeRate ?? 0;
        acc.usgPct += s.usgPct ?? 20;
        return acc;
      },
      { ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, threeRate: 0, usgPct: 0 }
    );

    return {
      statLine: {
        ppg: sum.ppg / n,
        apg: sum.apg / n,
        rpg: sum.rpg / n,
        spg: sum.spg / n,
        bpg: sum.bpg / n,
        threeRate: sum.threeRate / n,
        usgPct: sum.usgPct / n,
      },
      seasonUsed: undefined,
    };
  };

  /* ----------------------------- CLASSIC MODE ----------------------------- */
  if (mode === "classic") {
    return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);
  }

  /* ----------------------------- OTHER MODES ------------------------------ */
  switch (mode) {
    case "average":
      return average(stats);

    case "peak-era":
      return peak(byEra) || peak(stats);

    case "peak-team":
      return peak(byTeam) || peak(stats);

    case "peak-era-team":
      return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);

    case "average-era":
      return average(byEra) || average(stats);

    case "average-era-team":
      return average(byEraTeam) || average(byEra) || average(stats);

    case "peak":
    default:
      return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);
  }
}

/* -------------------------------------------------------------------------- */
/*                                CREATE DRAFT                                */
/* -------------------------------------------------------------------------- */

export async function createDraft(data: any) {
  const rules: DraftRules = data.rules || {};
  rules.mode = data.mode;

  const rulesJson = jsonSafe(rules);

  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    { participants: rules.participants, playersPerTeam: rules.playersPerTeam },
    rules
  );

  return prisma.draft.create({
    data: {
      title: data.title || null,
      league: data.league,
      mode: data.mode,
      randomEra: data.randomEra,
      eraFrom: data.eraFrom ?? null,
      eraTo: data.eraTo ?? null,
      randomTeam: data.randomTeam,
      teamConstraint: data.teamConstraint ?? null,
      maxPlayers: data.maxPlayers,
      requirePositions: data.requirePositions,
      scoringMethod: data.scoringMethod,
      rules: rulesJson,
      participants,
      playersPerTeam,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                  GET DRAFT                                 */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                                CANCEL DRAFT                                */
/* -------------------------------------------------------------------------- */

export async function cancelDraft(id: string) {
  await prisma.nBADraftPick.deleteMany({ where: { draftId: id } });
  await prisma.vote.deleteMany({ where: { draftId: id } });
  await prisma.draft.delete({ where: { id } });
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                               SAVE DRAFT STATE                             */
/* -------------------------------------------------------------------------- */

export async function saveDraftState(
  id: string,
  savedState: any,
  status: "saved" | "in_progress" = "saved"
) {
  const draft = await prisma.draft.findUnique({ where: { id } });
  if (!draft) throw new Error("Draft not found");

  const rules = (draft.rules || {}) as DraftRules;

  const mergedRules = jsonSafe({
    ...rules,
    ...savedState,
    savedState: {
      ...(rules.savedState || {}),
      ...(savedState || {}),
    },
    status,
    savedAt: new Date().toISOString(),
  });

  return prisma.draft.update({
    where: { id },
    data: { rules: mergedRules },
    include: {
      picks: {
        include: { player: true },
        orderBy: { slot: "asc" },
      },
      votes: true,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                            UPDATE PICK (TURN ORDER)                        */
/* -------------------------------------------------------------------------- */

export async function updatePick(
  draftId: string,
  data: { slot: number; playerId: string; position: string }
) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { picks: true },
  });
  if (!draft) throw new Error("Draft not found");

  const rules: DraftRules = Object.assign(
    {},
    draft.rules || {},
    (draft.rules as any)?.savedState || {}
  );

  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    draft,
    rules
  );

  // Determine whose turn it is
  const totalPicks = draft.picks.length;
  const activeParticipant =
    totalPicks < draft.maxPlayers ? (totalPicks % participants) + 1 : undefined;

  if (!activeParticipant) throw new Error("Draft is already full");

  const slotParticipant = Math.floor((data.slot - 1) / playersPerTeam) + 1;

  if (slotParticipant !== activeParticipant) {
    throw new Error(
      `It's Player ${activeParticipant}'s turn. You cannot pick in Player ${slotParticipant}'s slot.`
    );
  }

  // Resolve seasonUsed + teamUsed
  const player = await prisma.nBAPlayer.findUnique({
    where: { id: data.playerId },
    include: { seasonStats: true },
  });

  const eraCtx: NbaEraContext = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const chosen = chooseSeasonForScoring(player, rules, eraCtx);

  const seasonUsed = chosen?.seasonUsed ?? null;
  const teamUsed = rules.teamLandedOn ?? draft.teamConstraint ?? null;

  const existing = await prisma.nBADraftPick.findFirst({
    where: { draftId, slot: data.slot },
  });

  if (existing && existing.playerId !== data.playerId) {
    throw new Error("Slot already filled. Undo this pick before changing it.");
  }

  if (!existing) {
    return prisma.nBADraftPick.create({
      data: {
        draftId,
        slot: data.slot,
        playerId: data.playerId,
        position: data.position,
        ownerIndex: activeParticipant,
        seasonUsed,
        teamUsed,
      },
    });
  }

  return prisma.nBADraftPick.update({
    where: { id: existing.id },
    data: {
      playerId: data.playerId,
      position: data.position,
      ownerIndex: activeParticipant,
      seasonUsed,
      teamUsed,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                 UNDO PICK                                  */
/* -------------------------------------------------------------------------- */

export async function undoPick(draftId: string, slot: number) {
  const existing = await prisma.nBADraftPick.findFirst({
    where: { draftId, slot },
  });
  if (existing)
    await prisma.nBADraftPick.delete({ where: { id: existing.id } });
  return getDraft(draftId);
}

/* -------------------------------------------------------------------------- */
/*                                  SCORE                                     */
/* -------------------------------------------------------------------------- */

export async function scoreDraft(draftId: string): Promise<ScoreResponse> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Draft not found");

  const rulesObj =
    typeof draft.rules === "object" && draft.rules !== null
      ? (draft.rules as DraftRules)
      : {};
  const savedStateObj =
    typeof (rulesObj as any).savedState === "object" &&
    (rulesObj as any).savedState !== null
      ? (rulesObj as any).savedState
      : {};
  const rules: DraftRules = {
    ...rulesObj,
    ...savedStateObj,
  };

  const eraCtx: NbaEraContext = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const { participants } = getParticipantsAndPlayersPerTeam(draft, rules);

  const ruleWarnings = new Set<string>();

  /* base season selection */
  const perPickBase = draft.picks.map((p: any) =>
    chooseSeasonForScoring(p.player, rules, eraCtx)
  );

  /* group by ownerIndex */
  const teamsMap = new Map<
    number,
    {
      heights: number[];
      shooters: number;
      positions: NbaPosition[];
      usages: number[];
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
      positions: [],
      usages: [],
      picks: [],
    };

    const base = choice.statLine;

    const pos: NbaPosition = ["PG", "SG", "SF", "PF", "C"].includes(
      pick.position
    )
      ? pick.position
      : "SF";

    const heightInches = pick.player.heightInches ?? 78;

    const threeRate = base.threeRate ?? 0;
    const usgPct = base.usgPct ?? 20;

    team.heights.push(heightInches);
    if (threeRate >= 0.33) team.shooters++;
    team.positions.push(pos);
    team.usages.push(usgPct);

    team.picks.push({
      pickId: pick.id,
      playerId: pick.player.id,
      name: pick.player.name,
      position: pos,
      seasonUsed: pick.seasonUsed ?? choice.seasonUsed,
      ppg: base.ppg,
      slot: pick.slot,
      ownerIndex,
      score: 0,
      threeRate,
      heightInches,
      usgPct,
    });

    teamsMap.set(ownerIndex, team);
  });

  /* scoring */
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
        usgPct: p.usgPct ?? 20,
      };

      const otherPicks = t.picks.filter((o) => o.pickId !== p.pickId);

      const fit: TeamFitContext = {
        position: p.position as NbaPosition,
        heightInches: p.heightInches ?? 78,
        teamHeights: otherPicks.map((o) => o.heightInches ?? 78),
        teamShooters: otherPicks.filter((o) => (o.threeRate ?? 0) >= 0.33)
          .length,
        teamPositions: otherPicks.map((o) => o.position as NbaPosition),
        teamUsage: otherPicks.map((o) => o.usgPct ?? 20),
      };

      const score = scoreNbaPlayer(
        stat,
        p.position as NbaPosition,
        eraCtx,
        fit
      );

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

  /* caps */
  const maxPpgCap = rules.maxPpgCap ?? null;
  const maxOverallCap = rules.overallCap ?? null;

  if (teams.length) {
    for (const t of teams) {
      if (maxPpgCap && t.totalPpg > maxPpgCap) {
        ruleWarnings.add(
          `Player ${t.participant} exceeds PPG cap (${t.totalPpg.toFixed(
            1
          )} > ${maxPpgCap}).`
        );
      }

      if (maxOverallCap && t.totalRating > maxOverallCap) {
        ruleWarnings.add(
          `Player ${t.participant} exceeds rating cap (${t.totalRating.toFixed(
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

/* -------------------------------------------------------------------------- */
/*                                 VOTING                                     */
/* -------------------------------------------------------------------------- */

export async function addVote(draftId: string, value: number) {
  return prisma.vote.create({
    data: { draftId, value },
  });
}

export async function getDraftScore(draftId: string) {
  return scoreDraft(draftId);
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

//   participants?: number; // 1–5
//   playersPerTeam?: number; // 5–12

//   // timer + autopick
//   pickTimerSeconds?: number | null;
//   autoPickEnabled?: boolean;

//   // allow re-spin before pick? (for casual/creative)
//   allowRespinsWithoutPick?: boolean;
//   savedState?: any;
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
//     position: string;
//     seasonUsed?: number;
//     ppg: number;
//     score: number;
//     slot?: number;
//     ownerIndex?: number;
//     threeRate?: number | null;
//     heightInches?: number;
//     usgPct?: number;
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

// // Cancel draft: delete picks/votes then draft
// export async function cancelDraft(id: string) {
//   await prisma.nBADraftPick.deleteMany({ where: { draftId: id } });
//   await prisma.vote.deleteMany({ where: { draftId: id } });
//   await prisma.draft.delete({ where: { id } });
//   return { ok: true };
// }

// // Save draft state into rules (JSON) without schema changes
// export async function saveDraftState(
//   id: string,
//   savedState: any,
//   status: "saved" | "in_progress" = "saved"
// ) {
//   const draft = await prisma.draft.findUnique({ where: { id } });
//   if (!draft) throw new Error("Draft not found");

//   const rules = (draft.rules || {}) as DraftRules;
//   const mergedRules = jsonSafe({
//     ...rules,
//     savedState: savedState ?? rules.savedState ?? {},
//     status,
//     savedAt: new Date().toISOString(),
//   });

//   return prisma.draft.update({
//     where: { id },
//     data: { rules: mergedRules },
//     include: {
//       picks: {
//         include: { player: true },
//         orderBy: { slot: "asc" },
//       },
//       votes: true,
//     },
//   });
// }

// // ---------------------------------------------------------------------
// // UPDATE PICK — enforce turn order & no overwrite
// // ---------------------------------------------------------------------

// export async function updatePick(
//   draftId: string,
//   data: { slot: number; playerId: string; position: string }
// ) {
//   const draft = await prisma.draft.findUnique({
//     where: { id: draftId },
//     include: { picks: true },
//   });
//   if (!draft) throw new Error("Draft not found");

//   const rules = (draft.rules || {}) as DraftRules;
//   const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
//     draft,
//     rules
//   );

//   // Turn logic: P1, P2, ... PN, P1, ...
//   const totalPicks = draft.picks.length;
//   const activeParticipant =
//     totalPicks < draft.maxPlayers ? (totalPicks % participants) + 1 : undefined;

//   if (!activeParticipant) {
//     throw new Error("Draft is already full");
//   }

//   // Slot must belong to the active participant
//   const slotParticipant = Math.floor((data.slot - 1) / playersPerTeam) + 1;
//   if (slotParticipant !== activeParticipant) {
//     throw new Error(
//       `It's Player ${activeParticipant}'s turn. You cannot pick in Player ${slotParticipant}'s slot.`
//     );
//   }

//   // Does this slot already have a pick?
//   const existing = await prisma.nBADraftPick.findFirst({
//     where: { draftId, slot: data.slot },
//   });

//   if (existing && existing.playerId !== data.playerId) {
//     // force Undo if they want to change
//     throw new Error("Slot already filled. Undo this pick before changing it.");
//   }

//   if (!existing) {
//     return prisma.nBADraftPick.create({
//       data: {
//         draftId,
//         slot: data.slot,
//         playerId: data.playerId,
//         position: data.position,
//         ownerIndex: activeParticipant,
//       },
//     });
//   }

//   // Update (only allowed if same player, e.g. changing position)
//   return prisma.nBADraftPick.update({
//     where: { id: existing.id },
//     data: {
//       playerId: data.playerId,
//       position: data.position,
//       ownerIndex: activeParticipant,
//     },
//   });
// }

// // ---------------------------------------------------------------------
// // UNDO PICK — clear slot
// // ---------------------------------------------------------------------

// export async function undoPick(draftId: string, slot: number) {
//   const existing = await prisma.nBADraftPick.findFirst({
//     where: { draftId, slot },
//   });
//   if (existing) {
//     await prisma.nBADraftPick.delete({ where: { id: existing.id } });
//   }
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
//   interface TeamDataForScoring {
//     heights: number[];
//     shooters: number;
//     positions: NbaPosition[];
//     usages: number[];
//     picks: ScoreResponse["perPlayerScores"];
//   }
//   const teamsMap = new Map<number, TeamDataForScoring>();

//   draft.picks.forEach((pick: any, idx: number) => {
//     const choice = perPickBase[idx];
//     if (!choice) return;

//     const ownerIndex = pick.ownerIndex || ((pick.slot - 1) % participants) + 1;
//     const team = teamsMap.get(ownerIndex) || {
//       heights: [],
//       shooters: 0,
//       positions: [],
//       usages: [],
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
//     const usgPct = base.usgPct ?? 20; // Default USG% to 20 if not available

//     team.heights.push(heightInches);
//     if (threeRate >= 0.33) team.shooters++;
//     team.positions.push(pos); // Add position
//     team.usages.push(usgPct); // Add usage

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
//       usgPct, // Add usgPct to the pick object
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

//       // The context for player 'p' is the team *excluding* 'p' itself.
//       // Since 't' contains all players, we need to filter out 'p' from the context arrays.
//       const otherPicks = t.picks.filter((other) => other.pickId !== p.pickId);

//       const teamHeights = otherPicks.map((op) => op.heightInches ?? 78);
//       const teamShooters = otherPicks.filter(
//         (op) => (op.threeRate ?? 0) >= 0.33
//       ).length;
//       const teamPositions = otherPicks.map((op) => op.position as NbaPosition);
//       const teamUsage = otherPicks.map((op) => op.usgPct ?? 20);

//       const fit: TeamFitContext = {
//         position: p.position as NbaPosition,
//         heightInches: p.heightInches ?? 78,
//         teamHeights,
//         teamShooters,
//         teamPositions,
//         teamUsage,
//       };

//       const score = scoreNbaPlayer(
//         stat,
//         p.position as NbaPosition,
//         eraCtx,
//         fit
//       );

//       const withScore = { ...p, score };
//       perPlayerScores.push(
//         withScore as ScoreResponse["perPlayerScores"][number]
//       );

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

//   // PPG / rating caps — ONLY MAX caps
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
