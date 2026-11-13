// Where the Pecking Order engine gets its ranked lists. The engine is shared with the room screens on phones, and the
// lists (the answers) must never ship there, so the engine asks this module and only the places that really deal
// questions (the server and solo play) fill it in, by importing lists.ts, which registers the full lists here.
import type { PeckList } from "./types";

let source: ((id: string) => PeckList | undefined) | null = null;

export function setListSource(f: (id: string) => PeckList | undefined): void {
  source = f;
}

/** The list with this id, or undefined for an unknown id. Throws if no lists were loaded, so a missing import can't pass as an empty game. */
export function listFor(id: string): PeckList | undefined {
  if (!source) throw new Error("Pecking Order lists not loaded: import pecking/lists where questions are dealt");
  return source(id);
}
