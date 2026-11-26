// Resolves a picture for every draft catalog item ahead of time, with the same providers the browser uses, and
// writes app/lib/characterImages.json ({ "kind:name": url }). A fresh browser then shows pictures at once; anything
// left out is still looked up live. Items already in the map are kept, so a rerun only asks about new rows.
// Run: npx tsx scripts/resolveImages.ts [--fresh] [pool ...]
import fs from "node:fs";
import path from "node:path";
import { CATALOG_IDS, getCatalog } from "../app/topicDraft/catalogs";
import { resolveImage, usableThumb } from "../app/lib/characterImages";

const OUT = path.resolve(__dirname, "../app/lib/characterImages.json");
const UA = "TopPicImageResolver/1.0 (one-off picture lookup for a game catalog)";
const GAP_MS = 250; // about 4 requests a second, across every provider
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every provider call goes through fetch, so pacing and the User-Agent are added here once.
const realFetch = globalThis.fetch;
let next = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  for (let attempt = 0; ; attempt++) {
    const wait = next - Date.now();
    next = Math.max(next, Date.now()) + GAP_MS;
    if (wait > 0) await sleep(wait);
    const res = await realFetch(input, { ...init, headers: { "User-Agent": UA, ...(init.headers as object) } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(1000 * (Number(res.headers.get("retry-after")) || 3 * (attempt + 1)));
      continue;
    }
    return res;
  }
}) as typeof fetch;

/** Wikipedia answers up to 50 exact titles in one request, which keeps us far below its rate limits. */
async function wikiBatch(names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < names.length; i += 50) {
    const chunk = names.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=320&pilicense=any&redirects=1&titles=${encodeURIComponent(chunk.join("|"))}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const q = (await res.json())?.query ?? {};
    const hop = (list: { from: string; to: string }[] | undefined, t: string) => list?.find((x) => x.from === t)?.to ?? t;
    const byTitle = new Map<string, string | undefined>(Object.values(q.pages ?? {}).map((p: any) => [p.title, p.thumbnail?.source]));
    for (const n of chunk) {
      const src = usableThumb(byTitle.get(hop(q.redirects, hop(q.normalized, n))));
      if (src) out.set(n, src);
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const pools = args.filter((a) => !a.startsWith("--"));
  const ids = pools.length ? pools : CATALOG_IDS;
  const old: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

  const used = (list: string[]) => [...new Set(list.flatMap((id) => getCatalog(id).map((i) => i.q).filter((q): q is string => !!q)))];
  const queries = used(ids);
  // Keep every other pool's entries when only some pools are asked for.
  const all = new Set(used(CATALOG_IDS));
  const map: Record<string, string> = {};
  for (const [q, url] of Object.entries(old)) if (all.has(q) && !(fresh && queries.includes(q))) map[q] = url;
  const save = () => fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))).replace(/","/g, '",\n"') + "\n");

  // Pass 1: exact Wikipedia titles, 50 at a time.
  const todo = queries.filter((q) => !map[q]);
  const wiki = todo.filter((q) => q.startsWith("wiki:")).map((q) => q.slice(5));
  for (const [name, url] of await wikiBatch(wiki)) map[`wiki:${name}`] = url;
  save();
  console.log(`batch: ${wiki.length} Wikipedia titles, ${queries.filter((q) => map[q]).length}/${queries.length} resolved`);

  // Pass 2: everything else one by one with the browser's own providers (search fallback, PokéAPI, AniList, heroes).
  const missing: string[] = [];
  let done = 0;
  for (const q of queries.filter((x) => !map[x])) {
    try {
      const url = await resolveImage(q);
      if (url) map[q] = url;
      else missing.push(q);
    } catch (e) {
      missing.push(`${q} (error: ${(e as Error).message})`);
    }
    if (++done % 25 === 0) (save(), console.log(`${done} looked up one by one`));
  }
  save();
  console.log(`${Object.keys(map).length} pictures in the map, ${missing.length} without one:`);
  for (const m of missing) console.log("  " + m);
}

void main();
