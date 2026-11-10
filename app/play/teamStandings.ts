import { teamName } from "./teamMoves";

export type TeamStanding = { index: number; name: string; score: number; members: string[] };

/** Best first. A team's score is its members' points added up; ties keep team order. */
export function teamStandings(points: Record<string, number>, teams: string[][]): TeamStanding[] {
  return teams
    .map((members, index) => ({ index, name: `${teamName(index)} team`, score: members.reduce((n, p) => n + (points[p] ?? 0), 0), members }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export { teamsFor } from "../topicDraft/party/teams";
