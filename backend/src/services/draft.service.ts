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
    LAL: "LAL",
    MIN: "LAL",
    MNL: "LAL",
    GSW: "GSW",
    PHW: "GSW",
    SFW: "GSW",
    SAC: "SAC",
    KCO: "SAC",
    KCK: "SAC",
    ROC: "SAC",
    BKN: "BKN",
    NJN: "BKN",
    NYA: "BKN",
    LAC: "LAC",
    SDC: "LAC",
    ATL: "ATL",
    STB: "ATL",
    MLI: "ATL",
    WAS: "WAS",
    BAL: "WAS",
    CHI: "WAS",
    WSB: "WAS",
    OKC: "OKC",
    SEA: "OKC",
    NOP: "NOP",
    NOH: "NOP",
    NOK: "NOP",
    CHA: "CHA",
    CHH: "CHA",
  };
  return map[team] ?? team;
}

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type StatMode =
  | "peak"
  | "average"
  | "peak-era"
  | "peak-team"
  | "peak-era-team"
  | "average-era"
  | "average-era-team"
  | "career-avg"
  | "best-any";

// export type DraftRules = {
//   hallRule?: "any" | "only" | "none";
//   maxPpgCap?: number | null;
//   overallCap?: number | null;
//   multiTeamOnly?: boolean;
//   playedWithPlayerId?: string | null;

//   peakMode?: StatMode; // legacy
//   statMode?: StatMode; // canonical
//   mode?: "classic" | "casual" | "free";

//   participants?: number;
//   playersPerTeam?: number;

//   pickTimerSeconds?: number | null;
//   autoPickEnabled?: boolean;

//   allowRespinsWithoutPick?: boolean;

//   eraFrom?: number;
//   eraTo?: number;
//   teamLandedOn?: string;

//   savedState?: any;
// };
export type DraftRules = {
  hallRule?: "any" | "only" | "none";
  maxPpgCap?: number | null;
  overallCap?: number | null;
  multiTeamOnly?: boolean;
  playedWithPlayerId?: string | null;

  peakMode?: StatMode; // legacy
  statMode?: StatMode; // canonical
  mode?: "classic" | "casual" | "free";

  participants?: number;
  playersPerTeam?: number;

  pickTimerSeconds?: number | null;
  autoPickEnabled?: boolean;

  allowRespinsWithoutPick?: boolean;

  // NEW: whether to show system suggestions
  suggestionsEnabled?: boolean;

  // Spin state
  eraFrom?: number;
  eraTo?: number;
  teamLandedOn?: string;

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

  const eraFrom = rules.eraFrom ?? era.eraFrom;
  const eraTo = rules.eraTo ?? era.eraTo;

  const isClassic = rules.mode === "classic";

  const eraFromInclusive =
    eraFrom && !isClassic ? eraFrom - 1 : eraFrom ?? undefined;

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

  const mode: StatMode =
    rules.statMode || rules.peakMode || (isClassic ? "peak-era-team" : "peak");

  const peak = (list: any[]) => {
    if (!list.length) return null;
    const best = list.reduce((a, b) => (a.ppg > b.ppg ? a : b));
    return {
      seasonUsed: best.season,
      statLine: best as NbaStatLine,
    };
  };

  const average = (list: any[]) => {
    if (!list.length) return null;
    const n = list.length;
    const avg: any = {};
    for (const k of Object.keys(list[0])) {
      if (typeof list[0][k] === "number") {
        avg[k] = list.reduce((s: number, r: any) => s + (r[k] ?? 0), 0) / n;
      }
    }
    return { seasonUsed: undefined, statLine: avg as NbaStatLine };
  };

  if (isClassic) {
    return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);
  }

  switch (mode) {
    case "average":
      return average(stats);
    case "peak-era":
      return peak(byEra) || peak(stats);
    case "peak-team":
      return peak(byTeam) || peak(stats);
    case "peak-era-team":
      return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);
    case "career-avg":
      return average(stats);
    case "best-any":
      return peak(stats);
    default:
      return peak(byEraTeam) || peak(stats);
  }
}

/* -------------------------------------------------------------------------- */
/*                                CREATE DRAFT                                */
/* -------------------------------------------------------------------------- */

