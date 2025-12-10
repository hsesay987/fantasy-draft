// src/services/draft.service.ts
import prisma from "../lib/prisma";
import {
  scoreNbaPlayer,
  NbaStatLine,
  NbaEraContext,
  TeamFitContext,
  NbaPosition,
} from "../lib/scoring/nba";
import { getIo } from "../socket";

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

  // 🔹 ONLINE
  online?: boolean;
  roomCode?: string;
  seatAssignments?: string[]; // index 0 → Player 1 userId, etc.
  seatDisplayNames?: string[]; // index 0 → label for Player 1
  hostUserId?: string;
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

export async function createDraft(data: any, userId?: string) {
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

  // ✅ CREATE GAME FIRST
  const game = await prisma.game.create({
    data: {
      type: "DRAFT",
      category: "SPORTS",
      subtype: "NBA",
      title: data.title ?? "NBA Draft",
    },
  });

  return prisma.draft.create({
    data: {
      ...data,
      gameId: game.id,
      ownerId: userId ?? null,
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
        include: { player: { include: { seasonStats: true } } },
        orderBy: { slot: "asc" },
      },
      votes: true,
    },
  });
}

export async function getDraftsByOwner(ownerId: string) {
  return prisma.draft.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      mode: true,
      createdAt: true,
      rules: true,
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

  // return prisma.draft.update({
  //   where: { id },
  //   data: { rules: mergedRules },
  //   include: {
  //     picks: {
  //       include: { player: true },
  //       orderBy: { slot: "asc" },
  //     },
  //     votes: true,
  //   },
  // });

  const saved = await prisma.draft.update({
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

  // broadcast updated draft
  const updated = await getDraft(id);
  const io = getIo();
  if (io && updated) {
    io.to(`draft:${id}`).emit("draft:update", updated);
  }

  return saved;
}

/* -------------------------------------------------------------------------- */
/*                            UPDATE PICK                                     */
/* -------------------------------------------------------------------------- */

export async function updatePick(
  draftId: string,
  data: {
    slot: number;
    playerId: string;
    position: string;
    userId?: string | null;
  }
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

  // 🔹 NEW: enforce by userId when online
  const seatAssignments: string[] | undefined = (rules as any).seatAssignments;

  if (rules.online && seatAssignments && seatAssignments.length) {
    const expectedUserId = seatAssignments[activeParticipant - 1];
    if (expectedUserId && expectedUserId !== data.userId) {
      throw new Error("Not your turn");
    }
  }

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

  const pick = await prisma.nBADraftPick.create({
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

  // broadcast updated draft
  const updated = await getDraft(draftId);
  const io = getIo();
  if (io && updated) {
    io.to(`draft:${draftId}`).emit("draft:update", updated);
  }

  return pick;
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
  // return getDraft(draftId);

  // broadcast updated draft
  const updated = await getDraft(draftId);
  const io = getIo();
  if (io && updated) {
    io.to(`draft:${draftId}`).emit("draft:update", updated);
  }

  return updated;
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

  const eraCtx: NbaEraContext = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const teams = new Map<
    number,
    {
      participant: number;
      picks: any[];
      totalScore: number;
      totalPpg: number;
    }
  >();

  /* --------------------- build team buckets --------------------- */
  for (const pick of draft.picks) {
    if (!pick.ownerIndex) continue;

    const choice = chooseSeasonForScoring(pick.player, rules, eraCtx);
    if (!choice) continue;

    if (!teams.has(pick.ownerIndex)) {
      teams.set(pick.ownerIndex, {
        participant: pick.ownerIndex,
        picks: [],
        totalScore: 0,
        totalPpg: 0,
      });
    }

    const team = teams.get(pick.ownerIndex)!;

    const fit: TeamFitContext = {
      position: pick.position as NbaPosition,
      heightInches: pick.player.heightInches ?? 78,
      teamHeights: team.picks.map((p) => p.heightInches ?? 78),
      teamShooters: team.picks.filter((p) => (p.threeRate ?? 0) >= 0.33).length,
      teamPositions: team.picks.map((p) => p.position as NbaPosition),
      teamUsage: team.picks.map((p) => p.usgPct ?? 20),
    };

    const score = scoreNbaPlayer(
      choice.statLine,
      pick.position as NbaPosition,
      eraCtx,
      fit
    );

    const scoredPick = {
      pickId: pick.id,
      playerId: pick.playerId,
      slot: pick.slot,
      ownerIndex: pick.ownerIndex,
      name: pick.player.name,
      position: pick.position,
      seasonUsed: pick.seasonUsed ?? choice.seasonUsed,
      ppg: choice.statLine.ppg,
      score,
      threeRate: choice.statLine.threeRate ?? null,
      usgPct: choice.statLine.usgPct ?? null,
      heightInches: pick.player.heightInches ?? null,
    };

    team.picks.push(scoredPick);
    team.totalScore += score;
    team.totalPpg += choice.statLine.ppg;
  }

  /* --------------------- build response --------------------- */
  const teamList = Array.from(teams.values()).map((t) => ({
    participant: t.participant,
    teamScore: t.totalScore,
    totalPpg: t.totalPpg,
    totalRating: t.totalScore / Math.max(1, t.picks.length),
    picks: t.picks,
  }));

  let winner: number | undefined;
  if (teamList.length > 1) {
    winner = teamList.reduce((best, curr) =>
      curr.teamScore > best.teamScore ? curr : best
    ).participant;
  }

  // After computing teamList and winner inside scoreDraft:
  if (winner && draft.gameId && draft.ownerId) {
    // basic: credit owner with teamScore / avgScore
    // Or, if you later track which user is which participant, map them properly.
    await prisma.gameResult.create({
      data: {
        gameId: draft.gameId,
        userId: draft.ownerId,
        score: teamList.find((t) => t.participant === winner)?.teamScore ?? 0,
      },
    });
  }

  const allPicks = teamList.flatMap((t) => t.picks);

  return {
    draftId,
    teamScore: teamList.reduce((s, t) => s + t.teamScore, 0),
    avgScore:
      teamList.reduce((s, t) => s + t.totalRating, 0) /
      Math.max(1, teamList.length),
    totalPpg: teamList.reduce((s, t) => s + t.totalPpg, 0),
    perPlayerScores: allPicks,
    teams: teamList,
    winner,
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
