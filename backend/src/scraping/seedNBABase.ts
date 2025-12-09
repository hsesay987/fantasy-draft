// src/scraping/seedNBABase.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import prisma from "../lib/prisma";

/* ====================== CSV TYPES ====================== */

type TotalsRow = {
  season: string;
  player: string;
  player_id: string;
  pos: string;
  g: string;
  pts: string;
  ast: string;
  trb: string;
  stl: string;
  blk: string;
  fga: string;
  fta: string;
  x3pa: string;
  team: string;
};

type AdvancedRow = {
  season: string;
  player_id: string;
  per: string;
  ws: string;
  usg_percent: string;
};

type CareerRow = {
  player_id: string;
  player: string;
  pos: string;
  ht_in_in: string;
  from: string;
  to: string;
  hof: string;
};

/* ====================== HELPERS ====================== */

const DATA_DIR = path.join(process.cwd(), "data");

const readCsv = <T>(file: string): T[] =>
  parse(fs.readFileSync(path.join(DATA_DIR, file)), {
    columns: true,
    skip_empty_lines: true,
  }) as T[];

const toNum = (v?: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const tsPct = (pts: number, fga: number, fta: number) =>
  fga + 0.44 * fta > 0 ? pts / (2 * (fga + 0.44 * fta)) : null;

const threeRate = (fg3a: number, fga: number) => (fga > 0 ? fg3a / fga : null);

function eligiblePositions(pos: string) {
  const base = (pos || "").toUpperCase();

  const map: Record<string, string[]> = {
    PG: ["PG", "SG"],
    SG: ["SG", "PG"],
    G: ["PG", "SG"],

    SF: ["SF", "PF"],
    PF: ["PF", "SF"],
    F: ["SF", "PF"],

    C: ["C", "PF"],

    "G-F": ["PG", "SG", "SF"],
    "F-G": ["SG", "SF", "PF"],
    "F-C": ["SF", "PF", "C"],
    "C-F": ["PF", "C"],
  };

  return (map[base] || [base]).join(",");
}

/* ====================== MAIN SEED ====================== */

async function main() {
  console.log("🏀 Seeding NBA players & seasons...");

  const totals = readCsv<TotalsRow>("Player Totals.csv");
  const adv = readCsv<AdvancedRow>("Advanced.csv");
  const careers = readCsv<CareerRow>("Player Career Info.csv");

  const advMap = new Map(adv.map((a) => [`${a.player_id}_${a.season}`, a]));

  const careerMap = new Map(careers.map((c) => [c.player_id, c]));

  const players = new Map<string, any>();

  for (const row of totals) {
    const season = Number(row.season);
    if (!row.player_id || season < 1950) continue;

    const key = row.player_id;

    if (!players.has(key)) {
      const c = careerMap.get(key);
      players.set(key, {
        id: key,
        name: row.player,
        position: c?.pos || row.pos || "SF",
        eligiblePositions: eligiblePositions(c?.pos || row.pos || "SF"),
        heightInches: c?.ht_in_in ? Number(c.ht_in_in) : 78,
        hof: c?.hof === "TRUE",
        seasons: new Map<number, any>(),
        teams: new Set<string>(),
        eraFrom: season,
        eraTo: season,
      });
    }

    const g = toNum(row.g);
    if (!g) continue;

    const pts = toNum(row.pts);
    const fga = toNum(row.fga);
    const fta = toNum(row.fta);
    const fg3a = toNum(row.x3pa);

    const advRow = advMap.get(`${key}_${season}`);

    const playerObj = players.get(key);
    playerObj.teams.add(row.team);
    playerObj.eraFrom = Math.min(playerObj.eraFrom, season);
    playerObj.eraTo = Math.max(playerObj.eraTo, season);

    const existing = playerObj.seasons.get(season);

    // Prefer TOT rows, otherwise keep first
    if (!existing || row.team === "TOT") {
      playerObj.seasons.set(season, {
        season,
        team: row.team,
        games: g,
        ppg: pts / g,
        apg: toNum(row.ast) / g,
        rpg: toNum(row.trb) / g,
        spg: toNum(row.stl) / g,
        bpg: toNum(row.blk) / g,
        tsPct: tsPct(pts, fga, fta),
        threeRate: threeRate(fg3a, fga),
        per: advRow ? toNum(advRow.per) : null,
        ws: advRow ? toNum(advRow.ws) : null,
        usgPct: advRow ? toNum(advRow.usg_percent) : null,
      });
    }
  }

  let totalPlayers = 0;

  for (const p of players.values()) {
    totalPlayers++;

    if (totalPlayers % 100 === 0) {
      console.log(`✅ ${totalPlayers} players seeded`);
    }

    const [firstName, ...last] = (p.name || "").split(" ");
    const lastName = last.join(" ") || firstName;
    const seasonsArray = Array.from(p.seasons.values()).sort(
      (a: any, b: any) => a.season - b.season
    );

    const primaryTeam = (seasonsArray[0] as any)?.team ?? null;
    const heightInches = Number.isFinite(p.heightInches)
      ? Number(p.heightInches)
      : 78;

    await prisma.nBAPlayer.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        firstName: firstName || p.name,
        lastName: lastName,
        position: p.position,
        eligiblePositions: p.eligiblePositions,
        heightInches,
        isHallOfFamer: p.hof,
        primaryTeam,
        primaryEraFrom: p.eraFrom ?? null,
        primaryEraTo: p.eraTo ?? null,
        totalTeams: p.teams?.size ?? 1,
      },
      update: {
        name: p.name,
        firstName: firstName || p.name,
        lastName: lastName,
        position: p.position,
        eligiblePositions: p.eligiblePositions,
        heightInches,
        isHallOfFamer: p.hof,
        primaryTeam,
        primaryEraFrom: p.eraFrom ?? null,
        primaryEraTo: p.eraTo ?? null,
        totalTeams: p.teams?.size ?? 1,
      },
    });

    await prisma.nBAPlayerSeasonStat.deleteMany({
      where: { playerId: p.id },
    });

    for (const s of p.seasons.values()) {
      await prisma.nBAPlayerSeasonStat.create({
        data: {
          playerId: p.id,
          ...s,
        },
      });
    }
  }

  console.log("✅ NBA base seed complete");
  await prisma.$disconnect();
}

main().catch(console.error);