export async function createDraft(data: any) {
  const rules: DraftRules = data.rules || {};
  rules.mode = data.mode as DraftRules["mode"];

  if (data.mode === "classic") {
    // HARD LOCKED classic rules
    rules.participants = 2;
    rules.playersPerTeam = 6;
    rules.statMode = "peak-era-team";
    rules.pickTimerSeconds = 60;
    rules.autoPickEnabled = true;
    rules.suggestionsEnabled = false;
    rules.hallRule = "any";
    rules.multiTeamOnly = false;
    rules.maxPpgCap = null;
  } else if (data.mode === "casual") {
    // Casual defaults (can be overridden by frontend)
    if (rules.participants == null) {
      rules.participants = data.participants ?? 2;
    }
    if (rules.playersPerTeam == null) {
      rules.playersPerTeam = data.playersPerTeam ?? 6;
    }
    if (rules.pickTimerSeconds === undefined) {
      // allow "off" by sending null from frontend
      rules.pickTimerSeconds = null;
    }
    if (rules.autoPickEnabled === undefined) {
      rules.autoPickEnabled = false;
    }
    if (rules.suggestionsEnabled === undefined) {
      rules.suggestionsEnabled = true;
    }
  } else if (data.mode === "free") {
    // Free mode: no timer by default, no suggestions
    if (rules.participants == null) {
      rules.participants = data.participants ?? 1;
    }
    if (rules.playersPerTeam == null) {
      rules.playersPerTeam = data.playersPerTeam ?? 10;
    }
    rules.pickTimerSeconds = null;
    rules.autoPickEnabled = false;
    rules.suggestionsEnabled = false;
  }

  if (!rules.statMode) {
    // peakMode from frontend or default to peak
    rules.statMode = rules.peakMode || "peak";
  }

  const rulesJson = jsonSafe(rules);
  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    data,
    rules
  );

  return prisma.draft.create({
    data: {
      ...data,
      rules: rulesJson,
      participants,
      playersPerTeam,
    },
  });
}
// export async function createDraft(data: any) {
//   const rules: DraftRules = data.rules || {};
//   rules.mode = data.mode;

//   if (data.mode === "classic") {
//     rules.participants = 2;
//     rules.playersPerTeam = 6;
//     rules.statMode = "peak-era-team";
//     rules.pickTimerSeconds = 60;
//     rules.autoPickEnabled = true;
//   }

//   if (!rules.statMode) rules.statMode = rules.peakMode || "peak";

//   const rulesJson = jsonSafe(rules);
//   const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
//     data,
//     rules
//   );

//   return prisma.draft.create({
//     data: {
//       ...data,
//       rules: rulesJson,
//       participants,
//       playersPerTeam,
//     },
//   });
// }

/* -------------------------------------------------------------------------- */
/*                                  GET DRAFT                                 */
/* -------------------------------------------------------------------------- */

