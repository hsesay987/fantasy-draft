"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { WorldScene } from "../components/pixel/WorldScene";
import { VOWEL_TOPICS } from "../topicDraft/party/vowelWords";
import { bestFor } from "./best";

/** Vowel Play's front door: the shop, how it works, and a topic to pick. */
export default function VowelPlayHub() {
  const [best, setBest] = useState<Record<string, number>>({});
  useEffect(() => setBest(Object.fromEntries(VOWEL_TOPICS.map((t) => [t.id, bestFor(t.id)]))), []);
  return (
    <PixelShell world="typewriter">
      <div className="vp-page">
        <Link href="/trivia" className="vp-back">&lt; All trivia</Link>
        <header className="vp-sign">
          <div>
            <p className="eyebrow">Solo · 10 names</p>
            <h1>Vowel Play</h1>
          </div>
        </header>
        <div className="vp-stage">
          <WorldScene world="typewriter" labels={false} track={false} caption="A typewriter repair shop: a battered machine on the bench, its vowel keys scattered around it" actors={[{ name: "YOU", value: 0 }]} />
        </div>
        <PixelBox className="vp-rules">
          <p className="m-0">This old machine has lost its vowels. Pick a topic, then name each one from the letters left: <b>SPDRMN</b> is Spider-Man.</p>
          <p className="px-note m-0">20 seconds a name. The faster you get it, the more it scores, up to 100.</p>
        </PixelBox>
        <section aria-label="Choose a topic">
          <h2 className="m-1 mb-3">Choose a topic</h2>
          <ul className="vp-topics">
            {VOWEL_TOPICS.map((t) => (
              <li key={t.id}>
                <Link href={`/vowelplay/${t.id}`} className="vp-topic"><span>{t.title}</span>{(best[t.id] ?? 0) > 0 && <em>{best[t.id]}</em>}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PixelShell>
  );
}
