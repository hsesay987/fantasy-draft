"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedModernFromCsv = seedModernFromCsv;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sync_1 = require("csv-parse/sync");
const prisma_1 = __importDefault(require("../lib/prisma"));
// 🧩 ADJUST THESE TO MATCH YOUR CSV HEADERS
const COL = {
    playerId: "Player", // CSV does not include a dedicated id, so fall back to the name
    playerName: "Player",
    seasonYear: "Season", // e.g. 2003, 2013 etc
    team: "Tm", // e.g. "LAL", "BOS"
    games: "G", // games played
    pts: "PTS", // total points
    ast: "AST", // total assists
    trb: "TRB", // total rebounds
    stl: "STL", // total steals
    blk: "BLK", // total blocks
    fga: "FGA", // field goal attempts
    fta: "FTA", // free throw attempts
    fg3a: "3PA", // three-point attempts
    pos: "Pos", // position, like "PG", "SG", "PF"
    heightInches: "height_in", // if present, else we’ll default later
    // Optionally advanced stats (if present in dataset):
    per: "PER",
    ws: "WS",
    bpm: "BPM",
    vorp: "VORP",
    usg: "USG%",
};
function num(v) {
    if (v === null || v === undefined || v === "")
        return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
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
async function loadCsv() {
    const csvPath = path_1.default.join(process.cwd(), "data", "nba_player_seasons.csv");
    const buf = await promises_1.default.readFile(csvPath);
    const records = (0, sync_1.parse)(buf, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    return records;
}
async function buildPlayersFromCsv() {
    const rows = await loadCsv();
    const playersMap = new Map();
    for (const row of rows) {
        const seasonYear = num(row[COL.seasonYear]);
        if (!seasonYear || seasonYear < 1980)
            continue; // modern-era filter
        const rawId = (row[COL.playerId] || row[COL.playerName]).trim();
        if (!rawId)
            continue;
        const id = String(rawId);
        const name = (row[COL.playerName] || "").trim();
        if (!name)
            continue;
        const [firstName, ...rest] = name.split(" ");
        const lastName = rest.join(" ");
        const team = (row[COL.team] || "").trim();
        const games = num(row[COL.games]);
        const pts = num(row[COL.pts]);
        const ast = num(row[COL.ast]);
        const trb = num(row[COL.trb]);
        const stl = num(row[COL.stl]);
        const blk = num(row[COL.blk]);
        const fga = num(row[COL.fga]);
        const fta = num(row[COL.fta]);
        const fg3a = num(row[COL.fg3a]);
        const tsPct = calcTsPct(pts, fga, fta);
        const threeRate = calcThreeRate(fg3a, fga);
        let player = playersMap.get(id);
        if (!player) {
            const rawPos = (row[COL.pos] || "").trim() || "UNK";
            const heightInches = num(row[COL.heightInches]) || 78; // default 6'6"
            player = {
                id,
                name,
                firstName,
                lastName,
                position: rawPos,
                heightInches,
                teams: new Set(),
                eraFrom: seasonYear,
                eraTo: seasonYear,
                seasons: [],
            };
            playersMap.set(id, player);
        }
        player.teams.add(team);
        player.eraFrom = Math.min(player.eraFrom, seasonYear);
        player.eraTo = Math.max(player.eraTo, seasonYear);
        player.seasons.push({
            season: seasonYear,
            team,
            games,
            pts,
            ast,
            trb,
            stl,
            blk,
            fga,
            fta,
            fg3a,
            tsPct,
            threeRate,
        });
    }
    return Array.from(playersMap.values());
}
async function seedModernFromCsv() {
    console.log("Loading NBA player seasons from CSV...");
    const players = await buildPlayersFromCsv();
    console.log(`Loaded ${players.length} modern players from CSV`);
    let i = 0;
    for (const p of players) {
        i++;
        const player = await prisma_1.default.nBAPlayer.upsert({
            where: { id: p.id },
            update: {
                name: p.name,
                firstName: p.firstName,
                lastName: p.lastName,
                position: p.position,
                heightInches: p.heightInches,
                primaryTeam: p.seasons[0]?.team ?? null,
                primaryEraFrom: p.eraFrom,
                primaryEraTo: p.eraTo,
                // isHallOfFamer can be enriched later (for now default false)
                isHallOfFamer: false,
                totalTeams: p.teams.size,
            },
            create: {
                id: p.id,
                name: p.name,
                firstName: p.firstName,
                lastName: p.lastName,
                position: p.position,
                heightInches: p.heightInches,
                primaryTeam: p.seasons[0]?.team ?? null,
                primaryEraFrom: p.eraFrom,
                primaryEraTo: p.eraTo,
                isHallOfFamer: false,
                totalTeams: p.teams.size,
            },
        });
        await prisma_1.default.nBAPlayerSeasonStat.deleteMany({
            where: { playerId: player.id },
        });
        for (const s of p.seasons) {
            const games = s.games || 1;
            await prisma_1.default.nBAPlayerSeasonStat.create({
                data: {
                    playerId: player.id,
                    season: s.season,
                    team: s.team,
                    games: s.games,
                    ppg: s.pts / games,
                    apg: s.ast / games,
                    rpg: s.trb / games,
                    spg: s.stl / games,
                    bpg: s.blk / games,
                    tsPct: s.tsPct,
                    threeRate: s.threeRate,
                },
            });
        }
        if (i % 50 === 0) {
            console.log(`Seeded ${i}/${players.length} players so far...`);
        }
    }
    console.log("Modern players seeded from CSV.");
}
// ---- Your existing legends pack (pre-1980) ----
async function seedPre1980Legends() {
    const legends = [
        {
            id: "legacy_wilt",
            name: "Wilt Chamberlain",
            firstName: "Wilt",
            lastName: "Chamberlain",
            position: "C",
            heightInches: 84,
            primaryTeam: "LAL",
            primaryEraFrom: 1959,
            primaryEraTo: 1973,
            isHallOfFamer: true,
            totalTeams: 3,
            seasons: [
                {
                    season: 1962,
                    team: "PHW",
                    games: 80,
                    ppg: 50.4,
                    apg: 2.4,
                    rpg: 25.7,
                    spg: 0,
                    bpg: 0,
                    tsPct: 0.537,
                    threeRate: 0,
                },
            ],
        },
        {
            id: "legacy_russell",
            name: "Bill Russell",
            firstName: "Bill",
            lastName: "Russell",
            position: "C",
            heightInches: 82,
            primaryTeam: "BOS",
            primaryEraFrom: 1956,
            primaryEraTo: 1969,
            isHallOfFamer: true,
            totalTeams: 1,
            seasons: [
                {
                    season: 1962,
                    team: "BOS",
                    games: 78,
                    ppg: 18.9,
                    apg: 4.5,
                    rpg: 23.6,
                    spg: 0,
                    bpg: 0,
                    tsPct: 0.494,
                    threeRate: 0,
                },
            ],
        },
        {
            id: "legacy_west",
            name: "Jerry West",
            firstName: "Jerry",
            lastName: "West",
            position: "SG",
            heightInches: 75,
            primaryTeam: "LAL",
            primaryEraFrom: 1960,
            primaryEraTo: 1974,
            isHallOfFamer: true,
            totalTeams: 1,
            seasons: [
                {
                    season: 1969,
                    team: "LAL",
                    games: 74,
                    ppg: 25.9,
                    apg: 7.5,
                    rpg: 4.9,
                    spg: 0,
                    bpg: 0,
                    tsPct: 0.549,
                    threeRate: 0,
                },
            ],
        },
        // (You can add Dr. J, Oscar, Kareem 70s, Gervin, etc. here later)
    ];
    for (const l of legends) {
        const player = await prisma_1.default.nBAPlayer.upsert({
            where: { id: l.id },
            update: {},
            create: {
                id: l.id,
                name: l.name,
                firstName: l.firstName,
                lastName: l.lastName,
                position: l.position,
                heightInches: l.heightInches,
                primaryTeam: l.primaryTeam,
                primaryEraFrom: l.primaryEraFrom,
                primaryEraTo: l.primaryEraTo,
                isHallOfFamer: l.isHallOfFamer,
                totalTeams: l.totalTeams,
            },
        });
        await prisma_1.default.nBAPlayerSeasonStat.deleteMany({
            where: { playerId: player.id },
        });
        for (const s of l.seasons) {
            await prisma_1.default.nBAPlayerSeasonStat.create({
                data: {
                    playerId: player.id,
                    season: s.season,
                    team: s.team,
                    games: s.games,
                    ppg: s.ppg,
                    apg: s.apg,
                    rpg: s.rpg,
                    spg: s.spg,
                    bpg: s.bpg,
                    tsPct: s.tsPct,
                    threeRate: s.threeRate,
                },
            });
        }
    }
    console.log("Pre-1980 legends seeded.");
}
async function main() {
    await seedModernFromCsv();
    await seedPre1980Legends();
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
//# sourceMappingURL=seedNbaFromCsv.js.map