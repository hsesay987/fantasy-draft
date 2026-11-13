// What Say Less's clue field holds as the describer types. Pure, so it can be tested without a browser.

/** A space with something on both sides: two words. */
const TWO_WORDS = /\S\s+\S/;

/**
 * The field's next value after an edit from `prev` to `next`. A space at either end stays (a predictive-text tap adds
 * one; sending trims it), but a space between two words is refused with `warn`: the field keeps the first word, or the
 * word as it was when the space was typed inside it. Nothing is ever joined, so "a", " ", "b" never becomes "ab".
 */
export function clueDraft(prev: string, next: string): { value: string; warn: boolean } {
  if (!TWO_WORDS.test(next)) return { value: next, warn: false };
  const word = prev.trim();
  // One space typed inside the word ("ab" to "a b"): refuse just that keystroke.
  if (word && !TWO_WORDS.test(prev) && next.replace(/\s/, "") === prev) return { value: prev, warn: true };
  return { value: next.trim().split(/\s+/)[0]!, warn: true };
}

/** What a send carries: the field without its end spaces. */
export const clueToSend = (value: string): string => value.trim();
