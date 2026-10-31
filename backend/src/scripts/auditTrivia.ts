// Re-check AI-written trivia already in the bank. Every available model answers each clue without seeing the key;
// a clue survives only if all of them pick the stored answer. Categories left with fewer than four clues are removed.
//   npm run trivia:audit            report what would be removed
//   npm run trivia:audit -- --apply remove it
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import prisma from "../lib/prisma";
import { allClients } from "../services/judge.service";
import { verifyClue } from "../services/trivia.service";
import type { Clue } from "../shared/topicDraft/trivia/types";

(async () => {
  const apply = process.argv.includes("--apply");
  const models = allClients();
  if (models.length < 2) return console.error("Need at least two AI models configured to audit.");
  const rows = await prisma.triviaCategory.findMany({ where: { source: "ai" } });
  let kept = 0, dropped = 0, removedCats = 0;
  for (const row of rows) {
    const clues = row.clues as unknown as Clue[];
    const good: Clue[] = [];
    for (const clue of clues) {
      let ok = true;
      for (const m of models) if (!(await verifyClue(m, clue))) { ok = false; break; }
      if (ok) good.push(clue);
    }
    kept += good.length;
    dropped += clues.length - good.length;
    if (good.length < 4) {
      removedCats++;
      console.log(`remove  ${row.pool}/${row.name} (${good.length} of ${clues.length} clues survive)`);
      if (apply) await prisma.triviaCategory.delete({ where: { id: row.id } });
    }
  }
  console.log(`${rows.length} AI categories: ${kept} clues pass, ${dropped} fail, ${removedCats} categories ${apply ? "removed" : "would be removed"}`);
  process.exit(0);
})();
