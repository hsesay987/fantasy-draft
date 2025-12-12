"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDraft = createDraft;
exports.getDraft = getDraft;
exports.getDraftsByOwner = getDraftsByOwner;
exports.cancelDraft = cancelDraft;
exports.saveDraftState = saveDraftState;
exports.updatePick = updatePick;
exports.undoPick = undoPick;
exports.scoreDraft = scoreDraft;
exports.addVote = addVote;
exports.getDraftScore = getDraftScore;
exports.getDraftSuggestions = getDraftSuggestions;
// src/services/draft.service.ts
const prisma_1 = __importDefault(require("../lib/prisma"));
const nba_1 = require("../lib/scoring/nba");
const socket_1 = require("../socket");
/* -------------------------------------------------------------------------- */
/*                               NORMALIZE TEAM                               */
/* -------------------------------------------------------------------------- */
function normalizeFranchise(team) {
    const map = {
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
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */
function jsonSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function getParticipantsAndPlayersPerTeam(draft, rules) {
    const participants = rules.participants || draft.participants || 1;
    const playersPerTeam = rules.playersPerTeam && rules.playersPerTeam > 0
        ? rules.playersPerTeam
        : draft.playersPerTeam;
    return { participants, playersPerTeam };
}
/* -------------------------------------------------------------------------- */
/*                        CHOOSE SEASON FOR SCORING                           */
/* -------------------------------------------------------------------------- */
function chooseSeasonForScoring(player, rules, era, opts) {
    if (!player || !player.seasonStats?.length)
        return null;
    const stats = player.seasonStats;
    const eraFrom = rules.eraFrom ?? era.eraFrom;
    const eraTo = rules.eraTo ?? era.eraTo;
    const isClassic = rules.mode === "classic";
    const eraFromInclusive = eraFrom && !isClassic ? eraFrom - 1 : eraFrom ?? undefined;
    const spunTeam = opts?.teamOverride !== undefined
        ? opts.teamOverride
            ? normalizeFranchise(opts.teamOverride)
            : null
        : rules.teamLandedOn
            ? normalizeFranchise(rules.teamLandedOn)
            : null;
    const eraFilter = (s) => {
        if (eraFromInclusive && s.season < eraFromInclusive)
            return false;
        if (eraTo && s.season > eraTo)
            return false;
        return true;
    };
    const teamFilter = (s) => spunTeam ? normalizeFranchise(s.team) === spunTeam : true;
    const byEra = stats.filter(eraFilter);
    const byTeam = stats.filter(teamFilter);
    const byEraTeam = stats.filter((s) => eraFilter(s) && teamFilter(s));
    const mode = rules.statMode || rules.peakMode || (isClassic ? "peak-era-team" : "peak");
    // If a specific season was already locked (e.g., earlier spin), honor it
    if (opts?.seasonOverride != null) {
        const seasonMatch = stats.find((s) => s.season === opts.seasonOverride);
        if (seasonMatch && (!spunTeam || normalizeFranchise(seasonMatch.team) === spunTeam)) {
            return { seasonUsed: seasonMatch.season, statLine: seasonMatch };
        }
        if (seasonMatch) {
            return { seasonUsed: seasonMatch.season, statLine: seasonMatch };
        }
    }
    const peak = (list) => {
        if (!list.length)
            return null;
        const best = list.reduce((a, b) => (a.ppg > b.ppg ? a : b));
        return {
            seasonUsed: best.season,
            statLine: best,
        };
    };
    const average = (list) => {
        if (!list.length)
            return null;
        const n = list.length;
        const avg = {};
        for (const k of Object.keys(list[0])) {
            if (typeof list[0][k] === "number") {
                avg[k] = list.reduce((s, r) => s + (r[k] ?? 0), 0) / n;
            }
        }
        return { seasonUsed: undefined, statLine: avg };
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
async function createDraft(data, userId) {
    const rules = data.rules || {};
    rules.mode = data.mode;
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
    }
    else if (data.mode === "casual") {
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
    }
    else if (data.mode === "free") {
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
    const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(data, rules);
    const maxPlayers = participants * playersPerTeam;
    // ✅ CREATE GAME FIRST
    const game = await prisma_1.default.game.create({
        data: {
            type: "DRAFT",
            category: "SPORTS",
            subtype: "NBA",
            title: data.title ?? "NBA Draft",
        },
    });
    const draft = await prisma_1.default.draft.create({
        data: {
            ...data,
            gameId: game.id,
            ownerId: userId ?? null,
            rules: rulesJson,
            participants,
            playersPerTeam,
            maxPlayers,
        },
    });
    // 🔹 If this draft was started from an online room, notify lobby clients
    if (rules.online && rules.roomCode) {
        const io = (0, socket_1.getIo)();
        const roomCode = rules.roomCode;
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
async function getDraft(id) {
    return prisma_1.default.draft.findUnique({
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
async function getDraftsByOwner(ownerId) {
    return prisma_1.default.draft.findMany({
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
async function cancelDraft(id) {
    await prisma_1.default.nBADraftPick.deleteMany({ where: { draftId: id } });
    await prisma_1.default.vote.deleteMany({ where: { draftId: id } });
    await prisma_1.default.draft.delete({ where: { id } });
    return { ok: true };
}
/* -------------------------------------------------------------------------- */
/*                               SAVE DRAFT STATE                             */
/* -------------------------------------------------------------------------- */
async function saveDraftState(id, savedState, status = "saved") {
    const draft = await prisma_1.default.draft.findUnique({ where: { id } });
    if (!draft)
        throw new Error("Draft not found");
    const rules = (draft.rules || {});
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
    const saved = await prisma_1.default.draft.update({
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
    const io = (0, socket_1.getIo)();
    if (io && updated) {
        io.to(`draft:${id}`).emit("draft:update", updated);
    }
    return saved;
}
/* -------------------------------------------------------------------------- */
/*                            UPDATE PICK                                     */
/* -------------------------------------------------------------------------- */
async function updatePick(draftId, data) {
    const draft = await getDraft(draftId);
    if (!draft)
        throw new Error("Draft not found");
    const rules = {
        ...draft.rules,
        ...draft.rules?.savedState,
    };
    const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(draft, rules);
    const totalPicks = draft.picks.length;
    const activeParticipant = (totalPicks % participants) + 1;
    // 🔹 NEW: enforce by userId when online
    const seatAssignments = rules.seatAssignments;
    if (rules.online && seatAssignments && seatAssignments.length) {
        const expectedUserId = seatAssignments[activeParticipant - 1];
        if (expectedUserId && expectedUserId !== data.userId) {
            throw new Error("Not your turn");
        }
    }
    const slotParticipant = Math.floor((data.slot - 1) / playersPerTeam) + 1;
    if (slotParticipant !== activeParticipant)
        throw new Error("Not your turn");
    if (draft.picks.some((p) => p.playerId === data.playerId))
        throw new Error("Player already drafted");
    const player = await prisma_1.default.nBAPlayer.findUnique({
        where: { id: data.playerId },
        include: { seasonStats: true },
    });
    if (!player)
        throw new Error("Player not found");
    const eraCtx = {
        eraFrom: data.eraFromOverride ??
            rules.eraFrom ??
            draft.eraFrom ??
            undefined,
        eraTo: data.eraToOverride ?? rules.eraTo ?? draft.eraTo ?? undefined,
    };
    const chosen = chooseSeasonForScoring(player, rules, eraCtx, {
        teamOverride: data.teamOverride ?? rules.teamLandedOn ?? null,
    });
    if (!chosen)
        throw new Error("No valid season");
    // Casual PPG cap: prevent team from exceeding maxPpgCap
    if (rules.mode === "casual" && rules.maxPpgCap) {
        let teamTotalPpg = chosen.statLine.ppg;
        for (const existing of draft.picks) {
            if (existing.ownerIndex !== activeParticipant)
                continue;
            if (!existing.player)
                continue;
            const existingChoice = chooseSeasonForScoring(existing.player, rules, eraCtx, {
                teamOverride: existing.teamUsed ?? null,
                seasonOverride: existing.seasonUsed ?? null,
            });
            if (existingChoice) {
                teamTotalPpg += existingChoice.statLine.ppg;
            }
        }
        if (teamTotalPpg > rules.maxPpgCap) {
            throw new Error(`PPG cap exceeded (${teamTotalPpg.toFixed(1)} > ${rules.maxPpgCap.toFixed(1)})`);
        }
    }
    const pick = await prisma_1.default.nBADraftPick.create({
        data: {
            draftId,
            slot: data.slot,
            playerId: data.playerId,
            position: data.position,
            ownerIndex: activeParticipant,
            seasonUsed: chosen.seasonUsed ?? null,
            teamUsed: data.teamOverride ??
                rules.teamLandedOn ??
                draft.teamConstraint ??
                null,
        },
    });
    // Clear saved spin state so next turn starts fresh
    const nextRules = jsonSafe({
        ...draft.rules,
        ...draft.rules?.savedState,
    });
    delete nextRules.savedState;
    await prisma_1.default.draft.update({
        where: { id: draftId },
        data: { rules: nextRules },
    });
    // broadcast updated draft
    const updated = await getDraft(draftId);
    const io = (0, socket_1.getIo)();
    if (io && updated) {
        io.to(`draft:${draftId}`).emit("draft:update", updated);
    }
    return pick;
}
/* -------------------------------------------------------------------------- */
/*                                 UNDO PICK                                  */
/* -------------------------------------------------------------------------- */
async function undoPick(draftId, slot) {
    const draft = await getDraft(draftId);
    if (!draft)
        throw new Error("Draft not found");
    const rules = {
        ...draft.rules,
        ...draft.rules?.savedState,
    };
    if (rules.online) {
        throw new Error("Undo is disabled for online drafts");
    }
    const existing = await prisma_1.default.nBADraftPick.findFirst({
        where: { draftId, slot },
    });
    if (existing)
        await prisma_1.default.nBADraftPick.delete({ where: { id: existing.id } });
    // return getDraft(draftId);
    // broadcast updated draft
    const updated = await getDraft(draftId);
    const io = (0, socket_1.getIo)();
    if (io && updated) {
        io.to(`draft:${draftId}`).emit("draft:update", updated);
    }
    return updated;
}
/* -------------------------------------------------------------------------- */
/*                                  SCORE                                     */
/* -------------------------------------------------------------------------- */
async function scoreDraft(draftId) {
    const draft = await getDraft(draftId);
    if (!draft)
        throw new Error("Draft not found");
    const rules = {
        ...draft.rules,
        ...draft.rules?.savedState,
    };
    const eraCtx = {
        eraFrom: rules.eraFrom ?? draft.eraFrom ?? undefined,
        eraTo: rules.eraTo ?? draft.eraTo ?? undefined,
    };
    const teams = new Map();
    /* --------------------- build team buckets --------------------- */
    for (const pick of draft.picks) {
        if (!pick.ownerIndex)
            continue;
        const choice = chooseSeasonForScoring(pick.player, rules, eraCtx, {
            teamOverride: pick.teamUsed ?? null,
            seasonOverride: pick.seasonUsed ?? null,
        });
        if (!choice)
            continue;
        if (!teams.has(pick.ownerIndex)) {
            teams.set(pick.ownerIndex, {
                participant: pick.ownerIndex,
                picks: [],
                totalScore: 0,
                totalPpg: 0,
            });
        }
        const team = teams.get(pick.ownerIndex);
        const fit = {
            position: pick.position,
            heightInches: pick.player.heightInches ?? 78,
            teamHeights: team.picks.map((p) => p.heightInches ?? 78),
            teamShooters: team.picks.filter((p) => (p.threeRate ?? 0) >= 0.33).length,
            teamPositions: team.picks.map((p) => p.position),
            teamUsage: team.picks.map((p) => p.usgPct ?? 20),
        };
        const score = (0, nba_1.scoreNbaPlayer)(choice.statLine, pick.position, eraCtx, fit);
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
    let winner;
    if (teamList.length > 1) {
        winner = teamList.reduce((best, curr) => curr.teamScore > best.teamScore ? curr : best).participant;
    }
    // After computing teamList and winner inside scoreDraft:
    if (winner && draft.gameId && draft.ownerId) {
        // basic: credit owner with teamScore / avgScore
        // Or, if you later track which user is which participant, map them properly.
        await prisma_1.default.gameResult.create({
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
        avgScore: teamList.reduce((s, t) => s + t.totalRating, 0) /
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
async function addVote(draftId, value) {
    return prisma_1.default.vote.create({
        data: { draftId, value },
    });
}
async function getDraftScore(draftId) {
    return scoreDraft(draftId);
}
/* -------------------------------------------------------------------------- */
/*                              SUGGESTIONS                                   */
/* -------------------------------------------------------------------------- */
async function getDraftSuggestions(draftId, limit = 5) {
    const draft = await getDraft(draftId);
    if (!draft)
        throw new Error("Draft not found");
    const rules = {
        ...draft.rules,
        ...draft.rules?.savedState,
    };
    // Classic is always pure — no suggestions
    if (rules.mode !== "casual" || rules.suggestionsEnabled === false) {
        return [];
    }
    const eraCtx = {
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
    const { participants, playersPerTeam } = getParticipantsAndPlayersPerTeam(draft, rules);
    const activeParticipant = (draft.picks.length % participants) + 1;
    // determine active slot
    const takenSlots = new Set(draft.picks.map((p) => p.slot));
    const allSlots = Array.from({ length: draft.maxPlayers }, (_, i) => i + 1);
    const activeSlot = allSlots.find((s) => Math.floor((s - 1) / playersPerTeam) + 1 === activeParticipant &&
        !takenSlots.has(s)) ?? null;
    if (!activeSlot)
        return [];
    // position constraint
    const requiredPosition = draft.requirePositions
        ? ["PG", "SG", "SF", "PF", "C"][(activeSlot - 1) % playersPerTeam]
        : null;
    const draftedPlayerIds = new Set(draft.picks.map((p) => p.playerId));
    const players = await prisma_1.default.nBAPlayer.findMany({
        include: { seasonStats: true },
    });
    const scored = [];
    for (const player of players) {
        if (draftedPlayerIds.has(player.id))
            continue;
        const eligiblePositions = player.eligiblePositions
            ? player.eligiblePositions.split(",").map((p) => p.trim())
            : [player.position];
        if (requiredPosition && !eligiblePositions.includes(requiredPosition)) {
            continue;
        }
        // pick best season given rules + era + team
        const chosen = chooseSeasonForScoring(player, rules, eraCtx);
        if (!chosen)
            continue;
        // Optionally: if a team is spun AND mode is "peak-era-team" or classic-like,
        // skip players whose chosen season is not on that team.
        if (spunTeam) {
            const normalizedSeasonTeam = normalizeFranchise(chosen.statLine.team);
            if (normalizedSeasonTeam !== spunTeam)
                continue;
        }
        // Casual PPG cap
        if (rules.mode === "casual" &&
            rules.maxPpgCap &&
            chosen.statLine.ppg > rules.maxPpgCap) {
            continue;
        }
        const score = (0, nba_1.scoreNbaPlayer)(chosen.statLine, requiredPosition ?? player.position, eraCtx, {
            position: requiredPosition ?? player.position,
            heightInches: player.heightInches ?? 78,
            teamHeights: [],
            teamShooters: 0,
            teamPositions: [],
            teamUsage: [],
        });
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
//# sourceMappingURL=draft.service.js.map