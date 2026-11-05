"use client";

import { useState } from "react";
import { Shuffle } from "lucide-react";
import { Button } from "../components/ui";
import { newSeed } from "../topicDraft/rng";
import { moveToTeam, placeTeams, splitTeams, TEAM_COLORS, teamName, type TeamMap } from "./teamMoves";

/**
 * Tap a player, then tap the team they should join. `players` is the room's seats right now, so anyone who joins while
 * this is open shows up on the smallest team and anyone who leaves disappears, without touching the other placements.
 */
export function TeamPicker({ players, teams, map, onChange }: { players: string[]; teams: number; map: TeamMap; onChange: (map: TeamMap) => void }) {
  const [held, setHeld] = useState<string | null>(null);
  const placed = placeTeams(players, teams, map);
  const moving = held && players.includes(held) ? held : null; // they may have left since being tapped
  const rosters = Array.from({ length: teams }, (_, t) => players.filter((p) => placed[p] === t));
  const filled = rosters.filter((r) => r.length > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground" role="status">{moving ? `Where should ${moving} go?` : "Tap a player to move them."}</p>
        <Button variant="ghost" onClick={() => { setHeld(null); onChange(splitTeams(players, teams, newSeed(), placed)); }}><Shuffle className="h-4 w-4" aria-hidden /> Shuffle</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rosters.map((roster, t) => (
          <section key={t} aria-label={`${teamName(t)} team`} className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex min-h-9 items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: TEAM_COLORS[t] }} aria-hidden />{teamName(t)} ({roster.length})</h4>
              {moving && placed[moving] !== t && (
                <button type="button" className="min-h-9 rounded-lg bg-primary px-3 text-sm font-semibold" onClick={() => { onChange(moveToTeam(players, teams, placed, moving, t)); setHeld(null); }}>Move here</button>
              )}
            </div>
            {roster.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet.</p> : (
              <ul className="flex flex-wrap gap-2">
                {roster.map((p) => (
                  <li key={p} className="min-w-0 max-w-full">
                    <button type="button" aria-pressed={moving === p} onClick={() => setHeld(moving === p ? null : p)}
                      className={`min-h-11 max-w-full truncate rounded-lg border px-3 text-sm font-semibold ${moving === p ? "border-secondary bg-primary/40" : "border-white/10 bg-black/20 hover:bg-white/10"}`}>{p}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {filled < 2
        ? <p role="alert" className="text-sm text-accent">Everyone is on one team, so this would play without teams.</p>
        : filled < teams && <p className="text-sm text-muted-foreground">Empty teams sit out.</p>}
      <p className="text-sm text-muted-foreground">Anyone who joins later goes on the smallest team.</p>
    </div>
  );
}
