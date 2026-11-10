import { buildTeams } from "../topicDraft/party/teams";
import { teamName } from "./teamMoves";
import type { GameSetup } from "./types";

/** Fewest players for teams (the same as Party Trivia's). */
const MIN_PLAYERS = 4;

export type TeamStanding = { index: number; name: string; score: number; members: string[] };

/** Best first. A team's score is its members' points added up; ties keep team order. */
export function teamStandings(points: Record<string, number>, teams: string[][]): TeamStanding[] {
  return teams
    .map((members, index) => ({ index, name: `${teamName(index)} team`, score: members.reduce((n, p) => n + (points[p] ?? 0), 0), members }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/**
 * The teams a party game was set up with, found from the seats and the host's map the way Party Trivia places them
 * (loose players join the smallest team, empty teams are dropped). `null` when it is a solo game.
 */
export function teamsFor(setup: Pick<GameSetup, "opts">, players: string[]): string[][] | null {
  const { teams, teamMap } = setup.opts;
  if (teams < 2 || players.length < MIN_PLAYERS) return null;
  const filled = buildTeams(players, teams, teamMap ?? {}).filter((t) => t.length > 0);
  return filled.length >= 2 ? filled : null;
}
