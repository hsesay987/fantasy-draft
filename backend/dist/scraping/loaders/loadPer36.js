"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPer36 = loadPer36;
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const normalizeSeason_1 = require("../utils/normalizeSeason");
async function loadPer36(path) {
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
            console.log(`📊 Processed ${count} rows from Per36.csv`);
        }
        const season = (0, normalizeSeason_1.normalizeSeason)(Number(r.season));
        if (!r.player_id)
            continue;
        await prisma_1.default.nBAPlayerSeasonStat.updateMany({
            where: { playerId: r.player_id, season },
            data: {
                ptsPer36: Number(r.pts_per_36_min) || null,
                trbPer36: Number(r.trb_per_36_min) || null,
                astPer36: Number(r.ast_per_36_min) || null,
                stlPer36: Number(r.stl_per_36_min) || null,
                blkPer36: Number(r.blk_per_36_min) || null,
            },
        });
    }
}
//# sourceMappingURL=loadPer36.js.map