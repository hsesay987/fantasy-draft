// src/scraping/seedNBAAdvanced.ts
import prisma from "../lib/prisma";
import { loadAdvanced } from "./loaders/loadAdvanced";
import { loadPer36 } from "./loaders/loadPer36";
import { loadPlayByPlay } from "./loaders/loadPlayByPlay";
import { loadAllStar } from "./loaders/loadAllStar";
import { loadEndOfSeasonTeams } from "./loaders/loadEndOfSeasonTeams";
import { loadAwardsVoting } from "./loaders/loadAwardsVoting";

async function main() {
  console.log("📊 Seeding NBA advanced metrics...");

  await loadAdvanced("data/nba/Advanced.csv");
  await loadPer36("data/nba/Per 36 Minutes.csv");
  await loadPlayByPlay("data/nba/Player Play By Play.csv");
  await loadAllStar("data/nba/All-Star Selections.csv");
  await loadEndOfSeasonTeams("data/nba/End of Season Teams.csv");
  await loadAwardsVoting("data/nba/Player Award Shares.csv");

  console.log("✅ NBA advanced seed complete");
  await prisma.$disconnect();
}

main().catch(console.error);
