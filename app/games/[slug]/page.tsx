import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, Play } from "lucide-react";
import { GameTile, IconBadge, PageShell, Section } from "../../components/ui";
import { DAILY_TITLES } from "../../lib/daily";
import { gamesOf, kindMeta, type LibraryGame } from "../../play/library";
import { LANDINGS, howToPlay, landing, landingFor, landingGames, type Landing } from "../landing";

export const dynamicParams = false;
export const generateStaticParams = () => LANDINGS.map((l) => ({ slug: l.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = landing((await params).slug);
  if (!l) return {};
  const url = `/games/${l.slug}`;
  return {
    title: { absolute: `${l.seoTitle} | TopPic` },
    description: l.description,
    keywords: [landingGames(l)[0]?.title, ...(l.aka ?? [])].filter(Boolean) as string[],
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: l.seoTitle, description: l.description, siteName: "TopPic" },
    twitter: { card: "summary", title: l.seoTitle, description: l.description },
  };
}

/** Questions people search for, answered from what the game actually is. */
function faqOf(l: Landing, main: LibraryGame): { q: string; a: string }[] {
  const t = main.title;
  const faq = [
    { q: `Is ${t} free?`, a: `Yes. You can play ${t} free in your browser, on a phone or a computer, with nothing to download.` },
    { q: `How many people can play ${t}?`, a: `${main.players}.${main.kind === "party" ? " Everyone plays on their own phone: one person opens a room and shares the code." : ""}` },
  ];
  const daily = landingGames(l).find((g) => g.daily)?.daily;
  if (daily) faq.push({ q: `Is there a daily ${t}?`, a: `Yes. There is a new ${DAILY_TITLES[daily]} puzzle every day, the same for everyone, and you can compare your score when you finish.` });
  if (main.kind === "draft") faq.push({ q: `What can I draft in ${t}?`, a: "Superheroes, villains, anime, Pokémon, mythology, animals, celebrities, movie icons, NBA legends, NFL players, countries and more. Every topic shows the drafts that suit it." });
  return faq;
}

export default async function GameLanding({ params }: Props) {
  const l = landing((await params).slug);
  const games = l ? landingGames(l) : [];
  if (!l || !games.length) notFound();
  const [main, ...modes] = games;
  const kind = kindMeta(main.kind);
  const how = howToPlay(l);
  const faq = faqOf(l, main);
  const daily = games.find((g) => g.daily)?.daily;
  const related = gamesOf(main.kind).filter((g) => !l.ids.includes(g.id)).flatMap((g) => { const r = landingFor(g.id); return r ? [{ g, slug: r.slug }] : []; })
    .filter((x, i, all) => all.findIndex((y) => y.slug === x.slug) === i).slice(0, 6);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toppicgames.com";

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "VideoGame", name: main.title, url: `${site}/games/${l.slug}`, description: l.description,
      alternateName: l.aka, genre: kind.title === "Draft" ? "Draft game" : kind.title === "Quiz" ? "Trivia game" : "Party game",
      gamePlatform: "Web browser", applicationCategory: "Game", operatingSystem: "Any", playMode: main.kind === "party" ? "MultiPlayer" : "SinglePlayer",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: { "@type": "Organization", name: "TopPic", url: site },
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Games", item: `${site}/games` },
        { "@type": "ListItem", position: 2, name: main.title, item: `${site}/games/${l.slug}` },
      ],
    },
  ];

  return (
    <PageShell width="md" className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="space-y-5">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-white"><ChevronLeft className="h-4 w-4" aria-hidden /> All games</Link>
        <div className="flex items-start gap-4">
          <IconBadge icon={main.icon} tint={kind.tint} size="lg" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">{kind.title} game · {main.players}</p>
            <h1 className="text-4xl md:text-5xl">{main.title}</h1>
          </div>
        </div>
        <p className="max-w-2xl text-lg text-muted-foreground">{main.tagline}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={main.href} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-black"><Play className="h-5 w-5" aria-hidden /> Play {main.title}</Link>
          {daily && <Link href={`/daily/${daily}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 font-semibold hover:bg-white/10"><CalendarDays className="h-5 w-5" aria-hidden /> Today&apos;s puzzle</Link>}
          {modes.map((m) => <Link key={m.id} href={m.href} className="inline-flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 font-semibold hover:bg-white/10">Play as a {kindMeta(m.kind).title.toLowerCase()} game</Link>)}
        </div>
      </header>

      <section className="space-y-3" aria-labelledby="about">
        <h2 id="about" className="text-xl">What is {main.title}?</h2>
        {l.about.map((p) => <p key={p.slice(0, 24)} className="leading-relaxed text-muted-foreground">{p}</p>)}
        {l.aka?.length ? <p className="text-sm text-muted-foreground/80">Also known as: {l.aka.join(", ")}.</p> : null}
      </section>

      {how.length > 0 && (
        <section className="surface space-y-3 p-5" aria-labelledby="how">
          <h2 id="how" className="text-xl">How to play {main.title}</h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">{how.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="faq">
        <h2 id="faq" className="text-xl">{main.title} FAQ</h2>
        <dl className="space-y-4">
          {faq.map((f) => <div key={f.q}><dt className="font-semibold">{f.q}</dt><dd className="mt-1 text-muted-foreground">{f.a}</dd></div>)}
        </dl>
      </section>

      {related.length > 0 && (
        <Section title={`More ${kind.title.toLowerCase()} games`}>
          <div className="grid gap-4 sm:grid-cols-2">
            {related.map(({ g, slug }) => <GameTile key={slug} title={g.title} blurb={g.tagline} icon={g.icon} tint={kind.tint} href={`/games/${slug}`} />)}
          </div>
        </Section>
      )}
    </PageShell>
  );
}
