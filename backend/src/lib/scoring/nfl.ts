// src/lib/scoring/nfl.ts

export type NflPosition =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "OL"
  | "DL"
  | "LB"
  | "DB"
  | "K"
  | "FLEX"
  | "DEF";

export interface NflStatLine {
  games?: number | null;
  yards?: number | null; // total offense or tackles proxy
  touchdowns?: number | null;
  receptions?: number | null;
  sacks?: number | null;
  interceptions?: number | null; // thrown for QBs, created for defenders
  fantasyPoints?: number | null;
  approximateValue?: number | null;
  teamPointsAllowed?: number | null; // for DEF units
  teamYardsAllowed?: number | null; // optional, if available
}

export interface NflEraContext {
  eraFrom?: number | null;
  eraTo?: number | null;
}

export interface NflRoleContext {
  lineupPositions?: NflPosition[]; // e.g., ["QB","RB","RB","WR","WR","TE","FLEX","DEF"]
  existingPositions?: NflPosition[];
  allowDefenders?: boolean;
  fantasyScoring?: boolean;
}

export interface NflAccoladeContext {
  proBowls?: number | null;
  allPros?: number | null;
  hallOfFame?: boolean | null;
  championships?: number | null;
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function normalize(value: number, elite: number) {
  return clamp(value / elite, 0, 1);
}

/* -------------------------------------------------------------------------- */
/*                               PRODUCTION (0–45)                            */
/* -------------------------------------------------------------------------- */

export function productionScore(
  stat: NflStatLine,
  position: NflPosition
): number {
  const yards = stat.yards ?? 0;
  const td = stat.touchdowns ?? 0;
  const rec = stat.receptions ?? 0;
  const sacks = stat.sacks ?? 0;
  const picks = stat.interceptions ?? 0;
  const fantasy = stat.fantasyPoints ?? 0;

  let raw = 0;

  if (position === "QB") {
    const yardScore = normalize(yards, 5000);
    const tdScore = normalize(td, 45);
    const intPenalty = clamp(picks / 18, 0, 1);
    const fantasyBoost = fantasy ? normalize(fantasy, 350) : 0;

    raw =
      0.45 * yardScore + 0.35 * tdScore + 0.1 * fantasyBoost - 0.2 * intPenalty;
  } else if (position === "RB") {
    const yardScore = normalize(yards, 2200);
    const tdScore = normalize(td, 22);
    const recScore = normalize(rec, 110);
    raw = 0.4 * yardScore + 0.4 * tdScore + 0.2 * recScore;
  } else if (position === "WR" || position === "TE") {
    const yardScore = normalize(yards, 1900);
    const tdScore = normalize(td, 18);
    const recScore = normalize(rec, 140);
    raw = 0.42 * yardScore + 0.38 * tdScore + 0.2 * recScore;
  } else if (position === "DL" || position === "LB") {
    const sackScore = normalize(sacks, 22);
    const takeaway = normalize(picks, 6);
    const tdScore = normalize(td, 4);
    raw = 0.5 * sackScore + 0.25 * takeaway + 0.25 * tdScore;
  } else if (position === "DB") {
    const takeaway = normalize(picks, 10);
    const tdScore = normalize(td, 3);
    raw = 0.6 * takeaway + 0.4 * tdScore;
  } else if (position === "DEF") {
    // Lower points allowed and turnovers → higher score. We store points allowed as negative fantasyPoints.
    const pointsAllowed = stat.teamPointsAllowed ?? stat.fantasyPoints ?? 0;
    const yardsAllowed = stat.teamYardsAllowed ?? 0;
    const pointsScore =
      pointsAllowed < 0 ? clamp(Math.abs(pointsAllowed) / 350, 0, 1) : 0.2;
    const yardScore = yardsAllowed ? clamp(1 - yardsAllowed / 6500, 0, 1) : 0.3;
    raw = 0.6 * pointsScore + 0.4 * yardScore;
  } else {
    // OL/K or unknown: lean on fantasy and touchdowns
    const tdScore = normalize(td, 10);
    const fantasyScore = fantasy ? normalize(fantasy, 150) : 0;
    raw = 0.5 * tdScore + 0.5 * fantasyScore;
  }

  return clamp(raw * 45, 0, 45);
}

/* -------------------------------------------------------------------------- */
/*                                IMPACT (0–25)                               */
/* -------------------------------------------------------------------------- */

export function impactScore(stat: NflStatLine): number {
  const av = stat.approximateValue ?? 10; // baseline contributor
  const norm = clamp(av / 30, 0, 1);
  const floor = 0.35; // ensure replacement-level still earns something
  return clamp((floor + norm * 0.65) * 25, 0, 25);
}

/* -------------------------------------------------------------------------- */
/*                              ACCOLADES (0–15)                              */
/* -------------------------------------------------------------------------- */

export function accoladesScore(ctx: NflAccoladeContext = {}): number {
  let score = 0;
  score += Math.min(ctx.proBowls ?? 0, 8) * 1.1;
  score += Math.min(ctx.allPros ?? 0, 5) * 2;
  if (ctx.hallOfFame) score += 5;
  if (ctx.championships) score += Math.min(ctx.championships, 3) * 0.8;
  return clamp(score, 0, 15);
}

/* -------------------------------------------------------------------------- */
/*                           ERA ADJUSTMENT (-5 → +5)                         */
/* -------------------------------------------------------------------------- */

export function eraAdjustment(
  position: NflPosition,
  stat: NflStatLine,
  era: NflEraContext
): number {
  if (!era.eraFrom && !era.eraTo) return 0;
  const mid =
    era.eraFrom && era.eraTo
      ? (era.eraFrom + era.eraTo) / 2
      : era.eraFrom || era.eraTo || 2000;

  let adj = 0;

  if (position === "RB" && mid < 1990) {
    adj += 2; // run-heavy eras
  }

  if (position === "QB" && mid >= 2010) {
    adj -= 2.5; // passing boom
  }

  if ((position === "WR" || position === "TE") && mid >= 2010) {
    adj -= 1.2; // normalize inflated receiving volume
  }

  if (
    (position === "DL" || position === "DB" || position === "LB") &&
    mid >= 2010
  ) {
    adj += 0.5; // passing era creates more defensive playmaking chances
  }

  return clamp(adj, -5, 5);
}

/* -------------------------------------------------------------------------- */
/*                     ROLE BALANCE / LINEUP FIT (-10 → +10)                  */
/* -------------------------------------------------------------------------- */

export function roleBalanceAdjustment(
  position: NflPosition,
  role?: NflRoleContext
): number {
  if (!role) return 0;
  const lineup = role.lineupPositions ?? defaultLineup();
  const current = role.existingPositions ?? [];

  const needed =
    lineup.filter((p) => p === position).length +
    lineup.filter((p) => p === "FLEX" && ["RB", "WR", "TE"].includes(position))
      .length;

  const have = current.filter((p) => p === position).length;
  let adj = 0;

  if (needed === 0) {
    adj -= 4; // position not expected
  } else if (have < needed) {
    adj += 3; // fills need
  } else if (have === needed) {
    adj += 1;
  } else {
    adj -= 2 * (have - needed); // overcrowded
  }

  if (position === "DEF" && role.fantasyScoring === false) {
    adj += 1; // system scoring values DEF more than fantasy
  }

  return clamp(adj, -10, 10);
}

export function defaultLineup(): NflPosition[] {
  return ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF"];
}

/* -------------------------------------------------------------------------- */
/*                               TOTAL SCORE (0–100)                          */
/* -------------------------------------------------------------------------- */

export function scoreNflPlayer(
  stat: NflStatLine,
  position: NflPosition,
  era: NflEraContext,
  role?: NflRoleContext,
  accolades?: NflAccoladeContext
): number {
  const prod = productionScore(stat, position);
  const impact = impactScore(stat);
  const acc = accoladesScore(accolades);
  const eraAdj = eraAdjustment(position, stat, era);
  const roleAdj = roleBalanceAdjustment(position, role);

  const total = prod + impact + acc + eraAdj + roleAdj;
  return clamp(total, 0, 100);
}
