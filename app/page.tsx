// app/page.tsx — TopPic hub: choose a topic, then a draft type
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Sparkles, Bot, RotateCcw, LogIn } from "lucide-react";
import { GameTile, PageShell } from "./components/ui";
import { PARTY } from "./topicDraft/games";
import { CATEGORIES, LEAGUES } from "./play/categories";
import { formatMeta } from "./play/formats";
import { resumable } from "./play/storage";
import type { GameSetup } from "./play/types";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28 } } };

function Group({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
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
  const router = useRouter();
  const [resume, setResume] = useState<GameSetup | null>(null);
  const [joinCode, setJoinCode] = useState("");
  useEffect(() => setResume(resumable()?.setup ?? null), []);

  return (
    <PageShell width="lg" className="space-y-14 md:py-16">
      <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 26 }} className="max-w-3xl space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-secondary"><Bot className="h-4 w-4" aria-hidden /> Drafts judged by AI</span>
        <h1 className="text-5xl leading-[1.05] md:text-7xl">Draft <span className="text-accent">anything.</span><br />Take the <span className="text-secondary">top pic.</span></h1>
        <p className="max-w-xl text-lg text-muted-foreground">Choose the TopPic, decide how to draft it, and let the AI judge crown the winner.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/play/spin?pool=superheroes" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-black shadow-[0_0_30px_-6px_var(--accent)] transition-transform hover:-translate-y-0.5"><Sparkles className="h-5 w-5" aria-hidden /> Quick play</Link>
          <Link href="/toppic" className="inline-flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 font-semibold hover:bg-white/10">Play party mode</Link>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (joinCode.trim()) router.push(`/room/${joinCode.trim().toUpperCase()}`); }} className="flex max-w-sm gap-2">
          <label className="sr-only" htmlFor="join-code">Room code</label>
          <input id="join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="Friend's room code" className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 font-display uppercase tracking-widest outline-none focus:border-secondary" />
          <button type="submit" disabled={!joinCode.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 font-semibold hover:bg-white/10 disabled:opacity-50"><LogIn className="h-4 w-4" aria-hidden /> Join</button>
        </form>
        {resume && (
          <Link href={`/play/${resume.format}/game`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-secondary/50 bg-primary/15 px-4 text-sm font-semibold">
            <RotateCcw className="h-4 w-4" aria-hidden /> Resume your {formatMeta(resume.format)?.title}
          </Link>
        )}
      </motion.header>

      <Group title="Choose the TopPic" sub="Auctions, loadouts, blind rankings and more for every one.">
        {CATEGORIES.filter((c) => !c.hidden).map((c) => (
          <motion.div key={c.id} variants={item}><GameTile title={c.title} blurb={c.blurb} iconSrc={c.iconSrc} gradient={c.gradient} href={`/category/${c.id}`} /></motion.div>
        ))}
      </Group>

      <Group title="Stat drafts" sub="Real players and shows with career stats.">
        {LEAGUES.map((g) => (
          <motion.div key={g.id} variants={item}><GameTile title={g.title} blurb={g.blurb} iconSrc={g.iconSrc} gradient={g.gradient} href={g.href} /></motion.div>
        ))}
        <motion.div variants={item}><GameTile title={PARTY.title} blurb={PARTY.blurb} icon={PARTY.icon} gradient={PARTY.gradient} href={PARTY.href} /></motion.div>
      </Group>
    </PageShell>
  );
}
