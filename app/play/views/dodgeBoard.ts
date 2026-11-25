// Dodge's pure helpers for the room screens: the phase clock, the phase line, the reveal's groups and the standings.
import type { DodgeRound, DodgeView } from "../../topicDraft/formats/dodge";
import { chosen } from "../../topicDraft/formats/dodge";
import { ANSWER_MS, JUDGE_MS, REVEAL_MS, matchKey } from "../../topicDraft/dodge/rules";
import { own } from "../../topicDraft/party/own";

type Clocked = Pick<DodgeView, "phase" | "phaseAt" | "done">;

/** How long the current phase runs: the 20 s answer (without its grace), the judge's limit, the reveal. */
export function dodgeClock(s: Clocked): { deadline: number; total: number } | null {
  if (s.done) return null;
  const total = s.phase === "answer" ? ANSWER_MS : s.phase === "judge" ? JUDGE_MS : REVEAL_MS;
  return { deadline: s.phaseAt + total, total };
}

/** The screen's phase line: which round, who is chosen, and what is happening. */
export function dodgePhase(s: Pick<DodgeView, "phase" | "round" | "total" | "players" | "done">): string {
  if (s.done) return "Final scores";
  const step = s.phase === "answer" ? "Answering" : s.phase === "judge" ? "Checking close calls" : "Reveal";
  return `Round ${s.round + 1} of ${s.total} · ${chosen(s)} is chosen · ${step}`;
}

export type RevealGroups = {
  chosen: { name: string; text: string };
  /** Everyone who said the same as the chosen player; `judged` when the judge called it. */
  matched: { name: string; text: string; judged: boolean }[];
  /** Everyone who dodged, grouped by what they said, biggest group first. */
  dodged: { text: string; names: string[] }[];
  blank: string[];
};

/** A round's answers laid out for the reveal: the chosen player, their matches beside them, then the dodges. */
export function revealGroups(r: DodgeRound, players: string[]): RevealGroups {
  const text = (p: string) => own(r.answers, p) ?? "";
  const of = (st: string) => players.filter((p) => own(r.status, p) === st);
  const groups = new Map<string, { text: string; names: string[] }>();
  for (const p of of("dodge")) {
    const k = matchKey(text(p));
    const g = groups.get(k) ?? { text: text(p), names: [] };
    g.names.push(p);
    groups.set(k, g);
  }
  return {
    chosen: { name: r.chosen, text: text(r.chosen) },
    matched: of("match").map((p) => ({ name: p, text: text(p), judged: r.judged.includes(p) })),
    dodged: [...groups.values()].sort((a, b) => b.names.length - a.names.length),
    blank: of("blank"),
  };
}

export type DodgeRow = { name: string; points: number; place: number };

/** Players by points, best first; equal points share a place. */
export function dodgeRanked(s: Pick<DodgeView, "players" | "points">): DodgeRow[] {
  const rows = s.players.map((name) => ({ name, points: own(s.points, name) ?? 0, place: 0 })).sort((a, b) => b.points - a.points);
  rows.forEach((r, i) => { r.place = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.place : i + 1; });
  return rows;
}
