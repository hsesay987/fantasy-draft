"use client";

import { useEffect, useState } from "react";
import { myVote, sendVote, type RateKind, type Vote } from "../../lib/triviaRate";

const DIFF = ["TOO EASY", "EASY", "JUST RIGHT", "HARD", "TOO HARD"];

/**
 * Anyone can rate an item: 1 to 5 stars for quality, how hard it was, and a flag if the answer is wrong.
 * Each tap saves right away, and rating again replaces the earlier vote.
 */
export function RateItem({ kind, id, clue = -1, label }: { kind: RateKind; id: string; clue?: number; label: string }) {
  const [vote, setVote] = useState<Vote>({});
  const [saved, setSaved] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => { setVote(myVote(kind, id, clue)); setSaved("idle"); }, [kind, id, clue]);

  const set = async (patch: Vote) => {
    const next = { ...vote, ...patch };
    setVote(next);
    setSaved((await sendVote(kind, id, next, clue)) ? "ok" : "fail");
  };

  return (
    <fieldset className="m-0 grid gap-2 border-0 bg-[var(--px-ink)] p-3">
      <legend className="sr-only">Rate {label}</legend>
      <p className="px-eyebrow">{label.toUpperCase()}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="Quality">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => set({ quality: n })} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={vote.quality === n}
              className="cursor-pointer border-0 bg-transparent p-1 text-[28px] leading-none" style={{ color: (vote.quality ?? 0) >= n ? "var(--px-gold)" : "#4c3f94" }}>★</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Difficulty">
          {DIFF.map((d, i) => (
            <button key={d} type="button" onClick={() => set({ difficulty: i + 1 })} aria-pressed={vote.difficulty === i + 1}
              className={`cursor-pointer border-0 px-2 py-1 font-[family-name:var(--px-head)] text-[8px] ${vote.difficulty === i + 1 ? "bg-[var(--px-violet)] text-white" : "bg-[var(--px-panel2)] text-[var(--px-dim)]"}`}>{d}</button>
          ))}
        </div>
        {kind !== "category" && (
          <button type="button" onClick={() => set({ wrong: !vote.wrong })} aria-pressed={!!vote.wrong}
            className={`cursor-pointer border-0 px-2 py-1 font-[family-name:var(--px-head)] text-[8px] ${vote.wrong ? "bg-[var(--px-rose)] text-white" : "bg-[var(--px-panel2)] text-[var(--px-dim)]"}`}>{kind === "clue" ? "ANSWER IS WRONG" : "BOARD IS WRONG"}</button>
        )}
      </div>
      <p className="px-note m-0 min-h-[20px]" aria-live="polite">{saved === "ok" ? "Thanks. Tap again to change your vote." : saved === "fail" ? "Could not save that right now." : ""}</p>
    </fieldset>
  );
}
