// Two-tier content: one model writes, the other checks, and the roles swap every batch so each model reviews the
// other's work. Nothing is kept unless the checker approves it, it passes moderation, and it is not a repeat.
//
//   growVote     new cards for a vote deck (Icks, Who's Wrong, Who Would Win...)
//   growInSync   new pairs of opposites for an In-Sync deck
//   rateItems    stats for new catalog entries: both models rate blind, and a stat is kept only when they agree
import { createHash } from "crypto";
import { extractJson } from "../services/judge.service";
import type { Deck, VoteCard } from "../shared/topicDraft/party/decks";
import type { InSyncDeck, Pair as SyncPair } from "../shared/topicDraft/party/insyncDecks";
import type { StatDef } from "../shared/topicDraft/stats";
import { roles, type Named, type Pair } from "./models";

/** Model replies are untrusted JSON: every field is checked before use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type Moderate = (texts: unknown[]) => Promise<{ ok: boolean; reason?: string }>;
export type Log = (msg: string) => void;

export const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9{} ]+/g, " ").replace(/\s+/g, " ").trim();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8);
/** Models like typographic hyphens and spaces; cards use plain ones so they read and match like hand-written ones. */
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[\u2010-\u2013]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "";

async function json(llm: Named, system: string, user: string): Promise<Loose | null> {
  try {
    return extractJson(await llm.complete(system, user));
  } catch {
    return null;
  }
}

/** The checker's verdict on one item: keep it or not, with a reason for the log. */
async function review(checker: Named, rubric: string, item: string): Promise<{ keep: boolean; reason: string }> {
  const out = await json(checker, `You review content for a party game before it goes live. Be strict.\n${rubric}\nReply with ONLY JSON: {"keep": true or false, "reason": "one short sentence"}`, item);
  return { keep: out?.keep === true, reason: String(out?.reason ?? "no answer") };
}

// ─────────────────────────── Vote cards ───────────────────────────

/** A deck whose every card has the same two sides ("Ick" / "No ick") gets those sides on every new card too. */
const fixedSides = (d: Deck): [string, string] | null => {
  const [first] = d.cards;
  return first && d.cards.every((c) => c.a === first.a && c.b === first.b) ? [first.a, first.b] : null;
};
const isFacts = (d: Deck) => d.cards.some((c) => c.answer);
const cardKey = (c: Pick<VoteCard, "prompt" | "a" | "b">) => fold(`${c.prompt}|${c.a}|${c.b}`);

export function validateCard(raw: Loose, d: Deck, seen: Set<string>): (VoteCard & { claim?: "real" | "made-up" }) | null {
  const sides = fixedSides(d);
  const prompt = str(raw?.prompt, 220), a = sides ? sides[0] : str(raw?.a, 70), b = sides ? sides[1] : str(raw?.b, 70);
  if (!prompt || !a || !b || prompt.length > 220 || a.length > 70 || b.length > 70 || fold(a) === fold(b)) return null;
  // Models sometimes paste the two sides into the prompt, "(Nina / The teammates)": a card that does is malformed.
  if (/\([^)]*(\/| vs\.? )[^)]*\)?\s*\.?$/.test(prompt) || (prompt.includes(a) && prompt.includes(b) && / \/ /.test(prompt))) return null;
  // A side is who or what you vote for, not a sentence: "Nina", not "Nina for being too chilly".
  if (!sides && (a.split(" ").length > 7 || b.split(" ").length > 7)) return null;
  const room = d.cards.some((c) => /\{p1\}/.test(c.a + c.b + c.prompt));
  if (room && !/\{p1\}/.test(prompt + a + b)) return null; // a Room card must name someone at the table
  if (!room && /\{p[12]\}/.test(prompt + a + b)) return null;
  const card: VoteCard & { claim?: "real" | "made-up" } = { id: "", prompt, a, b };
  if (isFacts(d)) {
    const claim = raw?.real === true ? "real" : raw?.real === false ? "made-up" : null;
    if (!claim) return null;
    card.claim = claim;
    card.a = "It happened";
    card.b = "Made up";
    card.answer = claim === "real" ? "a" : "b";
    const note = str(raw?.note, 80);
    if (claim === "real" && !note) return null; // a true story must say where it happened
    if (note) card.note = note;
  }
  const key = cardKey(card);
  if (seen.has(key) || seen.has(fold(prompt))) return null;
  card.id = `${d.id}-g${hash(key)}`;
  return card;
}

