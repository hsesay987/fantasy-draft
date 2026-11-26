"use client";

import { useEffect, useState } from "react";
import { canVeto, vetoOf, VETO_MS } from "../topicDraft/veto";
import type { GameCtl } from "./useGame";
import type { GameSetup } from "./types";
import { isDone } from "../topicDraft/core";

/**
 * The veto window under a draft: who picked what, a countdown, and a Veto button for whoever may veto it. Local games
 * close the window here (a tick); online rooms are ticked by the server.
 */
export function VetoBar({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const v = vetoOf(ctl.state);
  const open = v?.open;
  const [now, setNow] = useState(() => Date.now() + ctl.offset);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now() + ctl.offset), 250);
    return () => clearInterval(t);
  }, [open, ctl.offset]);
  useEffect(() => {
    if (open && !ctl.online && now >= open.until) ctl.dispatch({ type: "tick" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, now, ctl.online]);

  if (!v || isDone(setup, ctl.state)) return null;
  const mine = ctl.me != null ? v.left[ctl.me] : undefined;
  if (!open || now >= open.until) {
    return mine != null ? <p className="mt-3 text-center text-sm text-muted-foreground">Vetoes left: {mine}</p> : null;
  }
  const secs = Math.max(0, Math.ceil((open.until - now) / 1000));
  const name = ctl.byId(open.itemId)?.name ?? open.itemId;
  // Online: only your own seat. Local: every human at the table who still has a veto.
  const who = ctl.online ? (ctl.me && canVeto(ctl.state, ctl.me, now) ? [ctl.me] : []) : setup.players.filter((p) => ctl.controls(p) && canVeto(ctl.state, p, now));
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 mx-auto w-[min(100%-16px,36rem)] rounded-2xl border border-secondary/60 bg-background/95 p-3 shadow-xl backdrop-blur md:bottom-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{open.picker} took {name}</p>
          <p className="text-sm text-muted-foreground">{who.length ? `Veto it? ${secs}s` : `Waiting for vetoes… ${secs}s`}</p>
        </div>
        <span aria-hidden className="tabular-nums text-2xl font-bold text-secondary">{secs}</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-white/10" aria-hidden>
        <div className="h-full bg-secondary transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, ((open.until - now) / VETO_MS) * 100))}%` }} />
      </div>
      {who.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {who.map((p) => (
            <button key={p} type="button" onClick={() => ctl.dispatch({ type: "veto", by: p })} className="min-h-11 flex-1 rounded-xl bg-rose-600 px-4 font-bold text-white hover:opacity-90">
              {ctl.online ? "Veto" : `${p}: Veto`} · {v.left[p]} left
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
