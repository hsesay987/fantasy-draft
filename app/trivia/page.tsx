"use client";

import Link from "next/link";
import { GameTile, PageShell } from "../components/ui";
import { CATEGORIES } from "../play/categories";
import { formatMeta } from "../play/formats";
import { hasTrivia } from "../topicDraft/trivia";
import type { FormatId } from "../play/types";

const GAMES: FormatId[] = ["jeopardy", "feud", "price"];
const topics = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

export default function TriviaHub() {
  return (
    <PageShell width="lg" className="space-y-12 md:py-14">
      <header className="max-w-2xl space-y-3">
        <h1 className="text-4xl md:text-6xl">Trivia</h1>
        <p className="text-lg text-muted-foreground">Know your stuff? Jeopardy boards, survey showdowns and guess-the-score games for every topic. Play solo, against the AI, or with friends.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl">Choose a game</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((id) => {
            const f = formatMeta(id)!;
            return <GameTile key={id} title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} href={`/play/${id}`} />;
          })}
        </div>
      </section>

      {GAMES.slice(0, 2).map((id) => (
        <section key={id} className="space-y-3">
          <h2 className="text-2xl">{formatMeta(id)!.title} by topic</h2>
          <div className="flex flex-wrap gap-2">
            {topics.map((c) => (
              <Link key={c.id} href={`/play/${id}?pool=${c.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold transition-colors hover:border-secondary hover:bg-primary/15">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.iconSrc} alt="" width={20} height={20} className="h-5 w-5" /> {c.title}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
