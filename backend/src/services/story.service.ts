// Draft story: after a draft is judged, a play-by-play of the matchup. The verdict is fixed before the story is written,
// so the story can never change who won. One AI call per result, on its own daily budget; any failure means no story.
import { defaultClient, extractJson, type JudgeReq, type LLM, type Verdict } from "./judge.service";
import { trackServer } from "../lib/monitoring";

export type StoryBeat = { label: string; text: string };
export type Story = { title: string; setting: string; beats: StoryBeat[]; why: string };
export type StoryInput = Pick<JudgeReq, "scenario" | "teams"> & { verdict: Pick<Verdict, "winner" | "teams" | "statsTable"> };

const TIMEOUT_MS = Number(process.env.STORY_TIMEOUT_MS) || 25_000;
const DEFAULT_DAILY = 1000;

/** Story seeds: picked at random, so the same mission and teams still get a new story. */
export const SETTINGS = [
  "a fog-bound harbor at midnight", "a collapsing space station", "a desert canyon at high noon", "a flooded subway system",
  "a frozen mountain pass", "a neon city rooftop in the rain", "an abandoned theme park", "a jungle temple at dusk",
  "a sinking cruise ship", "a volcanic island", "a haunted opera house", "a stadium during a blackout",
  "a floating sky fortress", "a sandstorm-swept oil rig", "a medieval castle siege", "a hall of mirrors",
  "a train racing across a bridge", "an underwater research base", "a city during a solar eclipse", "a skyscraper under construction",
];
export const CONDITIONS = ["thick fog", "a thunderstorm", "a total blackout", "blinding sun", "a blizzard", "an earthquake mid-fight", "a ticking clock", "a crowd of millions watching", "zero gravity for one minute", "rising floodwater"];
export const TWISTS = ["a surprise ambush", "a betrayal that backfires", "a last-second comeback attempt", "an unlikely team-up", "a trap that springs early", "a hidden weakness exposed", "a power outage at the worst moment", "a ref who stops the clock", "a sudden change of terrain", "a bluff that almost works"];

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const pick = <T,>(xs: T[], rand: () => number): T => xs[Math.floor(rand() * xs.length) % xs.length]!;

/** The last titles written, so the model is told not to repeat them. */
const recent: string[] = [];
let day = "", spent = 0;
const dailyCap = () => { const n = Number(process.env.STORY_DAILY_CALLS); return Number.isFinite(n) && process.env.STORY_DAILY_CALLS ? n : DEFAULT_DAILY; };
/** Takes one call from today's budget; false once it is spent (resets at 00:00 UTC). */
function takeBudget(): boolean {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; spent = 0; }
  if (spent >= dailyCap()) return false;
  spent++;
  return true;
}
export const _resetStoryBudget = () => { day = ""; spent = 0; recent.length = 0; };

