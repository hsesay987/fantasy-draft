import { loadAdvanced } from "./loaders/loadAdvanced";
import { loadPer36 } from "./loaders/loadPer36";
import { loadPlayByPlay } from "./loaders/loadPlayByPlay";
import { loadAllStar } from "./loaders/loadAllStar";
import { loadEndOfSeasonTeams } from "./loaders/loadEndOfSeasonTeams";
import { loadAwardsVoting } from "./loaders/loadAwardsVoting";

async function main() {
  await loadAdvanced("src/data/Advanced.csv");
  await loadPer36("src/data/Per_36_Minutes.csv");
  await loadPlayByPlay("src/data/Play_By_Play.csv");
  await loadAllStar("src/data/All_Star_Selections.csv");
  await loadEndOfSeasonTeams("src/data/End_of_Season_Teams.csv");
  await loadAwardsVoting("src/data/Player_Award_Shares.csv");

  console.log("✅ NBA advanced seed complete");
}

main();
// import fs from "fs";
// import path from "path";
// import { parse } from "csv-parse/sync";
// import prisma from "../lib/prisma";

// type TotalsRow = {
//   season: string;
//   lg: string;
//   player: string;
//   player_id: string;
//   age: string;
//   team: string;
//   pos: string;
//   g: string;
//   gs: string;
//   mp: string;
//   fg: string;
//   fga: string;
//   fg_percent: string;
//   x3p: string;
//   x3pa: string;
//   x3p_percent: string;
//   x2p: string;
//   x2pa: string;
//   x2p_percent: string;
//   e_fg_percent: string;
//   ft: string;
//   fta: string;
//   ft_percent: string;
//   orb: string;
//   drb: string;
//   trb: string;
//   ast: string;
//   stl: string;
//   blk: string;
//   tov: string;
//   pf: string;
//   pts: string;
// };

// type AdvancedRow = {
//   season: string;
//   player_id: string;
//   team: string;
//   per: string;
//   ws: string;
//   usg_percent: string;
// };

// type CareerRow = {
//   player_id: string;
//   player: string;
//   pos: string;
//   ht_in_in: string;
//   from: string;
//   to: string;
//   hof: string;
// };

// type PlayerSeason = {
//   season: number;
//   team: string;
//   games: number;
//   ppg: number;
//   apg: number;
//   rpg: number;
//   spg: number;
//   bpg: number;
//   tsPct: number | null;
//   threeRate: number | null;
//   per: number | null;
//   ws: number | null;
//   usgPct: number | null;
// };

// type PlayerAgg = {
//   id: string;
//   name: string;
//   firstName: string;
//   lastName: string;
//   position: string;
//   eligiblePositions: string;
//   heightInches: number;
//   isHallOfFamer: boolean;
//   primaryTeam: string | null;
//   eraFrom: number;
//   eraTo: number;
//   teams: Set<string>;
//   seasons: PlayerSeason[];
//   imageUrl: string | null;
// };

// const DATA_DIR = path.join(process.cwd(), "data");

// function readCsv<T = any>(fileName: string): T[] {
//   const raw = fs.readFileSync(path.join(DATA_DIR, fileName));
//   return parse(raw, {
//     columns: true,
//     skip_empty_lines: true,
//     trim: true,
//   }) as T[];
// }

// function toNum(v: string | undefined): number {
//   const n = Number(v);
//   return Number.isFinite(n) ? n : 0;
// }

// function calcTsPct(pts: number, fga: number, fta: number): number | null {
//   const denom = 2 * (fga + 0.44 * fta);
//   if (!denom) return null;
//   return pts / denom;
// }

// function calcThreeRate(fg3a: number, fga: number): number | null {
//   if (!fga) return null;
//   return fg3a / fga;
// }

// function getEligiblePositions(primaryPos: string): string {
//   const posMap: Record<string, string[]> = {
//     PG: ["PG", "SG"],
//     SG: ["SG", "PG"],
//     SF: ["SF", "PF"],
//     PF: ["PF", "SF"],
//     C: ["C", "PF"],
//     G: ["PG", "SG"],
//     F: ["SF", "PF"],
//     "F-C": ["PF", "C"],
//     "G-F": ["SG", "SF"],
//     "C-F": ["C", "PF"],
//     UNK: ["PG", "SG", "SF", "PF", "C"],
//   };
//   const positions = posMap[primaryPos] || [primaryPos];
//   return Array.from(new Set(positions)).join(",");
// }

// async function seedPlayersFromCsvData() {
//   console.log("Loading CSV datasets (1950–present)...");
//   const totals = readCsv<TotalsRow>("Player Totals.csv");
//   const advanced = readCsv<AdvancedRow>("Advanced.csv");
//   const career = readCsv<CareerRow>("Player Career Info.csv");

//   const advancedMap = new Map<string, AdvancedRow>();
//   for (const row of advanced) {
//     const key = `${row.player_id}_${row.season}`;
//     advancedMap.set(key, row);
//   }

//   const careerMap = new Map<string, CareerRow>();
//   for (const row of career) {
//     careerMap.set(row.player_id, row);
//   }

//   // Track teams per player (for primary team inference) and prefer TOT rows when present.
//   const playerTeams = new Map<string, Set<string>>();
//   const totSeasons = new Set<string>();
//   for (const row of totals) {
//     const pid = row.player_id;
//     if (!pid) continue;
//     if (row.team === "TOT") {
//       totSeasons.add(`${pid}_${row.season}`);
//     } else {
//       if (!playerTeams.has(pid)) playerTeams.set(pid, new Set<string>());
//       playerTeams.get(pid)!.add(row.team);
//     }
//   }

