import prisma from "../lib/prisma";
import { getAllPlayers, getPlayerProfile } from "../services/nbaApi";

export async function seedNBAPlayers() {
  console.log("Fetching all players from NBA API...");
  const players = await getAllPlayers();

  console.log(`Found ${players.length} players`);
  let count = 0;

  for (const p of players) {
    const profile = await getPlayerProfile(p.playerId);

    const seasonTotals = profile.resultSets.find(
      (s: any) => s.name === "SeasonTotalsRegularSeason"
    );

    const seasons = seasonTotals?.rowSet || [];

    const prismaPlayer = await prisma.player.create({
      data: {
        id: String(p.playerId),
        name: p.name,
        firstName: p.name.split(" ")[0] || "",
        lastName: p.name.split(" ").slice(1).join(" ") || "",
        primaryTeam: p.teamId ? String(p.teamId) : null,
        primaryEraFrom: Number(p.fromYear),
        primaryEraTo: Number(p.toYear),
        isHallOfFamer: false, // NBA API doesn't track HOF directly
        totalTeams: 1, // will update after we process seasons
        position: "UNK", // will infer later
        heightInches: 78, // will override in enhanced scraper
      },
    });

    for (const s of seasons) {
      await prisma.playerSeasonStat.create({
        data: {
          playerId: prismaPlayer.id,
          season: parseInt(s[1], 10),
          team: s[3] || "",
          games: s[6] || 0,

          ppg: s[27] || 0,
          apg: s[21] || 0,
          rpg: s[18] || 0,
          spg: s[22] || 0,
          bpg: s[23] || 0,

          tsPct: null, // NBA API doesn't directly provide TS%
          threeRate: null, // will compute in enhanced version
        },
      });
    }

    count++;
    console.log(`Saved ${count}/${players.length} players: ${p.name}`);

    await new Promise((r) => setTimeout(r, 200)); // Respect API
  }

  console.log("DONE!");
}
