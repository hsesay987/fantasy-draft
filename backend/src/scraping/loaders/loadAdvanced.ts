// loaders/loadAdvanced.ts
import fs from "fs";
import csv from "csv-parser";
import prisma from "../../lib/prisma";
import { normalizeSeason } from "../utils/normalizeSeason";

export async function loadAdvanced(path: string) {
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
      console.log(`📊 Processed ${count} rows from Advanced.csv`);
    }
    const season = normalizeSeason(Number(r.season));
    if (!r.player_id) continue;

    // Ensure player exists before upserting stats to avoid FK errors
    const player = await prisma.nBAPlayer.findUnique({
      where: { id: r.player_id },
      select: { id: true },
    });
    if (!player) continue;

    await prisma.nBAPlayerSeasonStat.upsert({
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
