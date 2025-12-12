"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPlayers = searchPlayers;
// src/services/player.service.ts
const prisma_1 = __importDefault(require("../lib/prisma"));
function stripAccents(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
/* -------------------------------------------------------
   TEAM NORMALIZATION (historical → modern franchises)
------------------------------------------------------- */
function normalizeFranchise(raw) {
    if (!raw)
        return null;
    const t = raw.toUpperCase();
    if (t === "TOT")
        return null;
    switch (t) {
        case "PHO":
        case "PHX":
            return "PHX";
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
function pickBestSeasonForPlayer(p, eraFrom, eraTo, team) {
    const targetTeam = team ? normalizeFranchise(team) : null;
    const eraFromInclusive = eraFrom ? eraFrom - 1 : undefined; // allow prior season (e.g., 2009-10 counts for 2010)
    const candid = p.seasonStats.filter((s) => {
        if (eraFromInclusive && s.season < eraFromInclusive)
            return false;
        if (eraTo && s.season > eraTo)
            return false;
        if (targetTeam) {
            const sCode = normalizeFranchise(s.team);
            if (!sCode || sCode !== targetTeam)
                return false;
        }
        return true;
    });
    if (targetTeam && !candid.length)
        return null;
    const pool = candid.length ? candid : p.seasonStats;
    if (!pool.length)
        return null;
    return pool.reduce((best, s) => (!best || s.ppg > best.ppg ? s : best));
}
/* -------------------------------------------------------
   MAIN SEARCH (with full type-safety)
------------------------------------------------------- */
async function searchPlayers(input) {
    const { q, position, eraFrom, eraTo, team, hallRule = "any", multiTeamOnly, limit = 50, offset = 0, } = input;
    const andFilters = []; // or fully type it manually
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
        let positionSet = [pos];
        if (pos === "PG" || pos === "SG") {
            positionSet = ["PG", "SG", "G", "G-F", "F-G"];
        }
        else if (pos === "SF" || pos === "PF") {
            positionSet = ["SF", "PF", "F", "F-C", "C-F", "F-G", "G-F"];
        }
        else if (pos === "C") {
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
    }
    else if (hallRule === "none") {
        andFilters.push({ isHallOfFamer: false });
    }
    const where = andFilters.length ? { AND: andFilters } : {};
    // Only restrict by season range inside the JOIN
    const eraFromInclusive = eraFrom ? eraFrom - 1 : undefined;
    const seasonWhere = eraFromInclusive || eraTo
        ? {
            season: {
                ...(eraFromInclusive ? { gte: eraFromInclusive } : {}),
                ...(eraTo ? { lte: eraTo } : {}),
            },
        }
        : {};
    const rawLimit = Math.max(limit, 1);
    const queryLimit = Math.min(rawLimit * 3, 300);
    const players = await prisma_1.default.nBAPlayer.findMany({
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
        if (!p.seasonStats.length)
            continue;
        const best = pickBestSeasonForPlayer(p, eraFrom, eraTo, team);
        if (team && !best)
            continue;
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
    // Accent-insensitive filter for queries like "jokic" matching "Jokić"
    if (q) {
        const normQ = stripAccents(q).toLowerCase();
        return results
            .filter((p) => stripAccents(p.name).toLowerCase().includes(normQ))
            .slice(0, rawLimit);
    }
    return results.slice(0, rawLimit);
}
//# sourceMappingURL=player.service.js.map