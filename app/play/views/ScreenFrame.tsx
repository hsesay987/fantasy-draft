"use client";

import type { ReactNode } from "react";
import "../../components/pixel/pixel.css";
import { Sprite } from "../../components/pixel/Sprite";
import { isDone } from "../../topicDraft/core";
import { screenBoard, screenClock, screenInfo } from "../screenInfo";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { Leaderboard } from "./Leaderboard";
import { PartyClock, playerSprite } from "./partyBits";

/**
 * The screen host's TV view: the game's own board in watch mode, with a big title, whose turn it is, the phase and its
 * clock above it, and the leaderboard beside it (below it on a narrow window). Everything here reads the public state:
 * the server sends this seat exactly what a viewer with no seat gets.
 */
export function ScreenFrame({ setup, ctl, title, topic, code, tournament, children }: { setup: GameSetup; ctl: GameCtl; title: string; topic?: string | null; code: string; tournament?: ReactNode; children: ReactNode }) {
  const info = screenInfo(setup, ctl.state);
  const clock = screenClock(setup, ctl.state);
  const board = screenBoard(setup, ctl.state, ctl.gone ?? []);
  const done = isDone(setup, ctl.state);
  const players = (ctl.state as { players?: string[] }).players ?? setup.players;
  const seat = info.turn ? Math.max(0, players.indexOf(info.turn)) : 0;
  const night = done && tournament ? tournament : null; // a tournament's standings join the side once the game is over
  return (
    <div className={`pixel screen-frame ${board || night ? "" : "solo"}`}>
      <header className="screen-top">
        <div className="screen-title">
          <p className="eyebrow">{topic || "Party night"}</p>
          <h1>{title}</h1>
        </div>
        <div className="screen-phase">
          {info.phase && <p className="phase">{info.phase}</p>}
          {clock && <PartyClock deadline={clock.deadline} offset={ctl.offset} total={clock.total} />}
        </div>
        <p className="screen-code"><span>Room</span><b>{code}</b></p>
      </header>
      {info.turn && !done && (
        <p key={info.turn} className="screen-turn" role="status">
          <Sprite sprite={playerSprite(seat)} size={36} />
          <span><b>{info.turn}</b>&apos;s turn</span>
        </p>
      )}
      <div className="screen-main">
        <div className="screen-board">{children}</div>
        {(board || night) && (
          <aside className="screen-side">
            {night}
            {board && <Leaderboard rows={board.rows} teams={board.teams} title={done ? "Final standings" : "Leaderboard"} />}
          </aside>
        )}
      </div>
    </div>
  );
}
