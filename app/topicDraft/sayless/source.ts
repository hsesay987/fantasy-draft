// Where the Say Less engine gets a deck's words. The engine is shared with the room screens on phones, and the words must never
// ship there, so the engine asks this module and only the places that really deal words (the server and solo play) fill it in,
// by importing words.ts, which registers the full lists here.
export type SayWord = { name: string; par: number; also?: string[] };

let source: ((deck: string) => SayWord[]) | null = null;

export function setWordSource(f: (deck: string) => SayWord[]): void {
  source = f;
}

/** The words for a deck. Throws if no word list was loaded, so a missing import can't pass as an empty deck. */
export function wordsOf(deck: string): SayWord[] {
  if (!source) throw new Error("Say Less word lists not loaded: import sayless/words where words are dealt");
  return source(deck);
}
