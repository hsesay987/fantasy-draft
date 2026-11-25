"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { applyAction, initGame, poolFor, suggestion, type Action, type GameState } from "../topicDraft/core";
import type { Item } from "../topicDraft/types";
import type { GameSetup } from "./types";
import { useRunState } from "./useRunState";
import { trackAction } from "./trackAction";

/** `suggest`: a typed near miss was refused at no cost; this is the answer it was close to, to fill the input with. */
export type MoveResult = { ok: boolean; error?: string; suggest?: string };

/** One interface for local and online play: views read `state` and send `dispatch(action)`. */
export type GameCtl = {
  state: GameState;
  /** Online, the promise says whether the server took the move (and why not), for the few moves that can be refused and shown so, like a wrong typed guess. */
  dispatch: (a: Action) => void | Promise<MoveResult>;
  /** Your seat name when playing online, otherwise null. */
  me: string | null;
  online: boolean;
  finish: () => void;
  /** Server clock minus this device clock (ms); 0 for local games. */
  offset: number;
  pool: Item[];
  byId: (id: string) => Item | undefined;
  /** Can this device act for `player`? (online: only your seat; local: any human.) */
  controls: (player: string | null) => boolean;
  isAi: (player: string | null) => boolean;
  /** Online rooms: the seat running the room, as the server says: the first player still at the table with a phone awake. */
  host?: string | null;
  /** Online rooms: players who have left this game for good. Their turns are skipped and nobody waits for them. */
  gone?: string[];
  /** Online rooms: walk out of this game. It carries on for everyone else. */
  leave?: () => void;
  /** Online party games: true while the host has the game paused. */
  paused?: boolean;
  /** Online party games, host only: pause (true) or resume (false) the game. */
  setPaused?: (on: boolean) => void;
};

export function useLocalGame(setup: GameSetup): GameCtl {
  const [state, setState, finish] = useRunState<GameState>(setup.id, () => initGame(setup, Date.now()));
  const pool = useMemo(() => poolFor(setup), [setup]);
  const map = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; });
  const dispatch = useCallback(
    (a: Action): void | Promise<MoveResult> => {
      trackAction(setup, a, false);
      const now = Date.now();
      // Same spelling help as a room, worked out here: the engine notes the near miss, the view fills the input.
      const suggest = suggestion(setup, latest.current, a, now);
      setState((s) => applyAction(setup, s, a, now));
      if (suggest) return Promise.resolve({ ok: false, error: `Did you mean ${suggest}?`, suggest });
    },
    [setState, setup]
  );
  const isAi = useCallback((p: string | null) => !!p && setup.aiPlayers.includes(p), [setup.aiPlayers]);
  return { state, dispatch, me: null, online: false, finish, offset: 0, pool, byId: (id) => map.get(id), controls: (p) => !!p && !setup.aiPlayers.includes(p), isAi };
}
