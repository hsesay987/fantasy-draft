// src/scraping/seedNFLAdvanced.ts
import prisma from "../lib/prisma";

type Pos =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "OL"
  | "DL"
  | "LB"
  | "DB"
  | "K"
  | "DEF";

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function approximateValueForSeason(
  pos: Pos,
  stat: {
    yards?: number | null;
    touchdowns?: number | null;
    receptions?: number | null;
    sacks?: number | null;
    interceptions?: number | null;
    fantasyPoints?: number | null;
  }
) {
  const yards = stat.yards ?? 0;
  const td = stat.touchdowns ?? 0;
  const rec = stat.receptions ?? 0;
  const sacks = stat.sacks ?? 0;
  const picks = stat.interceptions ?? 0;
  const fantasy = stat.fantasyPoints ?? 0;

  // Position-aware weightings so linemen/defenders still matter.
  if (pos === "QB") {
    return (
      yards / 250 +
      td * 2.5 -
      picks * 0.7 +
      sacks * 0.2 +
      fantasy / 75
    );
  }

  if (pos === "RB" || pos === "WR" || pos === "TE") {
    return (
      yards / 160 +
      td * 2 +
      rec * 0.04 +
      fantasy / 80 +
      picks * 0.1
    );
  }

  if (pos === "DL" || pos === "LB") {
    return sacks * 2.2 + picks * 1.6 + td * 3 + yards / 60 + fantasy / 60;
  }

  if (pos === "DB") {
    return picks * 2.3 + td * 2.5 + sacks * 0.8 + fantasy / 60;
  }

  if (pos === "DEF") {
    // Use fantasy points as a proxy for points allowed / turnovers
    return fantasy ? Math.max(5, -fantasy / 10) : 8;
  }

  return yards / 200 + td * 1.5 + sacks * 0.5 + picks * 0.5;
}

async function main() {
  console.log("🏈 Updating NFL advanced metrics...");

  const players = await prisma.nFLPlayer.findMany({
    include: { seasons: true },
  });

  let processed = 0;

  for (const player of players) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`🔄 processed ${processed} players`);
    }

    const pos = (player.normalizedPos || "WR") as Pos;
    let careerSum = 0;
    let proBowls = 0;
    let allPros = 0;
    let seasonsCount = 0;

    for (const season of player.seasons) {
      const approx = approximateValueForSeason(pos, season);
      const finalAV = clamp(approx, 0, 40);
      careerSum += finalAV;
      seasonsCount++;

      // loose accolade heuristics (beta)
      if (finalAV >= 16) proBowls += 1;
      if (finalAV >= 22) allPros += 1;

      await prisma.nFLPlayerSeasonStat.update({
        where: { id: season.id },
        data: { approximateValue: finalAV },
      });
    }

    const careerAV = seasonsCount ? careerSum : null;
    const hallOfFame =
      (careerAV ?? 0) >= 140 || allPros >= 4 || proBowls >= 7;

    await prisma.nFLPlayer.update({
      where: { id: player.id },
      data: {
        careerAV,
        proBowls,
        allPros,
        hallOfFame,
        fitTopPicEligible: seasonsCount > 0,
      },
    });
  }

  console.log("✅ NFL advanced seed complete");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
