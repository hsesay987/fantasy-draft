"use client";

import { useEffect, useState } from "react";
import { Flame, Layers, PenLine, Trophy } from "lucide-react";
import { GameTile, PageHeader, PageShell, Section } from "../components/ui";
import { API_URL } from "../play/onlineApi";
import { CUSTOM_KINDS, customKind, type CustomKind } from "../topicDraft/custom";

type CommunityCard = { slug: string; kind: CustomKind; title: string; description: string; author: string; summary: string; plays: number; likes: number };

const KIND_ICON = { draft: Layers, summit: Trophy, hotair: Flame } as const;

/** Games players wrote and published. Making and playing them in the browser is still to come, so the tiles say "Soon". */
export default function CommunityPage() {
  const [games, setGames] = useState<CommunityCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${API_URL}/custom`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { games?: CommunityCard[] }) => { if (live) setGames(d.games ?? []); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <PageShell width="lg" className="space-y-10">
      <PageHeader title="Community" subtitle="Games other players wrote: their own draft pools, Summit boards and Hot Air surveys." icon={PenLine} />

      <Section title="Make your own" hint="Write a game, publish it, and anyone can play it.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOM_KINDS.map((k) => <GameTile key={k.kind} title={k.title} blurb={k.blurb} icon={KIND_ICON[k.kind]} tint="custom" soon />)}
        </div>
      </Section>

      <Section title="Published by players" hint="Newest first.">
        {failed ? (
          <p className="surface p-5 text-sm text-muted-foreground">Couldn&apos;t load community games right now. Try again in a moment.</p>
        ) : games === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : games.length === 0 ? (
          <p className="surface p-5 text-sm text-muted-foreground">Nobody has published a game yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <GameTile key={g.slug} title={g.title} blurb={g.description || g.summary} icon={KIND_ICON[g.kind]} tint="custom"
                badge={customKind(g.kind)?.title} meta={`by ${g.author} · ${g.plays} plays · ${g.likes} likes`} />
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  );
}
