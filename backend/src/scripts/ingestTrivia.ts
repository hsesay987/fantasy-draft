// Build the trivia bank from real data (Wikidata, PokéAPI) instead of asking an AI to remember facts.
//   npm run trivia:ingest -- films --dry       fetch + build, print a sample, write nothing
//   npm run trivia:ingest -- films             store the new categories and surveys
//   npm run trivia:ingest -- all --replace     rebuild every pool, replacing earlier rows from the same source
// Fetched data is cached in backend/.cache/trivia so templates can be tuned without hitting the sources again.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import { buildCategories, buildSurveys } from "../trivia/build";
import type { Entity, Spec } from "../trivia/model";
import { fetchPokemon, POKEMON_SPEC } from "../trivia/pokeapi";
import { WIKIDATA } from "../trivia/sources";
import { SPECS } from "../trivia/templates";
import { fetchEntities } from "../trivia/wikidata";

const CACHE = path.join(__dirname, "../../.cache/trivia");

async function load(pool: string, refresh: boolean): Promise<{ entities: Entity[]; spec: Spec; source: string }> {
  const file = path.join(CACHE, `${pool}.json`);
  const source = pool === "pokemon" ? "pokeapi" : "wikidata";
  const spec = pool === "pokemon" ? POKEMON_SPEC : SPECS[pool]!;
  if (!refresh && fs.existsSync(file)) return { entities: JSON.parse(fs.readFileSync(file, "utf8")), spec, source };
  const entities = pool === "pokemon" ? await fetchPokemon() : await fetchEntities(WIKIDATA[pool]!);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entities));
  return { entities, spec, source };
}

(async () => {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const target = args.find((a) => !a.startsWith("--")) ?? "all";
  const all = ["pokemon", ...Object.keys(WIKIDATA)];
  const pools = target === "all" ? all : [target];
  const dry = flags.has("--dry");
  const prisma = dry ? null : (await import("../lib/prisma")).default;
  const { moderate } = await import("../lib/moderation");
  const { prismaStore } = await import("../services/trivia.service");

  for (const pool of pools) {
    if (!all.includes(pool)) { console.error(`unknown pool ${pool}`); continue; }
    const { entities, spec, source } = await load(pool, flags.has("--refresh"));
    const cats = buildCategories(entities, spec);
    const surveys = buildSurveys(entities, spec);
    console.log(`${pool.padEnd(12)} ${String(entities.length).padStart(4)} entities -> ${cats.length} categories, ${surveys.length} surveys`);
    if (dry) {
      for (const c of cats.slice(0, 3)) console.log("  ", c.name, "|", c.clues.map((k) => `${k.q} => ${k.right} (${k.wrong.join(", ")})`).join("\n      "));
      for (const s of surveys.slice(0, 3)) console.log("  ", s.q, "|", s.answers.join(", "), "| decoys:", s.decoys.join(", "));
      continue;
    }
    if (flags.has("--replace")) {
      await prisma!.triviaCategory.deleteMany({ where: { pool, source } });
      await prisma!.triviaSurvey.deleteMany({ where: { pool, source } });
    }
    let c = 0, s = 0, blocked = 0;
    for (const cat of cats) {
      if (!(await moderate([cat.name, ...cat.clues.flatMap((k) => [k.q, k.right, ...k.wrong])])).ok) { blocked++; continue; }
      if (await prismaStore.addCategory(pool, cat, source)) c++;
    }
    for (const sv of surveys) {
      if (!(await moderate([sv.q, ...sv.answers, ...sv.decoys])).ok) { blocked++; continue; }
      if (await prismaStore.addSurvey(pool, sv, source)) s++;
    }
    console.log(`   stored +${c} categories +${s} surveys (${blocked} blocked by moderation)`);
  }
  process.exit(0);
})();
