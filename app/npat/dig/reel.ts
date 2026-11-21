export const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The letter shown at `step` of `steps`; always A-Z, and the last step is the target itself. */
export function reelLetter(target: string, step: number, steps: number): string {
  if (step >= steps) return target;
  const from = Math.max(0, ABC.indexOf(target));
  return ABC[(((from - (steps - step) * 5) % 26) + 26) % 26];
}
