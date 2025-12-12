"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedNba1960To1979FromCsv = seedNba1960To1979FromCsv;
const prisma_1 = __importDefault(require("../lib/prisma"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
function normalizeFranchise(raw) {
    if (!raw)
        return null;
    const t = raw.toUpperCase();
    if (t === "TOT")
        return null; // multi-team season, not tied to 1 franchise
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
// Helpers from modern seeder
function calcTsPct(pts, fga, fta) {
    const denom = 2 * (fga + 0.44 * fta);
    if (!denom)
        return null;
    return pts / denom;
}
function calcThreeRate(fg3a, fga) {
    if (!fga)
        return null;
    return fg3a / fga;
}
function getEligiblePositions(primaryPos) {
    const posMap = {
        PG: ["PG", "SG"],
        SG: ["SG", "PG"],
        SF: ["SF", "PF"],
        PF: ["PF", "SF"],
        C: ["C", "PF"],
        G: ["PG", "SG"],
        F: ["SF", "PF"],
        "F-C": ["PF", "C"],
        "G-F": ["SG", "SF"],
        "C-F": ["C", "PF"],
        UNK: ["PG", "SG", "SF", "PF", "C"],
    };
    const positions = posMap[primaryPos] || [primaryPos];
    return Array.from(new Set(positions)).join(",");
}
async function seedNba1960To1979FromCsv() {
    console.log("Loading CSV players (1960–1979)…");
    const results = [];
    const filePath = path_1.default.join(__dirname, "nba_players_1950_2022.csv"); // CHANGE IF NEEDED
    await new Promise((resolve, reject) => {
        fs_1.default.createReadStream(filePath)
            .pipe((0, csv_parser_1.default)())
            .on("data", (data) => results.push(data))
            .on("end", resolve)
            .on("error", reject);
    });
    console.log(`Raw CSV rows: ${results.length}`);
    // Group ALL rows by player first
    const rawPlayersMap = new Map();
    for (const row of results) {
        const name = row["Player"].trim();
        if (!rawPlayersMap.has(name))
            rawPlayersMap.set(name, []);
        rawPlayersMap.get(name).push(row);
    }
    // Now filter ONLY true 1960–1979 career players
    const playersMap = new Map();
    for (const [name, rows] of rawPlayersMap.entries()) {
        const seasons = rows.map((r) => Number(r["Season"]));
        const minSeason = Math.min(...seasons);
        const maxSeason = Math.max(...seasons);
        // Strict requirement: player must ONLY exist within 1960–1979
        if (minSeason >= 1960 && maxSeason <= 1979) {
            playersMap.set(name, rows.filter((r) => Number(r["Season"]) >= 1960 && Number(r["Season"]) <= 1979));
        }
    }
    console.log(`Players in 1960–1979 era: ${playersMap.size}`);
    let i = 0;
    for (const [name, seasons] of playersMap.entries()) {
        i++;
        // build first/last name
        const [firstName, ...rest] = name.split(" ");
        const lastName = rest.join(" ") || "";
        // derive primary position
        const pos = seasons[0]["Pos"] || "UNK";
        const primaryPos = pos.split("-")[0];
        const eligible = getEligiblePositions(primaryPos);
        // Derive team + era info
        const teamSet = new Set();
        let eraFrom = 9999;
        let eraTo = 0;
        for (const s of seasons) {
            const season = Number(s["Season"]);
            const team = s["Tm"];
            eraFrom = Math.min(eraFrom, season);
            eraTo = Math.max(eraTo, season);
            teamSet.add(normalizeFranchise(team));
        }
        // Generate consistent ID
        const playerId = `era_${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        // Upsert Player (if API already put him there, update instead)
        const player = await prisma_1.default.nBAPlayer.upsert({
            where: { id: playerId },
            update: {
                name,
                firstName,
                lastName,
                position: primaryPos,
                eligiblePositions: eligible,
                primaryTeam: Array.from(teamSet)[0] ?? null,
                primaryEraFrom: eraFrom,
                primaryEraTo: eraTo,
                totalTeams: teamSet.size,
            },
            create: {
                id: playerId,
                name,
                firstName,
                lastName,
                position: primaryPos,
                eligiblePositions: eligible,
                heightInches: 75, // You may adjust later
                primaryTeam: Array.from(teamSet)[0] ?? null,
                primaryEraFrom: eraFrom,
                primaryEraTo: eraTo,
                isHallOfFamer: false,
                totalTeams: teamSet.size,
                imageUrl: null,
            },
        });
        // Wipe seasons and reinsert
        await prisma_1.default.nBAPlayerSeasonStat.deleteMany({
            where: { playerId: player.id },
        });
        for (const row of seasons) {
            const season = Number(row["Season"]);
            const pts = Number(row["PTS"] || 0);
            const fga = Number(row["FGA"] || 0);
            const fta = Number(row["FTA"] || 0);
            const fg3a = Number(row["3PA"] || 0);
            const spg = Number(row["STL"] || 0);
            const bpg = Number(row["BLK"] || 0);
            const rpg = Number(row["TRB"] || 0);
            const apg = Number(row["AST"] || 0);
            const g = Number(row["G"] || 0);
            const tsPct = calcTsPct(pts / g, fga / g, fta / g);
            const threeRate = calcThreeRate(fg3a, fga);
            await prisma_1.default.nBAPlayerSeasonStat.create({
                data: {
                    playerId: player.id,
                    season,
                    team: normalizeFranchise(row["Tm"]),
                    games: g,
                    ppg: pts / g,
                    apg,
                    rpg,
                    spg,
                    bpg,
                    tsPct,
                    threeRate,
                    per: null,
                    ws: null,
                    usgPct: null,
                },
            });
        }
        if (i % 25 === 0)
            console.log(`Seeded ${i} players`);
    }
    console.log("1960–1979 CSV seeding complete.");
}
//# sourceMappingURL=seedNba1960To1979FromCsv.js.map