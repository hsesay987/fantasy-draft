export type HallRule = "any" | "only" | "none";
export type SearchPlayersInput = {
    q?: string;
    position?: string;
    eraFrom?: number;
    eraTo?: number;
    team?: string;
    hallRule?: HallRule;
    multiTeamOnly?: boolean;
    limit?: number;
    offset?: number;
    eligiblePositions?: string;
    imaegeUrl?: string;
};
export declare function searchPlayers(input: SearchPlayersInput): Promise<any[]>;
//# sourceMappingURL=player.service.d.ts.map