function voteBrief(d: Deck, existing: VoteCard[], n: number): { system: string; user: string } {
  const sides = fixedSides(d);
  const facts = isFacts(d);
  const room = d.cards.some((c) => /\{p1\}/.test(c.a + c.b + c.prompt));
  const shape = facts
    ? `{"cards":[{"prompt":string,"real":true or false,"note":string}]}: "prompt" retells one TV moment in a sentence; "real" says whether it truly happened; "note" names the show and episode for a real one.`
    : sides
      ? `{"cards":[{"prompt":string}]}: each prompt is one short scenario players will vote "${sides[0]}" or "${sides[1]}" on.`
      : `{"cards":[{"prompt":string,"a":string,"b":string}]}: "prompt" sets the scene, "a" and "b" are the two sides players vote between, each under 60 characters.`;
  const system = [
    `You write cards for "${d.title}", a voting party game. ${d.blurb}`,
    `Reply with ONLY JSON: ${shape}`,
    "Cards must be original, specific and funny or debatable, so a room splits on them. Write for adults at a party but keep it clean enough for a family game night: no sex, slurs, real tragedies or cruelty about groups of people.",
    room ? 'Every card must use {p1} (and optionally {p2}) where a player at the table is named, e.g. "{p1}" against "A goose". Never invent real names.' : "Never name a private person.",
    facts ? "Mix real and made-up moments about half and half. Made-up ones must be believable. Only use shows you are sure about." : "",
  ].filter(Boolean).join("\n");
  const sample = existing.slice(-60).map((c) => `- ${c.prompt}${sides || facts ? "" : ` (${c.a} / ${c.b})`}`).join("\n");
  return { system, user: `Write ${n} new cards. Do not repeat or reword any of these:\n${sample}` };
}

/** What a deck allows that a strict checker would otherwise reject. */
const DECK_NOTES: Record<string, string> = {
  whowins: "Matchups may pit fictional characters, gods, monsters, historical figures and animals against each other, powers and magic included: that is the point of the deck. Judge whether the matchup is fun to argue about, not whether it is realistic.",
  "whowins-room": "{p1} and {p2} are people at the table, filled in when the game starts. Silly contests are fine. Reject anything that mocks someone's body, intelligence or identity.",
};

function voteRubric(d: Deck): string {
  if (isFacts(d)) return "This card claims a TV moment is real or made up. Keep it only if the claim is correct, the show is real, and the wording is clean.";
  return [
    `Deck: "${d.title}" — ${d.blurb}`,
    DECK_NOTES[d.id] ?? "",
    `Keep it only if: it fits the deck, ${d.id.startsWith("whowins") ? "" : "it describes something real people actually do or face (not absurd or surreal), "}both sides are reasonable votes (a room would split), it is clear in one read, it is not offensive or cruel, and it does not name a private person.`,
    "Reject anything forced, random or unfunny. When unsure, reject.",
  ].join("\n");
}

/** A Did That Happen card is kept only if the checker, not told the answer, reaches the same verdict as the writer. */
async function blindFact(checker: Named, prompt: string): Promise<"real" | "made-up" | null> {
  try {
    const out = (await checker.complete("You are a TV expert. Did this really happen on the show? Reply with ONLY one word: real, made-up, or unsure.", prompt)).toLowerCase();
    return /made[- ]?up|fake|false/.test(out) ? "made-up" : /\breal\b|true/.test(out) ? "real" : null;
  } catch {
    return null;
  }
}

