import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { GameTile, PageHeader, PageShell, Section } from "../components/ui";
import { TOPIC_GROUPS, topicsIn } from "../play/categories";
import { gamesOf, kindMeta } from "../play/library";

export const metadata: Metadata = {
  title: "Draft Games: Build a Team From Any Topic",
  description: "Snake drafts, auctions, blind rankings and stat drafts for superheroes, anime, NBA legends, movies and more. Play solo or with friends; an AI judge picks the best team.",
  alternates: { canonical: "/drafts" },
};

/** The Drafts tab: every way to draft, then every topic to draft from. */
export default function DraftsPage() {
  const draft = kindMeta("draft");
  return (
    <PageShell width="lg" className="space-y-10">
      <PageHeader title="Drafts" subtitle={draft.blurb} icon={Layers} />
      <Section title="Ways to draft" hint="Pick how you want to build your team." action={{ href: "/games?kind=draft", label: "About each game" }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gamesOf("draft").map((g) => <GameTile key={g.id} title={g.title} blurb={g.tagline} meta={g.players} icon={g.icon} tint={draft.tint} href={g.href} />)}
        </div>
      </Section>
      <section id="topics" className="scroll-mt-20 space-y-8">
        <div>
          <h2 className="text-lg">Pick a topic</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Each topic shows the drafts that suit it best.</p>
          <nav aria-label="Topic groups" className="mt-3 flex flex-wrap gap-2">
            {TOPIC_GROUPS.map((g) => <a key={g.id} href={`#topics-${g.id}`} className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold hover:bg-white/10">{g.title}</a>)}
          </nav>
        </div>
        {TOPIC_GROUPS.map((g) => (
          <Section key={g.id} id={`topics-${g.id}`} title={g.title} hint={g.blurb}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topicsIn(g.id).map((t) => <GameTile key={t.id} title={t.title} blurb={t.blurb} topic={t.id} tint={g.tint} href={`/category/${t.id}`} />)}
            </div>
          </Section>
        ))}
      </section>
    </PageShell>
  );
}
