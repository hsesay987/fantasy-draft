// src/services/draft.service.ts
import prisma from "../lib/prisma";
import {
  scoreNbaPlayer,
  NbaStatLine,
  NbaEraContext,
  TeamFitContext,
  NbaPosition,
} from "../lib/scoring/nba";
import {
  scoreNflPlayer,
  NflEraContext,
  NflPosition,
  NflStatLine,
  defaultLineup as defaultNflLineup,
} from "../lib/scoring/nfl";
import {
  applyCommunityBonus,
  CartoonScoringMethod,
  scoreCartoonCharacter,
  scoreCartoonShow,
} from "../lib/scoring/cartoon";
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

function normalizeNflPosition(pos: string): NflPosition {
  const p = (pos || "").toUpperCase();
  if (["QB"].includes(p)) return "QB";
  if (["RB", "HB", "FB"].includes(p)) return "RB";
  if (["WR"].includes(p)) return "WR";
  if (["TE"].includes(p)) return "TE";
  if (["OT", "OG", "C", "OL", "LT", "RT", "LG", "RG"].includes(p)) return "OL";
  if (["NT", "DT", "DE", "DL", "EDGE"].includes(p)) return "DL";
  if (["OLB", "MLB", "ILB", "WILL", "MIKE", "SAM", "LB"].includes(p))
    return "LB";
  if (["CB", "FS", "SS", "S", "DB", "SAF"].includes(p)) return "DB";
  if (["K", "PK", "P"].includes(p)) return "K";
  if (p === "DEF") return "DEF";
  return "WR";
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
  // NFL beta toggles
  lineup?: string[]; // e.g., ["QB","RB","RB","WR","WR","TE","FLEX","DEF"]
  fantasyScoring?: boolean;
  allowDefense?: boolean;
  yardageCap?: number | null;
  proBowlCap?: number | null;
  benchScoring?: boolean;

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

  // CARTOON DRAFTS
  cartoonMode?: string; // classic | by-channel | adult-only | kids-only | baby-shows | era | superhero | female-only
  cartoonDraftType?: "show" | "character";
  cartoonChannel?: string | null;
  cartoonAgeRating?: "baby" | "kids" | "adult";
  cartoonEraFrom?: number;
  cartoonEraTo?: number;
  cartoonRequireSuperhero?: boolean;
  cartoonGender?: "male" | "female" | "other" | "unknown";
  cartoonScoring?: "system" | "user" | "community";
  allowShows?: boolean;
  allowCharacters?: boolean;
  communityVoteEnabled?: boolean;
  adultContentOnly?: boolean;
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

const NFL_DEFAULT_LINEUP: NflPosition[] = defaultNflLineup();

function getNflLineup(rules: DraftRules): NflPosition[] {
  const lineup = rules.lineup || [];
  const parsed = lineup
    .map((p) => normalizeNflPosition(p))
    .filter(Boolean) as NflPosition[];
  return parsed.length ? parsed : NFL_DEFAULT_LINEUP;
}

function chooseNflSeasonForScoring(
  player: any,
  era: NflEraContext,
  opts?: { seasonOverride?: number | null }
): { seasonUsed: number; statLine: NflStatLine } | null {
  const stats = player.seasons || player.seasonStats || [];
  if (!stats.length) return null;

  const eraFrom = era.eraFrom ?? undefined;
  const eraTo = era.eraTo ?? undefined;

  const filter = (s: any) => {
    if (eraFrom && s.season < eraFrom) return false;
    if (eraTo && s.season > eraTo) return false;
    return true;
  };

  const pool = stats.filter(filter);
  const list = pool.length ? pool : stats;

  if (opts?.seasonOverride != null) {
    const match = list.find((s: any) => s.season === opts.seasonOverride);
    if (match) {
      return { seasonUsed: match.season, statLine: match as NflStatLine };
    }
  }

  const best = list.reduce((best: any, curr: any) => {
    const currScore =
      (curr.touchdowns ?? 0) * 10 +
      (curr.sacks ?? 0) * 4 +
      (curr.interceptions ?? 0) * 3 +
      (curr.yards ?? 0) / 10;
    const bestScore =
      (best?.touchdowns ?? 0) * 10 +
      (best?.sacks ?? 0) * 4 +
      (best?.interceptions ?? 0) * 3 +
      (best?.yards ?? 0) / 10;
    return currScore > bestScore ? curr : best;
  }, null as any);

  if (!best) return null;
  return { seasonUsed: best.season, statLine: best as NflStatLine };
}

/* -------------------------------------------------------------------------- */
/*                        CHOOSE SEASON FOR SCORING                           */
/* -------------------------------------------------------------------------- */

function chooseSeasonForScoring(
  player: any,
  rules: DraftRules,
  era: NbaEraContext,
  opts?: { teamOverride?: string | null; seasonOverride?: number | null }
) {
  if (!player || !player.seasonStats?.length) return null;
  const stats = player.seasonStats;

  const eraFrom = rules.eraFrom ?? era.eraFrom;
  const eraTo = rules.eraTo ?? era.eraTo;

  const isClassic = rules.mode === "classic";

  const eraFromInclusive =
    eraFrom && !isClassic ? eraFrom - 1 : eraFrom ?? undefined;

  const spunTeam =
    opts?.teamOverride !== undefined
      ? opts.teamOverride
        ? normalizeFranchise(opts.teamOverride)
        : null
      : rules.teamLandedOn
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

  // If a specific season was already locked (e.g., earlier spin), honor it
  if (opts?.seasonOverride != null) {
    const seasonMatch = stats.find(
      (s: any) => s.season === opts.seasonOverride
    );
    if (
      seasonMatch &&
      (!spunTeam || normalizeFranchise(seasonMatch.team) === spunTeam)
    ) {
      return {
        seasonUsed: seasonMatch.season,
        statLine: seasonMatch as NbaStatLine,
      };
    }
    if (seasonMatch) {
      return {
        seasonUsed: seasonMatch.season,
        statLine: seasonMatch as NbaStatLine,
      };
    }
  }

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

  // 🔒 When we have an era or team context (spins/constraints), always honor it first
  const contextualPeak =
    peak(byEraTeam) || peak(byEra) || peak(byTeam) || null;
  if (spunTeam || eraFromInclusive || eraTo) {
    if (contextualPeak) {
      return contextualPeak;
    }
  }

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
  const league = (data.league || "NBA").toUpperCase();
  const isNfl = league === "NFL";
  const isCartoon = league === "CARTOON";
  const rules: DraftRules = data.rules || {};
  rules.mode = (data.mode as DraftRules["mode"]) || rules.mode || "classic";

  if (isNfl && !rules.lineup) {
    rules.lineup = NFL_DEFAULT_LINEUP;
  }

  if (isNfl || isCartoon) {
    if (!userId) {
      throw new Error(
        `${isNfl ? "NFL" : "Cartoon"} beta drafts are premium-only. Please log in.`
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        subscriptionEnds: true,
        isFounder: true,
        isAdmin: true,
      },
    });
    const premium =
      user?.isAdmin ||
      user?.isFounder ||
      (!!user?.subscriptionTier &&
        (!user.subscriptionEnds ||
          user.subscriptionEnds.getTime() > Date.now()));
    if (!premium) {
      throw new Error(
        `${isNfl ? "NFL" : "Cartoon"} beta is available to premium members only.`
      );
    }
  }

  if (isCartoon) {
    rules.cartoonMode = data.cartoonMode || rules.cartoonMode || "classic";
    rules.cartoonDraftType =
      (data.cartoonDraftType as DraftRules["cartoonDraftType"]) ||
      rules.cartoonDraftType ||
      "character";
    rules.cartoonChannel =
      data.cartoonChannel ??
      data.channel ??
      rules.cartoonChannel ??
      null;
    rules.cartoonAgeRating =
      (data.cartoonAgeRating as any) ??
      rules.cartoonAgeRating ??
      (rules.cartoonMode === "adult-only"
        ? "adult"
        : rules.cartoonMode === "kids-only"
        ? "kids"
        : rules.cartoonMode === "baby-shows"
        ? "baby"
        : null);
    rules.cartoonEraFrom =
      data.cartoonEraFrom ?? rules.cartoonEraFrom ?? data.eraFrom ?? null;
    rules.cartoonEraTo =
      data.cartoonEraTo ?? rules.cartoonEraTo ?? data.eraTo ?? null;
    if (rules.cartoonRequireSuperhero === undefined) {
      rules.cartoonRequireSuperhero =
        !!data.cartoonRequireSuperhero || rules.cartoonMode === "superhero";
    }
    rules.cartoonGender =
      (data.cartoonGender as any) ??
      rules.cartoonGender ??
      (rules.cartoonMode === "female-only" ? "female" : undefined);
    rules.allowCharacters =
      rules.allowCharacters ??
      (rules.cartoonMode === "baby-shows" ? false : true);
    rules.allowShows =
      rules.allowShows ??
      (rules.cartoonMode === "superhero" ||
      rules.cartoonDraftType === "character"
        ? false
        : true);
    rules.cartoonScoring =
      (data.cartoonScoring as CartoonScoringMethod) ??
      (data.scoringMethod as CartoonScoringMethod) ??
      rules.cartoonScoring ??
      "system";
    rules.participants = rules.participants ?? data.participants ?? 2;
    rules.playersPerTeam = rules.playersPerTeam ?? data.playersPerTeam ?? 5;

    switch (rules.cartoonMode) {
      case "by-channel":
        if (!rules.cartoonChannel) {
          throw new Error("Channel filter is required for by-channel drafts");
        }
        break;
      case "adult-only":
        rules.cartoonAgeRating = "adult";
        break;
      case "kids-only":
        rules.cartoonAgeRating = "kids";
        break;
      case "baby-shows":
        rules.cartoonAgeRating = "baby";
        rules.cartoonDraftType = "show";
        rules.allowCharacters = false;
        rules.allowShows = true;
        break;
      case "era":
        rules.cartoonEraFrom = rules.cartoonEraFrom ?? data.eraFrom ?? null;
        rules.cartoonEraTo = rules.cartoonEraTo ?? data.eraTo ?? null;
        break;
      case "superhero":
        rules.cartoonRequireSuperhero = true;
        rules.cartoonDraftType = "character";
        rules.allowShows = false;
        break;
      case "female-only":
        rules.cartoonGender = "female";
        rules.cartoonDraftType = "character";
        rules.allowShows = false;
        break;
    }
  } else {
    if (data.mode === "classic") {
      // HARD LOCKED classic rules
      rules.participants = 2;
      rules.playersPerTeam = isNfl ? getNflLineup(rules).length : 6;
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

    if (isNfl) {
      // NFL beta defaults
      rules.playersPerTeam = rules.playersPerTeam || getNflLineup(rules).length;
      rules.allowDefense =
        rules.allowDefense !== undefined ? rules.allowDefense : true;
      rules.fantasyScoring =
        rules.fantasyScoring !== undefined ? rules.fantasyScoring : false;
    }
  }

  const lineup = isNfl ? getNflLineup(rules) : undefined;
  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    isNfl
      ? { ...data, playersPerTeam: rules.playersPerTeam }
      : { ...data, playersPerTeam: rules.playersPerTeam },
    rules
  );
  const playersPerTeamFinal = isNfl
    ? lineup?.length ?? playersPerTeam
    : playersPerTeam;

  if (isNfl || isCartoon) {
    rules.playersPerTeam = playersPerTeamFinal;
  }

  const scoringMethodOverride =
    (data.scoringMethod as any) ||
    (isCartoon ? rules.cartoonScoring : undefined) ||
    undefined;

  const rulesJson = jsonSafe(rules);
  const maxPlayers = participants * playersPerTeamFinal;

  // ✅ CREATE GAME FIRST
  const game = await prisma.game.create({
    data: {
      type: "DRAFT",
      category: isCartoon ? "TV" : "SPORTS",
      subtype: league,
      title: data.title ?? `${league} Draft`,
    },
  });

  const draft = await prisma.draft.create({
    data: {
      ...data,
      league,
      gameId: game.id,
      ownerId: userId ?? null,
      rules: rulesJson,
      scoringMethod: scoringMethodOverride || data.scoringMethod || "system",
      participants,
      playersPerTeam: playersPerTeamFinal,
      maxPlayers,
      requirePositions:
        data.requirePositions !== undefined
          ? data.requirePositions
          : isNfl
          ? true
          : isCartoon
          ? false
          : true,
    },
  });

  // 🔹 If this draft was started from an online room, notify lobby clients
  if ((rules as any).online && (rules as any).roomCode) {
    const io = getIo();
    const roomCode = (rules as any).roomCode as string;

    if (roomCode) {
      // tie draft to the room so late joiners can be redirected
      await prisma.room
        .update({
          where: { code: roomCode },
          data: { status: "in_progress", gameId: draft.id },
        })
        .catch(() => null);
    }

    if (io && roomCode) {
      io.to(`room:${roomCode}`).emit("room:draft-started", {
        draftId: draft.id,
      });
    }
  }

  return draft;
}

