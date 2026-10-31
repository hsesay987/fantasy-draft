"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelBox, PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { WORLDS } from "../components/pixel/worlds";
import { DAILY_TITLES, DAILY_WORLD, myStats, shareText, untilNext, type DailyGame, type Played } from "../lib/daily";

const FREE_PLAY: Record<DailyGame, string> = { summit: "/play/jeopardy", hotair: "/play/feud", costimation: "/costimation" };

/** After a daily: your result in the world, how everyone else did, your streaks, and how your run unfolded. */
export function DailyStats({ game, played }: { game: DailyGame; played: Played }) {
  const world = DAILY_WORLD[game];
  const st = played.stats;
  const mine = myStats(game, played.day);
  const [clock, setClock] = useState(untilNext());
  const [copied, setCopied] = useState(false);
  useEffect(() => { const id = setInterval(() => setClock(untilNext()), 1000); return () => clearInterval(id); }, []);
  const copy = async () => { try { await navigator.clipboard.writeText(shareText(game, played)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } };
  const myBucket = Math.min(9, Math.floor(played.score * 10));
  const tallest = Math.max(1, ...(st?.buckets ?? [1]));

  return (
    <PixelShell world={world}>
      <div className="space-y-6">
        <PixelBox>
          <p className="px-eyebrow">DAILY {DAILY_TITLES[game].toUpperCase()} #{played.number} · {played.day}</p>
          <h1 className="mt-2">{played.checkpoint}</h1>
          <p className="mt-2 text-[26px] text-[var(--px-gold)]">{Math.round(played.score * 100)}% of the way</p>
          <p className="px-note mt-1">
            {st && st.players > 1 && st.percentile != null ? `You went further than ${st.percentile}% of the ${st.players} players today.` : st ? "You are one of the first to play today. Check back later to see how you compare." : "Stats are not available right now."}
          </p>
        </PixelBox>

        <WorldScene world={world} caption="Your run against today's average" actors={[{ name: "YOU", value: played.score }, ...(st && st.players > 1 ? [{ name: "AVERAGE", value: st.average }] : [])]} />

        <div className="grid gap-6 md:grid-cols-2">
          <PixelBox>
            <p className="px-eyebrow">TODAY&apos;S PLAYERS</p>
            <div className="mt-4 flex h-40 items-end gap-1.5" role="img" aria-label={`Score distribution for ${st?.players ?? 0} players; your bar is highlighted`}>
              {(st?.buckets ?? new Array(10).fill(0)).map((n, i) => (
                <div key={i} className="flex h-full flex-1 flex-col justify-end gap-1">
                  <span className="text-center text-[16px] text-[var(--px-dim)]">{n || ""}</span>
                  <div style={{ height: `${(n / tallest) * 100}%`, minHeight: n ? 6 : 2, background: i === myBucket ? "var(--px-gold)" : "var(--px-panel2)", boxShadow: i === myBucket ? "0 0 0 2px #000" : undefined }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[16px] text-[var(--px-dim)]"><span>0%</span><span>50%</span><span>100%</span></div>
            {st && <p className="px-note mt-2">Average {Math.round(st.average * 100)}% · best {Math.round(st.best * 100)}%</p>}
          </PixelBox>

          <PixelBox>
            <p className="px-eyebrow">YOUR RUN</p>
            <RunChart game={game} history={played.history} />
          </PixelBox>
        </div>

        <PixelBox>
          <p className="px-eyebrow">YOUR STATS</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[["PLAYED", mine.played], ["STREAK", mine.streak], ["BEST STREAK", mine.bestStreak], ["BEST", `${Math.round(mine.best * 100)}%`], ["AVERAGE", `${Math.round(mine.average * 100)}%`]].map(([k, v]) => (
              <div key={k} className="grid gap-1 bg-[var(--px-ink)] p-3 text-center"><b className="font-[family-name:var(--px-title)] text-[28px] font-bold text-[var(--px-gold)]">{v}</b><span className="font-[family-name:var(--px-head)] text-[8px] text-[var(--px-dim)]">{k}</span></div>
            ))}
          </div>
          <pre className="mt-4 overflow-x-auto bg-[var(--px-ink)] p-3 text-[22px] leading-tight">{shareText(game, played)}</pre>
          <div className="mt-3 flex flex-wrap items-center">
            <PixelButton variant="gold" onClick={copy}>{copied ? "COPIED!" : "SHARE"}</PixelButton>
            <Link href={FREE_PLAY[game]} className="px-btn alt no-underline">FREE PLAY</Link>
            <Link href="/trivia" className="px-btn alt no-underline">OTHER DAILIES</Link>
            <span className="px-note ml-2">Next puzzle in {clock}</span>
          </div>
        </PixelBox>
      </div>
    </PixelShell>
  );
}

/** A stepped line of how far along you were after each question, with the world's checkpoints as gridlines. */
function RunChart({ game, history }: { game: DailyGame; history: number[] }) {
  const cps = WORLDS[DAILY_WORLD[game]].checkpoints;
  const pts = [0, ...history];
  const W = 300, H = 160, L = 8, R = 92, T = 6, B = 22;
  const x = (i: number) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  let d = `M${x(0)},${y(0)}`;
  pts.slice(1).forEach((v, i) => { d += ` H${x(i + 1)} V${y(v)}`; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full" role="img" aria-label={`Progress after each question: ${history.map((v) => `${Math.round(v * 100)}%`).join(", ")}`} shapeRendering="crispEdges">
      {cps.filter((c) => c.at > 0).map((c) => (
        <g key={c.name}>
          <line x1={L} x2={W - R} y1={y(c.at)} y2={y(c.at)} stroke="#3b3570" strokeWidth={1} strokeDasharray="3 3" />
          <text x={W - R + 4} y={y(c.at) + 3} fontSize={7} fill="#9b90d6" fontFamily="var(--font-press), monospace">{c.name}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="#ffd23f" strokeWidth={3} />
      {pts.map((v, i) => <rect key={i} x={x(i) - 2} y={y(v) - 2} width={4} height={4} fill={i === pts.length - 1 ? "#ff4d6d" : "#ffd23f"} />)}
      {pts.map((_, i) => (i > 0 && (pts.length <= 8 || i % 2 === 0) ? <text key={i} x={x(i)} y={H - 6} fontSize={7} fill="#9b90d6" textAnchor="middle" fontFamily="var(--font-press), monospace">{i}</text> : null))}
    </svg>
  );
}
