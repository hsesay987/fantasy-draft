import fs from "fs/promises";
import path from "path";
import prisma from "../lib/prisma";

async function main() {
  // Resolve the curated eligibility list relative to the backend root
  const filePath = path.resolve(
    __dirname,
    "../../data/nfl/fitTopPicEligible.txt"
  );

  const fileContents = await fs.readFile(filePath, "utf8");
  const names = fileContents
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);

  console.log(`Loaded ${names.length} curated names from ${filePath}`);

  // Reset all players first to avoid lingering true flags from prior seeds
  const resetResult = await prisma.nFLPlayer.updateMany({
    data: { fitTopPicEligible: false },
  });
  console.log(`Reset fitTopPicEligible to false for ${resetResult.count} players.`);

  let markedEligible = 0;
  const notFound: string[] = [];

  for (const name of names) {
    const updateResult = await prisma.nFLPlayer.updateMany({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      data: { fitTopPicEligible: true },
    });

    if (updateResult.count === 0) {
      notFound.push(name);
    } else {
      markedEligible += updateResult.count;
    }
  }

  console.log(`Marked ${markedEligible} players as fitTopPicEligible.`);

  if (notFound.length > 0) {
    console.log(
      `Names not found in NFLPlayer (check spelling/casing): ${notFound.join(", ")}`
    );
  } else {
    console.log("All names were matched to NFLPlayer records.");
  }
}

main()
  .catch((error) => {
    console.error("Failed to update fitTopPic eligibility:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
