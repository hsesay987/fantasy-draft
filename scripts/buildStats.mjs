#!/usr/bin/env node
// Rebuilds the stat numbers in app/topicDraft/catalogs/*.json from cited public sources, so a stat is either
// measured (computed here, reproducibly) or openly editorial (see app/topicDraft/stats.ts for which is which).
//
//   npm run stats:build                 every topic below
//   npm run stats:build -- nba films    just those
//   npm run stats:build -- --dry        print a sample, write nothing
//
// Sources (all free, no API key):
//   nba        backend/data/nba/*.csv (Basketball-Reference season tables)
//   pokemon    PokéAPI base stats
//   geography  World Bank Open Data (GDP PPP, military spending, tourist arrivals) + UNESCO World Heritage List
//   flags      Wikidata flag colours (already in app/pinpoint/data/flags.json) + Wikipedia pageviews
//   films      Wikidata review scores (Rotten Tomatoes, Metacritic, IMDb, Letterboxd), box office, awards, sitelinks
//   shows      Wikidata review scores, episode counts, awards, sitelinks
//   history    Pantheon (MIT) Historical Popularity Index
//   std        fictional characters: drops the unsourced "teamwork" stat (values stay editorial)
//
// Each run also writes app/topicDraft/catalogs/provenance.json: which stats of which item were measured.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAT = path.join(root, "app/topicDraft/catalogs");
const CACHE = path.join(root, ".cache/stats");
const UA = "TopPicStatsBot/1.0 (https://toppicgames.com)";
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const only = args.filter((a) => !a.startsWith("--"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const read = (id) => JSON.parse(fs.readFileSync(path.join(CAT, `${id}.json`), "utf8"));
const provPath = path.join(CAT, "provenance.json");
const provenance = fs.existsSync(provPath) ? JSON.parse(fs.readFileSync(provPath, "utf8")) : {};
function write(id, items, measured) {
  provenance[id] = Object.fromEntries(items.map((i) => [i.id, measured(i)]).filter(([, m]) => m.length));
  if (DRY) return console.log(`[dry] ${id}`, JSON.stringify(items.slice(0, 3).map((i) => ({ name: i.name, stats: i.stats }))));
  fs.writeFileSync(path.join(CAT, `${id}.json`), JSON.stringify(items, null, 1) + "\n");
  console.log(`wrote ${id}.json (${items.length} items)`);
}

async function getJson(url, init = {}) {
  const key = path.join(CACHE, crypto.createHash("sha1").update(url + (init.body ?? "")).digest("hex") + ".json");
  if (fs.existsSync(key)) return JSON.parse(fs.readFileSync(key, "utf8"));
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000), headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) } });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 100)}`);
      const data = await res.json();
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(key, JSON.stringify(data));
      return data;
    } catch (e) {
      if (i === 4) throw e;
      await sleep(1200 * (i + 1));
    }
  }
  throw new Error(`gave up on ${url.slice(0, 100)}`);
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Turn raw measurements into 0-100 game ratings that still separate a pool of greats.
 * Half is where the value sits between the pool's low and high (so real gaps stay real), half is its rank in the
 * pool (so one outlier cannot flatten everyone else). `log` is for money and crowds, which span orders of magnitude.
 * Items with no measurement get `undefined`, never a guess.
 */
function scale(raws, { log = false, lo = 30, hi = 99 } = {}) {
  const t = (x) => (log ? Math.log10(Math.max(x, 1)) : x);
  const known = raws.filter((x) => x != null && Number.isFinite(x)).map(t).sort((a, b) => a - b);
  if (!known.length) return raws.map(() => undefined);
  const q = (p) => known[Math.min(known.length - 1, Math.floor(p * (known.length - 1)))];
  const min = q(0.03), max = known[known.length - 1];
  return raws.map((x) => {
    if (x == null || !Number.isFinite(x)) return undefined;
    const v = t(x);
    const span = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0.5;
    const rank = known.length > 1 ? known.filter((k) => k <= v).length / known.length : 0.5;
    return Math.round(lo + (hi - lo) * (0.5 * span + 0.5 * rank));
  });
}

// ------------------------------------------------------------------ CSV
function csv(file) {
  const text = fs.readFileSync(path.join(root, "backend/data/nba", file), "utf8");
  const rows = [];
  let cur = [""], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else q = false; } else cur[cur.length - 1] += c; }
    else if (c === '"') q = true;
    else if (c === ",") cur.push("");
    else if (c === "\n") { rows.push(cur); cur = [""]; }
    else if (c !== "\r") cur[cur.length - 1] += c;
  }
  if (cur.length > 1) rows.push(cur);
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const num = (x) => (x == null || x === "" || x === "NA" ? null : Number(x));

// ------------------------------------------------------------------ NBA
// Every rating is the average of a player's five best seasons at that skill (at least 40 games each), so one hot
// year does not decide it, and nothing depends on stats the league did not record yet (steals and blocks before 1973-74).
function nba() {
  const items = read("nba");
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z ]/g, "").toLowerCase().trim();
  const adv = csv("Advanced.csv"), pg = csv("Player Per Game.csv");
  const teams = csv("End of Season Teams.csv"), awards = csv("Player Award Shares.csv"), career = csv("Player Career Info.csv");
  const seasonKey = (r) => `${r.player_id}|${r.season}`;
  // A traded player has one row per team plus a combined row ("2TM", "TOT"); keep the combined one, else the only one.
  const pick = (rows) => {
    const by = new Map();
    for (const r of rows) {
      if (r.lg !== "NBA" && r.lg !== "BAA" && r.lg !== "ABA") continue;
      const k = seasonKey(r), combined = /^(\dTM|TOT)$/.test(r.team);
      if (!by.has(k) || combined) by.set(k, r);
    }
    return by;
  };
  const A = pick(adv), P = pick(pg);
  // League-average true shooting by season (minutes-weighted), to judge efficiency against a player's own era.
  const lg = new Map();
  for (const r of A.values()) {
    const mp = num(r.mp), ts = num(r.ts_percent);
    if (!mp || ts == null) continue;
    const e = lg.get(r.season) ?? [0, 0];
    e[0] += ts * mp; e[1] += mp; lg.set(r.season, e);
  }
  const lgTs = (s) => { const e = lg.get(s); return e ? e[0] / e[1] : 0.53; };
  // Rebounds were easier to come by when teams missed more shots, so compare each season with that year's leaders.
  const lgTop = (field) => {
    const m = new Map();
    for (const r of P.values()) { const g = num(r.g), v = num(r[field]); if (g >= 40 && v != null) (m.get(r.season) ?? m.set(r.season, []).get(r.season)).push(v); }
    return new Map([...m].map(([s, xs]) => [s, mean(xs.sort((a, b) => b - a).slice(0, 10))]));
  };
  const topReb = lgTop("trb_per_game"), topAst = lgTop("ast_per_game"), topPts = lgTop("pts_per_game");

  const idByName = new Map();
  for (const c of career) { const k = norm(c.player); const prev = idByName.get(k); if (!prev || num(c.to) - num(c.from) > prev.span) idByName.set(k, { id: c.player_id, span: num(c.to) - num(c.from) }); }

  const raw = items.map((it) => {
    const id = idByName.get(norm(it.name))?.id;
    if (!id) return null;
    const seasons = [...A.values()].filter((r) => r.player_id === id && num(r.g) >= 40).map((a) => ({ a, p: P.get(seasonKey(a)) })).filter((x) => x.p);
    if (seasons.length < 3) return null;
    // Each skill is judged on the player's five best seasons at that skill.
    const best5 = (f) => mean(seasons.map(f).filter((v) => v != null && Number.isFinite(v)).sort((x, y) => y - x).slice(0, 5));
    const honours = (type) => teams.filter((t) => t.player_id === id && t.type === type);
    const share = (re) => awards.filter((w) => w.player_id === id && re.test(w.award)).reduce((n, w) => n + (num(w.share) ?? 0), 0);
    const allDef = honours("All-Defense"), allNba = [...honours("All-NBA"), ...honours("All-ABA"), ...honours("All-BAA")];
    const first = (xs) => xs.filter((t) => t.number_tm === "1st").length;
    // Counting stats are half "against the league leaders that year" and half the plain number, so neither a slow era nor a fast one is flattered.
    const rel = (field, top, flat) => best5((x) => 0.5 * (num(x.p[field]) / (top.get(x.a.season) ?? flat)) + 0.5 * (num(x.p[field]) / flat));
    return {
      scoring: rel("pts_per_game", topPts, 30),
      playmaking: rel("ast_per_game", topAst, 10),
      rebounding: best5((x) => num(x.p.trb_per_game) / (topReb.get(x.a.season) ?? 13)),
      // Defensive win shares exist for every era; All-Defense teams (from 1969) and DPOY votes (from 1983) add what the box score misses.
      defense: best5((x) => (num(x.a.dws) / Math.max(num(x.a.g), 1)) * 82) + first(allDef) * 0.45 + (allDef.length - first(allDef)) * 0.25 + Math.min(share(/dpoy/i), 3) * 0.8,
      // Free throws are the one shot every era took the same way; threes made and efficiency against the league add range and touch.
      shooting: (best5((x) => num(x.p.ft_percent)) - 0.7) * 120 + best5((x) => (num(x.a.ts_percent) == null ? null : num(x.a.ts_percent) - lgTs(x.a.season))) * 40 + Math.min(best5((x) => num(x.p.x3p_per_game)) || 0, 4) * 3,
      impact: best5((x) => num(x.a.ws_48)) * 100 + Math.min(share(/^(nba|aba) mvp$/i), 6) * 1.5 + first(allNba) * 0.6 + (allNba.length - first(allNba)) * 0.3,
    };
  });
  const keys = ["scoring", "playmaking", "rebounding", "defense", "shooting", "impact"];
  const scaled = Object.fromEntries(keys.map((k) => [k, scale(raw.map((r) => r?.[k] ?? null))]));
  let kept = 0;
  const out = items.map((it, i) => {
    if (!raw[i]) { kept++; return it; }
    return { ...it, stats: Object.fromEntries(keys.map((k) => [k, scaled[k][i]])) };
  });
  if (kept) console.log(`nba: ${kept} players not matched in the CSVs kept their old numbers`);
  write("nba", out, (i) => (raw[items.findIndex((x) => x.id === i.id)] ? keys : []));
}

// ------------------------------------------------------------------ Pokémon
const POKE_SLUG = { "mr-mime": "mr-mime", "farfetch-d": "farfetchd", "nidoran": "nidoran-m", "mimikyu": "mimikyu-disguised", "aegislash": "aegislash-shield", "deoxys": "deoxys-normal", "giratina": "giratina-altered", "zygarde": "zygarde-50", "toxtricity": "toxtricity-amped", "urshifu": "urshifu-single-strike", "wishiwashi": "wishiwashi-solo", "lycanroc": "lycanroc-midday", "keldeo": "keldeo-ordinary", "landorus": "landorus-incarnate", "thundurus": "thundurus-incarnate", "tornadus": "tornadus-incarnate", "meloetta": "meloetta-aria", "shaymin": "shaymin-land", "darmanitan": "darmanitan-standard", "basculin": "basculin-red-striped", "wormadam": "wormadam-plant", "eiscue": "eiscue-ice", "morpeko": "morpeko-full-belly", "indeedee": "indeedee-male", "meowstic": "meowstic-male", "oricorio": "oricorio-baile", "minior": "minior-red-meteor", "pumpkaboo": "pumpkaboo-average", "gourgeist": "gourgeist-average" };
async function pokemon() {
  const items = read("pokemon");
  const slug = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const r = (base) => Math.max(5, Math.min(99, Math.round(base / 1.5)));
  const got = new Set();
  const out = [];
  for (const it of items) {
    const s = slug(it.name);
    const d = await getJson(`https://pokeapi.co/api/v2/pokemon/${POKE_SLUG[s] ?? s}`);
    if (!d) { console.log(`pokemon: no PokéAPI entry for ${it.name}, kept as is`); const { teamwork, intellect, ...stats } = it.stats; out.push({ ...it, stats }); continue; }
    const b = Object.fromEntries(d.stats.map((x) => [x.stat.name, x.base_stat]));
    const total = Object.values(b).reduce((a, x) => a + x, 0);
    got.add(it.id);
    // Base stats run to about 150 for the very best, so dividing by 1.5 puts them on the same 0-100 scale as everyone else.
    out.push({ ...it, stats: { power: r(Math.max(b.attack, b["special-attack"])), speed: r(b.speed), durability: r((b.hp + b.defense + b["special-defense"]) / 3), combat: r(total / 6 * 1.15) } });
  }
  write("pokemon", out, (i) => (got.has(i.id) ? ["power", "speed", "durability", "combat"] : []));
}

