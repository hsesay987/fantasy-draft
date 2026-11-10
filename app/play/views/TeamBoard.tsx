"use client";

import { PixelScore } from "../../components/pixel/PixelUI";
import { TEAM_COLORS } from "../teamMoves";
import { teamStandings } from "../teamStandings";

/** Team standings for games where players score on their own: each team's points are its members' added up. */
export function TeamBoard({ points, teams, me }: { points: Record<string, number>; teams: string[][]; me?: string | null }) {
  const rows = teamStandings(points, teams);
  return (
    <div aria-label="Team standings" role="group">
      <PixelScore rows={rows.map((r) => ({ name: `${r.name}: ${r.members.join(", ")}`, value: String(r.score), color: TEAM_COLORS[r.index], active: !!me && r.members.includes(me) }))} />
    </div>
  );
}
