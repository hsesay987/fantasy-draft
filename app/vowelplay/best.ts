// The best Vowel Play score per topic, in this browser only. Storage can throw or be missing, and that must never reach the game.
const KEY = "toppic:vowelplay:best:v1";

function read(): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The best score kept for a topic; 0 if there is none or the save is damaged. */
export function bestFor(topic: string): number {
  const all = read();
  const v = Object.hasOwn(all, topic) ? all[topic] : 0;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Keeps `score` if it beats what is saved for the topic. */
export function saveBest(topic: string, score: number): void {
  if (score <= bestFor(topic)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [topic]: score }));
  } catch {
    /* storage unavailable */
  }
}
