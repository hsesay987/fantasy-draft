"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPlayByPlay = loadPlayByPlay;
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const normalizeSeason_1 = require("../utils/normalizeSeason");
async function loadPlayByPlay(path) {
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
            console.log(`📊 Processed ${count} rows from PlayByPlay.csv`);
        }
        const season = (0, normalizeSeason_1.normalizeSeason)(Number(r.season));
        if (!r.player_id)
            continue;
        await prisma_1.default.nBAPlayerSeasonStat.updateMany({
            where: { playerId: r.player_id, season },
            data: {
                plusMinusPer100: Number(r.on_court_plus_minus_per_100_poss) || null,
                netPlusMinusPer100: Number(r.net_plus_minus_per_100_poss) || null,
            },
        });
    }
}
//# sourceMappingURL=loadPlayByPlay.js.map