export function normalizeFranchise(t: string): string {
  const map: Record<string, string> = {
    BRK: "BKN",
    NJN: "BKN",
    SEA: "OKC",
    NOH: "NOP",
    NOK: "NOP",
    CHA: "CHA",
    CHH: "CHA",
    PHW: "GSW",
    SFW: "GSW",
  };
  return map[t] ?? t;
}
