import fs from "fs";
import csv from "csv-parser";
import prisma from "../../lib/prisma";
import { normalizeSeason } from "../utils/normalizeSeason";

export async function loadPlayByPlay(path: string) {
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
      console.log(`📊 Processed ${count} rows from PlayByPlay.csv`);
    }
    const season = normalizeSeason(Number(r.season));
    if (!r.player_id) continue;

    await prisma.nBAPlayerSeasonStat.updateMany({
      where: { playerId: r.player_id, season },
      data: {
        plusMinusPer100: Number(r.on_court_plus_minus_per_100_poss) || null,
        netPlusMinusPer100: Number(r.net_plus_minus_per_100_poss) || null,
      },
    });
  }
}