// ------------------------------------------------------------------ Wikidata helpers
async function qids(titles) {
  const out = new Map();
  for (const part of chunk(titles, 45)) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item|disambiguation&titles=${encodeURIComponent(part.join("|"))}`);
    const back = new Map();
    for (const n of d?.query?.normalized ?? []) back.set(n.to, n.from);
    const redir = new Map();
    for (const r of d?.query?.redirects ?? []) redir.set(r.to, r.from);
    for (const p of Object.values(d?.query?.pages ?? {})) {
      if (!p.pageprops?.wikibase_item || "disambiguation" in p.pageprops) continue;
      let t = p.title;
      t = redir.get(t) ?? t;
      t = back.get(t) ?? t;
      out.set(t, p.pageprops.wikibase_item);
    }
    await sleep(120);
  }
  return out;
}
const ents = new Map();
async function entities(ids) {
  for (const part of chunk([...new Set(ids)].filter((id) => !ents.has(id)), 45)) {
    const d = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|sitelinks&ids=${part.join("|")}`);
    for (const [id, e] of Object.entries(d?.entities ?? {})) ents.set(id, e);
    await sleep(120);
  }
}
const claims = (e, pid) => (e?.claims?.[pid] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.snaktype === "value");
const claimIds = (e, pid) => claims(e, pid).map((c) => c.mainsnak.datavalue?.value?.id).filter(Boolean);
/** Largest value of a quantity; `unit` keeps only one Wikidata unit (US dollars for money, so yen and won are not read as dollars). */
const maxAmount = (e, pid, unit) => {
  const xs = claims(e, pid).filter((c) => !unit || String(c.mainsnak.datavalue?.value?.unit ?? "").endsWith(`/${unit}`)).map((c) => Number(c.mainsnak.datavalue?.value?.amount)).filter(Number.isFinite);
  return xs.length ? Math.max(...xs) : null;
};
const sitelinks = (e) => Object.keys(e?.sitelinks ?? {}).filter((k) => k.endsWith("wiki") && !/commons|species|meta|quote|source|books|news|versity|voyage/.test(k)).length;

