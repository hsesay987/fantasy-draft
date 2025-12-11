// src/lib/scoring/nba.ts

export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C";

export interface NbaStatLine {
  // Per-game / per-36 type core stats
  ppg: number;
  apg: number;
  rpg: number;
  spg: number;
  bpg: number;

  tsPct?: number | null;
  threeRate?: number | null; // 0–1, proportion of shots that are 3s

  // Advanced box/impact stats (from Advanced.csv etc.)
  per?: number | null;
  ws?: number | null;
  wsPer48?: number | null;
  bpm?: number | null;
  obpm?: number | null;
  dbpm?: number | null;
  vorp?: number | null;
  usgPct?: number | null;

  // On/off & playstyle-ish stuff (from Play By Play / Shooting)
  plusMinusPer100?: number | null; // on_court_plus_minus_per_100_poss
  netPlusMinusPer100?: number | null; // net_plus_minus_per_100_poss

  ptsPer36?: number | null;
  trbPer36?: number | null;
  astPer36?: number | null;
  stlPer36?: number | null;
  blkPer36?: number | null;

  // Accolades / honors (per-season flags)
  allStar?: boolean; // from All Star Selections
  allNBA?: number | null; // 1, 2, 3 (team), null if none
  allDefense?: number | null; // 1, 2, 3 (if you want), null if none
  allRookie?: boolean; // optional, from End Of Season Teams
  mvpShare?: number | null; // 0–1 (pts_won / pts_max)
  dpoyShare?: number | null; // 0–1

  team?: string | null; // franchise normalization helper
}

export interface NbaEraContext {
  eraFrom?: number | null;
  eraTo?: number | null;
}

