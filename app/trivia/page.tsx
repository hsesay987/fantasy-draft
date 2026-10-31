"use client";

import Link from "next/link";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { CATEGORIES } from "../play/categories";
import { hasTrivia } from "../topicDraft/trivia";

const topics = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

/** The three trivia games, each in its own pixel world. */
const GAMES = [
  { id: "jeopardy", world: "summit", title: "Jeopardy: The Summit", blurb: "Pick a clue, climb a camp. Harder clues take you higher up the mountain.", href: "/play/jeopardy", demo: 0.62, topics: true },
  { id: "feud", world: "sky", title: "Family Feud: Sky High", blurb: "Name the most popular answers. The more common, the higher your balloon flies.", href: "/play/feud", demo: 0.7, topics: true },
  { id: "costimation", world: "launch", title: "Costimation: Liftoff", blurb: "Spin for a real product and guess its price. Close guesses launch you toward the stars.", href: "/costimation", demo: 0.55, topics: false },
] as const;

export default function TriviaHub() {
  return (
    <PixelShell>
      <div className="space-y-8">
        <header className="max-w-2xl space-y-3">
          <p className="px-eyebrow">TRIVIA</p>
          <h1>Three worlds. One question: do you know it?</h1>
          <p className="px-note">Play solo, against the AI, or with friends. Every game is made of real facts, and you can rate any question you play.</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-3">
          {GAMES.map((g) => (
            <div key={g.id} className="pixel !min-h-0 !bg-transparent" data-world={g.world}>
              <PixelBox className="grid h-full content-start gap-4">
                <Link href={g.href} aria-label={`Play ${g.title}`} className="block">
                  <WorldScene world={g.world} caption={g.title} actors={[{ name: "YOU", value: g.demo }]} labels={false} />
                </Link>
                <div>
                  <h2>{g.title}</h2>
                  <p className="px-note mt-2">{g.blurb}</p>
                </div>
                <Link href={g.href} className="px-btn gold inline-block w-fit no-underline">PLAY</Link>
                {g.topics && (
                  <div className="flex flex-wrap gap-2" aria-label={`${g.title} by topic`}>
                    {topics.map((c) => <Link key={c.id} href={`/play/${g.id}?pool=${c.id}`} className="px-chip no-underline hover:text-[var(--px-gold)]">{c.title}</Link>)}
                  </div>
                )}
              </PixelBox>
            </div>
          ))}
        </div>
      </div>
    </PixelShell>
  );
}
