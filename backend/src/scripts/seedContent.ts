// Load the bundled catalogs, stat definitions, sources and missions into the content tables.
//   npm run content:seed            upsert everything (safe to run again; players' stat votes are kept)
// The JSON catalogs stay the engines' bundle; after editing content in the database, run `npm run content:export`.
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";
import { CATALOG_META, FICTIONAL_MEMBERS } from "../shared/topicDraft/catalogs";
import { missionsFor } from "../shared/topicDraft/missions";
import { FAMILY_OF, SOURCES, STAT_FAMILIES, isMeasured, statDef } from "../shared/topicDraft/stats";

const DIR = path.join(__dirname, "../shared/topicDraft/catalogs");
const SECTION: Record<string, string> = {
  fictional: "characters", superheroes: "characters", villains: "characters", "heroes-villains": "characters", anime: "characters", pokemon: "characters", videogames: "characters", disney: "characters", movies: "characters",
  nba: "sports", football: "sports", films: "screen", shows: "screen", music: "screen", books: "screen", geography: "world", flags: "world", food: "world", history: "world",
};
/** Pools made of other pools; they hold no entities of their own. */
const INCLUDES: Record<string, string[]> = { fictional: FICTIONAL_MEMBERS, "heroes-villains": ["superheroes", "villains"] };

type Raw = { id: string; name: string; universe: string; archetype: string; stats: Record<string, number>; tags: string[]; facts?: object; q?: string };

async function main() {
  for (const s of Object.values(SOURCES)) await prisma.source.upsert({ where: { id: s.id }, create: s, update: s });

  for (const [family, defs] of Object.entries(STAT_FAMILIES)) {
    for (const [i, d] of defs.entries()) {
      const data = { label: d.label, best: d.best, code: d.code, method: d.method, basis: d.basis, sortOrder: i, sourceId: d.source };
      await prisma.statDef.upsert({ where: { family_key: { family, key: d.key } }, create: { family, key: d.key, ...data }, update: data });
    }
  }

  const families = new Set<string>();
  let entities = 0, stats = 0;
  for (const [order, meta] of CATALOG_META.entries()) {
    const family = FAMILY_OF[meta.id] ?? "characters";
    const topic = { title: meta.title, blurb: meta.blurb, section: SECTION[meta.id] ?? "gear", kind: meta.kind, statFamily: family, includes: INCLUDES[meta.id] ?? [], sortOrder: order };
    await prisma.topic.upsert({ where: { id: meta.id }, create: { id: meta.id, ...topic }, update: topic });

    if (meta.kind === "character" && !families.has(family)) {
      families.add(family);
      for (const [i, m] of missionsFor(meta.id).entries()) {
        const data = { title: m.title, blurb: m.blurb, weights: m.weights, wantTags: m.wantTags ?? [], sortOrder: i, active: true };
        await prisma.mission.upsert({ where: { family_slug: { family, slug: m.id } }, create: { family, slug: m.id, ...data }, update: data });
      }
    }
    if (INCLUDES[meta.id]) continue;

    const rows: Raw[] = JSON.parse(fs.readFileSync(path.join(DIR, `${meta.id}.json`), "utf8"));
    const seen = new Set<string>();
    for (const r of rows) {
      seen.add(r.id);
      const data = { name: r.name, universe: r.universe, archetype: r.archetype, tags: r.tags, facts: r.facts ?? undefined, imageQuery: r.q ?? null, active: true };
      const e = await prisma.entity.upsert({ where: { topicId_slug: { topicId: meta.id, slug: r.id } }, create: { topicId: meta.id, slug: r.id, ...data }, update: data });
      entities++;
      // Replace the entity's ratings in one go. Players' votes live in their own table and are not touched.
      const rowsOf = Object.keys(r.stats).map((key) => {
        const measured = isMeasured(meta.id, r.id, key);
        // An estimate still names the reference it was checked against, when there is one.
        const def = statDef(key, meta.id);
        const sourceId = measured ? def?.source ?? null : def && def.source !== "editorial" && def.method === "editorial" ? def.source : "editorial";
        return { entityId: e.id, key, value: Math.round(r.stats[key]!), measured, sourceId };
      });
      await prisma.$transaction([prisma.entityStat.deleteMany({ where: { entityId: e.id } }), prisma.entityStat.createMany({ data: rowsOf })]);
      stats += rowsOf.length;
    }
    // Something dropped from a catalog is switched off, not deleted, so its votes and history stay.
    await prisma.entity.updateMany({ where: { topicId: meta.id, slug: { notIn: [...seen] } }, data: { active: false } });
  }
  console.log(`seeded ${CATALOG_META.length} topics, ${entities} entities, ${stats} stats, ${Object.values(STAT_FAMILIES).flat().length} stat definitions`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