/** Find each item's Wikidata entity: try likely article titles in order and accept the first whose type fits. */
async function resolve(items, tries, isA) {
  const found = new Map();
  let left = items;
  for (let round = 0; round < 4 && left.length; round++) {
    const want = new Map(left.map((i) => [i.id, tries(i)[round]]).filter(([, t]) => t));
    if (!want.size) break;
    const map = await qids([...new Set(want.values())]);
    await entities([...map.values()]);
    for (const i of left) {
      const q = map.get(want.get(i.id));
      if (q && claimIds(ents.get(q), "P31").some((t) => isA.has(t))) found.set(i.id, q);
    }
    left = left.filter((i) => !found.has(i.id));
  }
  if (left.length) console.log(`  unresolved: ${left.map((i) => i.name).join(", ")}`);
  return found;
}

/** Review scores on a 0-100 scale, by who gave them. Wikidata stores them as text: "97%", "9.2/10", "4.5/5". */
const REVIEWERS = { Q105584: "rt", Q150248: "metacritic", Q37312: "imdb", Q18709181: "letterboxd" };
function reviews(e) {
  const out = {};
  for (const c of claims(e, "P444")) {
    const who = REVIEWERS[c.qualifiers?.P447?.[0]?.datavalue?.value?.id];
    const text = String(c.mainsnak.datavalue?.value ?? "");
    const pct = text.match(/^(\d{1,3})\s*%$/), frac = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/);
    if (!who) continue;
    // Rotten Tomatoes has two numbers: the Tomatometer (a percentage) and an average rating out of ten. Keep the percentage.
    if (who === "rt" && !pct) continue;
    const v = pct ? Number(pct[1]) : frac ? (Number(frac[1]) / Number(frac[2])) * 100 : null;
    if (v != null && v >= 0 && v <= 100) (out[who] ??= []).push(v);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, mean(v)]));
}

