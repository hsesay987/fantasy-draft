// NPAT dig's pure helpers for the room screens: the phase clock, the phase line, and the players ranked by depth.
// Data-free on purpose: nothing here may import the answer lists (see npat/boundary.test).
import type { DigAnswer, DigView } from "../../topicDraft/formats/npatDig";
import { categoryOf } from "../../topicDraft/npat/categories";
import { DIG_ANSWER_MS, depthOf, JUDGE_MS, REEL_MS, VERDICT_MS, ZONES } from "../../topicDraft/npat/rules";
import { own } from "../../topicDraft/party/own";

type Clocked = Pick<DigView, "phase" | "phaseAt" | "done">;

/** How long the current phase runs: the reel, the 20 s answer (without its grace), the judge's limit, the verdict. */
export function digClock(s: Clocked): { deadline: number; total: number } | null {
  if (s.done) return null;
  const total = s.phase === "reel" ? REEL_MS : s.phase === "ask" ? DIG_ANSWER_MS : s.phase === "judge" ? JUDGE_MS : VERDICT_MS;
  return { deadline: s.phaseAt + total, total };
}

const title = (id: string) => categoryOf(id)?.title ?? id;

/** The screen's phase line: which category of five (or round, in question style), and what is happening. */
export function digPhase(s: Pick<DigView, "phase" | "cat" | "categories" | "letter" | "done" | "letters">): string {
  const q = !!s.letters;
  if (s.done || s.phase === "summary") return q ? "Final scores" : "Final depths";
  if (s.phase === "reel") return q ? `Round ${s.cat + 1} of ${s.categories.length} · Drawing the letter` : "Drawing the letter";
  const step = s.phase === "ask" ? "Answering" : s.phase === "judge" ? "Judging" : "Verdict";
  if (q) return `Round ${s.cat + 1} of ${s.categories.length} · ${s.categories[s.cat] ?? ""} · ${s.letter} · ${step}`;
  return `Category ${s.cat + 1} of ${s.categories.length} · ${title(s.categories[s.cat] ?? "")} · ${s.letter} · ${step}`;
}

/** The zone a depth has reached. */
export const zoneName = (m: number): string => [...ZONES].reverse().find((z) => m >= z.m)?.name ?? ZONES[0]!.name;

export type DigRow = { name: string; points: number; depth: number; zone: string; place: number };

/** Players deepest first; equal points share a place. */
export function digRanked(s: Pick<DigView, "players" | "points">): DigRow[] {
  const rows = s.players.map((name) => {
    const points = own(s.points, name) ?? 0;
    const depth = depthOf(points);
    return { name, points, depth, zone: zoneName(depth), place: 0 };
  }).sort((a, b) => b.points - a.points);
  rows.forEach((r, i) => { r.place = i > 0 && rows[i - 1]!.points === r.points ? rows[i - 1]!.place : i + 1; });
  return rows;
}
