// Fill the trivia bank ahead of time so games rarely wait on the AI.
//   npm run trivia:fill -- anime 6          (6 new categories and 6 new surveys for one topic)
//   npm run trivia:fill -- all 4            (4 of each for every topic)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { defaultGen, ensureSeeded, generateCategory, generateSurvey, prismaStore } from "../services/trivia.service";
import { TRIVIA_POOLS } from "../shared/topicDraft/trivia";

(async () => {
  const [target = "all", n = "4"] = process.argv.slice(2);
  const pools = target === "all" ? TRIVIA_POOLS.filter((p) => p !== "heroes-villains") : [target];
  const gen = defaultGen();
  if (!gen) return console.error("No AI model configured (JUDGE_BASE_URL or ANTHROPIC_API_KEY).");
  for (const pool of pools) {
    await ensureSeeded(pool, prismaStore);
    for (const [label, make] of [["categories", generateCategory], ["surveys", generateSurvey]] as const) {
      let stored = 0;
      for (let attempt = 0; stored < Number(n) && attempt < Number(n) * 3; attempt++) {
        try {
          if (await make(pool, prismaStore, gen)) stored++;
        } catch (e) {
          console.error(pool, label, (e as Error).message);
        }
      }
      console.log(`${pool.padEnd(16)} ${label.padEnd(11)} +${stored}`);
    }
  }
  process.exit(0);
})();
