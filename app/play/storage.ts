import type { GameSetup } from "./types";

const SETUP = "toppic:v2:setup";
const run = (id: string) => `toppic:v2:run:${id}`;
const PREFS = "toppic:v2:prefs";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const saveSetup = (s: GameSetup) => safe(() => localStorage.setItem(SETUP, JSON.stringify(s)), undefined);
export const loadSetup = (): GameSetup | null => safe(() => JSON.parse(localStorage.getItem(SETUP) || "null"), null);
export const clearRun = (id: string) => safe(() => localStorage.removeItem(run(id)), undefined);

export function saveRun(id: string, state: unknown) {
  safe(() => localStorage.setItem(run(id), JSON.stringify(state)), undefined);
}
export function loadRun<T>(id: string): T | null {
  return safe(() => JSON.parse(localStorage.getItem(run(id)) || "null"), null);
}

/** A saved, unfinished run (for the Resume banner). */
export function resumable(): { setup: GameSetup } | null {
  const setup = loadSetup();
  if (!setup) return null;
  const st = loadRun<{ finished?: boolean }>(setup.id);
  return st && !st.finished ? { setup } : null;
}

export type Prefs = { pool?: string; name?: string };
export const loadPrefs = (): Prefs => safe(() => JSON.parse(localStorage.getItem(PREFS) || "{}"), {});
export const savePrefs = (p: Prefs) => safe(() => localStorage.setItem(PREFS, JSON.stringify({ ...loadPrefs(), ...p })), undefined);
