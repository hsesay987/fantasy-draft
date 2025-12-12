export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C";
export interface NbaStatLine {
    ppg: number;
    apg: number;
    rpg: number;
    spg: number;
    bpg: number;
    tsPct?: number | null;
    threeRate?: number | null;
    per?: number | null;
    ws?: number | null;
    wsPer48?: number | null;
    bpm?: number | null;
    obpm?: number | null;
    dbpm?: number | null;
    vorp?: number | null;
    usgPct?: number | null;
    plusMinusPer100?: number | null;
    netPlusMinusPer100?: number | null;
    ptsPer36?: number | null;
    trbPer36?: number | null;
    astPer36?: number | null;
    stlPer36?: number | null;
    blkPer36?: number | null;
    allStar?: boolean;
    allNBA?: number | null;
    allDefense?: number | null;
    allRookie?: boolean;
    mvpShare?: number | null;
    dpoyShare?: number | null;
    team?: string | null;
}
export interface NbaEraContext {
    eraFrom?: number | null;
    eraTo?: number | null;
}
export interface TeamFitContext {
    position: NbaPosition;
    heightInches: number;
    teamHeights: number[];
    teamShooters: number;
    teamPositions: NbaPosition[];
    teamUsage: number[];
}
export declare function baseNbaScore(stat: NbaStatLine, position: NbaPosition): number;
export declare function advancedNbaScore(stat: NbaStatLine): number;
export declare function applyEraAdjustment(score: number, stat: NbaStatLine, era: NbaEraContext): number;
export declare function calculateCompatibilityValue(stat: NbaStatLine, fit: TeamFitContext): number;
export declare function scoreNbaPlayer(stat: NbaStatLine, position: NbaPosition, era: NbaEraContext, fit: TeamFitContext): number;
export declare function normalizeFranchise(team: string): string;
//# sourceMappingURL=nba.d.ts.map