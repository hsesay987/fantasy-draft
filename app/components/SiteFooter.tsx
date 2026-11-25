import Link from "next/link";
import { SOURCES } from "../topicDraft/stats";

const DATA = [SOURCES.wikidata, SOURCES.worldbank, SOURCES.unesco, SOURCES.pantheon, SOURCES.pokeapi, SOURCES.bbref, SOURCES["superhero-api"]];
const link = "underline decoration-white/20 underline-offset-2 hover:text-white";

/** Where the facts and numbers come from, in one short paragraph. Icons are our own, so there is nothing to credit for them. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/8 px-4 pb-24 pt-6 text-xs leading-relaxed text-muted-foreground md:px-6 md:pb-8">
      <div className="mx-auto max-w-6xl space-y-3">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 text-sm [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center md:[&>a]:min-h-0">
          <Link href="/games" className="hover:text-white">All games</Link>
          <Link href="/drafts" className="hover:text-white">Drafts</Link>
          <Link href="/trivia" className="hover:text-white">Trivia</Link>
          <Link href="/online" className="hover:text-white">Party</Link>
          <Link href="/daily" className="hover:text-white">Daily</Link>
          <Link href="/community" className="hover:text-white">Community</Link>
          <Link href="/account/subscription" className="hover:text-white">Plans</Link>
          <Link href="/ads/submit" className="hover:text-white">Advertise</Link>
        </nav>
        <p>
          Stats and trivia are built from{" "}
          {DATA.map((s, i) => <span key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer" className={link}>{s.name}</a>{i < DATA.length - 1 ? ", " : ". "}</span>)}
          Pictures come from Wikipedia, AniList, PokéAPI and the Superhero API. Costimation prices and photos come from{" "}
          <a href="https://prices.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className={link}>Open Prices</a> and{" "}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className={link}>Open Food Facts</a> (ODbL; photos CC BY-SA).
        </p>
        <p>TopPic is an unofficial fan project. Characters, teams and titles belong to their owners.</p>
      </div>
    </footer>
  );
}