/** Article titles for names that land on the wrong page (a remake, a disambiguation page). */
const WIKI_TITLE = {
  Titanic: "Titanic (1997 film)", Avatar: "Avatar (2009 film)", Parasite: "Parasite (2019 film)", Gladiator: "Gladiator (2000 film)", Whiplash: "Whiplash (2014 film)",
  Up: "Up (2009 film)", Joker: "Joker (2019 film)", Coco: "Coco (2017 film)", "Spirited Away": "Spirited Away",
  "Death Note": "Death Note (2006 TV series)", "One Piece": "One Piece (1999 TV series)", "The Bear": "The Bear (TV series)", "Arrested Development": "Arrested Development", "Band of Brothers": "Band of Brothers (miniseries)",
};
async function screen(id, { suffixes, types, extra }) {
  const items = read(id);
  const found = await resolve(items, (i) => (WIKI_TITLE[i.name] ? [WIKI_TITLE[i.name]] : [...suffixes.map((s) => `${i.q ?? i.name} (${s})`), i.q ?? i.name]), types);
  const raw = items.map((i) => {
    const e = ents.get(found.get(i.id));
    if (!e) return {};
    const rv = reviews(e);
    const critics = [rv.rt, rv.metacritic].filter((x) => x != null), audience = [rv.imdb, rv.letterboxd].filter((x) => x != null);
    return {
      critics: critics.length ? mean(critics) : null,
      audience: audience.length ? mean(audience) : null,
      // How far it travelled: Wikipedia language editions, lifted by major awards won.
      impact: sitelinks(e) ? sitelinks(e) * (1 + Math.min(claims(e, "P166").length, 12) * 0.04) : null,
      ...extra(e),
    };
  });
  return { items, raw };
}
/** Old editorial numbers stand in where a source has nothing, so no item is left without a rating. */
const fill = (measured, fallback) => (measured ?? Math.round(fallback));

