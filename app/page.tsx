// app/page.tsx — TopPic hub
"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { Sparkles, Bot, RotateCcw } from "lucide-react";
import { GameTile } from "./components/ui";
import { CLASSIC, PARTY } from "./topicDraft/games";
import { FORMATS, formatMeta } from "./play/formats";
import { CHARACTER_POOLS } from "./topicDraft/catalogs";
import { resumable } from "./play/storage";
import type { GameSetup } from "./play/types";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28 } } };

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div><h2 className="text-2xl">{title}</h2><p className="text-sm text-muted-foreground">{sub}</p></div>
      <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </motion.div>
    </section>
  );
}

export default function Home() {
  const [resume, setResume] = useState<GameSetup | null>(null);
  useEffect(() => setResume(resumable()?.setup ?? null), []);

  return (
    <main className="mx-auto max-w-7xl space-y-14 px-4 py-10 md:px-6 md:py-16">
      <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 26 }} className="max-w-3xl space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-secondary"><Bot className="h-4 w-4" aria-hidden /> Drafts judged by AI</span>
        <h1 className="text-5xl leading-[1.05] md:text-7xl">Draft <span className="text-accent">anything.</span><br />Take the <span className="text-secondary">top pic.</span></h1>
        <p className="max-w-xl text-lg text-muted-foreground">Auctions, loadouts, blind rankings and more. Pick a mode, build your squad for a mission, and let the AI judge crown the winner.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/play/snake" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-black shadow-[0_0_30px_-6px_var(--accent)] transition-transform hover:-translate-y-0.5"><Sparkles className="h-5 w-5" aria-hidden /> Quick play</Link>
          <Link href="/toppic" className="inline-flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 font-semibold hover:bg-white/10">Play party mode</Link>
        </div>
        {resume && (
          <Link href={`/play/${resume.format}/game`} className="inline-flex items-center gap-2 rounded-xl border border-secondary/50 bg-primary/15 px-4 py-2 text-sm font-semibold">
            <RotateCcw className="h-4 w-4" aria-hidden /> Resume your {formatMeta(resume.format)?.title}
          </Link>
        )}
      </motion.header>

      <Section title="Game modes" sub="Six ways to draft. Every one is customizable.">
        {FORMATS.map((f) => (
          <motion.div key={f.id} variants={item}>
            <GameTile title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} href={`/play/${f.id}`} />
          </motion.div>
        ))}
      </Section>

      <section className="space-y-4">
        <div><h2 className="text-2xl">Pick a pool</h2><p className="text-sm text-muted-foreground">Jump straight into a Classic Draft with a pool.</p></div>
        <div className="flex flex-wrap gap-2">
          {CHARACTER_POOLS.map((p) => (
            <Link key={p.id} href={`/play/snake?pool=${p.id}`} className="min-h-11 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:border-secondary hover:bg-primary/20">{p.title}</Link>
          ))}
        </div>
      </section>

      <Section title="Classic Drafts" sub="Stat-based drafts with real players and characters.">
        {CLASSIC.map((g) => (
          <motion.div key={g.id} variants={item}><GameTile title={g.title} blurb={g.blurb} icon={g.icon} gradient={g.gradient} href={g.href} /></motion.div>
        ))}
      </Section>

      <Section title="Party" sub="Online-only. Everyone plays their best card.">
        <motion.div variants={item}><GameTile title={PARTY.title} blurb={PARTY.blurb} icon={PARTY.icon} gradient={PARTY.gradient} href={PARTY.href} /></motion.div>
      </Section>
    </main>
  );
}
