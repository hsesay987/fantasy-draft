"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEndOfSeasonTeams = loadEndOfSeasonTeams;
const fs_1 = __importDefault(require("fs"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const normalizeSeason_1 = require("../utils/normalizeSeason");
async function loadEndOfSeasonTeams(path) {
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
            console.log(`📊 Processed ${count} rows from EndOfSeasonTeams.csv`);
        }
        if (!r.player_id || !r.type)
            continue;
        const season = (0, normalizeSeason_1.normalizeSeason)(Number(r.season));
        const type = String(r.type).toLowerCase();
        const number = String(r.number_tm || "").toLowerCase();
        const data = {};
        const teamNumber = number.includes("1")
            ? 1
            : number.includes("2")
                ? 2
                : number.includes("3")
                    ? 3
                    : null;
        if (type.includes("all-nba"))
            data.allNBA = teamNumber;
        if (type.includes("all-defense"))
            data.allDefense = teamNumber;
        if (type.includes("all-rookie"))
            data.allRookie = true;
        if (!Object.keys(data).length)
            continue;
        await prisma_1.default.nBAPlayerSeasonStat.updateMany({
            where: { playerId: r.player_id, season },
            data,
        });
    }
}
//# sourceMappingURL=loadEndOfSeasonTeams.js.map