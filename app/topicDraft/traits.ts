// Clues for blind auctions: describe an item by a few traits without saying who it is.
// Every pool gets clues from the fields all catalogs share (universe, archetype, stats, tags). Items with `facts`
// (real players) also get real-world clues: height, team colours, past teams, college, best season, shooting.
import type { Item } from "./types";

export type Clue = { key: string; label: string; text: string; /** 1 is vague, 3 is pointed. */ tier: 1 | 2 | 3 };

const STAT: Record<string, string> = {
  power: "raw power", intellect: "brains", speed: "speed", durability: "toughness", combat: "fighting skill", teamwork: "teamwork", loyalty: "loyalty",
  utility: "usefulness", tech: "tech", stealth: "stealth", range: "reach", damage: "damage", firepower: "firepower",
  story: "storytelling", acting: "acting", visuals: "visuals", rewatch: "rewatch value", impact: "cultural impact", fun: "fun",
  pace: "pace", shooting: "shooting", passing: "passing", dribbling: "dribbling", defending: "defending", physical: "physicality",
  leadership: "leadership", courage: "courage", influence: "influence", charisma: "charisma", strategy: "strategy",
  scoring: "scoring", playmaking: "playmaking", rebounding: "rebounding", defense: "defense", athleticism: "athleticism",
};
const statName = (k: string) => STAT[k] ?? k;

type Voice = { universe: (u: string) => string; archetype: (a: string) => string };
const v = (universe: Voice["universe"], archetype: Voice["archetype"]): Voice => ({ universe, archetype });

/** How each topic talks about its two shared labels, so a clue reads naturally for that topic. */
export const VOICES: Record<string, Voice> = {
  superheroes: v((u) => `Comes from ${u}`, (a) => `Type: ${a}`),
  villains: v((u) => `Menaces the world of ${u}`, (a) => `Type: ${a}`),
  "heroes-villains": v((u) => `Comes from ${u}`, (a) => `Plays the ${a} role`),
  anime: v((u) => `Appears in ${u}`, (a) => `Type: ${a}`),
  pokemon: v((u) => `Its type is ${u}`, (a) => `Type: ${a}`),
  videogames: v((u) => `Comes from ${u}`, (a) => `A ${a} star`),
  disney: v((u) => `Lives in the world of ${u}`, (a) => `Plays the ${a}`),
  movies: v((u) => `A star of ${u} movies`, (a) => `Plays the ${a}`),
  history: v((u) => `Made history in ${u}`, (a) => `Remembered as a ${a}`),
  football: v((u) => `Plays for ${u}`, (a) => `Plays as a ${a}`),
  films: v((u) => `Genre: ${u}`, (a) => `Style: ${a}`),
  shows: v((u) => `Genre: ${u}`, (a) => `Style: ${a}`),
  nba: v((u) => `Spent the most seasons with ${u}`, (a) => `Plays ${a}`),
};
const FALLBACK: Voice = v((u) => `Category: ${u}`, (a) => `Type: ${a}`);

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

const ft = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;
const list = (xs: string[], max: number) => (xs.length <= max ? xs : [...xs.slice(0, max), `${xs.length - max} more`]).join(", ");
const mean = (o: Record<string, number>) => { const xs = Object.values(o); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };

