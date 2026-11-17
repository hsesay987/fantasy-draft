// Write the content tables back out as the JSON catalogs the game engines bundle.
//   npm run content:export                 write app/topicDraft/catalogs/*.json and provenance.json
//   npm run content:export -- --check      write nothing; exit 1 if the database and the bundled files differ
//   npm run content:export -- --out DIR    write somewhere else
// Then run `npm run sync:shared` in the repo root so the server bundles the same files.
import fs from "fs";
import path from "path";
import { isDeepStrictEqual } from "util";
import prisma from "../lib/prisma";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const APP = path.join(__dirname, "../../../app/topicDraft/catalogs");
const OUT = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]!) : APP;

async function main() {
  const topics = await prisma.topic.findMany({ where: { active: true, includes: { isEmpty: true } }, orderBy: { sortOrder: "asc" } });
  const order = new Map<string, number>();
  for (const d of await prisma.statDef.findMany()) order.set(`${d.family}|${d.key}`, d.sortOrder);
  const provenance: Record<string, Record<string, string[]>> = {};
  let differ = 0;
  if (!CHECK) fs.mkdirSync(OUT, { recursive: true });

  for (const t of topics) {
    const rows = await prisma.entity.findMany({ where: { topicId: t.id, active: true }, orderBy: { createdAt: "asc" }, include: { stats: true } });
    const rank = (k: string) => order.get(`${t.statFamily}|${k}`) ?? 99;
    const items = rows.map((e) => {
      const stats = [...e.stats].sort((a, b) => rank(a.key) - rank(b.key));
      const measured = stats.filter((s) => s.measured).map((s) => s.key);
      if (measured.length) (provenance[t.id] ??= {})[e.slug] = measured;
      return {
        id: e.slug, name: e.name, universe: e.universe, archetype: e.archetype, stats: Object.fromEntries(stats.map((s) => [s.key, s.value])), tags: e.tags,
        ...(e.facts ? { facts: e.facts } : {}), ...(e.imageQuery ? { q: e.imageQuery } : {}),
      };
    });
    if (CHECK) {
      const file = path.join(APP, `${t.id}.json`);
      const bundled = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
      if (!isDeepStrictEqual(bundled, JSON.parse(JSON.stringify(items)))) { differ++; console.log(`differs: ${t.id}`); }
    } else fs.writeFileSync(path.join(OUT, `${t.id}.json`), JSON.stringify(items, null, 1) + "\n");
  }
  if (CHECK) {
    const bundled = JSON.parse(fs.readFileSync(path.join(APP, "provenance.json"), "utf8"));
    const sorted = (p: Record<string, Record<string, string[]>>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([i, m]) => [i, [...m].sort()]))]));
    if (!isDeepStrictEqual(sorted(Object.fromEntries(Object.entries(bundled).filter(([, v]) => Object.keys(v as object).length)) as never), sorted(provenance))) { differ++; console.log("differs: provenance"); }
    console.log(differ ? `${differ} file(s) differ from the database` : `database and bundled catalogs match (${topics.length} topics)`);
    process.exit(differ ? 1 : 0);
  }
  fs.writeFileSync(path.join(OUT, "provenance.json"), JSON.stringify(provenance) + "\n");
  console.log(`wrote ${topics.length} catalogs to ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
