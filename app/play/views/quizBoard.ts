// Party trivia's scoreboard, worked out from what a seat is sent. A seat's team is always found by membership in
// `state.teams`: the host's map is not used during play, because empty teams are dropped and loose players are placed.
import { teamName } from "../teamMoves";

type Scores = { players: string[]; teams: string[][] | null; points: Record<string, number>; teamPoints: number[] };

export const teamIndexOf = (teams: string[][] | null, name: string) => (teams ? teams.findIndex((t) => t.includes(name)) : -1);

/** One line of the scoreboard: a team, or a player when there are no teams. `id` is the team's index or the player's seat. */
export type Standing = { id: number; label: string; members: string[]; score: number; rank: number; mine: boolean };

/** Best first. Ties share a rank and keep seat order. */
export function standings(s: Scores, me: string | null): Standing[] {
  const rows = s.teams
    ? s.teams.map((m, i) => ({ id: i, label: `${teamName(i)} team`, members: m, score: s.teamPoints[i] ?? 0 }))
    : s.players.map((p, i) => ({ id: i, label: p, members: [p], score: s.points[p] ?? 0 }));
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.id - b.id);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.score === r.score) + 1, mine: !!me && r.members.includes(me) }));
}

/** The result in words: who won, or that it was a tie, or nobody when nobody scored. */
export function winnerOf(rows: Standing[]): { kind: "win"; row: Standing } | { kind: "tie"; rows: Standing[] } | { kind: "none" } {
  const top = rows[0];
  if (!top || top.score <= 0) return { kind: "none" };
  const level = rows.filter((r) => r.score === top.score);
  return level.length > 1 ? { kind: "tie", rows: level } : { kind: "win", row: top };
}

export type PlayerStat = { name: string; seat: number; correct: number; carried: boolean };

/**
 * Each player's own right answers, best first. On a team, "carried" goes to whoever got the most right, ties included,
 * but not when the whole team is level (nobody carried anybody) and never on no right answers.
 */
export function playerStats(s: { players: string[]; correct: Record<string, number> }, members: string[]): PlayerStat[] {
  const n = (p: string) => s.correct[p] ?? 0;
  const top = Math.max(0, ...members.map(n));
  const level = members.length > 1 && members.every((p) => n(p) === top);
  return members
    .map((name) => ({ name, seat: s.players.indexOf(name), correct: n(name), carried: top > 0 && !level && n(name) === top }))
    .sort((a, b) => b.correct - a.correct || a.seat - b.seat);
}

/** What each option has been picked by, among the choices this seat may see. Other teams' blanked choices don't count. */
export function votesFor(answers: Record<string, { choice: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [p, a] of Object.entries(answers)) if (a.choice) (out[a.choice] ??= []).push(p);
  return out;
}

/** Fixed-width digits for the high-score look. */
export const scoreDigits = (n: number) => String(Math.max(0, Math.round(n))).padStart(5, "0");

const ORDINALS = ["1ST", "2ND", "3RD"];
export const rankLabel = (rank: number) => ORDINALS[rank - 1] ?? `${rank}TH`;
