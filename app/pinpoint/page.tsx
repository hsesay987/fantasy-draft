"use client";

import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { GameTile, PageHeader, PageShell } from "../components/ui";
import { PINPOINT_TOPICS, loadPinpoint } from "./topics";
import { dayNumber } from "../topicDraft/pinpoint";

/** Pick a topic for today's Pinpoint. Topics you already solved today show your result. */
export default function PinpointHub() {
  const [done, setDone] = useState<Record<string, string>>({});
  useEffect(() => {
    const day = dayNumber();
    setDone(Object.fromEntries(PINPOINT_TOPICS.flatMap((t) => {
      const r = loadPinpoint(t.id, day);
      return r?.over ? [[t.id, r.won ? `${r.guesses.length}/8` : "X/8"]] : [];
    })));
  }, []);
  return (
    <PageShell width="lg">
      <PageHeader title="Pinpoint" subtitle={`Daily #${dayNumber()}: guess today's hidden pick. Every guess tells you how close you are.`} icon={Crosshair} gradient="from-emerald-600/50 to-primary/20" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PINPOINT_TOPICS.map((t) => (
          <GameTile key={t.id} title={t.title} blurb={t.blurb} iconSrc={t.iconSrc} gradient={t.gradient} badge={done[t.id]} href={`/pinpoint/${t.id}`} />
        ))}
      </div>
    </PageShell>
  );
}
