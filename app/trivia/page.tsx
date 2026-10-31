"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { playedOn, todayKey, todayNumber, type DailyGame, type Played } from "../lib/daily";
import { CATEGORIES } from "../play/categories";
import { hasTrivia } from "../topicDraft/trivia";

const topics = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

/** The three trivia games, each in its own pixel world, each with a daily puzzle and free play. */
const GAMES: { id: string; daily: DailyGame; world: "summit" | "sky" | "launch"; title: string; blurb: string; href: string; demo: number; topics: boolean }[] = [
  { id: "jeopardy", daily: "summit", world: "summit", title: "Summit", blurb: "Pick a clue, climb the mountain. Harder clues take you higher, past nine named camps to the top.", href: "/play/jeopardy", demo: 0.42, topics: true },
  { id: "feud", daily: "hotair", world: "sky", title: "Hot Air", blurb: "Say what everyone would say. Popular answers lift your balloon from the sea to the edge of space.", href: "/play/feud", demo: 0.5, topics: true },
  { id: "costimation", daily: "costimation", world: "launch", title: "Costimation", blurb: "Guess what real products cost. Close guesses fly your ship across the solar system, planet by planet.", href: "/costimation", demo: 0.3, topics: false },
];

export default function TriviaHub() {
  const [n, setN] = useState<number | null>(null);
  const [done, setDone] = useState<Record<string, Played | null>>({});
  useEffect(() => {
    setN(todayNumber());
    const day = todayKey();
    setDone(Object.fromEntries(GAMES.map((g) => [g.daily, playedOn(g.daily, day)])));
  }, []);

  return (
    <PixelShell>
      <div className="space-y-8">
        <header className="max-w-2xl space-y-3">
          <p className="px-eyebrow">TRIVIA</p>
          <h1>Three worlds. A new puzzle in each, every day.</h1>
          <p className="px-note">Play the daily to compare with everyone else, or free play any topic, solo, against the AI or with friends. Every question is made of real facts, and you can rate any one you play.</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-3">
          {GAMES.map((g) => {
            const mine = done[g.daily];
            return (
              <div key={g.id} className="pixel !min-h-0 !bg-transparent" data-world={g.world}>
                <PixelBox className="grid h-full content-start gap-4">
                  <Link href={`/daily/${g.daily}`} aria-label={`Play today's ${g.title}`} className="block">
                    <WorldScene world={g.world} caption={g.title} actors={[{ name: "YOU", value: mine?.score ?? g.demo }]} labels={false} track={false} />
                  </Link>
                  <div>
                    <h2>{g.title}</h2>
                    <p className="px-note mt-2">{g.blurb}</p>
                  </div>
                  <div className="flex flex-wrap items-center">
                    <Link href={`/daily/${g.daily}`} className="px-btn gold no-underline">{mine ? `DAILY #${mine.number} · ${Math.round(mine.score * 100)}%` : `PLAY DAILY${n ? ` #${n}` : ""}`}</Link>
                    <Link href={g.href} className="px-btn alt no-underline">FREE PLAY</Link>
                  </div>
                  {g.topics && (
                    <div className="flex flex-wrap gap-2" aria-label={`${g.title} by topic`}>
                      {topics.map((c) => <Link key={c.id} href={`/play/${g.id}?pool=${c.id}`} className="px-chip no-underline hover:text-[var(--px-gold)]">{c.title}</Link>)}
                    </div>
                  )}
                </PixelBox>
              </div>
            );
          })}
        </div>
      </div>
    </PixelShell>
  );
}
