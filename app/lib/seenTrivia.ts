// Remembers which quiz questions this device saw recently, so new Jeopardy and Feud games prefer fresh ones.
const KEY = "toppic:seen-trivia";
const MAX = 300;

export function loadSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(-MAX) : [];
  } catch {
    return [];
  }
}

export function saveSeen(questions: string[]) {
  try {
    const merged = [...loadSeen().filter((q) => !questions.includes(q)), ...questions].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable */
  }
}
