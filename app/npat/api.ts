// The browser's calls to the NPAT API (judge, stats, dispute). Each one fails quietly: the solo game never waits on them
// beyond the engine's own judge timeout, and a missing answer just shows no number.
import { API_URL } from "../play/onlineApi";

export type JudgeVerdict = { ok: boolean; niche: number; reason?: string };

/** Verdicts for answers not on the lists, in order. Null on any failure (a 429 included): the engine's fallback applies. */
export async function judgeAnswers(category: string, letter: string, answers: string[], signal?: AbortSignal): Promise<JudgeVerdict[] | null> {
  try {
    const res = await fetch(`${API_URL}/npat/judge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, letter, answers }), signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { verdicts?: unknown };
    if (!Array.isArray(body.verdicts) || body.verdicts.length !== answers.length) return null;
    return body.verdicts.map((v: { ok?: unknown; niche?: unknown; reason?: unknown }) => ({ ok: v?.ok === true, niche: typeof v?.niche === "number" ? v.niche : 0, ...(typeof v?.reason === "string" ? { reason: v.reason } : {}) }));
  } catch {
    return null;
  }
}

/** "% of players said": the share (0..100) for one answer of a category and letter, or null when unavailable. */
export async function fetchShare(category: string, letter: string, answer: string): Promise<number | null> {
  try {
    const q = new URLSearchParams({ category, letter, answers: answer.replace(/,/g, " ") });
    const res = await fetch(`${API_URL}/npat/stats?${q}`);
    if (!res.ok) return null;
    const rows = (await res.json()) as { share?: unknown }[];
    return typeof rows[0]?.share === "number" ? rows[0].share : null;
  } catch {
    return null;
  }
}

/** Files a dispute; true when the server took it. */
export async function sendDispute(d: { category: string; letter: string; answer: string; typed: string; reason: string; tier: string | null }): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/npat/dispute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    return res.ok;
  } catch {
    return false;
  }
}