export async function getDraft(id: string) {
  return prisma.draft.findUnique({
    where: { id },
    include: {
      picks: {
        include: { player: { include: { seasonStats: true } } },
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
/*                            UPDATE PICK                                     */
/* -------------------------------------------------------------------------- */

export async function updatePick(
  draftId: string,
  data: { slot: number; playerId: string; position: string }
) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Draft not found");

  const rules: DraftRules = {
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  };

  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    draft,
    rules
  );

  const totalPicks = draft.picks.length;
  const activeParticipant = (totalPicks % participants) + 1;

  const slotParticipant = Math.floor((data.slot - 1) / playersPerTeam) + 1;
  if (slotParticipant !== activeParticipant) throw new Error("Not your turn");

  if (draft.picks.some((p) => p.playerId === data.playerId))
    throw new Error("Player already drafted");

  const player = await prisma.nBAPlayer.findUnique({
    where: { id: data.playerId },
    include: { seasonStats: true },
  });
  if (!player) throw new Error("Player not found");

  const eraCtx = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const chosen = chooseSeasonForScoring(player, rules, eraCtx);
  if (!chosen) throw new Error("No valid season");

  // Casual PPG cap: prevent team from exceeding maxPpgCap
  if (rules.mode === "casual" && rules.maxPpgCap) {
    let teamTotalPpg = chosen.statLine.ppg;

    for (const existing of draft.picks) {
      if (existing.ownerIndex !== activeParticipant) continue;
      if (!existing.player) continue;

      const existingChoice = chooseSeasonForScoring(
        existing.player,
        rules,
        eraCtx
      );
      if (existingChoice) {
        teamTotalPpg += existingChoice.statLine.ppg;
      }
    }

    if (teamTotalPpg > rules.maxPpgCap) {
      throw new Error(
        `PPG cap exceeded (${teamTotalPpg.toFixed(
          1
        )} > ${rules.maxPpgCap.toFixed(1)})`
      );
    }
  }

  return prisma.nBADraftPick.create({
    data: {
      draftId,
      slot: data.slot,
      playerId: data.playerId,
      position: data.position,
      ownerIndex: activeParticipant,
      seasonUsed: chosen.seasonUsed ?? null,
      teamUsed: rules.teamLandedOn ?? draft.teamConstraint ?? null,
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

  const rules: DraftRules = {
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  };

  const eraCtx = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const teams = new Map<number, any>();

  for (const pick of draft.picks) {
    const choice = chooseSeasonForScoring(pick.player, rules, eraCtx);
    if (!choice) continue;

    const owner = pick.ownerIndex!;
    if (!teams.has(owner))
      teams.set(owner, { picks: [], height: [], usage: [], pos: [] });

    teams.get(owner).picks.push({ pick, stat: choice.statLine });
    teams.get(owner).height.push(pick.player.heightInches ?? 78);
    teams.get(owner).usage.push(choice.statLine.usgPct ?? 20);
    teams.get(owner).pos.push(pick.position as NbaPosition);
  }

  const perPlayerScores: any[] = [];
  let totalScore = 0;
  let totalPpg = 0;

  teams.forEach((t, ownerIndex) => {
    for (const { pick, stat } of t.picks) {
      const fit: TeamFitContext = {
        position: pick.position,
        heightInches: pick.player.heightInches ?? 78,
        teamHeights: t.height,
        teamShooters: t.picks.filter(
          (p: any) => (p.stat.threeRate ?? 0) >= 0.33
        ).length,
        teamPositions: t.pos,
        teamUsage: t.usage,
      };

      const score = scoreNbaPlayer(
        stat,
        pick.position as NbaPosition,
        eraCtx,
        fit
      );

      perPlayerScores.push({
        pickId: pick.id,
        playerId: pick.playerId,
        name: pick.player.name,
        position: pick.position,
        ppg: stat.ppg,
        score,
        ownerIndex,
      });

      totalScore += score;
      totalPpg += stat.ppg;
    }
  });

  return {
    draftId,
    teamScore: totalScore,
    avgScore: totalScore / (perPlayerScores.length || 1),
    totalPpg,
    perPlayerScores,
    ruleWarnings: [],
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

/* -------------------------------------------------------------------------- */
/*                              SUGGESTIONS                                   */
/* -------------------------------------------------------------------------- */

export async function getDraftSuggestions(draftId: string, limit = 5) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Draft not found");

  const rules: DraftRules = {
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  };

  // ✅ Classic is always pure — no suggestions
  if (rules.mode !== "casual" || rules.suggestionsEnabled === false) {
    return [];
  }

  const eraCtx: NbaEraContext = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    draft,
    rules
  );

  const activeParticipant = (draft.picks.length % participants) + 1;

  // determine active slot
  const takenSlots = new Set(draft.picks.map((p) => p.slot));
  const allSlots = Array.from({ length: draft.maxPlayers }, (_, i) => i + 1);

  const activeSlot =
    allSlots.find(
      (s) =>
        Math.floor((s - 1) / playersPerTeam) + 1 === activeParticipant &&
        !takenSlots.has(s)
    ) ?? null;

  if (!activeSlot) return [];

  // position constraint
  const requiredPosition = draft.requirePositions
    ? (["PG", "SG", "SF", "PF", "C"][
        (activeSlot - 1) % playersPerTeam
      ] as NbaPosition)
    : null;

  const draftedPlayerIds = new Set(draft.picks.map((p) => p.playerId));

  const players = await prisma.nBAPlayer.findMany({
    include: { seasonStats: true },
  });

  const scored: any[] = [];

  for (const player of players) {
    if (draftedPlayerIds.has(player.id)) continue;

    const eligiblePositions = player.eligiblePositions
      ? player.eligiblePositions.split(",").map((p) => p.trim())
      : [player.position];

    if (requiredPosition && !eligiblePositions.includes(requiredPosition))
      continue;

    const chosen = chooseSeasonForScoring(player, rules, eraCtx);
    if (!chosen) continue;

    // Casual PPG cap
    if (
      rules.mode === "casual" &&
      rules.maxPpgCap &&
      chosen.statLine.ppg > rules.maxPpgCap
    ) {
      continue;
    }

    const score = scoreNbaPlayer(
      chosen.statLine,
      requiredPosition ?? (player.position as NbaPosition),
      eraCtx,
      {
        position: requiredPosition ?? (player.position as NbaPosition),
        heightInches: player.heightInches ?? 78,
        teamHeights: [],
        teamShooters: 0,
        teamPositions: [],
        teamUsage: [],
      }
    );

    scored.push({
      playerId: player.id,
      name: player.name,
      position: player.position,
      ppg: chosen.statLine.ppg,
      seasonUsed: chosen.seasonUsed,
      score,
      threeRate: chosen.statLine.threeRate ?? null,
      usgPct: chosen.statLine.usgPct ?? null,
      heightInches: player.heightInches ?? null,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// import prisma from "../lib/prisma";
// import {
//   scoreNbaPlayer,
//   NbaStatLine,
//   NbaEraContext,
//   TeamFitContext,
//   NbaPosition,
// } from "../lib/scoring/nba";

// /* -------------------------------------------------------------------------- */
// /*                               NORMALIZE TEAM                               */
// /* -------------------------------------------------------------------------- */

// function normalizeFranchise(team: string) {
//   const map: Record<string, string> = {
//     // Lakers
//     LAL: "LAL",
//     MIN: "LAL",
//     MNL: "LAL",

//     // Warriors
//     GSW: "GSW",
//     PHW: "GSW",
//     SFW: "GSW",

//     // Kings
//     SAC: "SAC",
//     KCO: "SAC",
//     KCK: "SAC",
//     ROC: "SAC",

//     // Nets
//     BKN: "BKN",
//     NJN: "BKN",
//     NYA: "BKN",

//     // Clippers
//     LAC: "LAC",
//     SDC: "LAC",

//     // Hawks
//     ATL: "ATL",
//     STB: "ATL",
//     MLI: "ATL",

//     // Wizards
//     WAS: "WAS",
//     BAL: "WAS",
//     CHI: "WAS",
//     WSB: "WAS",

//     // Thunder
//     OKC: "OKC",
//     SEA: "OKC",

//     // Pelicans
//     NOP: "NOP",
//     NOH: "NOP",
//     NOK: "NOP",

//     // Hornets
//     CHA: "CHA",
//     CHH: "CHA",

//     // fallback
//   };
//   return map[team] ?? team;
// }

// /* -------------------------------------------------------------------------- */
// /*                                   TYPES                                    */
// /* -------------------------------------------------------------------------- */

// export type DraftRules = {
//   hallRule?: "any" | "only" | "none";
//   maxPpgCap?: number | null;
//   overallCap?: number | null;
//   multiTeamOnly?: boolean;
//   playedWithPlayerId?: string | null;

//   /** scoring algorithm selection */
//   peakMode?: "peak" | "average";
//   mode?: string; // "default" | "classic" | "casual"

//   /** participants */
//   participants?: number;
//   playersPerTeam?: number;

//   /** timer */
//   pickTimerSeconds?: number | null;
//   autoPickEnabled?: boolean;

//   /** respin */
//   allowRespinsWithoutPick?: boolean;

//   /** spin locks */
//   eraFrom?: number;
//   eraTo?: number;
//   teamLandedOn?: string;

//   /** UI saved state */
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

// /* -------------------------------------------------------------------------- */
// /*                                   HELPERS                                  */
// /* -------------------------------------------------------------------------- */

// function jsonSafe<T>(obj: T): T {
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

// /* -------------------------------------------------------------------------- */
// /*                        CHOOSE SEASON FOR SCORING                           */
// /* -------------------------------------------------------------------------- */

// function chooseSeasonForScoring(
//   player: any,
//   rules: DraftRules,
//   era: NbaEraContext
// ) {
//   if (!player || !player.seasonStats?.length) return null;

//   const stats = player.seasonStats;

//   // resolve era
//   const eraFrom = rules.eraFrom ?? era.eraFrom;
//   const eraTo = rules.eraTo ?? era.eraTo;
//   const eraFromInclusive = eraFrom ? eraFrom - 1 : undefined; // allow prior season (e.g., 1979-80 counts for 1980)

//   const spunTeam = rules.teamLandedOn
//     ? normalizeFranchise(rules.teamLandedOn)
//     : null;

//   const eraFilter = (s: any) => {
//     if (eraFromInclusive && s.season < eraFromInclusive) return false;
//     if (eraTo && s.season > eraTo) return false;
//     return true;
//   };

//   const teamFilter = (s: any) =>
//     spunTeam ? normalizeFranchise(s.team) === spunTeam : true;

//   const byEra = stats.filter(eraFilter);
//   const byTeam = stats.filter(teamFilter);
//   const byEraTeam = stats.filter((s: any) => eraFilter(s) && teamFilter(s));

//   const mode = rules.mode || rules.peakMode || "peak";

//   const peak = (list: any[]) => {
//     if (!list.length) return null;
//     const best = list.reduce((a, b) => (a.ppg > b.ppg ? a : b));
//     return {
//       statLine: {
//         ppg: best.ppg,
//         apg: best.apg,
//         rpg: best.rpg,
//         spg: best.spg,
//         bpg: best.bpg,
//         threeRate: best.threeRate ?? 0,
//         usgPct: best.usgPct ?? 20,
//       },
//       seasonUsed: best.season,
//     };
//   };

//   const average = (list: any[]) => {
//     if (!list.length) return null;
//     const n = list.length;
//     const sum = list.reduce(
//       (acc: any, s: any) => {
//         acc.ppg += s.ppg;
//         acc.apg += s.apg;
//         acc.rpg += s.rpg;
//         acc.spg += s.spg;
//         acc.bpg += s.bpg;
//         acc.threeRate += s.threeRate ?? 0;
//         acc.usgPct += s.usgPct ?? 20;
//         return acc;
//       },
//       { ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, threeRate: 0, usgPct: 0 }
//     );

//     return {
//       statLine: {
//         ppg: sum.ppg / n,
//         apg: sum.apg / n,
//         rpg: sum.rpg / n,
//         spg: sum.spg / n,
//         bpg: sum.bpg / n,
//         threeRate: sum.threeRate / n,
//         usgPct: sum.usgPct / n,
//       },
//       seasonUsed: undefined,
//     };
//   };

//   /* ----------------------------- CLASSIC MODE ----------------------------- */
//   if (mode === "classic") {
//     return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);
//   }

//   /* ----------------------------- OTHER MODES ------------------------------ */
//   switch (mode) {
//     case "average":
//       return average(stats);

//     case "peak-era":
//       return peak(byEra) || peak(stats);

//     case "peak-team":
//       return peak(byTeam) || peak(stats);

//     case "peak-era-team":
//       return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);

//     case "average-era":
//       return average(byEra) || average(stats);

//     case "average-era-team":
//       return average(byEraTeam) || average(byEra) || average(stats);

//     case "peak":
//     default:
//       return peak(byEraTeam) || peak(byEra) || peak(byTeam) || peak(stats);
//   }
// }

// /* -------------------------------------------------------------------------- */
// /*                                CREATE DRAFT                                */
// /* -------------------------------------------------------------------------- */

// export async function createDraft(data: any) {
//   const rules: DraftRules = data.rules || {};
//   rules.mode = data.mode;

//   const rulesJson = jsonSafe(rules);

//   const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
//     { participants: rules.participants, playersPerTeam: rules.playersPerTeam },
//     rules
//   );

//   return prisma.draft.create({
//     data: {
//       title: data.title || null,
//       league: data.league,
//       mode: data.mode,
//       randomEra: data.randomEra,
//       eraFrom: data.eraFrom ?? null,
//       eraTo: data.eraTo ?? null,
//       randomTeam: data.randomTeam,
//       teamConstraint: data.teamConstraint ?? null,
//       maxPlayers: data.maxPlayers,
//       requirePositions: data.requirePositions,
//       scoringMethod: data.scoringMethod,
//       rules: rulesJson,
//       participants,
//       playersPerTeam,
//     },
//   });
// }

// /* -------------------------------------------------------------------------- */
// /*                                  GET DRAFT                                 */
// /* -------------------------------------------------------------------------- */

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

// /* -------------------------------------------------------------------------- */
// /*                                CANCEL DRAFT                                */
// /* -------------------------------------------------------------------------- */

// export async function cancelDraft(id: string) {
//   await prisma.nBADraftPick.deleteMany({ where: { draftId: id } });
//   await prisma.vote.deleteMany({ where: { draftId: id } });
//   await prisma.draft.delete({ where: { id } });
//   return { ok: true };
// }

// /* -------------------------------------------------------------------------- */
// /*                               SAVE DRAFT STATE                             */
// /* -------------------------------------------------------------------------- */

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
//     ...savedState,
//     savedState: {
//       ...(rules.savedState || {}),
//       ...(savedState || {}),
//     },
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

// /* -------------------------------------------------------------------------- */
// /*                            UPDATE PICK (TURN ORDER)                        */
// /* -------------------------------------------------------------------------- */

// export async function updatePick(
//   draftId: string,
//   data: { slot: number; playerId: string; position: string }
// ) {
//   const draft = await prisma.draft.findUnique({
//     where: { id: draftId },
//     include: { picks: true },
//   });
//   if (!draft) throw new Error("Draft not found");

//   const rules: DraftRules = Object.assign(
//     {},
//     draft.rules || {},
//     (draft.rules as any)?.savedState || {}
//   );

//   const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
//     draft,
//     rules
//   );

//   // Determine whose turn it is
//   const totalPicks = draft.picks.length;
//   const activeParticipant =
//     totalPicks < draft.maxPlayers ? (totalPicks % participants) + 1 : undefined;

//   if (!activeParticipant) throw new Error("Draft is already full");

//   const slotParticipant = Math.floor((data.slot - 1) / playersPerTeam) + 1;

//   if (slotParticipant !== activeParticipant) {
//     throw new Error(
//       `It's Player ${activeParticipant}'s turn. You cannot pick in Player ${slotParticipant}'s slot.`
//     );
//   }

//   // Resolve seasonUsed + teamUsed
//   const player = await prisma.nBAPlayer.findUnique({
//     where: { id: data.playerId },
//     include: { seasonStats: true },
//   });

//   const eraCtx: NbaEraContext = {
//     eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
//     eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
//   };

//   const chosen = chooseSeasonForScoring(player, rules, eraCtx);

//   const seasonUsed = chosen?.seasonUsed ?? null;
//   const teamUsed = rules.teamLandedOn ?? draft.teamConstraint ?? null;

//   const existing = await prisma.nBADraftPick.findFirst({
//     where: { draftId, slot: data.slot },
//   });

//   if (existing && existing.playerId !== data.playerId) {
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
//         seasonUsed,
//         teamUsed,
//       },
//     });
//   }

//   return prisma.nBADraftPick.update({
//     where: { id: existing.id },
//     data: {
//       playerId: data.playerId,
//       position: data.position,
//       ownerIndex: activeParticipant,
//       seasonUsed,
//       teamUsed,
//     },
//   });
// }

// /* -------------------------------------------------------------------------- */
// /*                                 UNDO PICK                                  */
// /* -------------------------------------------------------------------------- */

// export async function undoPick(draftId: string, slot: number) {
//   const existing = await prisma.nBADraftPick.findFirst({
//     where: { draftId, slot },
//   });
//   if (existing)
//     await prisma.nBADraftPick.delete({ where: { id: existing.id } });
//   return getDraft(draftId);
// }

// /* -------------------------------------------------------------------------- */
// /*                                  SCORE                                     */
// /* -------------------------------------------------------------------------- */

// export async function scoreDraft(draftId: string): Promise<ScoreResponse> {
//   const draft = await getDraft(draftId);
//   if (!draft) throw new Error("Draft not found");

//   const rulesObj =
//     typeof draft.rules === "object" && draft.rules !== null
//       ? (draft.rules as DraftRules)
//       : {};
//   const savedStateObj =
//     typeof (rulesObj as any).savedState === "object" &&
//     (rulesObj as any).savedState !== null
//       ? (rulesObj as any).savedState
//       : {};
//   const rules: DraftRules = {
//     ...rulesObj,
//     ...savedStateObj,
//   };

//   const eraCtx: NbaEraContext = {
//     eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
//     eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
//   };

//   const { participants } = getParticipantsAndPlayersPerTeam(draft, rules);

//   const ruleWarnings = new Set<string>();

//   /* base season selection */
//   const perPickBase = draft.picks.map((p: any) =>
//     chooseSeasonForScoring(p.player, rules, eraCtx)
//   );

//   /* group by ownerIndex */
//   const teamsMap = new Map<
//     number,
//     {
//       heights: number[];
//       shooters: number;
//       positions: NbaPosition[];
//       usages: number[];
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
//       positions: [],
//       usages: [],
//       picks: [],
//     };

//     const base = choice.statLine;

//     const pos: NbaPosition = ["PG", "SG", "SF", "PF", "C"].includes(
//       pick.position
//     )
//       ? pick.position
//       : "SF";

//     const heightInches = pick.player.heightInches ?? 78;

//     const threeRate = base.threeRate ?? 0;
//     const usgPct = base.usgPct ?? 20;

//     team.heights.push(heightInches);
//     if (threeRate >= 0.33) team.shooters++;
//     team.positions.push(pos);
//     team.usages.push(usgPct);

//     team.picks.push({
//       pickId: pick.id,
//       playerId: pick.player.id,
//       name: pick.player.name,
//       position: pos,
//       seasonUsed: pick.seasonUsed ?? choice.seasonUsed,
//       ppg: base.ppg,
//       slot: pick.slot,
//       ownerIndex,
//       score: 0,
//       threeRate,
//       heightInches,
//       usgPct,
//     });

//     teamsMap.set(ownerIndex, team);
//   });

//   /* scoring */
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
//         usgPct: p.usgPct ?? 20,
//       };

//       const otherPicks = t.picks.filter((o) => o.pickId !== p.pickId);

//       const fit: TeamFitContext = {
//         position: p.position as NbaPosition,
//         heightInches: p.heightInches ?? 78,
//         teamHeights: otherPicks.map((o) => o.heightInches ?? 78),
//         teamShooters: otherPicks.filter((o) => (o.threeRate ?? 0) >= 0.33)
//           .length,
//         teamPositions: otherPicks.map((o) => o.position as NbaPosition),
//         teamUsage: otherPicks.map((o) => o.usgPct ?? 20),
//       };

//       const score = scoreNbaPlayer(
//         stat,
//         p.position as NbaPosition,
//         eraCtx,
//         fit
//       );

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

//   /* caps */
//   const maxPpgCap = rules.maxPpgCap ?? null;
//   const maxOverallCap = rules.overallCap ?? null;

//   if (teams.length) {
//     for (const t of teams) {
//       if (maxPpgCap && t.totalPpg > maxPpgCap) {
//         ruleWarnings.add(
//           `Player ${t.participant} exceeds PPG cap (${t.totalPpg.toFixed(
//             1
//           )} > ${maxPpgCap}).`
//         );
//       }

//       if (maxOverallCap && t.totalRating > maxOverallCap) {
//         ruleWarnings.add(
//           `Player ${t.participant} exceeds rating cap (${t.totalRating.toFixed(
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

// /* -------------------------------------------------------------------------- */
// /*                                 VOTING                                     */
// /* -------------------------------------------------------------------------- */

// export async function addVote(draftId: string, value: number) {
//   return prisma.vote.create({
//     data: { draftId, value },
//   });
// }

// export async function getDraftScore(draftId: string) {
//   return scoreDraft(draftId);
// }
