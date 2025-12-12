"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAllStar = loadAllStar;
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const normalizeSeason_1 = require("../utils/normalizeSeason");
async function loadAllStar(path) {
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
            console.log(`📊 Processed ${count} rows from AllStar.csv`);
        }
        if (!r.player_id)
            continue;
        const season = (0, normalizeSeason_1.normalizeSeason)(Number(r.season));
        await prisma_1.default.nBAPlayerSeasonStat.updateMany({
            where: { playerId: r.player_id, season },
            data: { allStar: true },
        });
    }
}
//# sourceMappingURL=loadAllStar.js.map