"use client";

import { Sprite } from "../../components/pixel/Sprite";
import { TEAM_COLORS } from "../teamMoves";
import type { LeaderRow, LeaderTeam } from "../screenInfo";
import { playerSprite } from "./partyBits";

/**
 * Standings for the big screen (and the tournament screens): teams first when there are any, then every player, best
 * first. Ties share a place. `last` is what a player just scored; `left` greys out a player who walked off.
 */
export function Leaderboard({ rows, teams, title = "Leaderboard" }: { rows: LeaderRow[]; teams?: LeaderTeam[]; title?: string }) {
  const ranked = rows.map((r, i) => ({ ...r, seat: r.seat ?? i })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  const place = (i: number) => ranked.findIndex((r) => r.score === ranked[i]!.score) + 1;
  const best = teams?.length ? Math.max(...teams.map((t) => t.score)) : null;
  return (
    <section className="px-box lb" aria-label={title}>
      <h2 className="lb-title">{title}</h2>
      {teams && teams.length > 0 && (
        <ol className="lb-teams" aria-label="Teams">
          {teams.map((t) => (
            <li key={t.name} className={teams.length > 1 && t.score === best ? "top" : ""}>
              {t.color && <i className="swatch" style={{ background: t.color }} aria-hidden />}
              <span className="name">{t.name}</span>
              <b>{t.score.toLocaleString("en-US")}</b>
            </li>
          ))}
        </ol>
      )}
      {ranked.length > 0 && (
        <ol className="lb-rows" aria-label="Players">
          {ranked.map((r, i) => (
            <li key={r.name} className={`${place(i) === 1 && r.score > 0 ? "top" : ""} ${r.left ? "is-gone" : ""}`}>
              <span className="pos">{place(i)}</span>
              <Sprite sprite={playerSprite(r.seat)} size={24} />
              <span className="name">
                {r.team !== undefined && <i className="swatch" style={{ background: TEAM_COLORS[r.team] }} aria-hidden />}
                {r.name}
                {r.left && <span className="tag">left</span>}
              </span>
              {r.last ? <span key={`${r.name}-${r.score}`} className="last">+{r.last}</span> : <span />}
              <b>{r.score.toLocaleString("en-US")}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
