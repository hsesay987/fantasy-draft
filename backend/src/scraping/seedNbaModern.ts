import prisma from "../lib/prisma";
import { getAllModernPlayers, getPlayerSeasonTotals } from "../services/nbaApi";

function calcTsPct(pts: number, fga: number, fta: number): number | null {
  const denom = 2 * (fga + 0.44 * fta);
  if (!denom) return null;
  return pts / denom;
}

function calcThreeRate(fg3a: number, fga: number): number | null {
  if (!fga) return null;
  return fg3a / fga;
}

async function seedModernPlayers() {
  console.log("Fetching modern players (1980+) from NBA API...");
  const all = await getAllModernPlayers();
  console.log(`Found ${all.length} modern players`);

  let i = 0;
  for (const p of all) {
    i++;
    const [firstName, ...rest] = p.fullName.split(" ");
    const lastName = rest.join(" ");

    // Fetch seasons
    const seasons = await getPlayerSeasonTotals(p.playerId);

    if (!seasons.length) continue;

    const teams = new Set<string>();
    let eraFrom = 9999;
    let eraTo = 0;

    for (const s of seasons) {
      teams.add(s.team);
      eraFrom = Math.min(eraFrom, s.season);
      eraTo = Math.max(eraTo, s.season);
    }

    const player = await prisma.player.upsert({
      where: { id: String(p.playerId) },
      update: {},
      create: {
        id: String(p.playerId),
        name: p.fullName,
        firstName,
        lastName,
        position: "UNK", // you can refine from another endpoint later
        heightInches: 78, // placeholder, refine later if you want
        primaryTeam: seasons[0]?.team ?? null,
        primaryEraFrom: eraFrom,
        primaryEraTo: eraTo,
        isHallOfFamer: false, // we’ll mark manual HOFs later
        totalTeams: teams.size,
      },
    });

    // delete old season stats if reseeding
    await prisma.playerSeasonStat.deleteMany({
      where: { playerId: player.id },
    });

    for (const s of seasons) {
      const tsPct = calcTsPct(s.pts, s.fga, s.fta);
      const threeRate = calcThreeRate(s.fg3a, s.fga);

      await prisma.playerSeasonStat.create({
        data: {
          playerId: player.id,
          season: s.season,
          team: s.team,
          games: s.games,
          ppg: s.ppg,
          apg: s.apg,
          rpg: s.rpg,
          spg: s.spg,
          bpg: s.bpg,
          tsPct,
          threeRate,
        },
      });
    }

    if (i % 50 === 0) {
      console.log(`Seeded ${i}/${all.length} players so far...`);
    }

    // small delay to be polite
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log("Modern players done.");
}

// A very small pre-1980 legend pack with approximate numbers.
// These are illustrative; you can swap in a CC0 dataset later.
async function seedPre1980Legends() {
  const legends = [
    {
      id: "legacy_wilt",
      name: "Wilt Chamberlain",
      firstName: "Wilt",
      lastName: "Chamberlain",
      position: "C",
      heightInches: 84,
      primaryTeam: "LAL",
      primaryEraFrom: 1959,
      primaryEraTo: 1973,
      isHallOfFamer: true,
      totalTeams: 3,
      seasons: [
        {
          season: 1962,
          team: "PHW",
          games: 80,
          ppg: 50.4,
          apg: 2.4,
          rpg: 25.7,
          spg: 0,
          bpg: 0,
          tsPct: 0.537,
          threeRate: 0,
        },
      ],
    },
    {
      id: "legacy_russell",
      name: "Bill Russell",
      firstName: "Bill",
      lastName: "Russell",
      position: "C",
      heightInches: 82,
      primaryTeam: "BOS",
      primaryEraFrom: 1956,
      primaryEraTo: 1969,
      isHallOfFamer: true,
      totalTeams: 1,
      seasons: [
        {
          season: 1962,
          team: "BOS",
          games: 78,
          ppg: 18.9,
          apg: 4.5,
          rpg: 23.6,
          spg: 0,
          bpg: 0,
          tsPct: 0.494,
          threeRate: 0,
        },
      ],
    },
    {
      id: "legacy_west",
      name: "Jerry West",
      firstName: "Jerry",
      lastName: "West",
      position: "SG",
      heightInches: 75,
      primaryTeam: "LAL",
      primaryEraFrom: 1960,
      primaryEraTo: 1974,
      isHallOfFamer: true,
      totalTeams: 1,
      seasons: [
        {
          season: 1969,
          team: "LAL",
          games: 74,
          ppg: 25.9,
          apg: 7.5,
          rpg: 4.9,
          spg: 0,
          bpg: 0,
          tsPct: 0.549,
          threeRate: 0,
        },
      ],
    },
  ];

  for (const l of legends) {
    const player = await prisma.player.upsert({
      where: { id: l.id },
      update: {},
      create: {
        id: l.id,
        name: l.name,
        firstName: l.firstName,
        lastName: l.lastName,
        position: l.position,
        heightInches: l.heightInches,
        primaryTeam: l.primaryTeam,
        primaryEraFrom: l.primaryEraFrom,
        primaryEraTo: l.primaryEraTo,
        isHallOfFamer: l.isHallOfFamer,
        totalTeams: l.totalTeams,
      },
    });

    await prisma.playerSeasonStat.deleteMany({
      where: { playerId: player.id },
    });

    for (const s of l.seasons) {
      await prisma.playerSeasonStat.create({
        data: {
          playerId: player.id,
          season: s.season,
          team: s.team,
          games: s.games,
          ppg: s.ppg,
          apg: s.apg,
          rpg: s.rpg,
          spg: s.spg,
          bpg: s.bpg,
          tsPct: s.tsPct,
          threeRate: s.threeRate,
        },
      });
    }
  }

  console.log("Pre-1980 legends seeded.");
}

async function main() {
  await seedModernPlayers();
  await seedPre1980Legends();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
