import fs from "fs";
import csv from "csv-parser";
import prisma from "../../lib/prisma";
import { normalizeSeason } from "../utils/normalizeSeason";

export async function loadEndOfSeasonTeams(path: string) {
  const rows: any[] = [];

  await new Promise<void>((res) => {
    fs.createReadStream(path)
      .pipe(csv())
      .on("data", (r) => rows.push(r))
      .on("end", res);
  });

  let count = 0;

  for (const r of rows) {
    count++;
    if (count % 1000 === 0) {
      console.log(`📊 Processed ${count} rows from EndOfSeasonTeams.csv`);
    }
    if (!r.player_id || !r.type) continue;

    const season = normalizeSeason(Number(r.season));
    const type = String(r.type).toLowerCase();
    const number = String(r.number_tm || "").toLowerCase();

    const data: any = {};

    const teamNumber = number.includes("1")
      ? 1
      : number.includes("2")
      ? 2
      : number.includes("3")
      ? 3
      : null;

    if (type.includes("all-nba")) data.allNBA = teamNumber;
    if (type.includes("all-defense")) data.allDefense = teamNumber;
    if (type.includes("all-rookie")) data.allRookie = true;

    if (!Object.keys(data).length) continue;

    await prisma.nBAPlayerSeasonStat.updateMany({
      where: { playerId: r.player_id, season },
      data,
    });
  }
}
