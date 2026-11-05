"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { playedOn, todayKey, todayNumber, type Played } from "../lib/daily";
import { CATEGORIES } from "../play/categories";
import { hasTrivia } from "../topicDraft/trivia";

const topics = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

/** Top Rung's front door: today's climb, or a free climb on any topic with trivia. */
export default function TopRungHub() {
  const [n, setN] = useState<number | null>(null);
  const [mine, setMine] = useState<Played | null>(null);
  useEffect(() => {
    setN(todayNumber());
    setMine(playedOn("toprung", todayKey()));
  }, []);

  return (
    <PixelShell world="ladder">
      <div className="tr-page">
        <Link href="/trivia" className="tr-back">&lt; All trivia</Link>
        <header className="tr-sign">
          <div>
            <p className="eyebrow">{n ? `Daily #${n}` : "Daily"}</p>
            <h1>Top Rung</h1>
          </div>
        </header>
        <WorldScene world="ladder" labels={false} track={false} caption="A ladder bolted up a tall lighthouse at dusk" actors={[{ name: "YOU", value: mine?.score ?? 0.18 }]} />
        <PixelBox className="grid gap-3">
          <p className="m-0">Twelve rungs up the lighthouse, one question on each, harder as you go. Reach a safe ledge and a slip can only drop you that far. Walk away whenever you like, or keep going for the lamp.</p>
          <p className="px-note m-0">Three lifelines, once each per climb: Cut Two, Crowd Poll and Swap.</p>
          <div className="tr-actions">
            <Link href="/daily/toprung" className="px-btn gold no-underline">{mine ? `DAILY #${mine.number} · ${Math.round(mine.score * 100)}%` : `PLAY DAILY${n ? ` #${n}` : ""}`}</Link>
          </div>
        </PixelBox>
        <PixelBox className="grid gap-3">
          <h2 className="m-0">Free climb</h2>
          <div className="flex flex-wrap gap-2" aria-label="Climb by topic">
            {topics.map((c) => <Link key={c.id} href={`/toprung/${c.id}`} className="px-chip no-underline hover:text-[var(--px-gold)]">{c.title}</Link>)}
          </div>
        </PixelBox>
      </div>
    </PixelShell>
  );
}
