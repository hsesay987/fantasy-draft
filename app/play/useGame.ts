"use client";

import { useCallback, useMemo } from "react";
import { applyAction, initGame, poolFor, type Action, type GameState } from "../topicDraft/core";
import type { Item } from "../topicDraft/types";
import type { GameSetup } from "./types";
import { useRunState } from "./useRunState";

/** One interface for local and online play: views read `state` and send `dispatch(action)`. */
export type GameCtl = {
  state: GameState;
  dispatch: (a: Action) => void;
  /** Your seat name when playing online, otherwise null. */
  me: string | null;
  online: boolean;
  finish: () => void;
  pool: Item[];
  byId: (id: string) => Item | undefined;
  /** Can this device act for `player`? (online: only your seat; local: any human.) */
  controls: (player: string | null) => boolean;
  isAi: (player: string | null) => boolean;
};

export function useLocalGame(setup: GameSetup): GameCtl {
  const [state, setState, finish] = useRunState<GameState>(setup.id, () => initGame(setup, Date.now()));
  const pool = useMemo(() => poolFor(setup), [setup]);
  const map = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  const dispatch = useCallback((a: Action) => setState((s) => applyAction(setup, s, a, Date.now())), [setState, setup]);
  const isAi = useCallback((p: string | null) => !!p && setup.aiPlayers.includes(p), [setup.aiPlayers]);
  return { state, dispatch, me: null, online: false, finish, pool, byId: (id) => map.get(id), controls: (p) => !!p && !setup.aiPlayers.includes(p), isAi };
}
