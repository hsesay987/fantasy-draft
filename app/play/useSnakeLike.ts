"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoPick, init as initSnake, pick as snakePick, turnPlayer, validatePick } from "../topicDraft/engine";
import * as spin from "../topicDraft/formats/spin";
import type { Item, State } from "../topicDraft/types";
import { useSound } from "../components/SoundProvider";
import { snakeConfig, type GameSetup } from "./types";
import { useRunState } from "./useRunState";

type Run = { kind: "snake"; draft: State } | { kind: "spin"; spin: spin.SpinState };

export function useSnakeLike(setup: GameSetup, basePool: Item[]) {
  const { play } = useSound();
  const pool = useMemo(() => [...basePool, ...setup.opts.customItems], [basePool, setup.opts.customItems]);
  const [run, setRun, markFinished] = useRunState<Run>(setup.id, () =>
    setup.format === "spin" || setup.opts.roll
      ? { kind: "spin", spin: spin.init(snakeConfig(setup), pool, setup.opts.options, setup.opts.rerolls, setup.seed) }
      : { kind: "snake", draft: initSnake(snakeConfig(setup), pool) }
  );
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const draft = run.kind === "spin" ? run.spin.draft : run.draft;
  const offer = run.kind === "spin" ? run.spin.offer : null;
  const rerolls = run.kind === "spin" ? run.spin.rerolls : null;
  const player = draft.done ? null : turnPlayer(draft);
  const isAi = !!player && setup.aiPlayers.includes(player);
  const weights = setup.mission.weights;

  const apply = useCallback((fn: (r: Run) => Run) => setRun((r) => fn(r)), [setRun]);

  const choose = useCallback(
    (itemId: string, role?: string) => {
      const r = runRef.current;
      const d = r.kind === "spin" ? r.spin.draft : r.draft;
      const v = validatePick(d, itemId, role);
      if (!v.ok || (r.kind === "spin" && !r.spin.offer.includes(itemId))) {
        setError(v.ok ? "Not one of the offered options" : v.reason);
        play("error");
        return false;
      }
      setError(null);
      apply((x) => (x.kind === "spin" ? { kind: "spin", spin: spin.pick(x.spin, itemId, role) } : { kind: "snake", draft: snakePick(x.draft, itemId, role) }));
      play("pick");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      return true;
    },
    [apply, play]
  );

  const auto = useCallback(() => {
    setError(null);
    apply((x) => (x.kind === "spin" ? { kind: "spin", spin: spin.auto(x.spin, weights) } : { kind: "snake", draft: autoPick(x.draft, weights) }));
    play("steal");
  }, [apply, play, weights]);

  const reroll = useCallback(() => {
    apply((x) => (x.kind === "spin" ? { kind: "spin", spin: spin.reroll(x.spin) } : x));
    play("click");
  }, [apply, play]);

  useEffect(() => {
    if (!isAi || draft.done) return;
    const t = setTimeout(() => {
      apply((x) => (x.kind === "spin" ? { kind: "spin", spin: spin.auto(x.spin, weights) } : { kind: "snake", draft: autoPick(x.draft, weights) }));
      play("pick");
    }, 900);
    return () => clearTimeout(t);
  }, [isAi, draft.turn, draft.done, apply, play, weights]);

  useEffect(() => {
    if (draft.done) {
      markFinished();
      play("reveal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.done]);

  return { draft, pool, offer, rerolls, player, isAi, choose, auto, reroll, error, setError };
}