export async function growVote(d: Deck, want: number, p: Pair, moderate: Moderate, log: Log = () => {}, batch = 8): Promise<VoteCard[]> {
  const kept: VoteCard[] = [];
  const seen = new Set(d.cards.flatMap((c) => [cardKey(c), fold(c.prompt)]));
  for (let round = 0; kept.length < want && round < Math.ceil(want / batch) * 3; round++) {
    const { writer, checker } = roles(p, round);
    const brief = voteBrief(d, [...d.cards, ...kept], Math.min(batch, want - kept.length + 2));
    const raw = await json(writer, brief.system, brief.user);
    for (const r of Array.isArray(raw?.cards) ? raw.cards : []) {
      if (kept.length >= want) break;
      const card = validateCard(r, d, seen);
      if (!card) continue;
      seen.add(cardKey(card)).add(fold(card.prompt));
      const { claim, ...clean } = card;
      if (claim) {
        const verdict = await blindFact(checker, clean.prompt);
        if (verdict !== claim) { log(`  ✗ ${checker.name}: says ${verdict ?? "unsure"}, writer said ${claim} — ${clean.prompt}`); continue; }
      }
      const v = await review(checker, voteRubric(d), JSON.stringify({ prompt: clean.prompt, a: clean.a, b: clean.b, ...(clean.note ? { note: clean.note } : {}) }));
      if (!v.keep) { log(`  ✗ ${checker.name}: ${v.reason} — ${clean.prompt}`); continue; }
      const m = await moderate([clean.prompt, clean.a, clean.b, clean.note]);
      if (!m.ok) { log(`  ✗ moderation: ${m.reason ?? "flagged"} — ${clean.prompt}`); continue; }
      kept.push({ ...clean, by: `${writer.name}>${checker.name}` });
      log(`  ✓ ${writer.name}>${checker.name}: ${clean.prompt}`);
    }
  }
  return kept;
}

// ─────────────────────────── In-Sync pairs ───────────────────────────

const pairKey = (x: { left: string; right: string }) => fold(`${x.left}|${x.right}`);

export function validatePair(raw: Loose, d: InSyncDeck, seen: Set<string>): SyncPair | null {
  const left = str(raw?.left, 40), right = str(raw?.right, 40);
  if (!left || !right || left.length > 40 || right.length > 40 || fold(left) === fold(right)) return null;
  const key = pairKey({ left, right });
  if (seen.has(key) || seen.has(pairKey({ left: right, right: left }))) return null;
  return { id: `sync-${d.id}-g${hash(key)}`, left, right };
}

export async function growInSync(d: InSyncDeck, want: number, p: Pair, moderate: Moderate, log: Log = () => {}, batch = 10): Promise<SyncPair[]> {
  const kept: SyncPair[] = [];
  const seen = new Set(d.pairs.map(pairKey));
  const system = [
    `You write pairs of opposites for "${d.title}" (${d.blurb}), a party game where one player gives a clue for a hidden spot on the line between the two ends.`,
    'Reply with ONLY JSON: {"pairs":[{"left":string,"right":string}]}. Each end is under 35 characters.',
    "Good pairs make friends disagree about where things sit. Stay on the deck's topic. Clean enough for a family game night.",
  ].join("\n");
  const rubric = `Deck: "${d.title}" — ${d.blurb}\nKeep it only if the two ends are the two extremes of ONE scale, phrased in parallel (like Cringe / Iconic or Snack / Feast), not two unrelated things, people could place many things between them and argue about it, it fits the deck, and it is not offensive.`;
  for (let round = 0; kept.length < want && round < Math.ceil(want / batch) * 3; round++) {
    const { writer, checker } = roles(p, round);
    const sample = [...d.pairs, ...kept].slice(-60).map((x) => `- ${x.left} / ${x.right}`).join("\n");
    const raw = await json(writer, system, `Write ${Math.min(batch, want - kept.length + 2)} new pairs. Do not repeat or flip any of these:\n${sample}`);
    for (const r of Array.isArray(raw?.pairs) ? raw.pairs : []) {
      if (kept.length >= want) break;
      const pr = validatePair(r, d, seen);
      if (!pr) continue;
      seen.add(pairKey(pr));
      const v = await review(checker, rubric, `${pr.left} / ${pr.right}`);
      if (!v.keep) { log(`  ✗ ${checker.name}: ${v.reason} — ${pr.left} / ${pr.right}`); continue; }
      const m = await moderate([pr.left, pr.right]);
      if (!m.ok) { log(`  ✗ moderation — ${pr.left} / ${pr.right}`); continue; }
      kept.push({ ...pr, by: `${writer.name}>${checker.name}` });
      log(`  ✓ ${writer.name}>${checker.name}: ${pr.left} / ${pr.right}`);
    }
  }
  return kept;
}

