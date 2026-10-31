"use client";

import { useEffect } from "react";
import { autoAction, currentTurn, isDone } from "../../topicDraft/core";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/** Plays the AI's move a beat after it becomes their turn. `key` changes whenever the position changes. */
/** While `paused` (for example a result is on screen) the AI waits. */
export function useAiTurn(setup: GameSetup, ctl: GameCtl, key: string, delay = 1100, paused = false) {
  useEffect(() => {
    if (paused || ctl.online || isDone(setup, ctl.state)) return;
    const who = currentTurn(setup, ctl.state);
    if (!who || !ctl.isAi(who)) return;
    const t = setTimeout(() => {
      const a = autoAction(setup, ctl.state);
      if (a) ctl.dispatch(a);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ctl.state, paused]);
}

export function Scoreboard({ rows }: { rows: { name: string; value: string; active?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Scores">
      {rows.map((r) => (
        <li key={r.name} className={`rounded-full border px-3 py-1 text-sm ${r.active ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5"}`}>
          <span className="font-semibold">{r.name}</span> <span className="text-secondary">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
