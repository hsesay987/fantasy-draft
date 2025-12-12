export type NbaPlayerMeta = {
    playerId: number;
    fullName: string;
    fromYear: number;
    toYear: number;
};
export declare function getAllModernPlayers(): Promise<NbaPlayerMeta[]>;
export declare function getPlayerSeasonTotals(playerId: number): Promise<any>;
//# sourceMappingURL=nbaApi.d.ts.map