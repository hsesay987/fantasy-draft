"use client";

import { motion, useReducedMotion } from "motion/react";
import { Clapperboard, Trophy } from "lucide-react";
import type { Story } from "../../play/judging";
import { CharacterAvatar } from "../../components/CharacterAvatar";

/** One team's line-up for the matchup card. `q` is the picture query, when the pick has one. */
export type Roster = { player: string; picks: { name: string; q?: string }[] };

/** Who's fighting: every team and its characters, side by side, before the story starts. */
function Lineup({ rosters, winner }: { rosters: Roster[]; winner?: string }) {
  return (
    <div className={`mt-4 grid gap-3 ${rosters.length === 2 ? "grid-cols-2" : "sm:grid-cols-2"}`} aria-label="Line-ups">
      {rosters.map((r) => (
        <div key={r.player} className={`min-w-0 rounded-xl border p-3 ${r.player === winner ? "border-accent/50 bg-accent/10" : "border-white/10 bg-white/5"}`}>
          <p className="truncate text-sm font-semibold">{r.player}</p>
          <ul className="mt-2 space-y-1.5">
            {r.picks.map((p) => (
              <li key={p.name} className="flex min-w-0 items-center gap-2 text-sm">
                <CharacterAvatar name={p.name} query={p.q} size={24} className="shrink-0 !rounded-md" />
                <span className="min-w-0 break-words leading-tight">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The play-by-play under a draft result: a title, the setting, beats that tick in one by one, and why the winner won. */
export function StoryCard({ story, loading, rosters, winner }: { story: Story | null | undefined; loading: boolean; rosters?: Roster[]; winner?: string }) {
  const still = useReducedMotion();
  if (!story) {
    return loading ? (
      <div role="status" className="rounded-2xl border border-white/10 bg-card/60 p-5 text-sm text-muted-foreground">
        <Clapperboard className="mr-2 inline h-4 w-4 animate-pulse align-[-2px]" aria-hidden /> Writing the play-by-play…
        {rosters?.length ? <Lineup rosters={rosters} winner={winner} /> : null}
      </div>
    ) : null;
  }
  const step = still ? 0 : 0.6;
  return (
    <motion.section aria-label="Play-by-play" initial={still ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-secondary/40 bg-card/80 p-5">
      <p className="text-xs uppercase tracking-widest text-secondary"><Clapperboard className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />The matchup</p>
      <h3 className="mt-1 text-2xl">{story.title}</h3>
      {rosters?.length ? <Lineup rosters={rosters} winner={winner} /> : null}
      {story.setting && <p className="mt-4 text-sm text-muted-foreground">{story.setting}</p>}
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
