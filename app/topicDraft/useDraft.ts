"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoPick, init, pick, turnPlayer, validatePick } from "./engine";
import type { Item, State } from "./types";
import type { Setup } from "./config";
import { useSound } from "../components/SoundProvider";

export function useDraft(setup: Setup, basePool: Item[]) {
  const { play } = useSound();
  const pool = useMemo(() => [...basePool, ...setup.customItems], [basePool, setup.customItems]);
  const [state, setState] = useState<State>(() => init(setup.config, pool));
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const player = state.done ? null : turnPlayer(state);
  const isAi = !!player && setup.aiPlayers.includes(player);

  const choose = useCallback(
    (itemId: string, role?: string) => {
      const v = validatePick(stateRef.current, itemId, role);
      if (!v.ok) {
        setError(v.reason);
        play("error");
        return false;
      }
      setError(null);
      setState((s) => pick(s, itemId, role));
      play("pick");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      return true;
    },
    [play]
  );

  const auto = useCallback(() => {
    setError(null);
    setState((s) => autoPick(s, setup.scenario.weights));
    play("steal");
  }, [play, setup.scenario.weights]);

  // AI drafter takes its turn after a short, human-feeling delay.
  useEffect(() => {
    if (!isAi || state.done) return;
    const t = setTimeout(() => {
      setState((s) => autoPick(s, setup.scenario.weights));
      play("pick");
    }, 900);
    return () => clearTimeout(t);
  }, [isAi, state.turn, state.done, play, setup.scenario.weights]);

  useEffect(() => {
    if (state.done) play("reveal");
  }, [state.done, play]);

  return { state, pool, player, isAi, choose, auto, error, setError };
}
