"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Shared layout pieces for the NBA, NFL and Cartoon stat draft screens, so they read like the rest of TopPic:
// one header with the actions, one banner for whose turn it is, and titled sections in the same card style.

type Tone = "primary" | "ghost" | "danger" | "success";
const TONES: Record<Tone, string> = {
  primary: "bg-primary text-white hover:bg-[#8b5cf6]",
  ghost: "border border-white/10 bg-white/5 hover:bg-white/10",
  danger: "border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
  success: "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
};

export function DraftButton({ tone = "ghost", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button type="button" {...rest} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]} ${className}`} />;
}

/** Title, league, a few facts about the draft as chips, and the draft's actions on the right. */
export function DraftTopBar({ league, title, facts, actions, back }: { league: string; title: string; facts: (string | null | undefined | false)[]; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="space-y-3">
      {back && (
        <Link href={back.href} className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-white">
          <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <span className="inline-flex rounded-full border border-secondary/40 bg-primary/15 px-3 py-1 text-xs font-semibold tracking-wide text-secondary">{league} stat draft</span>
          <h1 className="text-3xl md:text-4xl">{title}</h1>
          <div className="flex flex-wrap gap-2">
            {facts.filter(Boolean).map((f) => <span key={String(f)} className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">{f}</span>)}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Whose turn it is, how long they have, and whether this screen can pick. */
export function TurnBanner({ who, detail, seconds, mine, note, done, children }: { who: string | null; detail?: string; seconds?: number | null; mine?: boolean; note?: ReactNode; done?: boolean; children?: ReactNode }) {
  const urgent = seconds != null && seconds <= 10;
  return (
    <section aria-live="polite" className={`flex flex-wrap items-center gap-4 rounded-2xl border p-4 md:p-5 ${mine ? "border-secondary/60 bg-primary/20 shadow-[0_0_40px_-16px_var(--primary)]" : "border-white/10 bg-card/70"}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{done ? "Draft complete" : mine ? "Your pick" : "On the clock"}</p>
        <p className="truncate text-2xl font-semibold">{done ? "Every slot is filled" : who ?? "—"}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
      </div>
      {seconds != null && !done && (
        <span className={`grid h-14 w-14 place-items-center rounded-full border-2 font-display text-xl tabular-nums ${urgent ? "border-accent text-accent" : "border-secondary text-secondary"}`} aria-label={`${seconds} seconds left`}>{seconds}</span>
      )}
      {children && <div className="w-full sm:w-auto">{children}</div>}
    </section>
  );
}

/** A titled card, the same look as the setup screens' panels. */
export function DraftSection({ title, hint, actions, children, className = "" }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-4 rounded-2xl border border-white/10 bg-card/70 p-4 md:p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
