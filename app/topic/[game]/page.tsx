"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SetupForm } from "../../topicDraft/components/SetupForm";
import { saveSetup } from "../../topicDraft/config";
import { topicGame } from "../../topicDraft/games";
import { getCatalog } from "../../topicDraft/catalogs";

export default function TopicSetupPage() {
  const { game } = useParams<{ game: string }>();
  const router = useRouter();
  const meta = topicGame(game);
  if (!meta || !getCatalog(game).length) return notFound();
  const Icon = meta.icon;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-white">← All games</Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/30">
            <Icon className="h-6 w-6 text-secondary" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl md:text-4xl">{meta.title} Draft</h1>
            <p className="text-muted-foreground">{meta.blurb}</p>
          </div>
        </div>
      </div>
      <SetupForm
        game={game}
        onStart={(s) => {
          saveSetup(s);
          router.push(`/topic/${game}/play`);
        }}
      />
    </main>
  );
}
