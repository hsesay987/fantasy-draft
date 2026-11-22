// Grow the game's content with two models checking each other (see src/content). Keys go in backend/.env.local:
// XAI_API_KEY (Grok) or GROQ_API_KEY, plus GEMINI_API_KEY.
//
//   npm run content:grow -- vote icks 20           20 new Icks cards (or a deck id, or "all")
//   npm run content:grow -- insync friends 15      15 new In-Sync pairs for a deck (or "all")
//   npm run content:grow -- catalog music 40       40 new musicians from Wikidata, stats rated by both models
//   npm run content:grow -- candidates books 30    just list who Wikidata would add (no AI, writes nothing)
//   npm run content:grow -- trivia films 6         6 Summit categories and 6 Hot Air surveys into the database
//   add --dry to print what would be kept without writing anything
//
// Cards land in app/topicDraft/party/generated.json and catalog entries in app/topicDraft/catalogs/*.json, so they
// are reviewed in a pull request like any other change; then `npm run content:seed` loads catalogs into the database.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { candidates } from "../content/candidates";
import { growInSync, growVote, rateItems } from "../content/grow";
import { pair, roles } from "../content/models";

const ROOT = path.join(__dirname, "../../..");
const GENERATED = path.join(ROOT, "app/topicDraft/party/generated.json");
const CATALOGS = path.join(ROOT, "app/topicDraft/catalogs");
const slug = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const log = (m: string) => console.log(m);

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [kind, target = "all", nArg = "10"] = args.filter((a) => !a.startsWith("--"));
  const n = Math.max(1, Math.min(200, Number(nArg) || 10));

  if (kind === "candidates") {
    const have = JSON.parse(fs.readFileSync(path.join(CATALOGS, `${target}.json`), "utf8")).map((i: { name: string }) => i.name);
    for (const c of await candidates(target, have, n)) console.log(`${String(c.sitelinks).padStart(4)}  ${c.name}  ·  ${c.universe}  ·  ${c.archetype}`);
    return process.exit(0);
  }

  const p = pair();
  if (!p) {
    console.error("Two models are needed. Put XAI_API_KEY (Grok) or GROQ_API_KEY, and GEMINI_API_KEY, in backend/.env.local.");
    return process.exit(1);
  }
  console.log(`models: ${p.a.name} and ${p.b.name}, taking turns to write and check`);
  const { moderate } = await import("../lib/moderation");

  if (kind === "vote" || kind === "insync") {
    const { DECKS } = await import("../shared/topicDraft/party/decks");
    const { INSYNC_DECKS } = await import("../shared/topicDraft/party/insyncDecks");
    const file = JSON.parse(fs.readFileSync(GENERATED, "utf8"));
    const decks = kind === "vote" ? DECKS : INSYNC_DECKS;
    const pick = target === "all" ? decks : decks.filter((d) => d.id === target);
    if (!pick.length) throw new Error(`no ${kind} deck "${target}"; try ${decks.map((d) => d.id).join(", ")}`);
    for (const d of pick) {
      console.log(`\n${d.title}`);
      const added = kind === "vote" ? await growVote(d as never, n, p, moderate, log) : await growInSync(d as never, n, p, moderate, log);
      file[kind][d.id] = [...(file[kind][d.id] ?? []), ...added];
      console.log(`${d.id}: +${added.length}`);
    }
    if (!dry) {
      fs.writeFileSync(GENERATED, JSON.stringify(file, null, 1) + "\n");
      execFileSync("node", [path.join(ROOT, "scripts/sync-shared.mjs")], { stdio: "inherit" });
    }
    return process.exit(0);
  }

  if (kind === "catalog") {
    const { statDefs } = await import("../shared/topicDraft/stats");
    const { catalogMeta } = await import("../shared/topicDraft/catalogs");
    const file = path.join(CATALOGS, `${target}.json`);
    const items = JSON.parse(fs.readFileSync(file, "utf8"));
    const defs = statDefs(target);
    // Twice as many candidates as wanted: some are set aside when the models disagree.
    const found = await candidates(target, items.map((i: { name: string }) => i.name), n * 2);
    console.log(`Wikidata offers ${found.length} new ${target}; rating until ${n} are agreed`);
    const examples = [...items].sort(() => 0.5 - Math.random()).slice(0, 12);
    const rated = [];
    for (let i = 0; i < found.length && rated.length < n; i += 5) rated.push(...(await rateItems(catalogMeta(target)?.title ?? target, defs, examples, found.slice(i, i + 5), p, log)));
    const ids = new Set(items.map((i: { id: string }) => i.id));
    const added = rated.slice(0, n).map((r) => ({ id: slug(r.name), name: r.name, universe: r.universe, archetype: r.archetype, stats: r.stats, tags: r.tags, q: r.q, ratedBy: r.by })).filter((r) => !ids.has(r.id));
    console.log(`\n${target}: +${added.length}`);
    if (!dry && added.length) {
      fs.writeFileSync(file, JSON.stringify([...items, ...added], null, 1) + "\n");
      // Films get their measured numbers (reviews, box office, awards) recomputed from Wikidata for the new entries.
      if (target === "films") execFileSync("node", [path.join(ROOT, "scripts/buildStats.mjs"), "films"], { stdio: "inherit", cwd: ROOT });
      execFileSync("node", [path.join(ROOT, "scripts/sync-shared.mjs")], { stdio: "inherit" });
    }
    return process.exit(0);
  }

  if (kind === "trivia") {
    if (dry) throw new Error("trivia writes straight to the database; there is no --dry");
    const { ensureSeeded, generateCategory, generateSurvey, prismaStore } = await import("../services/trivia.service");
    const { POOL_MEMBERS, TRIVIA_POOLS } = await import("../shared/topicDraft/trivia");
    const pools = target === "all" ? TRIVIA_POOLS.filter((x) => !POOL_MEMBERS[x]) : [target];
    let turn = 0;
    for (const pool of pools) {
      await ensureSeeded(pool, prismaStore);
      for (const [label, make] of [["categories", generateCategory], ["surveys", generateSurvey]] as const) {
        let stored = 0;
        for (let attempt = 0; stored < n && attempt < n * 3; attempt++) {
          try {
            if (await make(pool, prismaStore, roles(p, turn++))) stored++;
          } catch (e) {
            console.error(pool, label, (e as Error).message);
          }
        }
        console.log(`${pool.padEnd(16)} ${label.padEnd(11)} +${stored}`);
      }
    }
    return process.exit(0);
  }

  console.error("Usage: content:grow -- <vote|insync|catalog|candidates|trivia> <target|all> <count> [--dry]");
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
