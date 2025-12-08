import fs from "fs";
import csv from "csv-parser";
import prisma from "../../lib/prisma";
import { normalizeSeason } from "../utils/normalizeSeason";

export async function loadPer36(path: string) {
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
      console.log(`📊 Processed ${count} rows from Per36.csv`);
    }
    const season = normalizeSeason(Number(r.season));
    if (!r.player_id) continue;

    await prisma.nBAPlayerSeasonStat.updateMany({
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
