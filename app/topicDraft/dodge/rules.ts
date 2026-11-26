// Dodge's timing and matching rules. Pure, shared by the engine, the server and the room screens.

/** Everyone, the chosen player included, has this long to type one answer. */
export const ANSWER_MS = 20_000;
/** An answer sent as the clock runs out still counts if it arrives this soon after. */
export const WRITE_GRACE_MS = 500;
/** How long close calls wait for the AI judge before only exact matches count. */
export const JUDGE_MS = 6_000;
/** How long the reveal stays up unless the host moves on. */
export const REVEAL_MS = 14_000;
export const ANSWER_MAX = 40;
/** Laps the host can pick: how many times each player is chosen. */
export const LAPS = [1, 2, 3] as const;

const FILLER = new Set(["the", "a", "an"]);
/** Singular words that end in "is", which would otherwise lose their "s" like "kiwis" and "pepperonis" do. */
const SINGULAR_IS = new Set(["tennis", "iris", "axis", "oasis", "basis", "pelvis", "chassis", "paris", "elvis", "memphis", "lewis", "genesis", "crisis", "thesis"]);

/**
 * One word, singular. Only plural endings come off: "boxes" -> "box", "roses" -> "rose", "shoes" -> "shoe", while a
 * bare singular keeps its "e" ("cape" never meets "cap"). "-ie", "-ies" and a "-y" after a consonant share one stem, so
 * "cookie"/"cookies" and "berry"/"berries" both match. Words that only look plural ("tennis", "octopus") are left alone.
 */
function stem(w: string): string {
  if (w.length <= 3) {
    // Short words still share a stem with their plural: pie/pies, fry/fries, spy/spies.
    if (w.endsWith("ie")) return w.slice(0, -1);
    if (/[^aeiou]y$/.test(w) && w.length === 3) return `${w.slice(0, -1)}i`;
    return w;
  }
  let x = w;
  if (x.endsWith("ies") && x.length > 4) return x.slice(0, -2); // cookies -> cooki, berries -> berri
  if (/(sses|xes|zzes|ches|shes|oes)$/.test(x)) x = x.endsWith("oes") && !/(tomatoes|potatoes|heroes|mangoes|echoes)$/.test(x) ? x.slice(0, -1) : x.slice(0, -2);
  else if (x.endsWith("s") && !/(ss|us)$/.test(x) && !SINGULAR_IS.has(x)) x = x.slice(0, -1);
  if (x.endsWith("ie")) return x.slice(0, -1); // cookie -> cooki
  if (/[^aeiou]y$/.test(x) && x.length > 3) return `${x.slice(0, -1)}i`; // berry -> berri
  return x;
}

/**
 * The form two answers are compared in: case, accents, punctuation, spaces and hyphens folded, "the/a/an" dropped,
 * simple plurals made singular. "Spider-Man" and "Spiderman" share a key. Empty for a blank.
 */
export function matchKey(text: string): string {
  return stems(text).join("");
}

/** The answer's words, folded and singular, in order. */
function stems(text: string): string[] {
  return String(text ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter((w) => w && !FILLER.has(w)).map(stem);
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** Typos allowed for a key this long: short words must match exactly. */
const slack = (n: number) => (n < 4 ? 0 : n <= 6 ? 1 : 2);

/**
 * Close but not the same: a small typo apart, or one answer's words inside the other's ("Coke" and "Diet Coke").
 * These go to the judge; anything further apart is a dodge.
 */
export function close(a: string, b: string): boolean {
  const x = matchKey(a), y = matchKey(b);
  if (!x || !y || x === y) return false;
  // Containment is checked word by word, so "ham" is not inside "graham".
  const sx = stems(a).join(" "), sy = stems(b).join(" ");
  const [short, long] = sx.length <= sy.length ? [sx, sy] : [sy, sx];
  if (short.length >= 3 && ` ${long} `.includes(` ${short} `)) return true;
  return distance(x, y) <= slack(Math.min(x.length, y.length));
}