async function films() {
  const { items, raw } = await screen("films", { suffixes: ["film"], types: new Set(["Q11424", "Q202866", "Q20650540", "Q24862", "Q29168811", "Q229390", "Q20667187", "Q24869", "Q506240"]), extra: (e) => ({ boxOffice: maxAmount(e, "P2142", "Q4917") }) });
  const S = { critics: scale(raw.map((r) => r.critics), { lo: 40 }), audience: scale(raw.map((r) => r.audience), { lo: 40 }), impact: scale(raw.map((r) => r.impact), { log: true, lo: 40 }), boxOffice: scale(raw.map((r) => r.boxOffice), { log: true }) };
  const got = new Map();
  const out = items.map((it, i) => {
    const o = it.stats, m = Object.keys(S).filter((k) => S[k][i] != null);
    got.set(it.id, m);
    return { ...it, stats: {
      critics: fill(S.critics[i], ((o.story ?? o.critics ?? 70) + (o.acting ?? o.critics ?? 70)) / 2), audience: fill(S.audience[i], ((o.fun ?? o.audience ?? 70) + (o.rewatch ?? 70)) / 2),
      boxOffice: fill(S.boxOffice[i], o.boxOffice ?? 50), impact: fill(S.impact[i], o.impact ?? 70), visuals: o.visuals, rewatch: o.rewatch,
    } };
  });
  write("films", out, (i) => got.get(i.id));
}
async function shows() {
  const { items, raw } = await screen("shows", { suffixes: ["TV series", "American TV series"], types: new Set(["Q5398426", "Q63952888", "Q581714", "Q1259759", "Q117467246", "Q15416", "Q21191270", "Q1366112", "Q170238", "Q526877"]), extra: (e) => ({ longevity: maxAmount(e, "P1113") }) });
  const S = { critics: scale(raw.map((r) => r.critics), { lo: 40 }), audience: scale(raw.map((r) => r.audience), { lo: 40 }), impact: scale(raw.map((r) => r.impact), { log: true, lo: 40 }), longevity: scale(raw.map((r) => r.longevity), { log: true }) };
  const got = new Map();
  const out = items.map((it, i) => {
    const o = it.stats, m = Object.keys(S).filter((k) => S[k][i] != null);
    got.set(it.id, m);
    return { ...it, stats: {
      critics: fill(S.critics[i], ((o.story ?? o.critics ?? 70) + (o.acting ?? o.critics ?? 70)) / 2), audience: fill(S.audience[i], ((o.fun ?? o.audience ?? 70) + (o.rewatch ?? 70)) / 2),
      longevity: fill(S.longevity[i], o.longevity ?? 50), impact: fill(S.impact[i], o.impact ?? 70), visuals: o.visuals, rewatch: o.rewatch,
    } };
  });
  write("shows", out, (i) => got.get(i.id));
}

