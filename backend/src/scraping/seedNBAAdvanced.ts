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

  await loadAdvanced("data/Advanced.csv");
  await loadPer36("data/Per 36 Minutes.csv");
  await loadPlayByPlay("data/Player Play By Play.csv");
  await loadAllStar("data/All-Star Selections.csv");
  await loadEndOfSeasonTeams("data/End of Season Teams.csv");
  await loadAwardsVoting("data/Player Award Shares.csv");

  console.log("✅ NBA advanced seed complete");
  await prisma.$disconnect();
}

main().catch(console.error);
