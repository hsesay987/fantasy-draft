"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { GameTile, Section } from "../components/ui";
import { KINDS, gamesOf, type GameKind } from "../play/library";
import { landingHref } from "./landing";

/** Every game on the site, grouped by what you do: draft, quiz or party. `?kind=` narrows it to one group. Each tile opens the game's own page. */
export function GamesList() {
  const kindParam = useSearchParams().get("kind");
  const only = KINDS.some((k) => k.kind === kindParam) ? (kindParam as GameKind) : null;
  const kinds = only ? KINDS.filter((k) => k.kind === only) : KINDS;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center sm:min-h-9 rounded-full border px-3 text-sm font-semibold ${active ? "border-secondary bg-primary/20 text-white" : "border-white/15 bg-white/5 hover:bg-white/10"}`;

  return (
    <>
      <nav aria-label="Kinds of game" className="flex flex-wrap gap-2">
        <Link href="/games" className={chip(!only)}>All</Link>
        {KINDS.map((k) => <Link key={k.kind} href={`/games?kind=${k.kind}`} className={chip(only === k.kind)}>{k.title}</Link>)}
      </nav>
      {kinds.map((k) => (
        <Section key={k.kind} id={`kind-${k.kind}`} title={k.title} hint={k.blurb}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gamesOf(k.kind).map((g) => (
              <GameTile key={g.id} title={g.title} blurb={g.tagline} meta={g.players} icon={g.icon} tint={k.tint} badge={g.daily ? "Daily" : undefined} href={landingHref(g.id) ?? g.href} />
            ))}
          </div>
        </Section>
      ))}
      {(!only || only === "party") && (
        <section id="room" className="surface scroll-mt-20 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg">Party games are played in a room</h2>
            <p className="text-sm text-muted-foreground">Open a room, share the code, and pick any party game from the lobby.</p>
          </div>
          <Link href="/online" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold"><Users className="h-4 w-4" aria-hidden /> Open or join a room</Link>
        </section>
      )}
    </>
  );
}