//   const players = new Map<string, PlayerAgg>();

//   for (const row of totals) {
//     const season = Number(row.season);
//     if (!season || season < 1950) continue;

//     const pid = row.player_id;
//     if (!pid) continue;

//     const seasonKey = `${pid}_${season}`;
//     if (totSeasons.has(seasonKey) && row.team !== "TOT") {
//       // Skip team splits if TOT exists for that season.
//       continue;
//     }

//     const games = toNum(row.g);
//     if (!games) continue; // skip rows without games

//     const pts = toNum(row.pts);
//     const ast = toNum(row.ast);
//     const trb = toNum(row.trb);
//     const stl = toNum(row.stl);
//     const blk = toNum(row.blk);
//     const fga = toNum(row.fga);
//     const fta = toNum(row.fta);
//     const fg3a = toNum(row.x3pa);

//     const ppg = pts / games;
//     const apg = ast / games;
//     const rpg = trb / games;
//     const spg = stl / games;
//     const bpg = blk / games;
//     const tsPct = calcTsPct(ppg, fga ? fga / games : 0, fta ? fta / games : 0);
//     const threeRate = calcThreeRate(
//       fg3a ? fg3a / games : 0,
//       fga ? fga / games : 0
//     );

//     const adv = advancedMap.get(seasonKey);

//     let player = players.get(pid);
//     if (!player) {
//       const cInfo = careerMap.get(pid);
//       const primaryPos =
//         (cInfo?.pos || row.pos || "UNK").split("-")[0] || "UNK";
//       const eligible = getEligiblePositions(primaryPos);
//       const heightInches = cInfo?.ht_in_in ? Number(cInfo.ht_in_in) : 78;
//       const name = row.player;
//       const [firstName, ...rest] = name.split(" ");
//       const lastName = rest.join(" ");
//       const imageUrl = pid
//         ? `https://www.basketball-reference.com/req/202106291/images/headshots/${pid}.jpg`
//         : null;

//       player = {
//         id: pid,
//         name,
//         firstName,
//         lastName,
//         position: primaryPos,
//         eligiblePositions: eligible,
//         heightInches: heightInches || 78,
//         isHallOfFamer: cInfo?.hof === "TRUE",
//         primaryTeam: null,
//         eraFrom: season,
//         eraTo: season,
//         teams: playerTeams.get(pid) ?? new Set<string>(),
//         seasons: [],
//         imageUrl,
//       };
//       players.set(pid, player);
//     }

//     player.teams.add(row.team);
//     player.eraFrom = Math.min(player.eraFrom, season);
//     player.eraTo = Math.max(player.eraTo, season);

//     player.seasons.push({
//       season,
//       team:
//         row.team === "TOT"
//           ? (playerTeams.get(pid) &&
//               Array.from(playerTeams.get(pid)!).find((t) => t)) ??
//             "TOT"
//           : row.team,
//       games,
//       ppg,
//       apg,
//       rpg,
//       spg,
//       bpg,
//       tsPct,
//       threeRate,
//       per: adv ? toNum(adv.per) || null : null,
//       ws: adv ? toNum(adv.ws) || null : null,
//       usgPct: adv ? toNum(adv.usg_percent) || null : null,
//     });
//   }

//   console.log(`Aggregated ${players.size} players from CSV.`);

//   let i = 0;
//   for (const player of players.values()) {
//     i++;
//     const primaryTeam =
//       Array.from(player.teams).find((t) => t && t !== "TOT") ?? null;

//     const dbPlayer = await prisma.nBAPlayer.upsert({
//       where: { id: player.id },
//       update: {
//         name: player.name,
//         firstName: player.firstName,
//         lastName: player.lastName,
//         position: player.position,
//         eligiblePositions: player.eligiblePositions,
//         imageUrl: player.imageUrl,
//         heightInches: player.heightInches,
//         primaryTeam,
//         primaryEraFrom: player.eraFrom,
//         primaryEraTo: player.eraTo,
//         isHallOfFamer: player.isHallOfFamer,
//         totalTeams: player.teams.size,
//       },
//       create: {
//         id: player.id,
//         name: player.name,
//         firstName: player.firstName,
//         lastName: player.lastName,
//         position: player.position,
//         eligiblePositions: player.eligiblePositions,
//         imageUrl: player.imageUrl,
//         heightInches: player.heightInches,
//         primaryTeam,
//         primaryEraFrom: player.eraFrom,
//         primaryEraTo: player.eraTo,
//         isHallOfFamer: player.isHallOfFamer,
//         totalTeams: player.teams.size,
//       },
//     });

//     await prisma.nBAPlayerSeasonStat.deleteMany({
//       where: { playerId: dbPlayer.id },
//     });

//     for (const s of player.seasons) {
//       await prisma.nBAPlayerSeasonStat.create({
//         data: {
//           playerId: dbPlayer.id,
//           season: s.season,
//           team: s.team,
//           games: s.games,
//           ppg: s.ppg,
//           apg: s.apg,
//           rpg: s.rpg,
//           spg: s.spg,
//           bpg: s.bpg,
//           tsPct: s.tsPct,
//           threeRate: s.threeRate,
//           per: s.per,
//           ws: s.ws,
//           usgPct: s.usgPct,
//         },
//       });
//     }

//     if (i % 100 === 0) {
//       console.log(`Seeded ${i} players...`);
//     }
//   }

//   console.log("CSV-based seeding complete.");
// }

// async function main() {
//   await seedPlayersFromCsvData();
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
