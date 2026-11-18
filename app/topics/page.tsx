import { Compass } from "lucide-react";
import { GameTile, PageHeader, PageShell, Section } from "../components/ui";
import { TOPIC_GROUPS, topicsIn } from "../play/categories";

/** Every topic, grouped the same way as on the home page. Each opens that topic's page of games. */
export default function TopicsPage() {
  return (
    <PageShell width="lg" className="space-y-10">
      <PageHeader title="Topics" subtitle="Pick what to draft or quiz on, then choose how to play it." icon={Compass} />
      <nav aria-label="Topic groups" className="flex flex-wrap gap-2">
        {TOPIC_GROUPS.map((g) => <a key={g.id} href={`#topics-${g.id}`} className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold hover:bg-white/10">{g.title}</a>)}
      </nav>
      {TOPIC_GROUPS.map((g) => (
        <Section key={g.id} id={`topics-${g.id}`} title={g.title} hint={g.blurb}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topicsIn(g.id).map((t) => <GameTile key={t.id} title={t.title} blurb={t.blurb} topic={t.id} tint={g.tint} href={`/category/${t.id}`} />)}
          </div>
        </Section>
      ))}
    </PageShell>
  );
}
