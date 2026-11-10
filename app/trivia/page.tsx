"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { playedOn, todayKey, todayNumber, type DailyGame, type Played } from "../lib/daily";
import { CATEGORIES } from "../play/categories";
import { hasTrivia } from "../topicDraft/trivia";
import { VOWEL_TOPICS } from "../topicDraft/party/vowelWords";

const topics = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

/** The trivia games, each in its own pixel world, with free play and, for most, a daily puzzle. `topicList` is for a game whose topics aren't the trivia ones. */
const GAMES: { id: string; daily?: DailyGame; world: "summit" | "sky" | "launch" | "ladder" | "typewriter"; title: string; blurb: string; href: string; demo: number; topics: boolean; topicHref?: (pool: string) => string; topicList?: { id: string; title: string }[] }[] = [
  { id: "jeopardy", daily: "summit", world: "summit", title: "Summit", blurb: "Pick a clue, climb the mountain. Harder clues take you higher, past nine named camps to the top.", href: "/play/jeopardy", demo: 0.42, topics: true },
  { id: "feud", daily: "hotair", world: "sky", title: "Hot Air", blurb: "Say what everyone would say. Popular answers lift your balloon from the sea to the edge of space.", href: "/play/feud", demo: 0.5, topics: true },
  { id: "costimation", daily: "costimation", world: "launch", title: "Costimation", blurb: "Guess what real products cost. Close guesses fly your ship across the solar system, planet by planet.", href: "/costimation", demo: 0.3, topics: false },
  { id: "toprung", daily: "toprung", world: "ladder", title: "Top Rung", blurb: "Climb a lighthouse ladder, one question a rung, up to the lamp. A slip drops you to your last safe ledge, so know when to walk away.", href: "/toprung", demo: 0.18, topics: true, topicHref: (pool) => `/toprung/${pool}` },
  { id: "vowelplay", world: "typewriter", title: "Vowel Play", blurb: "A battered typewriter has lost its vowels. Name each one from the letters left, fast, and the keys snap back into place.", href: "/vowelplay", demo: 0, topics: true, topicHref: (pool) => `/vowelplay/${pool}`, topicList: VOWEL_TOPICS },
];

export default function TriviaHub() {
  const [n, setN] = useState<number | null>(null);
  const [done, setDone] = useState<Record<string, Played | null>>({});
  useEffect(() => {
    setN(todayNumber());
    const day = todayKey();
    setDone(Object.fromEntries(GAMES.flatMap((g) => (g.daily ? [[g.daily, playedOn(g.daily, day)]] : []))));
  }, []);

  return (
    <PixelShell>
      <div className="space-y-8">
        <header className="max-w-2xl space-y-3">
          <p className="px-eyebrow">TRIVIA</p>
          <h1>Five worlds. New puzzles every day.</h1>
          <p className="px-note">Play a daily to compare with everyone else, or free play any topic, solo, against the AI or with friends. Every question is made of real facts, and you can rate any one you play.</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          {GAMES.map((g) => {
            const mine = g.daily ? done[g.daily] : null;
            const home = g.daily ? `/daily/${g.daily}` : g.href;
            return (
              <div key={g.id} className="pixel !min-h-0 !bg-transparent" data-world={g.world}>
                <PixelBox className="grid h-full content-start gap-4">
                  <Link href={home} aria-label={g.daily ? `Play today's ${g.title}` : `Play ${g.title}`} className="block">
                    <WorldScene world={g.world} caption={g.title} actors={[{ name: "YOU", value: mine?.score ?? g.demo }]} labels={false} track={false} />
                  </Link>
                  <div>
                    <h2>{g.title}</h2>
                    <p className="px-note mt-2">{g.blurb}</p>
                  </div>
                  <div className="flex flex-wrap items-center">
                    {g.daily ? (
                      <>
                        <Link href={home} className="px-btn gold no-underline">{mine ? `DAILY #${mine.number} · ${Math.round(mine.score * 100)}%` : `PLAY DAILY${n ? ` #${n}` : ""}`}</Link>
                        <Link href={g.href} className="px-btn alt no-underline">FREE PLAY</Link>
                      </>
                    ) : <Link href={g.href} className="px-btn gold no-underline">PLAY</Link>}
                  </div>
                  {g.topics && (
                    <div className="flex flex-wrap gap-2" aria-label={`${g.title} by topic`}>
                      {(g.topicList ?? topics).map((c) => <Link key={c.id} href={g.topicHref?.(c.id) ?? `/play/${g.id}?pool=${c.id}`} className="px-chip no-underline hover:text-[var(--px-gold)]">{c.title}</Link>)}
                    </div>
                  )}
                </PixelBox>
              </div>
            );
          })}
        </div>

        <PixelBox className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="px-eyebrow">NEW · DAILY</p>
            <h2 className="mt-2">Pinpoint</h2>
            <p className="px-note mt-2">Guess today&apos;s hidden pick in any topic. Every guess is checked against real facts about the pick and shows how close you are.</p>
          </div>
          <Link href="/pinpoint" className="px-btn gold no-underline">PLAY PINPOINT</Link>
        </PixelBox>

        <PixelBox className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="px-eyebrow">NEW · DAILY</p>
            <h2 className="mt-2">Common Thread</h2>
            <p className="px-note mt-2">Six clues share one hidden fact, from obscure to obvious. Work out what links them in any topic: the fewer clues you need, the more you score.</p>
          </div>
          <Link href="/commonthread" className="px-btn gold no-underline">PLAY COMMON THREAD</Link>
        </PixelBox>
      </div>
    </PixelShell>
  );
}