/** One pick for the prompt: name, what it is, and its strongest stats, so the story can use real details. */
function pickLine(i: StoryInput["teams"][number]["items"][number]): string {
  const top = Object.entries(i.stats ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
  const what = [i.archetype, i.universe].filter(Boolean).join(", ");
  return `${i.name}${i.role ? ` [${i.role}]` : ""}${what ? ` (${what})` : ""}${top ? ` - ${top}` : ""}`;
}

export function storyPrompt(input: StoryInput, seeds: { setting: string; condition: string; twist: string }, avoid: string[]): { system: string; user: string } {
  const system = [
    "You are a hype sports-and-action commentator narrating a fantasy matchup for a party game, as a vivid play-by-play. Reply with JSON only.",
    'Shape: {"title": string, "setting": string, "beats": [{"label": string, "text": string}], "why": string}.',
    "Write it like the best fight commentary: concrete, specific, high stakes. Never vague, never generic.",
    "Rules:",
    "- 5 to 7 beats. Each beat is 2 to 4 sentences (about 250-400 characters) and names the characters involved.",
    "- Use each character's real signature moves, powers, weapons, skills, catchphrases or play style from their own story or career. Name the move.",
    "- Stage head-to-head duels: pair specific characters from opposite teams, show who gets the upper hand and how.",
    "- Work the stats into the action (e.g. speed 95 lets them close the gap first), but as story, not a list.",
    "- Use the setting, the condition and the twist so they change what happens, not just decoration.",
    "- Give the losing side a real moment: a lead, a near win or a scare for the winner. Then the turning point flips it.",
    "- Use as many characters as you can, from both teams. Only characters from the teams; no new ones.",
    "- The given winner must win; nothing may suggest otherwise. No gore, no slurs, no real-world politics.",
    "- `setting` is 1-2 sentences that set the scene and the stakes. `title` is punchy, 2-6 words.",
    "- `why` is 1-2 sentences on why the winner won, tied to the deciding stats and the key picks.",
    "- Labels are short and dramatic, like Opening Bell, First Blood, Momentum Swing, The Scare, Turning Point, Final Blow.",
  ].join("\n");
  const teams = input.teams.map((t) => `${t.player}:\n${t.items.map((i) => `  - ${pickLine(i)}`).join("\n")}`).join("\n");
  const scores = input.verdict.teams.map((t) => `${t.player} ${t.score}`).join(", ");
  const deciding = (input.verdict.statsTable ?? []).slice(0, 5).map((r) => `${r.key}: ${Object.entries(r.values).map(([p, v]) => `${p} ${v}`).join(", ")}`).join("; ");
  const user = [
    `Mission: ${input.scenario.title}${input.scenario.blurb ? ` - ${input.scenario.blurb}` : ""}`,
    `Teams:\n${teams}`,
    `Winner: ${input.verdict.winner}. Scores: ${scores}.`,
    deciding ? `Deciding stats (team averages): ${deciding}` : "",
    `Story seeds: set it in ${seeds.setting}, with ${seeds.condition}, and include ${seeds.twist}.`,
    avoid.length ? `Do not reuse these titles: ${avoid.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
  return { system, user };
}

/** A story the model wrote, checked: right shape, real picks named, the winner in `why`. Null when it doesn't hold up. */
export function validateStory(raw: any, input: StoryInput): Story | null {
  if (!raw || !Array.isArray(raw.beats)) return null;
  const beats = raw.beats.slice(0, 7).map((b: any) => ({ label: clean(b?.label, 28), text: clean(b?.text, 520) })).filter((b: StoryBeat) => b.label && b.text);
  // Thin stories fail: at least 5 beats with some substance to them.
  if (beats.length < 5 || beats.filter((b: StoryBeat) => b.text.length >= 140).length < 4) return null;
  const why = clean(raw.why, 320);
  const title = clean(raw.title, 80);
  if (!why || !title || !fold(why).includes(fold(input.verdict.winner))) return null;
  const names = input.teams.flatMap((t) => t.items.map((i) => i.name));
  const text = fold(beats.map((b: StoryBeat) => b.text).join(" "));
  // A pick counts when its name appears, or its name without a bracketed part ("Spider-Man" for "Spider-Man (Peter Parker)"),
  // or its last word when that is distinctive (4+ letters: "Kratos", "Jordan").
  const forms = (n: string) => { const bare = n.replace(/\s*\(.*\)\s*$/, ""); const last = bare.split(" ").pop() ?? ""; return [n, bare, ...(last.length >= 4 && bare.includes(" ") ? [last] : [])].map(fold); };
  const hit = (n: string) => forms(n).some((f) => text.includes(f));
  const named = new Set(names.filter(hit));
  // Both sides show up, and most of the picks get a moment.
  const everyTeam = input.teams.every((t) => t.items.some((i) => hit(i.name)));
  if (!everyTeam || named.size < Math.min(names.length, Math.max(2, Math.ceil(names.length * 0.6)))) return null;
  return { title, setting: clean(raw.setting, 300), beats, why };
}

/** Writes one story, or null (no AI configured, budget spent, timeout, or an answer that fails the checks). */
export async function writeStory(input: StoryInput, client: LLM | null = defaultClient(), rand: () => number = Math.random): Promise<Story | null> {
  if (!client || !input.teams.length || !input.verdict?.winner) return null;
  if (!takeBudget()) { trackServer("story_call", { source: "budget" }); return null; }
  const seeds = { setting: pick(SETTINGS, rand), condition: pick(CONDITIONS, rand), twist: pick(TWISTS, rand) };
  const { system, user } = storyPrompt(input, seeds, recent.slice(-30));
  const t0 = Date.now();
  try {
    const text = await Promise.race([
      client.complete(system, user),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("story timeout")), TIMEOUT_MS)),
    ]);
    const story = validateStory(extractJson(text), input);
    trackServer("story_call", { source: story ? "ai" : "invalid", ms: Date.now() - t0 });
    if (story) { recent.push(story.title); if (recent.length > 60) recent.splice(0, recent.length - 60); }
    return story;
  } catch {
    trackServer("story_call", { source: "error", ms: Date.now() - t0 });
    return null;
  }
}
