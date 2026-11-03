import { CATEGORIES } from "../play/categories";
import { getCatalog } from "../topicDraft/catalogs";
import { PINPOINT_DATA } from "./data";

/** Topics with real facts for enough picks to make a fair daily puzzle. */
export const PINPOINT_TOPICS = CATEGORIES.filter((c) => !c.hidden && Object.keys(PINPOINT_DATA[c.id]?.facts ?? {}).length >= 25);

/** The picks you can guess (and that can be the answer): the ones we have facts for. */
export const pinpointPicks = (pool: string) => {
  const facts = PINPOINT_DATA[pool]?.facts ?? {};
  return getCatalog(pool).filter((i) => facts[i.id]);
};

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