/* -------------------------------------------------------------------------- */
/*                                  GET DRAFT                                 */
/* -------------------------------------------------------------------------- */

export async function getDraft(id: string) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      picks: {
        include: { player: { include: { seasonStats: true } } },
        orderBy: { slot: "asc" },
      },
      nflPicks: {
        include: { player: { include: { seasons: true } } },
        orderBy: { slot: "asc" },
      },
      cartoonPicks: {
        include: {
          show: true,
          character: {
            include: { show: true },
          },
        },
        orderBy: { slot: "asc" },
      },
      votes: true,
    },
  });

  if (draft) {
    const league = (draft.league || "NBA").toUpperCase();
    if (league === "NFL") {
      return {
        ...draft,
        picks: (draft as any).nflPicks || [],
      };
    }
    if (league === "CARTOON") {
      return {
        ...draft,
        picks: (draft as any).cartoonPicks || [],
      };
    }
  }

  return draft;
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
  const draft = await prisma.draft.findUnique({ where: { id } });
  if (!draft) throw new Error("Draft not found");

  const rules: DraftRules = (draft.rules as any) || {};
  const roomCode = (rules as any).roomCode as string | undefined;
  const hostUserId = (rules as any).hostUserId as string | undefined;
  const io = getIo();

  await prisma.nBADraftPick.deleteMany({ where: { draftId: id } });
  await prisma.nFLDraftPick.deleteMany({ where: { draftId: id } });
  await prisma.cartoonDraftPick.deleteMany({ where: { draftId: id } });
  await prisma.vote.deleteMany({ where: { draftId: id } });
  await prisma.draft.delete({ where: { id } });

  // For online drafts, reset/clean up the room as well
  if (rules.online && roomCode) {
    // Tear down the room entirely so all players are ejected
    await prisma.roomParticipant.deleteMany({
      where: { room: { code: roomCode } },
    });
    await prisma.room.deleteMany({ where: { code: roomCode } });

    if (io) {
      io.to(`room:${roomCode}`).emit("room:cancelled", { code: roomCode });
    }
  }

  // Notify any connected draft clients so UIs can exit immediately
  if (io) {
    io.to(`draft:${id}`).emit("draft:cancelled", { draftId: id, roomCode });
  }

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
      cartoonPicks: {
        include: { show: true, character: true },
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
    playerId?: string;
    position?: string;
    userId?: string | null;
    teamOverride?: string | null;
    eraFromOverride?: number | null;
    eraToOverride?: number | null;
    seasonOverride?: number | null;
    cartoonShowId?: string;
    cartoonCharacterId?: string;
    isAutoPick?: boolean;
  }
) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Draft not found");

  const league = (draft.league || "NBA").toUpperCase();
  const isNfl = league === "NFL";
  const isCartoon = league === "CARTOON";

  const rules: DraftRules = {
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  };

  const lineup = isNfl ? getNflLineup(rules) : undefined;
  const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(
    isNfl
      ? {
          ...draft,
          playersPerTeam: rules.playersPerTeam || draft.playersPerTeam,
        }
      : draft,
    rules
  );
  const playersPerTeamFinal = isNfl
    ? lineup?.length ?? playersPerTeam
    : playersPerTeam;

  const picks = isNfl
    ? (draft as any).nflPicks || []
    : isCartoon
    ? ((draft as any).cartoonPicks as any[]) || []
    : draft.picks;
  const pickIndex = picks.length;

  const slotOwner =
    isNfl && playersPerTeamFinal
      ? Math.floor((data.slot - 1) / playersPerTeamFinal) + 1
      : (pickIndex % participants) + 1;

  const ownerIndex = slotOwner;

  if (slotOwner !== ownerIndex) {
    throw new Error("Invalid slot ownership");
  }

  // 🔹 NEW: enforce by userId when online
  const seatAssignments: string[] | undefined = (rules as any).seatAssignments;

  if (rules.online && seatAssignments && seatAssignments.length) {
    const expectedUserId = seatAssignments[ownerIndex - 1];
    const isHostAutoPick =
      data.isAutoPick &&
      (rules as any).hostUserId &&
      data.userId === (rules as any).hostUserId;
    if (expectedUserId && expectedUserId !== data.userId && !isHostAutoPick) {
      throw new Error("Not your turn");
    }
  }

  if (!isNfl) {
    const slotParticipant =
      Math.floor((data.slot - 1) / playersPerTeamFinal) + 1;
    if (slotParticipant !== ownerIndex) throw new Error("Not your turn");
  }

  if (isCartoon) {
    const targetId =
      data.cartoonCharacterId || data.cartoonShowId || data.playerId;
    if (!targetId) throw new Error("Character or show is required");
    if (
      picks.some(
        (p: any) => p.characterId === targetId || p.showId === targetId
      )
    ) {
      throw new Error("Pick already drafted");
    }
  } else if (picks.some((p: any) => p.playerId === data.playerId)) {
    throw new Error("Player already drafted");
  }

  let createdPick: any = null;

  if (isNfl) {
    if (!data.playerId) {
      throw new Error("playerId is required");
    }
    const player = await prisma.nFLPlayer.findUnique({
      where: { id: data.playerId },
      include: { seasons: true },
    });
    if (!player) throw new Error("Player not found");

    const eraCtx: NflEraContext = {
      eraFrom:
        data.eraFromOverride ?? rules.eraFrom ?? draft.eraFrom ?? undefined,
      eraTo: data.eraToOverride ?? rules.eraTo ?? draft.eraTo ?? undefined,
    };

    const lineup = getNflLineup(rules);
    const requiredPos = draft.requirePositions
      ? lineup[(data.slot - 1) % playersPerTeamFinal]
      : null;
    const normalizedPos = normalizeNflPosition(data.position);

    if (
      requiredPos &&
      requiredPos !== "FLEX" &&
      normalizedPos !== requiredPos
    ) {
      throw new Error(`Slot requires ${requiredPos}`);
    }
    if (requiredPos === "FLEX" && !["RB", "WR", "TE"].includes(normalizedPos)) {
      throw new Error("Flex slot only allows RB/WR/TE");
    }
    if (
      rules.fantasyScoring &&
      ["DL", "LB", "DB", "DEF", "OL"].includes(normalizedPos)
    ) {
      throw new Error("Fantasy scoring is offense-only");
    }

    const chosen = chooseNflSeasonForScoring(player, eraCtx, {
      seasonOverride: data.seasonOverride ?? null,
    });
    if (!chosen) throw new Error("No valid season");

    createdPick = await prisma.nFLDraftPick.create({
      data: {
        draftId,
        slot: data.slot,
        playerId: data.playerId,
        position: normalizedPos,
        ownerIndex,
        seasonUsed: chosen.seasonUsed ?? null,
        teamUsed: null,
      },
    });
  } else if (isCartoon) {
    const draftType =
      (rules.cartoonDraftType as DraftRules["cartoonDraftType"]) ||
      "character";
    const targetId =
      data.cartoonCharacterId || data.cartoonShowId || data.playerId;
    if (!targetId) throw new Error("Character or show is required");

    if (draftType === "show" && rules.allowShows === false) {
      throw new Error("Shows are disabled for this draft");
    }
    if (draftType === "character" && rules.allowCharacters === false) {
      throw new Error("Characters are disabled for this draft");
    }
    if (draftType === "character" && data.cartoonShowId) {
      throw new Error("This draft is character-only");
    }
    if (draftType === "show" && data.cartoonCharacterId) {
      throw new Error("This draft is show-only");
    }

    let show: any = null;
    let character: any = null;

    if (draftType === "show") {
      show = await prisma.cartoonShow.findUnique({
        where: { id: targetId },
      });
      if (!show) throw new Error("Show not found");
    } else {
      character = await prisma.cartoonCharacter.findUnique({
        where: { id: targetId },
        include: { show: true },
      });
      if (!character) throw new Error("Character not found");
      show = character.show;
    }

    const channelFilter = rules.cartoonChannel || null;
    if (
      channelFilter &&
      show?.channel &&
      channelFilter.toString() !== show.channel.toString()
    ) {
      throw new Error("Channel restricted in this draft");
    }

    const ageFilter =
      rules.cartoonAgeRating ??
      (rules.cartoonMode === "adult-only"
        ? "adult"
        : rules.cartoonMode === "kids-only"
        ? "kids"
        : rules.cartoonMode === "baby-shows"
        ? "baby"
        : null);
    if (ageFilter && show?.ageRating && show.ageRating !== ageFilter) {
      throw new Error("Age rating restricted in this draft");
    }

    const eraFrom = rules.cartoonEraFrom ?? rules.eraFrom ?? draft.eraFrom;
    const eraTo = rules.cartoonEraTo ?? rules.eraTo ?? draft.eraTo;
    if (eraFrom && (show.yearTo ?? show.yearFrom) < eraFrom) {
      throw new Error("Selection is before the allowed era");
    }
    if (eraTo && show.yearFrom > eraTo) {
      throw new Error("Selection is after the allowed era");
    }

    if (draftType === "character") {
      if (rules.cartoonRequireSuperhero && !character.isSuperhero) {
        throw new Error("Only superhero characters are allowed");
      }
      if (rules.cartoonGender && character.gender !== rules.cartoonGender) {
        throw new Error("Character does not match gender filter");
      }
    }

    createdPick = await prisma.cartoonDraftPick.create({
      data: {
        draftId,
        slot: data.slot,
        ownerIndex,
        entityType: draftType === "show" ? "SHOW" : "CHARACTER",
        showId: show.id,
        characterId: draftType === "character" ? character.id : null,
      },
    });
  } else {
    if (!data.playerId) {
      throw new Error("playerId is required");
    }
    const player = await prisma.nBAPlayer.findUnique({
      where: { id: data.playerId },
      include: { seasonStats: true },
    });
    if (!player) throw new Error("Player not found");

    const eraCtx = {
      eraFrom:
        data.eraFromOverride ?? rules.eraFrom ?? draft.eraFrom ?? undefined,
      eraTo: data.eraToOverride ?? rules.eraTo ?? draft.eraTo ?? undefined,
    };

    const chosen = chooseSeasonForScoring(player, rules, eraCtx, {
      teamOverride: data.teamOverride ?? rules.teamLandedOn ?? null,
    });
    if (!chosen) throw new Error("No valid season");

    // Casual PPG cap: prevent team from exceeding maxPpgCap
    if (rules.mode === "casual" && rules.maxPpgCap) {
      let teamTotalPpg = chosen.statLine.ppg;

      for (const existing of draft.picks) {
        if (existing.ownerIndex !== ownerIndex) continue;
        if (!existing.player) continue;

        const existingChoice = chooseSeasonForScoring(
          existing.player,
          rules,
          eraCtx,
          {
            teamOverride: existing.teamUsed ?? null,
            seasonOverride: existing.seasonUsed ?? null,
          }
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

    createdPick = await prisma.nBADraftPick.create({
      data: {
        draftId,
        slot: data.slot,
        playerId: data.playerId,
        position: data.position,
        ownerIndex,
        seasonUsed: chosen.seasonUsed ?? null,
        teamUsed:
          data.teamOverride ??
          rules.teamLandedOn ??
          draft.teamConstraint ??
          null,
      },
    });
  }

  // Clear saved spin state so next turn starts fresh
  const nextRules = jsonSafe({
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  });
  delete (nextRules as any).savedState;

  await prisma.draft.update({
    where: { id: draftId },
    data: { rules: nextRules },
  });

  // broadcast updated draft
  const updated = await getDraft(draftId);
  const io = getIo();
  if (io && updated) {
    io.to(`draft:${draftId}`).emit("draft:update", updated);
  }

  return createdPick;
}

/* -------------------------------------------------------------------------- */
/*                                 UNDO PICK                                  */
/* -------------------------------------------------------------------------- */

export async function undoPick(draftId: string, slot: number) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Draft not found");

  const isNfl = (draft.league || "NBA").toUpperCase() === "NFL";
  const isCartoon = (draft.league || "NBA").toUpperCase() === "CARTOON";
  const rules: DraftRules = {
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  };

  if (rules.online) {
    throw new Error("Undo is disabled for online drafts");
  }

  if (isNfl) {
    const existing = await prisma.nFLDraftPick.findFirst({
      where: { draftId, slot },
    });
    if (existing) {
      await prisma.nFLDraftPick.delete({ where: { id: existing.id } });
    }
  } else if (isCartoon) {
    const existing = await prisma.cartoonDraftPick.findFirst({
      where: { draftId, slot },
    });
    if (existing) {
      await prisma.cartoonDraftPick.delete({ where: { id: existing.id } });
    }
  } else {
    const existing = await prisma.nBADraftPick.findFirst({
      where: { draftId, slot },
    });
    if (existing)
      await prisma.nBADraftPick.delete({ where: { id: existing.id } });
  }
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

  const league = (draft.league || "NBA").toUpperCase();
  const isNfl = league === "NFL";
  const isCartoon = league === "CARTOON";

  const rules: DraftRules = {
    ...(draft.rules as any),
    ...(draft.rules as any)?.savedState,
  };

  if (isCartoon) {
    const scoringMethod: CartoonScoringMethod =
      (rules.cartoonScoring as CartoonScoringMethod) ||
      (draft.scoringMethod as CartoonScoringMethod) ||
      "system";

    const teams = new Map<
      number,
      { participant: number; picks: any[]; totalScore: number; totalPpg: number }
    >();

    const picks =
      (draft as any).cartoonPicks ||
      (draft as any).picks ||
      [];

    for (const pick of picks) {
      if (!pick.ownerIndex) continue;
      const show = pick.show ?? pick.character?.show;
      if (!show) continue;

      const entityType =
        pick.entityType || (pick.characterId ? "CHARACTER" : "SHOW");

      const pickScore =
        scoringMethod === "system" || scoringMethod === "community"
          ? entityType === "SHOW"
            ? scoreCartoonShow(show)
            : scoreCartoonCharacter({
                ...(pick.character as any),
                show,
              })
          : 0;

      if (!teams.has(pick.ownerIndex)) {
        teams.set(pick.ownerIndex, {
          participant: pick.ownerIndex,
          picks: [],
          totalScore: 0,
          totalPpg: 0,
        });
      }

      const team = teams.get(pick.ownerIndex)!;
      const scoredPick = {
        pickId: pick.id,
        playerId: pick.characterId ?? pick.showId ?? "",
        slot: pick.slot,
        ownerIndex: pick.ownerIndex,
        name:
          entityType === "SHOW"
            ? show.name
            : pick.character?.name ?? "Unknown",
        position: entityType,
        seasonUsed: undefined,
        ppg: show.imdbRating ?? 0,
        score: pickScore,
        threeRate: null,
        usgPct: null,
        heightInches: null,
      };

      team.picks.push(scoredPick);
      team.totalScore += pickScore;
      team.totalPpg += scoredPick.ppg;
    }

    const voteTotal =
      draft.votes?.reduce((sum: number, v: any) => sum + (v.value ?? 0), 0) ||
      0;

    const teamList = Array.from(teams.values());
    if (scoringMethod === "community" && teamList.length) {
      const leader = teamList.reduce((best, curr) =>
        curr.totalScore > best.totalScore ? curr : best
      );
      leader.totalScore = applyCommunityBonus(leader.totalScore, voteTotal);
    }

    let winner: number | undefined;
    if (teamList.length > 1 && scoringMethod !== "user") {
      winner = teamList.reduce((best, curr) =>
        curr.totalScore > best.totalScore ? curr : best
      ).participant;
    }

    const allPicks = teamList.flatMap((t) => t.picks);
    const ruleWarnings: string[] = [];
    if (scoringMethod === "user") {
      ruleWarnings.push(
        "User-decided scoring: rely on votes to determine the winner."
      );
    }
    if (scoringMethod === "community" && voteTotal) {
      ruleWarnings.push(
        "Community vote bonus applied: +1 to the top-scoring team."
      );
    }

    if (winner && draft.gameId && draft.ownerId) {
      await prisma.gameResult.create({
        data: {
          gameId: draft.gameId,
          userId: draft.ownerId,
          score:
            teamList.find((t) => t.participant === winner)?.totalScore ?? 0,
        },
      });
    }

    return {
      draftId,
      teamScore: teamList.reduce((s, t) => s + t.totalScore, 0),
      avgScore:
        teamList.reduce((s, t) => s + t.totalScore, 0) /
        Math.max(1, teamList.length),
      totalPpg: teamList.reduce((s, t) => s + t.totalPpg, 0),
      perPlayerScores: allPicks,
      teams: teamList.map((t) => ({
        participant: t.participant,
        teamScore: t.totalScore,
        totalPpg: t.totalPpg,
        totalRating: t.totalScore / Math.max(1, t.picks.length),
        picks: t.picks,
      })),
      winner,
      ruleWarnings,
    };
  }

  if (isNfl) {
    const eraCtx: NflEraContext = {
      eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
      eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
    };

    const lineup = getNflLineup(rules);
    const teams = new Map<
      number,
      {
        participant: number;
        picks: any[];
        totalScore: number;
        totalYards: number;
      }
    >();

    for (const pick of draft.nflPicks) {
      if (!pick.ownerIndex) continue;
      const choice = chooseNflSeasonForScoring(pick.player, eraCtx, {
        seasonOverride: pick.seasonUsed ?? null,
      });
      if (!choice) continue;

      if (!teams.has(pick.ownerIndex)) {
        teams.set(pick.ownerIndex, {
          participant: pick.ownerIndex,
          picks: [],
          totalScore: 0,
          totalYards: 0,
        });
      }

      const team = teams.get(pick.ownerIndex)!;
      const roleCtx = {
        lineupPositions: lineup,
        existingPositions: team.picks.map((p) => p.position as NflPosition),
        fantasyScoring: rules.fantasyScoring,
      };

      const accCtx = {
        proBowls: (pick.player as any).proBowls ?? 0,
        allPros: (pick.player as any).allPros ?? 0,
        hallOfFame: (pick.player as any).hallOfFame ?? false,
        championships: (pick.player as any).championships ?? 0,
      };

      const pos = normalizeNflPosition(pick.position);
      const score = scoreNflPlayer(
        choice.statLine,
        pos,
        eraCtx,
        roleCtx,
        accCtx
      );

      const yardsPerGame =
        choice.statLine.yards && choice.statLine.games
          ? choice.statLine.yards / Math.max(choice.statLine.games, 1)
          : choice.statLine.yards ?? 0;

      const scoredPick = {
        pickId: pick.id,
        playerId: pick.playerId,
        slot: pick.slot,
        ownerIndex: pick.ownerIndex,
        name: pick.player.name,
        position: pick.position,
        seasonUsed: pick.seasonUsed ?? choice.seasonUsed,
        ppg: yardsPerGame,
        score,
        threeRate: null,
        usgPct: null,
        heightInches: null,
      };

      team.picks.push(scoredPick);
      team.totalScore += score;
      team.totalYards += choice.statLine.yards ?? 0;
    }

    const teamList = Array.from(teams.values()).map((t) => ({
      participant: t.participant,
      teamScore: t.totalScore,
      totalPpg: t.totalYards,
      totalRating: t.totalScore / Math.max(1, t.picks.length),
      picks: t.picks,
    }));

    let winner: number | undefined;
    if (teamList.length > 1) {
      winner = teamList.reduce((best, curr) =>
        curr.teamScore > best.teamScore ? curr : best
      ).participant;
    }

    if (winner && draft.gameId && draft.ownerId) {
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

    const choice = chooseSeasonForScoring(pick.player, rules, eraCtx, {
      teamOverride: pick.teamUsed ?? null,
      seasonOverride: pick.seasonUsed ?? null,
    });
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

  const league = (draft.league || "NBA").toUpperCase();
  if (league === "NFL" || league === "CARTOON") {
    return [];
  }

  // Classic is always pure — no suggestions
  if (rules.mode !== "casual" || rules.suggestionsEnabled === false) {
    return [];
  }

  const eraCtx: NbaEraContext = {
    eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
    eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
  };

  const spunTeam = rules.teamLandedOn
    ? normalizeFranchise(rules.teamLandedOn)
    : null;

  // 🔒 Only suggest when we have at least era or team context
  if (!spunTeam && !eraCtx.eraFrom && !eraCtx.eraTo) {
    return [];
  }

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

    if (requiredPosition && !eligiblePositions.includes(requiredPosition)) {
      continue;
    }

    // pick best season given rules + era + team
    const chosen = chooseSeasonForScoring(player, rules, eraCtx);
    if (!chosen) continue;

    // Optionally: if a team is spun AND mode is "peak-era-team" or classic-like,
    // skip players whose chosen season is not on that team.
    if (spunTeam) {
      const normalizedSeasonTeam = normalizeFranchise(chosen.statLine.team);
      if (normalizedSeasonTeam !== spunTeam) continue;
    }

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
