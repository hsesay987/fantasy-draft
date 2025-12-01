// // lib/scoring/nba.ts
// src/lib/scoring/nba.ts

export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C";

export interface NbaStatLine {
  ppg: number;
  apg: number;
  rpg: number;
  spg: number;
  bpg: number;
  tsPct?: number | null;
  threeRate?: number | null; // 0–1, proportion of shots that are 3s
}

export interface NbaEraContext {
  eraFrom?: number | null;
  eraTo?: number | null;
}

export interface TeamFitContext {
  position: NbaPosition;
  heightInches: number;
  teamHeights: number[]; // heights of teammates
  teamShooters: number; // count of teammates with good shooting
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

// Normalize a stat vs some rough idea of "elite" caps.
function normalize(value: number, elite: number): number {
  return clamp(value / elite, 0, 1);
}

// Base score ignoring era and fit.
export function baseNbaScore(stat: NbaStatLine, position: NbaPosition): number {
  const scoring = normalize(stat.ppg, 35); // 35 PPG ~ elite
  const assists = normalize(stat.apg, 10);
  const rebounds = normalize(stat.rpg, 15);
  const steals = normalize(stat.spg, 3);
  const blocks = normalize(stat.bpg, 3);
  const efficiency = stat.tsPct
    ? clamp((stat.tsPct - 0.48) / (0.65 - 0.48), 0, 1)
    : 0.5;

  // Weighting depends on position a bit
  let wScoring = 0.45;
  let wAssists = 0.2;
  let wReb = 0.2;
  let wDef = 0.1;
  let wEff = 0.05;

  if (position === "PG") {
    wAssists += 0.1;
    wReb -= 0.05;
  } else if (position === "C" || position === "PF") {
    wReb += 0.1;
    wAssists -= 0.05;
  }

  const def = (steals + blocks) / 2;

  const raw =
    wScoring * scoring +
    wAssists * assists +
    wReb * rebounds +
    wDef * def +
    wEff * efficiency;

  return clamp(raw * 100, 0, 100);
}

// Era adjustment: 3pt specialists hurt in 60s, rewarded in 2010s, etc.
export function applyEraAdjustment(
  baseScore: number,
  stat: NbaStatLine,
  era: NbaEraContext
): number {
  if (!era.eraFrom || !era.eraTo) return baseScore;

  const midEra = (era.eraFrom + era.eraTo) / 2;

  const threeRate = stat.threeRate ?? 0;

  // Very rough rules:
  if (midEra < 1980) {
    // 3pt doesn't matter; pure scoring/rebounding era.
    const penalty = threeRate * 10; // up to -10
    return baseScore - penalty;
  } else if (midEra >= 2005) {
    // Spacing era: 3pt specialists get bonus.
    const bonus = threeRate * 10; // up to +10
    return baseScore + bonus;
  }

  // Neutral-ish in between
  return baseScore;
}

// Team fit: penalize no size / no spacing etc.
export function applyTeamFitAdjustment(
  score: number,
  fit: TeamFitContext
): number {
  const teamAvgHeight =
    fit.teamHeights.length > 0
      ? fit.teamHeights.reduce((a, b) => a + b, 0) / fit.teamHeights.length
      : fit.heightInches;

  let adjustment = 0;

  // Too small frontcourt
  if (
    (fit.position === "PF" || fit.position === "C") &&
    fit.heightInches < 80
  ) {
    adjustment -= 8;
  }

  // If entire team is tiny, small penalty
  if (teamAvgHeight < 77) {
    adjustment -= 5;
  }

  // Spacing: if fewer than 2 shooters, slight penalty
  if (fit.teamShooters < 2) {
    adjustment -= 5;
  } else if (fit.teamShooters >= 3) {
    adjustment += 5;
  }

  return clamp(score + adjustment, 0, 100);
}

export function scoreNbaPlayer(
  stat: NbaStatLine,
  position: NbaPosition,
  era: NbaEraContext,
  fit: TeamFitContext
): number {
  const base = baseNbaScore(stat, position);
  const eraAdjusted = applyEraAdjustment(base, stat, era);
  const fitAdjusted = applyTeamFitAdjustment(eraAdjusted, fit);
  return fitAdjusted;
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
// }

// export interface NbaEraContext {
//   eraFrom?: number | null;
//   eraTo?: number | null;
// }

// export interface TeamFitContext {
//   position: NbaPosition;
//   heightInches: number;
//   teamHeights: number[]; // heights of teammates
//   teamShooters: number; // count of teammates with good shooting
// }

// function clamp(x: number, min: number, max: number) {
//   return Math.max(min, Math.min(max, x));
// }

// // Normalize a stat vs some rough idea of "elite" caps.
// function normalize(value: number, elite: number): number {
//   return clamp(value / elite, 0, 1);
// }

// // Base score ignoring era and fit.
// export function baseNbaScore(stat: NbaStatLine, position: NbaPosition): number {
//   const scoring = normalize(stat.ppg, 35); // 35 PPG ~ elite
//   const assists = normalize(stat.apg, 10);
//   const rebounds = normalize(stat.rpg, 15);
//   const steals = normalize(stat.spg, 3);
//   const blocks = normalize(stat.bpg, 3);
//   const efficiency = stat.tsPct
//     ? clamp((stat.tsPct - 0.48) / (0.65 - 0.48), 0, 1)
//     : 0.5;

//   // Weighting depends on position a bit
//   let wScoring = 0.45;
//   let wAssists = 0.2;
//   let wReb = 0.2;
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

// // Era adjustment: 3pt specialists hurt in 60s, rewarded in 2010s, etc.
// export function applyEraAdjustment(
//   baseScore: number,
//   stat: NbaStatLine,
//   era: NbaEraContext
// ): number {
//   if (!era.eraFrom || !era.eraTo) return baseScore;

//   const midEra = (era.eraFrom + era.eraTo) / 2;

//   const threeRate = stat.threeRate ?? 0;

//   // Very rough rules:
//   if (midEra < 1980) {
//     // 3pt doesn't matter; pure scoring/rebounding era.
//     const penalty = threeRate * 10; // up to -10
//     return baseScore - penalty;
//   } else if (midEra >= 2005) {
//     // Spacing era: 3pt specialists get bonus.
//     const bonus = threeRate * 10; // up to +10
//     return baseScore + bonus;
//   }

//   // Neutral-ish in between
//   return baseScore;
// }

// // Team fit: penalize no size / no spacing etc. Here we just do a simple size/spreading adjust.
// export function applyTeamFitAdjustment(
//   score: number,
//   fit: TeamFitContext
// ): number {
//   const teamAvgHeight =
//     fit.teamHeights.length > 0
//       ? fit.teamHeights.reduce((a, b) => a + b, 0) / fit.teamHeights.length
//       : fit.heightInches;

//   let adjustment = 0;

//   // Too small frontcourt
//   if (
//     (fit.position === "PF" || fit.position === "C") &&
//     fit.heightInches < 80
//   ) {
//     adjustment -= 8;
//   }

//   // If entire team is tiny, small penalty
//   if (teamAvgHeight < 77) {
//     adjustment -= 5;
//   }

//   // Spacing: if fewer than 2 shooters, slight penalty
//   if (fit.teamShooters < 2) {
//     adjustment -= 5;
//   } else if (fit.teamShooters >= 3) {
//     adjustment += 5;
//   }

//   return clamp(score + adjustment, 0, 100);
// }

// export function scoreNbaPlayer(
//   stat: NbaStatLine,
//   position: NbaPosition,
//   era: NbaEraContext,
//   fit: TeamFitContext
// ): number {
//   const base = baseNbaScore(stat, position);
//   const eraAdjusted = applyEraAdjustment(base, stat, era);
//   const fitAdjusted = applyTeamFitAdjustment(eraAdjusted, fit);
//   return fitAdjusted;
// }
