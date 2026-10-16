"use client";

import { useEffect, useState } from "react";
import { Confetti } from "../../components/Confetti";
import { useCountUp } from "../../components/useCountUp";
import { useSound } from "../../components/SoundProvider";
import { track } from "../../lib/analytics";
import { motion } from "motion/react";
import { Crown, Bot, RotateCcw, Share2, Repeat } from "lucide-react";
import { Button, Card } from "../../components/ui";
import type { Verdict } from "../../play/judging";

export function VerdictView({ verdict, loading, onAgain, onRematch, extra, shareText, mission, format }: { verdict: Verdict | null; loading: boolean; onAgain: () => void; onRematch?: () => void; extra?: React.ReactNode; shareText?: string; mission?: string; format?: string }) {
  const [copied, setCopied] = useState(false);
  const { play } = useSound();
  useEffect(() => {
    if (verdict) {
      play("win");
      const sorted = [...verdict.teams].sort((a, b) => b.score - a.score);
      track("verdict_shown", { format, source: verdict.source, winner_score: Math.round(sorted[0]?.score ?? 0), margin: sorted[1] ? Math.round(sorted[0]!.score - sorted[1].score) : null, players: sorted.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!verdict]);
  if (loading || !verdict) {
    return (
      <Card className="space-y-4" >
        <div role="status" className="flex items-center gap-3 text-secondary">
          <Bot className="h-6 w-6 animate-pulse" aria-hidden />
          <span className="font-display text-xl">The judge is deliberating…</span>
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
        ))}
      </Card>
    );
  }
  const sorted = [...verdict.teams].sort((a, b) => b.score - a.score);
  const solo = sorted.length === 1;
  return (
    <div className="space-y-4">
      <Confetti />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="rounded-2xl border border-accent/50 bg-gradient-to-br from-accent/20 to-primary/20 p-6 text-center"
      >
        <Crown className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <p className="mt-2 text-sm uppercase tracking-widest text-muted-foreground">{solo ? "Your score" : "Winner"}</p>
        <h2 className="text-4xl">{solo ? <Score value={Math.round(sorted[0]!.score)} delay={200} plain /> : verdict.winner}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-foreground/90">{verdict.summary}</p>
        {verdict.source === "fallback" && (
          <p className="mt-2 text-xs text-muted-foreground">AI judge unavailable — analysis generated from the numbers.</p>
        )}
      </motion.div>
      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((t, i) => (
          <motion.div
            key={t.player}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.12 }}
          >
            <Card className="h-full">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl">#{i + 1} {t.player}</h3>
                <Score value={Math.round(t.score)} delay={400 + i * 250} />
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {t.highlights.map((h, k) => <li key={k}>{h}</li>)}
              </ul>
              {(t.strengths?.length || t.weaknesses?.length) ? (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {t.strengths?.length ? <div><p className="text-xs uppercase tracking-wider text-success">Strengths</p><ul className="mt-1 space-y-1">{t.strengths.map((x, k) => <li key={k}>{x}</li>)}</ul></div> : null}
                  {t.weaknesses?.length ? <div><p className="text-xs uppercase tracking-wider text-accent">Weak spots</p><ul className="mt-1 space-y-1">{t.weaknesses.map((x, k) => <li key={k}>{x}</li>)}</ul></div> : null}
                </div>
              ) : null}
              {t.roast && <p className="mt-3 border-l-2 border-accent pl-3 text-sm italic text-muted-foreground">“{t.roast}”</p>}
            </Card>
          </motion.div>
        ))}
      </div>
      {(verdict.analysis?.length || verdict.statsTable?.length) ? (
        <Card className="space-y-5">
          <h3 className="text-xl">Judge&apos;s analysis</h3>
          {verdict.statsTable?.length ? (
            <div className="space-y-3" aria-label="Stat comparison">
              {verdict.statsTable.map((row) => (
                <div key={row.key}>
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{row.key}</p>
                  <div className="space-y-1">
                    {sorted.map((t, i) => (
                      <div key={t.player} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 truncate">{t.player}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <motion.div className="h-full rounded-full" style={{ background: i === 0 ? "var(--accent)" : "var(--secondary)" }} initial={{ width: 0 }} animate={{ width: `${row.values[t.player] ?? 0}%` }} transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }} />
                        </div>
                        <span className="w-8 text-right tabular-nums text-muted-foreground">{row.values[t.player] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
            {verdict.analysis?.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </Card>
      ) : null}
      {extra}
      <div className="flex flex-wrap justify-center gap-3">
        {onRematch && <Button onClick={() => { track("rematch_clicked", { format }); onRematch(); }}><Repeat className="h-4 w-4" aria-hidden /> Rematch</Button>}
        <Button variant="ghost" onClick={onAgain}><RotateCcw className="h-4 w-4" aria-hidden /> New game</Button>
        {shareText && (
          <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(shareText); track("share_clicked", { format }); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}>
            <Share2 className="h-4 w-4" aria-hidden /> {copied ? "Copied!" : "Copy result"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Score({ value, delay, plain }: { value: number; delay: number; plain?: boolean }) {
  const v = useCountUp(value, 1000, delay);
  return plain ? <>{v}</> : <span className="font-display text-3xl text-secondary tabular-nums">{v}</span>;
}