// ------------------------------------------------------------------ Geography
const ISO_ALIAS = { "United States": "USA", "United Kingdom": "GBR", "South Korea": "KOR", "North Korea": "PRK", Russia: "RUS", Egypt: "EGY", Turkey: "TUR", Iran: "IRN", Vietnam: "VNM", "Czech Republic": "CZE", "New Zealand": "NZL", "South Africa": "ZAF", "Saudi Arabia": "SAU", "United Arab Emirates": "ARE", Bahamas: "BHS", Venezuela: "VEN", Syria: "SYR", Laos: "LAO", "Ivory Coast": "CIV", "Costa Rica": "CRI", "Sri Lanka": "LKA" };
async function worldBank(indicator, query) {
  const d = await getJson(`https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&${query}`);
  const best = new Map();
  for (const r of d?.[1] ?? []) if (r.value != null && r.value > 0 && (!best.has(r.countryiso3code) || r.date > best.get(r.countryiso3code).date)) best.set(r.countryiso3code, r);
  return new Map([...best].map(([k, r]) => [k, r.value]));
}
async function geography() {
  const items = read("geography");
  const list = await getJson("https://api.worldbank.org/v2/country?format=json&per_page=400");
  const iso = new Map(list[1].map((c) => [c.name, c.id]));
  const code = (n) => ISO_ALIAS[n] ?? iso.get(n);
  const [gdp, mil, tour] = await Promise.all([worldBank("NY.GDP.MKTP.PP.CD", "date=2019:2025"), worldBank("MS.MIL.XPND.CD", "date=2019:2025"), worldBank("ST.INT.ARVL", "date=2015:2019")]);
  // UNESCO World Heritage sites per country, from UNESCO's own open data (a shared site counts for each country).
  const un = await getJson("https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?select=iso_codes,count(*)&group_by=iso_codes&limit=300", { headers: { "User-Agent": "Mozilla/5.0 TopPicStatsBot/1.0" } });
  const iso2 = new Map(list[1].map((c) => [c.iso2Code, c.id]));
  const sites = new Map();
  for (const r of un?.results ?? []) { const k = iso2.get(String(r.iso_codes).toUpperCase()); if (k) sites.set(k, (sites.get(k) ?? 0) + r["count(*)"]); }
  const missing = items.filter((i) => !code(i.name)).map((i) => i.name);
  if (missing.length) console.log(`  geography: no ISO code for ${missing.join(", ")}`);
  const at = (m) => items.map((i) => m.get(code(i.name)) ?? null);
  const S = { economy: scale(at(gdp), { log: true }), military: scale(at(mil), { log: true }), tourism: scale(at(tour), { log: true }), culture: scale(at(sites).map((x) => (x == null ? null : x + 1)), { log: true }) };
  const got = new Map();
  const out = items.map((it, i) => {
    const o = it.stats, m = Object.keys(S).filter((k) => S[k][i] != null);
    got.set(it.id, m);
    return { ...it, stats: { economy: fill(S.economy[i], o.economy), military: fill(S.military[i], o.military), tourism: fill(S.tourism[i], o.tourism ?? ((o.climate ?? 60) + o.landscape) / 2), culture: fill(S.culture[i], o.culture), landscape: o.landscape, cuisine: o.cuisine } };
  });
  write("geography", out, (i) => got.get(i.id));
}

