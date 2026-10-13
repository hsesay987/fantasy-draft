// app/page.tsx — TopPic hub
"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Sparkles, Bot } from "lucide-react";
import { GameTile } from "./components/ui";
import { TOPIC_GAMES, CLASSIC, PARTY } from "./topicDraft/games";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28 } },
};

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl">{title}</h2>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {children}
      </motion.div>
    </section>
  );
}

export default function Home() {
  const live = TOPIC_GAMES.filter((g) => g.live);
  const soon = TOPIC_GAMES.filter((g) => !g.live);

  return (
    <main className="mx-auto max-w-7xl space-y-14 px-4 py-10 md:px-6 md:py-16">
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 26 }}
        className="max-w-3xl space-y-5"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-secondary">
          <Bot className="h-4 w-4" aria-hidden /> Drafts judged by AI
        </span>
        <h1 className="text-5xl leading-[1.05] md:text-7xl">
          Draft <span className="text-accent">anything.</span>
          <br />
          Take the <span className="text-secondary">top pic.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Pick a topic, build your squad for a mission, and let an AI judge crown the winner. Solo, pass-and-play, or
          live with friends.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/topic/superheroes"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-black shadow-[0_0_30px_-6px_var(--accent)] transition-transform hover:-translate-y-0.5"
          >
            <Sparkles className="h-5 w-5" aria-hidden /> Start a Superhero draft
          </Link>
          <Link
            href="/toppic"
            className="inline-flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 font-semibold hover:bg-white/10"
          >
            Play party mode
          </Link>
        </div>
      </motion.header>

      <Section title="Topic Drafts" sub="Pick a topic. Set the rules. Beat your friends or the AI.">
        {live.map((g) => (
          <motion.div key={g.id} variants={item}>
            <GameTile title={g.title} blurb={g.blurb} icon={g.icon} gradient={g.gradient} href={`/topic/${g.id}`} badge="New" />
          </motion.div>
        ))}
        {soon.map((g) => (
          <motion.div key={g.id} variants={item}>
            <GameTile title={g.title} blurb={g.blurb} icon={g.icon} gradient={g.gradient} soon />
          </motion.div>
        ))}
      </Section>

      <Section title="Classic Drafts" sub="Stat-based drafts with real players and characters.">
        {CLASSIC.map((g) => (
          <motion.div key={g.id} variants={item}>
            <GameTile title={g.title} blurb={g.blurb} icon={g.icon} gradient={g.gradient} href={g.href} />
          </motion.div>
        ))}
      </Section>

      <Section title="Party" sub="Online-only. Everyone plays their best card.">
        <motion.div variants={item}>
          <GameTile title={PARTY.title} blurb={PARTY.blurb} icon={PARTY.icon} gradient={PARTY.gradient} href={PARTY.href} />
        </motion.div>
      </Section>
    </main>
  );
}
