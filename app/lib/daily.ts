import { API_URL } from "../play/onlineApi";
import { voterId } from "./triviaRate";

export type DailyGame = "summit" | "hotair" | "costimation";
export const DAILY_GAMES: DailyGame[] = ["summit", "hotair", "costimation"];
export const DAILY_TITLES: Record<DailyGame, string> = { summit: "Summit", hotair: "Hot Air", costimation: "Costimation" };
export const DAILY_WORLD: Record<DailyGame, "summit" | "sky" | "launch"> = { summit: "summit", hotair: "sky", costimation: "launch" };
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

export async function sendResult(g: DailyGame, day: string, score: number, detail: unknown): Promise<Stats | null> {
  try {
    const res = await fetch(`${API_URL}/daily/${g}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player: voterId(), day, score, detail }) });
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
  return [`TopPic ${DAILY_TITLES[g]} #${p.number}`, `${p.checkpoint} · ${Math.round(p.score * 100)}%`, p.grid, "toppicgames.com/trivia"].join("\n");
}
