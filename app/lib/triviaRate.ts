import { API_URL } from "../play/onlineApi";

export type RateKind = "category" | "clue" | "survey";
export type Vote = { quality?: number; difficulty?: number; wrong?: boolean };

const VOTER_KEY = "toppic:voter:v1";
const VOTES_KEY = "toppic:votes:v1";
let memoryVoter: string | null = null;

/** An anonymous id kept in this browser, so a later vote on the same item replaces the earlier one. */
export function voterId(): string {
  try {
    let v = localStorage.getItem(VOTER_KEY);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(VOTER_KEY, v); }
    return v;
  } catch {
    return (memoryVoter ??= `anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  }
}

const keyOf = (kind: RateKind, id: string, clue = -1) => `${kind}:${id}:${clue}`;

export function myVote(kind: RateKind, id: string, clue = -1): Vote {
  try { return (JSON.parse(localStorage.getItem(VOTES_KEY) ?? "{}") as Record<string, Vote>)[keyOf(kind, id, clue)] ?? {}; } catch { return {}; }
}

function remember(kind: RateKind, id: string, clue: number, vote: Vote) {
  try {
    const all = JSON.parse(localStorage.getItem(VOTES_KEY) ?? "{}") as Record<string, Vote>;
    all[keyOf(kind, id, clue)] = vote;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete all[k]; // keep the list small
    localStorage.setItem(VOTES_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}

/** Sends a vote. Resolves false if it could not be saved, which the caller can ignore: ratings are optional. */
export async function sendVote(kind: RateKind, id: string, vote: Vote, clue = -1): Promise<boolean> {
  remember(kind, id, clue, vote);
  try {
    const res = await fetch(`${API_URL}/trivia/rate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, ...(kind === "clue" ? { clue } : {}), voter: voterId(), ...vote }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
