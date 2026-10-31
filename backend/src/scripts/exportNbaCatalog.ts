// Build the NBA catalog for the play engine (blind auctions and other formats) from the player database.
//   npm run nba:export -- --dry            show what would be written
//   npm run nba:export                     write app/topicDraft/catalogs/nba.json
//   npm run nba:export -- --college        also look up each player's college on Wikidata (slower, optional)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";
import { getJson } from "../costimation/http";
import { NBA_TEAMS, teamName } from "../nba/teams";

const POS: Record<string, string> = { PG: "point guard", SG: "shooting guard", SF: "small forward", PF: "power forward", C: "center", G: "guard", F: "forward" };
const clamp = (x: number) => Math.max(5, Math.min(100, Math.round(x)));
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const season = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

async function collegeOf(name: string): Promise<string | null> {
  try {
    const s = await getJson<any>(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(name)}`);
    const hit = (s.search as any[]).find((x) => /basketball/i.test(x.description ?? ""));
    if (!hit) return null;
    const e = (await getJson<any>(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${hit.id}`)).entities[hit.id];
    const ids: string[] = (e.claims?.P69 ?? []).map((c: any) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    if (!ids.length) return null;
    const l = await getJson<any>(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${ids.join("|")}`);
    const names = ids.map((id) => l.entities[id]?.labels?.en?.value as string | undefined).filter((x): x is string => !!x);
    return names.find((n) => /universit|college|state|tech/i.test(n)) ?? null;
  } catch { return null; }
}

(async () => {
  const args = process.argv.slice(2), dry = args.includes("--dry"), withCollege = args.includes("--college");
  const players = await prisma.nBAPlayer.findMany({ include: { seasonStats: { orderBy: { season: "asc" } } } });
  const scored = players.map((p) => {
    const rows = p.seasonStats.filter((s) => !/^\dTM$/.test(s.team));
    const ws = p.seasonStats.reduce((n, s) => n + (s.ws ?? 0), 0);
    const allNba = p.seasonStats.filter((s) => s.allNBA != null).length;
    const allStar = p.seasonStats.filter((s) => s.allStar).length;
    return { p, rows, ws, allNba, allStar, score: ws + allNba * 6 + allStar * 2 + (p.isHallOfFamer ? 15 : 0) };
  }).filter((x) => x.rows.length >= 5).sort((a, b) => b.score - a.score).slice(0, 180);

  const items: any[] = [];
  for (const { p, rows, allNba, allStar } of scored) {
    const bySeasons = new Map<string, number>();
    for (const r of rows) bySeasons.set(r.team, (bySeasons.get(r.team) ?? 0) + 1);
    const main = [...bySeasons.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const order: string[] = [];
    for (const r of rows) if (!order.includes(r.team)) order.push(r.team);
    const peak = [...rows].sort((a, b) => (b.per ?? b.ppg + b.rpg + b.apg) - (a.per ?? a.ppg + a.rpg + a.apg))[0]!;
    // The database lists mixed positions like "F-G"; turn each into the one position fans would name.
    const posName = POS[p.position] ?? ({ "F-G": "small forward", "G-F": "shooting guard", "F-C": "power forward", "C-F": "center" } as Record<string, string>)[p.position] ?? "forward";
    const posFinal = p.position === "G" ? (peak.apg >= 5.5 ? "point guard" : "shooting guard") : posName;
    const num = (x: number | null | undefined, d = 1) => (x == null ? undefined : Math.round(x * 10 ** d) / 10 ** d);
    items.push({
      id: slug(p.name), name: p.name, universe: teamName(main), archetype: posFinal,
      stats: {
        scoring: clamp((peak.ppg / 32) * 100), playmaking: clamp((peak.apg / 11) * 100), rebounding: clamp((peak.rpg / 15) * 100),
        defense: clamp((peak.spg ?? 0) * 22 + (peak.bpg ?? 0) * 14), shooting: clamp((((peak.tsPct ?? 0.52) - 0.48) / 0.12) * 100), impact: clamp(peak.per != null ? ((peak.per - 12) / 18) * 100 : 50),
      },
      tags: [...(p.isHallOfFamer ? ["hall-of-fame"] : []), ...(allNba ? ["all-nba"] : []), `${Math.floor((peak.season) / 10) * 10}s`],
      facts: {
        heightIn: p.heightInches ?? undefined, pos: posFinal, team: teamName(main), colors: NBA_TEAMS[main]?.colors,
        teams: order.map(teamName).filter((t, i, a) => a.indexOf(t) === i), from: rows[0]!.season, to: rows[rows.length - 1]!.season,
        hof: p.isHallOfFamer || undefined, allNba: allNba || undefined, allStar: allStar || undefined,
        peak: { season: season(peak.season), team: peak.team, ppg: num(peak.ppg)!, rpg: num(peak.rpg)!, apg: num(peak.apg)!, spg: num(peak.spg), bpg: num(peak.bpg), ts: num(peak.tsPct, 3) },
      },
    });
  }
  if (withCollege) {
    let found = 0;
    for (const it of items) { const c = await collegeOf(it.name); if (c) { it.facts.college = c; found++; } }
    console.log(`college found for ${found} of ${items.length}`);
  }
  console.log(`${items.length} players`);
  for (const it of items.slice(0, 3)) console.log(JSON.stringify(it));
  if (!dry) {
    const out = path.join(__dirname, "../../../app/topicDraft/catalogs/nba.json");
    fs.writeFileSync(out, JSON.stringify(items, null, 1) + "\n");
    console.log("wrote", out);
  }
  process.exit(0);
})();
