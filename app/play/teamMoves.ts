// The host's team picker, as plain moves on a name-to-team map. The map may be stale (seats come and go while the
// picker is open), so every move starts from the current seats and leaves only them in the map.
import { buildTeams } from "../topicDraft/formats/partytrivia";
import { shuffle } from "../topicDraft/rng";

export type TeamMap = Record<string, number>;

/** Team colours, used as team names everywhere: nobody has to remember "Team 3". */
export const TEAM_NAMES = ["Red", "Blue", "Gold", "Green"];
export const TEAM_COLORS = ["#ff5a6e", "#5ab8ff", "#ffc933", "#3fdc8a"];
export const teamName = (i: number) => TEAM_NAMES[i] ?? `Team ${i + 1}`;

const toMap = (teams: string[][]): TeamMap => Object.fromEntries(teams.flatMap((m, t) => m.map((p) => [p, t] as const)));
const same = (a: TeamMap, b: TeamMap) => Object.keys(a).every((k) => a[k] === b[k]);

/** Who is on which team right now: gone players dropped, and new or unplaced ones on the smallest team (as the game itself does it). */
export const placeTeams = (players: string[], teams: number, map: TeamMap): TeamMap => toMap(buildTeams(players, teams, map));

/** An even random split. It differs from `avoid` when it can, so pressing Shuffle always visibly does something. */
export function splitTeams(players: string[], teams: number, seed: number, avoid?: TeamMap): TeamMap {
  let s = seed;
  let out: TeamMap = {};
  for (let i = 0; i < 8; i++) {
    const [order, ns] = shuffle(players, s);
    s = ns;
    out = Object.fromEntries(order.map((p, n) => [p, n % teams] as const));
    if (!avoid || !same(out, avoid)) break;
  }
  return out;
}

/** Tap-to-move. A player or team that isn't there leaves everything as it was. */
export function moveToTeam(players: string[], teams: number, map: TeamMap, name: string, team: number): TeamMap {
  const placed = placeTeams(players, teams, map);
  if (!players.includes(name) || !Number.isInteger(team) || team < 0 || team >= teams) return placed;
  return { ...placed, [name]: team };
}

/** What gets saved: empty teams closed up so team colours match in play, and no teams at all unless two have players. */
export function compactTeams(players: string[], teams: number, map: TeamMap): { teams: number; teamMap: TeamMap } {
  const filled = buildTeams(players, teams, map).filter((m) => m.length > 0);
  return filled.length >= 2 ? { teams: filled.length, teamMap: toMap(filled) } : { teams: 0, teamMap: {} };
}