// ─────────────────────────── Catalog stats ───────────────────────────

export type Candidate = { name: string; universe: string; archetype: string; tags: string[]; q?: string; hint?: string };
export type Rated = Candidate & { stats: Record<string, number>; by: string };

/** Largest gap between the two models' numbers for one stat before the entry is set aside. */
export const AGREE_WITHIN = 15;

function ratingPrompt(topic: string, defs: StatDef[], examples: { name: string; stats: Record<string, number> }[]) {
  const system = [
    `You rate entries for "${topic}" in a drafting game. Each stat is 0-100 against the existing entries below, which set the scale.`,
    `Stats:\n${defs.map((s) => `- ${s.key}: ${s.label} — ${s.basis}`).join("\n")}`,
    `"fits" is false when the entry is not mainly known for this topic (an actor who once released a song is not a musician) or is not real.`,
    `Reply with ONLY JSON: {"fits": true or false, ${defs.map((s) => `"${s.key}": number`).join(", ")}}`,
  ].join("\n\n");
  const scale = examples.map((e) => `${e.name}: ${defs.map((s) => `${s.key} ${e.stats[s.key]}`).join(", ")}`).join("\n");
  return { system, scale };
}

const readStats = (raw: Loose, defs: StatDef[]): Record<string, number> | null => {
  const out: Record<string, number> = {};
  for (const s of defs) {
    const n = Number(raw?.[s.key]);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    out[s.key] = Math.round(n);
  }
  return out;
};

/** Both models rate the entry without seeing each other's numbers; the average is kept only if every stat is close. */
export function agree(x: Record<string, number>, y: Record<string, number>, within = AGREE_WITHIN): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const k of Object.keys(x)) {
    if (!(k in y) || Math.abs(x[k]! - y[k]!) > within) return null;
    out[k] = Math.round((x[k]! + y[k]!) / 2);
  }
  return out;
}

export async function rateItems(topic: string, defs: StatDef[], examples: { name: string; stats: Record<string, number> }[], items: Candidate[], p: Pair, log: Log = () => {}): Promise<Rated[]> {
  const { system, scale } = ratingPrompt(topic, defs, examples);
  const out: Rated[] = [];
  for (const [i, c] of items.entries()) {
    const { writer, checker } = roles(p, i);
    const ask = `Existing entries (the scale):\n${scale}\n\nRate: ${c.name} (${c.universe}; ${c.archetype})${c.hint ? `. ${c.hint}` : ""}`;
    const [x, y] = await Promise.all([json(writer, system, ask), json(checker, system, ask)]);
    if (x?.fits === false || y?.fits === false) { log(`  ✗ ${c.name}: not mainly known for ${topic}`); continue; }
    const sx = readStats(x, defs), sy = readStats(y, defs);
    const stats = sx && sy ? agree(sx, sy) : null;
    if (!stats) { log(`  ✗ ${c.name}: the models disagree or did not answer`); continue; }
    out.push({ ...c, stats, by: `${writer.name}+${checker.name}` });
    log(`  ✓ ${c.name}: ${defs.map((s) => `${s.key} ${stats[s.key]}`).join(", ")}`);
  }
  return out;
}
