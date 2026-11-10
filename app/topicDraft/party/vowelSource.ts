// Where the Vowel Play engine gets a topic's names. The engine is shared with the room screens on phones, and the names must never
// ship there, so the engine asks this module and only the places that really deal words (the server and solo play) fill it in,
// by importing vowelWords.ts, which registers the full list here.
let source: ((topic: string) => string[]) | null = null;

export function setWordSource(f: (topic: string) => string[]): void {
  source = f;
}

/** The names for a topic. Throws if no word list was loaded, so a missing import can't pass as an empty topic. */
export function namesFor(topic: string): string[] {
  if (!source) throw new Error("Vowel Play word list not loaded: import party/vowelWords where words are dealt");
  return source(topic);
}
