"use client";

import { motion, useReducedMotion } from "motion/react";
import { Clapperboard, Trophy } from "lucide-react";
import type { Story } from "../../play/judging";

/** The play-by-play under a draft result: a title, the setting, beats that tick in one by one, and why the winner won. */
export function StoryCard({ story, loading }: { story: Story | null | undefined; loading: boolean }) {
  const still = useReducedMotion();
  if (!story) {
    return loading ? (
      <div role="status" className="rounded-2xl border border-white/10 bg-card/60 p-5 text-sm text-muted-foreground">
        <Clapperboard className="mr-2 inline h-4 w-4 animate-pulse align-[-2px]" aria-hidden /> Writing the play-by-play…
      </div>
    ) : null;
  }
  const step = still ? 0 : 0.6;
  return (
    <motion.section aria-label="Play-by-play" initial={still ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-secondary/40 bg-card/80 p-5">
      <p className="text-xs uppercase tracking-widest text-secondary"><Clapperboard className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />The matchup</p>
      <h3 className="mt-1 text-2xl">{story.title}</h3>
      {story.setting && <p className="mt-1 text-sm text-muted-foreground">{story.setting}</p>}
      <ol className="mt-4 space-y-3 border-l-2 border-secondary/40 pl-4">
        {story.beats.map((b, i) => (
          <motion.li key={i} initial={still ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * step }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">{b.label}{b.side && <span className="ml-2 normal-case tracking-normal text-muted-foreground">· {b.side}</span>}</p>
            <p className="text-pretty">{b.text}</p>
          </motion.li>
        ))}
      </ol>
      <motion.p initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + story.beats.length * step }} className="mt-4 rounded-xl bg-accent/15 px-4 py-3 font-semibold">
        <Trophy className="mr-2 inline h-4 w-4 align-[-2px] text-accent" aria-hidden />{story.why}
      </motion.p>
    </motion.section>
  );
}
