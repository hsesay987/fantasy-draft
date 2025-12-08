// utils/normalizeSeason.ts
export function normalizeSeason(endYear: number): number {
  if (!Number.isFinite(endYear)) return endYear;
  return endYear - 1;
}
