// Builds app/commonthread/data/<topic>.json: the hidden categories for Common Thread.
// Every category is a real fact: Wikidata (most topics), PokéAPI (Pokémon) and AniList (anime characters).
// Run: npx tsx scripts/buildCommonThread.ts [topic ...]        (no argument builds every topic)
// Responses are cached under node_modules/.cache/commonthread, so a failed topic can be re-run alone and cheaply.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sparql, hasName } from "../backend/src/trivia/wikidata";
import { getJson } from "../backend/src/trivia/http";
import { PINPOINT_TOPICS } from "../app/pinpoint/topics";
import { assemble, slug, type RawCategory, type RawMember } from "./commonThreadRules";
import type { ThreadTopic } from "../app/commonthread/types";
import { SPECS, type Entity, type WdSpec } from "./commonThreadTopics";

const OUT = path.resolve(__dirname, "../app/commonthread/data");
const CACHE = path.resolve(__dirname, "../node_modules/.cache/commonthread");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Runs `fn` over `items` with at most `n` in flight, keeping the order of the results. */
async function inParallel<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); } }));
  return out;
}

// ---------------- cached, polite fetching ----------------
async function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, crypto.createHash("sha1").update(key).digest("hex") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  const v = await run();
  fs.writeFileSync(file, JSON.stringify(v));
  return v;
}
export const ask = (q: string) => cached("sparql:" + q, async () => { await sleep(350); return sparql(q); });
export const fetchJson = <T = any>(url: string, init: RequestInit = {}) =>
  cached<T>("json:" + url + JSON.stringify(init.body ?? ""), async () => { await sleep(150); return getJson<T>(url, init); });

// ---------------- the generic Wikidata pool ----------------
/** The entities the `where` patterns match, most famous first. A list runs one query per entry (keeps big classes under the time limit). */
async function wikidataPool(spec: WdSpec): Promise<Entity[]> {
  const parts = Array.isArray(spec.where) ? spec.where : [spec.where];
  const fame = new Map<string, number>();
  for (const w of parts) {
    const rows = await ask(`SELECT DISTINCT ?item ?sl WHERE { ${w} ?item wikibase:sitelinks ?sl. FILTER(?sl >= ${spec.minSitelinks}) } ORDER BY DESC(?sl) LIMIT ${spec.limit}`);
    for (const r of rows) if (!fame.has(r.item)) fame.set(r.item, Number(r.sl));
  }
  const ids = [...fame.keys()].filter((id) => /^Q\d+$/.test(id)).sort((a, b) => fame.get(b)! - fame.get(a)!).slice(0, spec.limit * parts.length);
  const byName = new Map<string, Entity>();
  for (const part of chunk(ids, 150)) {
    const rows = await ask(
      `SELECT ?item ?l ?title WHERE { VALUES ?item { ${part.map((i) => "wd:" + i).join(" ")} } ?item rdfs:label ?l. FILTER(lang(?l) = "en") ` +
        `OPTIONAL { ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title } }`
    );
    for (const r of rows) {
      if (!hasName(r.l)) continue;
      const e: Entity = { id: r.item, name: r.l.replace(/^./, (c) => c.toUpperCase()), fame: fame.get(r.item)!, facts: {} };
      if (r.title && r.title !== r.l) e.q = r.title;
      // Two entities with one name would blend their facts: keep the more famous.
      const prev = byName.get(e.name);
      if (!prev || prev.fame < e.fame) byName.set(e.name, e);
    }
  }
  const ents = [...byName.values()].filter((e) => !spec.keep || spec.keep(e.name)).sort((a, b) => b.fame - a.fame);
  const byId = new Map(ents.map((e) => [e.id, e]));
  for (const f of spec.facts) {
    const batches = chunk([...byId.keys()], 120);
    const results = await inParallel(batches, 4, (part) =>
      ask(
        `SELECT ?item ?v ?vl WHERE { VALUES ?item { ${part.map((i) => "wd:" + i).join(" ")} } ?item ${f.path} ?v. ${f.extra ?? ""} ` +
          (f.as === "item" ? `OPTIONAL { ?v rdfs:label ?vl FILTER(lang(?vl) = "en") } ` : "") + `}`
      )
    );
    const years = new Map<string, number>();
    for (const r of results.flat()) {
      const e = byId.get(r.item);
      if (!e) continue;
      if (f.as === "item") {
        if (!hasName(r.vl) || r.v === undefined) continue;
        if (f.skip?.test(r.vl)) continue;
        const lab = f.label(r.vl);
        if (lab) (e.facts[f.kind] ??= new Set()).add(lab);
      } else {
        const y = /^-?\d{4}/.test(r.v) ? parseInt(r.v, 10) : NaN;
        if (Number.isFinite(y) && y > 0) years.set(r.item, Math.min(years.get(r.item) ?? Infinity, y));
      }
    }
    for (const [id, y] of years) {
      const lab = f.label(f.as === "decade" ? String(Math.floor(y / 10) * 10) : f.as === "century" ? String(Math.floor((y - 1) / 100) + 1) : String(y));
      if (lab) (byId.get(id)!.facts[f.kind] ??= new Set()).add(lab);
    }
    if (f.single) for (const e of ents) if (e.facts[f.kind] && e.facts[f.kind]!.size > 1) delete e.facts[f.kind];
    console.log(`    fact ${f.kind}: ${ents.filter((e) => e.facts[f.kind]?.size).length}/${ents.length} entities`);
  }
  return ents;
}