// ------------------------------------------------------------------ Flags
async function flags() {
  const items = read("flags");
  const facts = JSON.parse(fs.readFileSync(path.join(root, "app/pinpoint/data/flags.json"), "utf8")).facts;
  const views = [];
  for (const it of items) {
    const title = `Flag_of_${(/^(United States|United Kingdom|Netherlands|Philippines|Bahamas|Maldives|Seychelles|Czech Republic|Dominican Republic|United Arab Emirates)$/.test(it.name) ? "the_" : "") + it.name.replace(/ /g, "_")}`;
    const d = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/monthly/20250101/20251231`);
    views.push(d?.items?.length ? d.items.reduce((a, x) => a + x.views, 0) : null);
    await sleep(60);
  }
  const recognition = scale(views, { log: true, lo: 35 });
  // More colours score higher for "colourful"; two colours is the calm end, six or more the busy end.
  const colourful = (n) => (n == null ? undefined : [20, 30, 42, 60, 76, 88, 96][Math.min(n, 6)]);
  const got = new Map();
  const out = items.map((it, i) => {
    const o = it.stats, c = colourful(facts[it.id]?.count), m = [...(c != null ? ["colors"] : []), ...(recognition[i] != null ? ["recognition"] : [])];
    got.set(it.id, m);
    return { ...it, stats: { colors: fill(c, o.colors), recognition: fill(recognition[i], o.recognition), simplicity: o.simplicity, symbolism: o.symbolism, uniqueness: o.uniqueness } };
  });
  write("flags", out, (i) => got.get(i.id));
}

// ------------------------------------------------------------------ History
async function history() {
  const items = read("history");
  const found = await resolve(items, (i) => [i.q ?? i.name], new Set(["Q5"]));
  const hpi = [];
  for (const it of items) {
    const q = found.get(it.id);
    const person = q ? await getJson(`https://api.pantheon.world/person?wd_id=eq.${q}&select=id`) : null;
    const d = person?.[0]?.id ? await getJson(`https://api.pantheon.world/person_ranks?id=eq.${person[0].id}&select=hpi`) : null;
    hpi.push(d?.[0]?.hpi ?? null);
    await sleep(60);
  }
  const influence = scale(hpi, { lo: 45 });
  const got = new Map();
  const out = items.map((it, i) => { got.set(it.id, influence[i] != null ? ["influence"] : []); return { ...it, stats: { ...it.stats, influence: fill(influence[i], it.stats.influence) } }; });
  write("history", out, (i) => got.get(i.id));
}

// ------------------------------------------------------------------ Fictional characters
function std() {
  for (const id of ["superheroes", "villains", "anime", "videogames", "disney", "movies"]) {
    const items = read(id).map((it) => { const { teamwork, ...stats } = it.stats; return { ...it, stats }; });
    write(id, items, () => []);
  }
}

const TOPICS = { nba, pokemon, geography, flags, films, shows, history, std };
for (const [name, run] of Object.entries(TOPICS)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`== ${name}`);
  await run();
}
if (!DRY) fs.writeFileSync(provPath, JSON.stringify(provenance) + "\n");
