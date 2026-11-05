"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { dayNumber } from "../pinpoint/engine";
import { CLUES, savedRun, score, type ThreadRun } from "./engine";
import { THREAD_TOPICS } from "./topics";

/** Pick a topic's case file. The hub reads only what is saved, so it never downloads a topic's clues. */
export default function CommonThreadHub() {
  const [day, setDay] = useState<number | null>(null);
  const [runs, setRuns] = useState<Record<string, ThreadRun | null>>({});
  useEffect(() => {
    const d = dayNumber();
    setDay(d);
    setRuns(Object.fromEntries(THREAD_TOPICS.map((t) => [t.id, savedRun(t.id, d)])));
  }, []);

  return (
    <PixelShell world="board">
      <div className="ct-page">
        <Link href="/trivia" className="ct-back">&lt; All trivia</Link>
        <header className="ct-sign">
          <div>
            <p className="eyebrow">{day ? `Daily #${day}` : "Daily"}</p>
            <h1>Common Thread</h1>
          </div>
        </header>
        <WorldScene world="board" actors={[]} labels={false} track={false} caption="A detective's office at night: rain on the window and a corkboard of clues joined by red string" />
        <p className="px-note m-1">Six clues share one hidden fact. They start obscure and end obvious. Name the fact from eight leads: the fewer clues you need, the more you score. Open a file.</p>
        <ul className="ct-files" aria-label="Topics">
          {THREAD_TOPICS.map((t) => {
            const r = runs[t.id];
            return (
              <li key={t.id}>
                <Link href={`/commonthread/${t.id}`} className="ct-file">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.iconSrc} alt="" />
                  <span className="min-w-0">
                    <b>{t.title}</b>
                    {r?.over && <em className={r.won ? "won" : "cold"}>{r.won ? `${score(r)}/${CLUES}` : `X/${CLUES}`}</em>}
                    {r && !r.over && <em>OPEN</em>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </PixelShell>
  );
}