/** Turns entities and their facts into raw categories, one per fact value shared by enough of them. */
export function categorize(ents: Entity[]): RawCategory[] {
  const by = new Map<string, RawCategory>();
  for (const e of ents) {
    const m: RawMember = { name: e.name, fame: e.fame, ...(e.q ? { q: e.q } : {}) };
    for (const [kind, vals] of Object.entries(e.facts)) {
      for (const label of vals) {
        const key = kind + "|" + label;
        let c = by.get(key);
        if (!c) by.set(key, (c = { label, kind, members: [] }));
        c.members.push(m);
      }
    }
  }
  return [...by.values()].filter((c) => c.members.length >= 6);
}

// ---------------- building a topic ----------------
const MAX_MEMBERS = 150;

async function buildTopic(pool: string): Promise<{ topic: ThreadTopic; stats: string }> {
  const spec = SPECS[pool];
  if (!spec) throw new Error(`no spec for ${pool}`);
  console.log(`\n== ${pool}`);
  const ents = "load" in spec ? await spec.load({ ask, fetchJson, wikidataPool }) : await wikidataPool(spec);
  console.log(`  pool: ${ents.length} entities`);
  if (ents.length < 100) throw new Error(`pool for ${pool} is only ${ents.length} entities`);
  // Facts that would make two kinds of the same label (for example a "Debuted in the 1980s" and a "Released in the 1980s") stay apart by kind.
  const raw = categorize(ents).filter((c) => c.members.length <= MAX_MEMBERS);
  console.log(`  candidate categories: ${raw.length} (${[...new Set(raw.map((c) => c.kind))].map((k) => `${k} ${raw.filter((c) => c.kind === k).length}`).join(", ")})`);
  const topic = assemble(pool, raw, 20261105);
  // The file only needs member names that show up as a clue somewhere in the topic: that is all the "no clue fits a wrong option" check reads.
  const clueNames = new Set([...topic.daily, ...topic.practice].flatMap((c) => c.clues.map((x) => x.name)));
  for (const c of [...topic.daily, ...topic.practice]) c.members = c.members.filter((n) => clueNames.has(n));
  const stats = `${pool}: pool ${ents.length}, candidates ${raw.length}, daily ${topic.daily.length}, practice ${topic.practice.length}`;
  return { topic, stats };
}

async function main() {
  const asked = process.argv.slice(2);
  const topics = PINPOINT_TOPICS.map((t) => t.id);
  const todo = asked.length ? asked : topics;
  for (const t of todo) if (!topics.includes(t)) throw new Error(`unknown topic ${t}; topics: ${topics.join(", ")}`);
  fs.mkdirSync(OUT, { recursive: true });
  const lines: string[] = [];
  for (const pool of todo) {
    try {
      const { topic, stats } = await buildTopic(pool);
      fs.writeFileSync(path.join(OUT, `${pool}.json`), JSON.stringify(topic));
      lines.push(stats);
      console.log("  " + stats);
    } catch (e) {
      lines.push(`${pool}: FAILED ${(e as Error).message}`);
      console.error("  FAILED", e);
    }
  }
  console.log("\n==== summary ====\n" + lines.join("\n"));
}
if (require.main === module) main();
