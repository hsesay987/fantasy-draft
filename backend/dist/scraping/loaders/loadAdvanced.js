"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAdvanced = loadAdvanced;
// loaders/loadAdvanced.ts
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const normalizeSeason_1 = require("../utils/normalizeSeason");
async function loadAdvanced(path) {
    const rows = [];
    await new Promise((res) => {
        fs_1.default.createReadStream(path)
            .pipe((0, csv_parser_1.default)())
            .on("data", (r) => rows.push(r))
            .on("end", res);
    });
    let count = 0;
    for (const r of rows) {
        count++;
        if (count % 1000 === 0) {
            console.log(`📊 Processed ${count} rows from Advanced.csv`);
        }
        const season = (0, normalizeSeason_1.normalizeSeason)(Number(r.season));
        if (!r.player_id)
            continue;
        // Ensure player exists before upserting stats to avoid FK errors
        const player = await prisma_1.default.nBAPlayer.findUnique({
            where: { id: r.player_id },
            select: { id: true },
        });
        if (!player)
            continue;
        await prisma_1.default.nBAPlayerSeasonStat.upsert({
            where: { playerId_season: { playerId: r.player_id, season } },
            update: {
                usgPct: Number(r.usg_percent) || null,
                per: Number(r.per) || null,
                ws: Number(r.ws) || null,
                wsPer48: Number(r.ws_48) || null,
                bpm: Number(r.bpm) || null,
                obpm: Number(r.obpm) || null,
                dbpm: Number(r.dbpm) || null,
                vorp: Number(r.vorp) || null,
            },
            create: {
                playerId: r.player_id,
                season,
                team: r.team,
                ppg: 0,
                apg: 0,
                rpg: 0,
            },
        });
    }
}
//# sourceMappingURL=loadAdvanced.js.map