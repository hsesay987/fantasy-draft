import { API_URL } from "../play/onlineApi";
import { voterId } from "./triviaRate";

export type DailyGame = "summit" | "hotair" | "costimation" | "toprung" | "pecking" | "npat";
export const DAILY_GAMES: DailyGame[] = ["summit", "hotair", "costimation", "toprung", "pecking", "npat"];
export const DAILY_TITLES: Record<DailyGame, string> = { summit: "Summit", hotair: "Hot Air", costimation: "Costimation", toprung: "Top Rung", pecking: "Pecking Order", npat: "Name Place Animal Thing" };
/** The dailies that play in a pixel world. Pecking Order and NPAT have none: they are scored in points and named by
 * bands instead (`bandsFor`). */
export type WorldDaily = Exclude<DailyGame, "pecking" | "npat">;
export type PointsDaily = Exclude<DailyGame, WorldDaily>;
export const DAILY_WORLD: Record<WorldDaily, "summit" | "sky" | "launch" | "ladder"> = { summit: "summit", hotair: "sky", costimation: "launch", toprung: "ladder" };
export const hasWorld = (g: DailyGame): g is WorldDaily => g in DAILY_WORLD;

/** Pecking Order's checkpoints, by share of the 500 points on offer: the highest one reached names the result. `mark` is the run chart's shorter label. */
export const PECKING_BANDS: { name: string; at: number; mark?: string }[] = [
  { name: "Bottom of the order", at: 0 },
  { name: "Low perch", at: 0.2 },
  { name: "Middle rung", at: 0.4 },
  { name: "High perch", at: 0.6 },
  { name: "Top of the pecking order", at: 0.8, mark: "Top perch" },
];
export const peckingBand = (score: number) => [...PECKING_BANDS].reverse().find((b) => score >= b.at)!.name;
/** One square per question: green from 80 points, yellow from 40, red below. */
export const peckingSquare = (points: number) => (points >= 80 ? "🟩" : points >= 40 ? "🟨" : "🟥");

/** NPAT's checkpoints, by share of the 500 points on offer (five categories, a Unicorn each). */
export const NPAT_BANDS: { name: string; at: number; mark?: string }[] = [
  { name: "Blank page", at: 0 },
  { name: "First scribbles", at: 0.15, mark: "Scribbles" },
  { name: "Filling in", at: 0.3 },
  { name: "Sharp pencil", at: 0.5 },
  { name: "Full marks", at: 0.75 },
];
/** One square per category: green from 60 points (Rare or better), yellow from 30 (Solid), red below. */
export const npatSquare = (points: number) => (points >= 60 ? "🟩" : points >= 30 ? "🟨" : "🟥");

/** The points-scored dailies: their total on offer and their bands. */
export const DAILY_POINTS: Record<PointsDaily, number> = { pecking: 500, npat: 500 };
export const bandsFor = (g: PointsDaily) => (g === "npat" ? NPAT_BANDS : PECKING_BANDS);
export const bandOf = (g: PointsDaily, score: number) => [...bandsFor(g)].reverse().find((b) => score >= b.at)!.name;
export const isDailyGame = (g: string): g is DailyGame => (DAILY_GAMES as string[]).includes(g);

/** Puzzle numbers count up from the first daily (31 October 2026, UTC). */
export const todayKey = () => new Date().toISOString().slice(0, 10);
export const todayNumber = () => Math.floor((Date.parse(`${todayKey()}T00:00:00Z`) - Date.parse("2026-10-31T00:00:00Z")) / 86_400_000) + 1;

export type Puzzle = { game: DailyGame; day: string; number: number; content: any };
export type Stats = { players: number; average: number; percentile: number | null; buckets: number[]; best: number };
/** What this browser remembers about one finished daily. */
export type Played = { day: string; number: number; score: number; history: number[]; grid: string; checkpoint: string; stats?: Stats };

const KEY = (g: DailyGame) => `toppic:daily:v1:${g}`;
function load(g: DailyGame): Record<string, Played> {
  try { return JSON.parse(localStorage.getItem(KEY(g)) ?? "{}"); } catch { return {}; }
}
export function playedOn(g: DailyGame, day: string): Played | null {
  return load(g)[day] ?? null;
}
export function remember(g: DailyGame, p: Played) {
  try { const all = load(g); all[p.day] = p; localStorage.setItem(KEY(g), JSON.stringify(all)); } catch { /* storage unavailable */ }
}

/** Played, current and best streak (days in a row), best and average score, from this browser's history. */
export function myStats(g: DailyGame, today: string) {
  const all = Object.values(load(g)).sort((a, b) => a.day.localeCompare(b.day));
  const days = new Set(all.map((p) => p.day));
  const prev = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let streak = 0;
  for (let d = days.has(today) ? today : prev(today); days.has(d); d = prev(d)) streak++;
  let best = 0, run = 0, last = "";
  for (const p of all) { run = last && prev(p.day) === last ? run + 1 : 1; best = Math.max(best, run); last = p.day; }
  const scores = all.map((p) => p.score);
  return { played: all.length, streak, bestStreak: best, best: scores.length ? Math.max(...scores) : 0, average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
}

export async function fetchPuzzle(g: DailyGame): Promise<Puzzle> {
  const res = await fetch(`${API_URL}/daily/${g}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Today's puzzle is not available right now.");
  return res.json();
}

/** `answers` is NPAT's typed answers, `{ category, text }` each, for the server to re-check and count. */
export async function sendResult(g: DailyGame, day: string, score: number, detail: unknown, answers?: { category: string; text: string }[]): Promise<Stats | null> {
  try {
    const res = await fetch(`${API_URL}/daily/${g}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player: voterId(), day, score, detail, ...(answers ? { answers } : {}) }) });
    return res.ok ? (await res.json()).stats : null;
  } catch {
    return null;
  }
}

export async function fetchStats(g: DailyGame, day: string, score: number): Promise<Stats | null> {
  try {
    const res = await fetch(`${API_URL}/daily/${g}/stats?day=${day}&score=${score}`);
    return res.ok ? (await res.json()).stats : null;
  } catch {
    return null;
  }
}

/** Time until the next puzzle (midnight UTC), as h:mm:ss. */
export function untilNext(now = Date.now()): string {
  const next = Math.ceil(now / 86_400_000) * 86_400_000;
  const s = Math.max(0, Math.floor((next - now) / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function shareText(g: DailyGame, p: Played): string {
  const result = hasWorld(g) ? `${Math.round(p.score * 100)}%` : `${Math.round(p.score * DAILY_POINTS[g])}/${DAILY_POINTS[g]}`;
  return [`TopPic ${DAILY_TITLES[g]} #${p.number}`, `${p.checkpoint} · ${result}`, p.grid, "toppicgames.com/trivia"].join("\n");
}
