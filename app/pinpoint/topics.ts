import { CATEGORIES } from "../play/categories";
import { CATALOG_META, getCatalog } from "../topicDraft/catalogs";

/** Topics with enough picks to make a fair daily puzzle. */
export const PINPOINT_TOPICS = CATEGORIES.filter((c) => !c.hidden && CATALOG_META.some((m) => m.id === c.id && m.kind === "character") && getCatalog(c.id).length >= 30);

export type PinpointRun = { guesses: string[]; over: boolean; won: boolean };
const key = (pool: string, day: number) => `toppic:pinpoint:${pool}:${day}`;

export function loadPinpoint(pool: string, day: number): PinpointRun | null {
  try {
    const raw = localStorage.getItem(key(pool, day));
    return raw ? (JSON.parse(raw) as PinpointRun) : null;
  } catch {
    return null;
  }
}

export function savePinpoint(pool: string, day: number, run: PinpointRun) {
  try {
    localStorage.setItem(key(pool, day), JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
}
