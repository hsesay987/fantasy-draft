"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Crown, Bot, RotateCcw, Share2, Repeat } from "lucide-react";
import { Button, Card } from "../../components/ui";
import type { Verdict } from "../../play/judging";

export function VerdictView({ verdict, loading, onAgain, onRematch, extra, shareText, mission }: { verdict: Verdict | null; loading: boolean; onAgain: () => void; onRematch?: () => void; extra?: React.ReactNode; shareText?: string; mission?: string }) {
  const [copied, setCopied] = useState(false);
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
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="rounded-2xl border border-accent/50 bg-gradient-to-br from-accent/20 to-primary/20 p-6 text-center"
      >
        <Crown className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <p className="mt-2 text-sm uppercase tracking-widest text-muted-foreground">Winner</p>
        <h2 className="text-4xl">{verdict.winner}</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{verdict.summary}</p>
        {verdict.source === "fallback" && (
          <p className="mt-2 text-xs text-muted-foreground">AI judge unavailable — scored by the numbers.</p>
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
                <span className="font-display text-3xl text-secondary">{Math.round(t.score)}</span>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {t.highlights.map((h, k) => <li key={k}>{h}</li>)}
              </ul>
              {t.roast && <p className="mt-3 border-l-2 border-accent pl-3 text-sm italic text-muted-foreground">“{t.roast}”</p>}
            </Card>
          </motion.div>
        ))}
      </div>
      {extra}
      <div className="flex flex-wrap justify-center gap-3">
        {onRematch && <Button onClick={onRematch}><Repeat className="h-4 w-4" aria-hidden /> Rematch</Button>}
        <Button variant="ghost" onClick={onAgain}><RotateCcw className="h-4 w-4" aria-hidden /> New game</Button>
        {shareText && (
          <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}>
            <Share2 className="h-4 w-4" aria-hidden /> {copied ? "Copied!" : "Copy result"}
          </Button>
        )}
      </div>
    </div>
  );
}