/** Everything that could be said about an item. `pool` (the other items in the game) lets us say how it ranks. */
export function allClues(topic: string, item: Item, pool: Item[] = []): Clue[] {
  const voice = VOICES[topic] ?? FALLBACK;
  const out: Clue[] = [];
  const add = (key: string, label: string, text: string, tier: Clue["tier"]) => out.push({ key, label, text, tier });
  const f = item.facts;

  if (f) {
    if (f.pos) add("pos", "Position", `Plays ${f.pos}`, 1);
    if (f.from && f.to) add("era", "Era", f.from === f.to ? `Played in ${f.from}` : `Played from ${f.from} to ${f.to}`, 1);
    if (f.heightIn) add("height", "Height", `Stands ${ft(f.heightIn)} tall`, 1);
    if (f.team && f.colors?.length) add("colors", "Team colours", `Spent the most seasons with a team in ${f.colors.join(" and ")}`, 2);
    if (f.teams && f.teams.length > 1) add("teams", "Other teams", `Also suited up for ${list(f.teams.filter((t) => t !== f.team), 3)}`, 2);
    if (f.college) add("college", "College", `Played college ball at ${f.college}`, 2);
    if (f.peak) {
      const p = f.peak;
      add("peak", "Best season", `Best season (${p.season}): ${p.ppg} points, ${p.rpg} rebounds, ${p.apg} assists a game`, 3);
      const best = [["scoring", p.ppg, "points"], ["rebounding", p.rpg, "rebounds"], ["passing", p.apg, "assists"]].sort((a, b) => (b[1] as number) - (a[1] as number))[0]!;
      add("peakStat", "Best season stat", `Once averaged ${best[1]} ${best[2]} a game in a season`, 2);
      if (p.spg && p.spg >= 1.8) add("steals", "Steals", `Averaged ${p.spg} steals a game at their best`, 3);
      if (p.bpg && p.bpg >= 1.8) add("blocks", "Blocks", `Averaged ${p.bpg} blocks a game at their best`, 3);
    }
    if (f.fg3 != null) add("fg3", "Three-point %", `Career three-point shooter at ${f.fg3}%`, 3);
    if (f.fg2 != null) add("fg2", "Two-point %", `Career two-point shooter at ${f.fg2}%`, 3);
    if (f.ft != null) add("ft", "Free throws", `Career free throw shooter at ${f.ft}%`, 3);
    if (f.hof) add("hof", "Honors", "Is in the Hall of Fame", 2);
    if (f.allNba) add("allnba", "Honors", `Made ${f.allNba} All-NBA team${f.allNba > 1 ? "s" : ""}`, 2);
    if (f.allStar) add("allstar", "Honors", `${f.allStar}-time All-Star`, 2);
  }

  if (item.universe && !f?.team) add("universe", "Where from", voice.universe(item.universe), 1);
  if (item.archetype && !f?.pos) add("archetype", "Role", voice.archetype(item.archetype), 1);

  const stats = Object.entries(item.stats).sort((a, b) => b[1] - a[1]);
  if (stats.length >= 2 && !f) {
    add("topStat", "Strength", `Best at ${statName(stats[0]![0])} (${stats[0]![1]}/100)`, 2);
    const low = stats[stats.length - 1]!;
    add("lowStat", "Weak spot", `Weakest at ${statName(low[0])} (${low[1]}/100)`, 2);
    const m = Math.round(mean(item.stats));
    add("overall", "Overall", `Average rating in the ${Math.floor(m / 10) * 10}s`, 2);
  }
  if (item.tags.length && !f) add("tags", "Known as", `Tagged: ${list(item.tags, 3)}`, 2);

  if (pool.length >= 8 && !f) {
    for (const [k] of stats.slice(0, 2)) {
      const better = pool.filter((p) => (p.stats[k] ?? 0) > (item.stats[k] ?? 0)).length;
      if (better < 3) { add(`rank-${k}`, "Rank", better === 0 ? `Tops the pool for ${statName(k)}` : `Top ${better + 1} in the pool for ${statName(k)}`, 3); break; }
    }
  }
  const words = item.name.split(/\s+/);
  add("letters", "Name", `Name has ${item.name.replace(/\s/g, "").length} letters`, 3);
  if (words.length > 1) add("initials", "Initials", `Initials: ${words.map((w) => w[0]!.toUpperCase()).join(".")}.`, 3);
  else add("first", "First letter", `Name starts with ${item.name[0]!.toUpperCase()}`, 3);

  // Never give the name away in a clue (a franchise called "Mario", a team named after a player).
  const name = fold(item.name);
  return out.filter((c) => c.key === "letters" || c.key === "initials" || c.key === "first" || !fold(c.text).includes(name));
}

/**
 * The clues shown for one lot: a spread from vague to pointed, the same on every device for the same seed.
 * With three clues you get one of each tier; more clues add pointed ones first.
 */
export function pickClues(topic: string, item: Item, n: number, seed: number, pool: Item[] = []): Clue[] {
  const all = allClues(topic, item, pool);
  const byTier = (t: Clue["tier"]) => all.filter((c) => c.tier === t).sort((a, b) => hashOf(`${seed}|${item.id}|${a.key}`) - hashOf(`${seed}|${item.id}|${b.key}`));
  const queues = [byTier(1), byTier(2), byTier(3)];
  const order = [0, 1, 2, 1, 2, 0, 1];
  const picked: Clue[] = [];
  for (const q of order) {
    if (picked.length >= n) break;
    const c = queues[q]!.shift();
    if (c && !picked.some((p) => p.key === c.key)) picked.push(c);
  }
  // Fill from whatever is left if a tier ran dry.
  for (const c of queues.flat()) { if (picked.length >= n) break; if (!picked.some((p) => p.key === c.key)) picked.push(c); }
  return picked.sort((a, b) => a.tier - b.tier);
}
