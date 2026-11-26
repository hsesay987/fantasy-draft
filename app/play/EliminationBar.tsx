"use client";

import { useEffect, useRef, useState } from "react";
import type { GameCtl } from "./useGame";

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * Elimination mode on a phone or the TV: a short "Eliminated" banner when someone goes out, a standing note on an out
 * seat's own phone, and the list of who went out once the game is over.
 */
export function EliminationBar({ ctl, done }: { ctl: GameCtl; done: boolean }) {
  const out = ctl.out ?? [];
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef(out.length);
  useEffect(() => {
    if (out.length > seen.current) {
      setFlash(out[out.length - 1]!.name);
      const id = setTimeout(() => setFlash(null), 4500);
      seen.current = out.length;
      return () => clearTimeout(id);
    }
    seen.current = out.length;
  }, [out]);

  if (!out.length) return null;
  if (done) {
    return (
      <section aria-label="Eliminated" className="mx-auto my-4 w-[min(100%-16px,36rem)] rounded-2xl border border-white/10 bg-black/40 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Eliminated</h2>
        <ol className="space-y-1">
          {[...out].reverse().map((o) => (
            <li key={o.name} className="flex justify-between gap-3 text-sm"><span className="truncate">{o.name}</span><span className="shrink-0 text-muted-foreground">{ordinal(o.place)} · out in round {o.round}</span></li>
          ))}
        </ol>
      </section>
    );
  }
  const mine = ctl.seat ? out.find((o) => o.name === ctl.seat) : undefined;
  return (
    <>
      {flash && (
        <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top))] z-50 mx-auto w-fit max-w-[calc(100%-16px)] rounded-xl bg-rose-600 px-4 py-2 text-center font-bold text-white shadow-xl">
          Eliminated: {flash}
        </div>
      )}
      {mine && (
        <p role="note" className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[calc(100%-16px)] rounded-xl border border-white/15 bg-background/95 px-4 py-2 text-center text-sm shadow-lg backdrop-blur md:bottom-4">
          You&apos;re out · round {mine.round}, {ordinal(mine.place)} place. Watching the rest.
        </p>
      )}
    </>
  );
}
