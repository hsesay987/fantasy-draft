"use client";

import { useEffect, useState } from "react";
import * as FD from "../topicDraft/formats/feud";
import type * as J from "../topicDraft/formats/jeopardy";
import { useSound } from "../components/SoundProvider";
import { PixelBox, PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import type { GameCtl } from "./useGame";
import type { GameSetup } from "./types";

/**
 * End screen for Jeopardy and Family Feud. No AI report: it shows the standings and then every question with
 * the right answer in green and any wrong pick in red.
 */
export function TriviaResults({ setup, ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const { play } = useSound();
  const [copied, setCopied] = useState(false);
  const jeo = setup.format === "jeopardy" ? (ctl.state as J.JeopardyState) : null;
  const feud = setup.format === "feud" ? (ctl.state as FD.FeudState) : null;
  const points = (jeo ?? feud)!.points;
  const unit = jeo ? "M" : " PTS";
  const ranked = Object.entries(points).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]!;
  const tied = ranked.filter(([, v]) => v === top[1]).length > 1;

  useEffect(() => { play(!tied && ctl.controls(top[0]) ? "win" : tied ? "reveal" : ctl.controls(top[0]) ? "win" : "lose"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const share = [`TopPic · ${setup.mission.title}`, ...ranked.map(([p, v], i) => `${i + 1}. ${p} — ${v}${unit.trim() === "M" ? "M" : " pts"}`), "Play at toppicgames.com"].join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(share); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } };

  return (
    <PixelShell world={jeo ? "summit" : "sky"}>
      <div className="space-y-5">
        <WorldScene world={jeo ? "summit" : "sky"} caption="Final standings" actors={ranked.map(([p, v]) => ({ name: p, value: Math.max(0, v) / Math.max(1, ...ranked.map(([, x]) => x)) }))} />
        <PixelBox>
          <p className="px-eyebrow">{jeo ? "JEOPARDY" : "FAMILY FEUD"} · FINAL SCORES</p>
          <h1 className="mt-2">{tied ? "IT'S A TIE!" : `${top[0].toUpperCase()} WINS!`}</h1>
          <ol className="m-0 mt-4 grid list-none gap-2 p-0">
            {ranked.map(([p, v], i) => (
              <li key={p} className="flex items-center justify-between bg-[var(--px-ink)] px-3 py-2 text-[24px]"><span>{i + 1}. {p}</span><b className="font-normal text-[var(--px-gold)]">{v}{unit}</b></li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap">
            <PixelButton variant="gold" onClick={onAgain}>NEW GAME</PixelButton>
            {onRematch && <PixelButton variant="alt" onClick={onRematch}>REMATCH</PixelButton>}
            <PixelButton variant="alt" onClick={copy}>{copied ? "COPIED!" : "COPY RESULT"}</PixelButton>
          </div>
        </PixelBox>

        <PixelBox>
          <p className="px-eyebrow">ANSWER REVIEW</p>
          <ul className="px-review m-0 mt-4 p-0">
            {jeo && jeo.cells.filter((c) => c.done).map((c, i) => (
              <li key={i} className="grid gap-2">
                <p className="m-0 text-[24px] leading-tight"><span className="text-[var(--px-lav)]">{c.cat} · {c.value}M</span><br />{c.q}</p>
                <div className="px-menu">
                  {c.options.map((o) => {
                    const right = o === c.answer, wrong = !right && o === c.picked;
                    return <div key={o} className={`px-opt ${right ? "right" : wrong ? "wrong" : "dim"}`}>{o}{right && <span className="badge">RIGHT ANSWER</span>}{wrong && <span className="badge">{c.by} PICKED THIS</span>}</div>;
                  })}
                </div>
              </li>
            ))}
            {feud && feud.rounds.map((r, ri) => (
              <li key={ri} className="grid gap-2">
                <p className="m-0 text-[24px] leading-tight text-[var(--px-lav)]">{r.q}</p>
                <ol className="m-0 grid list-none gap-2 bg-[var(--px-ink)] p-3">
                  {r.board.map((a, i) => (
                    <li key={a} className={`px-ans ${r.found[a] ? "hit" : "miss"}`}><span className="rk">{i + 1}</span><span className="tx">{a}</span><span className="pt">{r.found[a] ? `${r.found[a]} · +${FD.BOARD_POINTS[i]}` : "MISSED"}</span></li>
                  ))}
                </ol>
                {r.wrong.length > 0 && <p className="m-0 text-[21px] text-[var(--px-rose)]">NOT ON THE BOARD: {r.wrong.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </PixelBox>
      </div>
    </PixelShell>
  );
}
