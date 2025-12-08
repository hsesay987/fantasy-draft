// loaders/loadAwardsVoting.ts
import fs from "fs";
import csv from "csv-parser";
import prisma from "../../lib/prisma";
import { normalizeSeason } from "../utils/normalizeSeason";

export async function loadAwardsVoting(path: string) {
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
      console.log(`📊 Processed ${count} rows from AwardsVoting.csv`);
    }
    if (!r.player_id || !r.award) continue;

    const season = normalizeSeason(Number(r.season));
    const share = Number(r.share);
    if (!Number.isFinite(share)) continue;

    const award = r.award.toLowerCase();

    const data: any = {};
    if (award.includes("mvp")) data.mvpShare = share;
    if (award.includes("dpoy")) data.dpoyShare = share;

    if (!Object.keys(data).length) continue;

    await prisma.nBAPlayerSeasonStat.updateMany({
      where: { playerId: r.player_id, season },
      data,
    });
  }
}