export interface TeamFitContext {
  position: NbaPosition;
  heightInches: number;
  teamHeights: number[]; // heights of teammates
  teamShooters: number; // count of teammates with decent spacing (3s)
  teamPositions: NbaPosition[];
  teamUsage: number[]; // USG% of teammates
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function normalize(value: number, elite: number): number {
  return clamp(value / elite, 0, 1);
}

/* -------------------------------------------------------------------------- */
/* 1. BASE VALUE – “Box Score” Offense & Defense (0–60)                       */
/* -------------------------------------------------------------------------- */

export function baseNbaScore(stat: NbaStatLine, position: NbaPosition): number {
  // Offense core
  const scoring = normalize(stat.ppg, 35); // 35 ppg ~ ultra-elite
  const assists = normalize(stat.apg, 12); // CP3 / Nash range
  const rebounds = normalize(stat.rpg, 16); // Rodman / elite bigs
  const steals = normalize(stat.spg, 3.0);
  const blocks = normalize(stat.bpg, 3.5);

  const efficiency =
    stat.tsPct != null
      ? clamp((stat.tsPct - 0.5) / (0.66 - 0.5), 0, 1) // .50 = avg, .66 = god tier
      : 0.5;

  const spacing =
    stat.threeRate != null ? clamp(stat.threeRate / 0.6, 0, 1) : 0; // ~0.6 = pure gunner

  // Base weights tuned so non-scorers (Draymond / Rodman) are still strong
  // while 30+ ppg monsters still get rewarded.
  let wScoring = 0.3;
  let wPlaymaking = 0.18;
  let wRebounding = 0.17;
  let wDefense = 0.2;
  let wEfficiency = 0.1;
  let wSpacing = 0.05;

  // Position-specific tweaks
  if (position === "PG") {
    wPlaymaking += 0.1;
    wScoring -= 0.05;
    wRebounding -= 0.05;
  } else if (position === "SG") {
    // scorers / wings
    wScoring += 0.05;
    wSpacing += 0.02;
  } else if (position === "SF") {
    // two-way wings
    wDefense += 0.03;
    wSpacing += 0.02;
  } else if (position === "PF" || position === "C") {
    // Bigs: boards + rim protection
    wRebounding += 0.08;
    wDefense += 0.07;
    wPlaymaking -= 0.03;
  }

  const defBox = (steals + blocks) / 2;

  const raw =
    wScoring * scoring +
    wPlaymaking * assists +
    wRebounding * rebounds +
    wDefense * defBox +
    wEfficiency * efficiency +
    wSpacing * spacing;

  // Scale to 0–60
  return clamp(raw * 60, 0, 60);
}

/* -------------------------------------------------------------------------- */
/* 2. ADVANCED VALUE – PER / BPM / WS / On-Off (0–30)                         */
/* -------------------------------------------------------------------------- */

export function advancedNbaScore(stat: NbaStatLine): number {
  const per = stat.per ?? 15; // league avg
  const ws = stat.ws ?? 5;
  const wsPer48 = stat.wsPer48 ?? 0.08; // ~league avg
  const bpm = stat.bpm ?? 0;
  const vorp = stat.vorp ?? 0;
  const netOnOff = stat.netPlusMinusPer100 ?? stat.plusMinusPer100 ?? 0;
  const usg = stat.usgPct ?? 20;

  const perNorm = clamp((per - 15) / 15, 0, 1); // 30 PER ~ 1.0
  const wsNorm = clamp((ws - 4) / 12, 0, 1); // 16 WS ~ 1.0
  const ws48Norm = clamp((wsPer48 - 0.08) / 0.12, 0, 1); // .20 WS/48 ~ 1.0
  const bpmNorm = clamp((bpm - 0) / 8, 0, 1); // +8 BPM ~ 1.0
  const vorpNorm = clamp(vorp / 8, 0, 1); // 8 VORP ~ 1.0
  const onOffNorm = clamp((netOnOff + 4) / 12, 0, 1); // -4 to +8 -> 0..1

  // Usage: moderate usage with elite efficiency is ideal.
  const usageFactor = clamp(usg / 26, 0.6, 1.4);

  const raw =
    0.25 * perNorm +
    0.2 * wsNorm +
    0.15 * ws48Norm +
    0.2 * bpmNorm +
    0.1 * vorpNorm +
    0.1 * onOffNorm;

  // 0–30, then scaled by usage
  return clamp(raw * 30 * usageFactor, 0, 30);
}

/* -------------------------------------------------------------------------- */
/* 3. ERA ADJUSTMENT – 3pt / pace environment (+/- 5)                         */
/* -------------------------------------------------------------------------- */

export function applyEraAdjustment(
  score: number,
  stat: NbaStatLine,
  era: NbaEraContext
): number {
  if (!era.eraFrom || !era.eraTo) return score;

  const midEra = (era.eraFrom + era.eraTo) / 2;
  const threeRate = stat.threeRate ?? 0;
  let adjustment = 0;

  if (midEra < 1980) {
    // Pre-3pt era – don't over-reward 3pt volume
    adjustment -= threeRate * 5;
  } else if (midEra >= 2005) {
    // Spacing era – reward shooters
    adjustment += threeRate * 5;
  }

  return clamp(score + adjustment, 0, 100);
}

/* -------------------------------------------------------------------------- */
/* 4. TEAM FIT / CHEMISTRY – role balance, height, usage (+/- 10)            */
/* -------------------------------------------------------------------------- */

export function calculateCompatibilityValue(
  stat: NbaStatLine,
  fit: TeamFitContext
): number {
  let comp = 0;

  // a) Positional balance
  const posCount: Record<NbaPosition, number> = {
    PG: 0,
    SG: 0,
    SF: 0,
    PF: 0,
    C: 0,
  };
  fit.teamPositions.forEach((p) => {
    posCount[p] = (posCount[p] || 0) + 1;
  });

  const currentPosCount = posCount[fit.position] || 0;

  if (currentPosCount === 0) comp += 4; // filling a need
  else if (currentPosCount === 1) comp += 1; // fine
  else if (currentPosCount >= 2) comp -= 3 * (currentPosCount - 1); // overcrowded

  // b) Height fit
  const teamAvgHeight =
    fit.teamHeights.length > 0
      ? fit.teamHeights.reduce((a, b) => a + b, 0) / fit.teamHeights.length
      : fit.heightInches;

  const diff = fit.heightInches - teamAvgHeight;
  if (fit.position === "C" || fit.position === "PF") {
    comp += clamp(diff / 2, -3, 4);
  } else {
    comp += clamp(diff / 4, -2, 3);
  }

  // c) Usage fit
  const teamAvgUsage =
    fit.teamUsage.length > 0
      ? fit.teamUsage.reduce((a, b) => a + b, 0) / fit.teamUsage.length
      : 20;
  const playerUsage = stat.usgPct ?? 20;

  if (teamAvgUsage > 27) {
    // already star-heavy, low-usage helper is nice
    comp += clamp((teamAvgUsage - playerUsage) / 5, -4, 4);
  } else if (teamAvgUsage < 18) {
    // needs a star
    comp += clamp((playerUsage - teamAvgUsage) / 5, -4, 4);
  }

  return clamp(comp, -10, 10);
}

/* -------------------------------------------------------------------------- */
/* 5. ACCOLADES BONUS – All-NBA / All-Star / MVP shares (0–10)               */
/* -------------------------------------------------------------------------- */

function accoladeBonus(stat: NbaStatLine): number {
  let bonus = 0;

  if (stat.allStar) bonus += 1.5;

  if (stat.allNBA != null) {
    if (stat.allNBA === 1) bonus += 4;
    else if (stat.allNBA === 2) bonus += 3;
    else if (stat.allNBA === 3) bonus += 2;
  }

  if (stat.allDefense != null) {
    bonus += 1.5; // treat all-defense as strong signal
  }

  const mvp = stat.mvpShare ?? 0;
  const dpoy = stat.dpoyShare ?? 0;

  bonus += clamp(mvp * 5, 0, 5); // full MVP share ~ +5
  bonus += clamp(dpoy * 3, 0, 3); // full DPOY share ~ +3

  return clamp(bonus, 0, 10);
}

/* -------------------------------------------------------------------------- */
/* 6. FINAL SCORE – “2K-style” 0–100 overall                                  */
/* -------------------------------------------------------------------------- */

export function scoreNbaPlayer(
  stat: NbaStatLine,
  position: NbaPosition,
  era: NbaEraContext,
  fit: TeamFitContext
): number {
  const base = baseNbaScore(stat, position); // 0–60
  const adv = advancedNbaScore(stat); // 0–30
  const raw = base + adv; // 0–90-ish
  const eraAdjusted = applyEraAdjustment(raw, stat, era); // +/- 5
  const fitBonus = calculateCompatibilityValue(stat, fit); // -10..+10
  const accolade = accoladeBonus(stat); // 0–10

  const finalScore = eraAdjusted + fitBonus + accolade;

  return clamp(finalScore, 0, 100);
}

/* -------------------------------------------------------------------------- */
/* 7. Franchise Normalization (unchanged)                                     */
/* -------------------------------------------------------------------------- */

export function normalizeFranchise(team: string): string {
  if (!team) return "";
  const t = team.trim().toUpperCase();

  const map: Record<string, string> = {
    ATL: "ATL",
    BOS: "BOS",
    BRK: "BKN",
    BKN: "BKN",
    NJN: "BKN",
    CHA: "CHA",
    CHH: "CHA",
    CHI: "CHI",
    CLE: "CLE",
    DAL: "DAL",
    DEN: "DEN",
    DET: "DET",
    GSW: "GSW",
    PHO: "PHX",
    PHX: "PHX",
    HOU: "HOU",
    IND: "IND",
    LAC: "LAC",
    SD: "LAC",
    SDC: "LAC",
    LAL: "LAL",
    MPL: "LAL",
    MEM: "MEM",
    VAN: "MEM",
    MIA: "MIA",
    MIL: "MIL",
    MIN: "MIN",
    NOP: "NOP",
    NOH: "NOP",
    NOK: "NOP",
    CHO: "CHA",
    NYK: "NYK",
    OKC: "OKC",
    SEA: "OKC",
    ORL: "ORL",
    POR: "POR",
    SAC: "SAC",
    KCK: "SAC",
    KCO: "SAC",
    ROC: "SAC",
    CIN: "SAC",
    KAN: "SAC",
    SAS: "SAS",
    ABA: "SAS",
    TOR: "TOR",
    UTA: "UTA",
    NOJ: "UTA",
    WAS: "WAS",
    WSB: "WAS",
    BAL: "WAS",
    SYR: "PHI",
    PHW: "GSW",
    SFW: "GSW",
    FTL: "DET",
    FTW: "LAL", // historically Pistons -> DET, but franchise tie
    TRI: "ATL",
    MNL: "LAL",
    STL: "ATL",
    BUF: "LAC",
    NYA: "NYK",
    PTA: "POR",
    DNN: "DEN",
    SPG: "SAS",
  };

  return map[t] || t;
}

// export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C";

// export interface NbaStatLine {
//   ppg: number;
//   apg: number;
//   rpg: number;
//   spg: number;
//   bpg: number;
//   tsPct?: number | null;
//   threeRate?: number | null; // 0–1, proportion of shots that are 3s
//   // New advanced stats
//   per?: number | null;
//   ws?: number | null;
//   usgPct?: number | null;
// }

// export interface NbaEraContext {
//   eraFrom?: number | null;
//   eraTo?: number | null;
// }

// export interface TeamFitContext {
//   position: NbaPosition;
//   heightInches: number;
//   teamHeights: number[]; // heights of teammates
//   teamShooters: number; // count of teammates with good shooting (e.g., 3P% > 35%)
//   teamPositions: NbaPosition[]; // positions of teammates already drafted
//   teamUsage: number[]; // USG% of teammates already drafted
// }

// function clamp(x: number, min: number, max: number) {
//   return Math.max(min, Math.min(max, x));
// }

// // Normalize a stat vs some rough idea of "elite" caps.
// function normalize(value: number, elite: number): number {
//   return clamp(value / elite, 0, 1);
// }

// // --- 1. Base Value (Traditional Stats) --------------------------------------

// export function baseNbaScore(stat: NbaStatLine, position: NbaPosition): number {
//   const scoring = normalize(stat.ppg, 35); // 35 PPG ~ elite
//   const assists = normalize(stat.apg, 10);
//   const rebounds = normalize(stat.rpg, 15);
//   const steals = normalize(stat.spg, 3);
//   const blocks = normalize(stat.bpg, 3);
//   const efficiency = stat.tsPct
//     ? clamp((stat.tsPct - 0.48) / (0.65 - 0.48), 0, 1)
//     : 0.5;

//   // Weighting depends on position
//   let wScoring = 0.35;
//   let wAssists = 0.15;
//   let wReb = 0.15;
//   let wDef = 0.1;
//   let wEff = 0.05;

//   if (position === "PG") {
//     wAssists += 0.1;
//     wReb -= 0.05;
//   } else if (position === "C" || position === "PF") {
//     wReb += 0.1;
//     wAssists -= 0.05;
//   }

//   const def = (steals + blocks) / 2;

//   const raw =
//     wScoring * scoring +
//     wAssists * assists +
//     wReb * rebounds +
//     wDef * def +
//     wEff * efficiency;

//   return clamp(raw * 100, 0, 100);
// }

// // --- 2. Advanced Value ------------------------------------------------------

// export function advancedNbaScore(stat: NbaStatLine): number {
//   const per = stat.per ?? 15; // League average is 15
//   const ws = stat.ws ?? 5; // Placeholder for Win Shares (total, not per game)
//   const usgPct = stat.usgPct ?? 20; // League average is 20%

//   // Normalize PER (elite is ~25-30)
//   const perNorm = clamp((per - 15) / 15, 0, 1);

//   // Normalize WS (elite is ~15-20) - this is a rough proxy since we don't have total WS
//   const wsNorm = clamp((ws - 5) / 15, 0, 1);

//   // Usage is a multiplier on the overall value, not a score component itself.
//   // High usage (e.g., 30+) is a risk/reward factor.
//   const usageFactor = clamp(usgPct / 25, 0.5, 1.5);

//   // Advanced score is a weighted average of PER and WS, scaled by usage.
//   const rawAdvanced = (0.6 * perNorm + 0.4 * wsNorm) * 100;

//   return clamp(rawAdvanced * usageFactor * 0.5, 0, 50); // Max 50 points
// }

// // --- 3. Era Adjustment ------------------------------------------------------

// export function applyEraAdjustment(
//   score: number,
//   stat: NbaStatLine,
//   era: NbaEraContext
// ): number {
//   if (!era.eraFrom || !era.eraTo) return score;

//   const midEra = (era.eraFrom + era.eraTo) / 2;
//   const threeRate = stat.threeRate ?? 0;
//   let adjustment = 0;

//   if (midEra < 1980) {
//     // Pre-3pt era: penalize 3pt attempts (if any)
//     adjustment -= threeRate * 10;
//   } else if (midEra >= 2005) {
//     // Spacing era: reward 3pt specialists
//     adjustment += threeRate * 10;
//   }

//   return clamp(score + adjustment, 0, 100);
// }

// // --- 4. Compatibility Value (Team Fit) --------------------------------------

// export function calculateCompatibilityValue(
//   stat: NbaStatLine,
//   fit: TeamFitContext
// ): number {
//   let compatibility = 0;

//   // 4a. Positional Fit (Max +/- 10 points)
//   const posCount: Record<NbaPosition, number> = {
//     PG: 0,
//     SG: 0,
//     SF: 0,
//     PF: 0,
//     C: 0,
//   };
//   fit.teamPositions.forEach((p) => {
//     posCount[p] = (posCount[p] || 0) + 1;
//   });

//   const currentPosCount = posCount[fit.position] || 0;

//   if (currentPosCount === 0) {
//     compatibility += 5; // Reward filling a position
//   } else if (currentPosCount === 1) {
//     compatibility += 0; // Neutral
//   } else if (currentPosCount >= 2) {
//     compatibility -= 5 * (currentPosCount - 1); // Penalize drafting too many of the same position
//   }

//   // 4b. Size/Height Fit (Max +/- 5 points)
//   const teamAvgHeight =
//     fit.teamHeights.length > 0
//       ? fit.teamHeights.reduce((a, b) => a + b, 0) / fit.teamHeights.length
//       : fit.heightInches;

//   const heightDiff = fit.heightInches - teamAvgHeight;

//   if (fit.position === "C" || fit.position === "PF") {
//     // Reward bigs who are tall for the team
//     compatibility += clamp(heightDiff / 2, -3, 3);
//   } else {
//     // Reward guards who are average or slightly above average height
//     compatibility += clamp(heightDiff / 4, -2, 2);
//   }

//   // 4c. Usage Fit (Max +/- 5 points)
//   const teamAvgUsage =
//     fit.teamUsage.length > 0
//       ? fit.teamUsage.reduce((a, b) => a + b, 0) / fit.teamUsage.length
//       : 20; // Default to league average

//   const playerUsage = stat.usgPct ?? 20;

//   if (teamAvgUsage > 25) {
//     // Team is star-heavy, reward low-usage players
//     compatibility += clamp((teamAvgUsage - playerUsage) / 5, -5, 5);
//   } else if (teamAvgUsage < 18) {
//     // Team is low-usage, reward high-usage players
//     compatibility += clamp((playerUsage - teamAvgUsage) / 5, -5, 5);
//   }

//   return clamp(compatibility, -10, 10); // Clamp final compatibility value
// }

// // --- Final Score Calculation ------------------------------------------------

// export function scoreNbaPlayer(
//   stat: NbaStatLine,
//   position: NbaPosition,
//   era: NbaEraContext,
//   fit: TeamFitContext
// ): number {
//   const base = baseNbaScore(stat, position);
//   const advanced = advancedNbaScore(stat);
//   const eraAdjusted = applyEraAdjustment(base + advanced, stat, era);
//   const compatibility = calculateCompatibilityValue(stat, fit);

//   // Total Score = Base + Advanced + Era Adjustment + Compatibility
//   // Note: Era adjustment is applied to the sum of Base + Advanced.
//   const finalScore = eraAdjusted + compatibility;

//   return clamp(finalScore, 0, 100);
// }

// // --- Franchise Normalization ------------------------------------------------
// //
// // Converts any historical team code into a modern unified franchise identifier.
// // Example: SEA → OKC, BRK → BKN, NJN → BKN, NOH → NOP, CHA → CHH/CHA handling, etc.
// //
// export function normalizeFranchise(team: string): string {
//   if (!team) return "";

//   const t = team.trim().toUpperCase();

//   const map: Record<string, string> = {
//     // --- Active Franchises ---
//     ATL: "ATL",
//     BOS: "BOS",
//     BRK: "BKN",
//     BKN: "BKN",
//     NJN: "BKN",

//     CHA: "CHA",
//     CHH: "CHA",

//     CHI: "CHI",

//     CLE: "CLE",

//     DAL: "DAL",

//     DEN: "DEN",

//     DET: "DET",

//     GSW: "GSW",
//     PHO: "PHX",
//     PHX: "PHX",

//     HOU: "HOU",

//     IND: "IND",

//     LAC: "LAC",
//     SD: "LAC",
//     SDC: "LAC",

//     LAL: "LAL",
//     MPL: "LAL",

//     MEM: "MEM",
//     VAN: "MEM",

//     MIA: "MIA",

//     MIL: "MIL",

//     MIN: "MIN",

//     NOP: "NOP",
//     NOH: "NOP",
//     NOK: "NOP",
//     // Old Charlotte/New Orleans:
//     CHO: "CHA",

//     NYK: "NYK",

//     OKC: "OKC",
//     SEA: "OKC",

//     ORL: "ORL",

//     POR: "POR",

//     SAC: "SAC",
//     KCK: "SAC",
//     KCO: "SAC",
//     ROC: "SAC", // Rochester Royals
//     CIN: "SAC", // Cincinnati Royals
//     KAN: "SAC",

//     SAS: "SAS",
//     ABA: "SAS",

//     TOR: "TOR",

//     UTA: "UTA",
//     NOJ: "UTA",

//     WAS: "WAS",
//     WSB: "WAS",
//     BAL: "WAS",

//     // --- Defunct historical / early NBA ---
//     SYR: "PHI", // Nationals → 76ers
//     PHW: "GSW", // Philadelphia Warriors → Golden State
//     SFW: "GSW",

//     FTL: "DET",
//     FTW: "LAL", // Fort Wayne Pistons → Detroit (but historically same franchise) (could map to DET too)

//     TRI: "ATL", // Tri-Cities Blackhawks → Hawks
//     MNL: "LAL",

//     STL: "ATL", // St. Louis Hawks → Atlanta
//     BUF: "LAC", // Buffalo Braves → Clippers

//     // ABA teams that merged:
//     NYA: "NYK",
//     PTA: "POR",
//     DNN: "DEN",
//     SPG: "SAS",
//   };

//   return map[t] || t;
// }
