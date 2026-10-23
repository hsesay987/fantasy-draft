// Serializable seeded RNG: keep `seed` in game state, advance it on every draw.
export function next(seed: number): [number, number] {
  let s = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

export function shuffle<T>(arr: T[], seed: number): [T[], number] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    const [r, ns] = next(s);
    s = ns;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return [a, s];
}

export const newSeed = () => (Math.random() * 2 ** 31) | 0;
