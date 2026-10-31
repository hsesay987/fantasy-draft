// app/page.tsx — TopPic hub: choose a topic, then a draft type
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Sparkles, Bot, RotateCcw, LogIn, Users } from "lucide-react";
import { GameTile, PageShell } from "./components/ui";
import { TOPICS } from "./play/categories";
import { formatMeta } from "./play/formats";
import { loadPrefs, resumable, savePrefs } from "./play/storage";
import { createRoom, saveToken } from "./play/onlineApi";
import { track } from "./lib/analytics";
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
  const [hostName, setHostName] = useState("");
  const [creating, setCreating] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  useEffect(() => {
    setResume(resumable()?.setup ?? null);
    setHostName(loadPrefs().name ?? "");
  }, []);

  /** An empty room: friends join first, then the host picks games one after another in the lobby. */
  async function hostRoom() {
    if (!hostName.trim()) return setRoomError("Enter your name first.");
    setCreating(true);
    setRoomError(null);
    const r = await createRoom(null, hostName.trim());
    setCreating(false);
    if (!r.ok) return setRoomError(r.data.error ?? "Couldn't create the room");
    saveToken(r.data.code, r.data.token);
    savePrefs({ name: hostName.trim() });
    track("room_created", { format: "none", pool: "none", seats_max: 6 });
    router.push(`/room/${r.data.code}`);
  }

  return (
    <PageShell width="lg" className="space-y-14 md:py-16">
      <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 26 }} className="max-w-3xl space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-secondary"><Bot className="h-4 w-4" aria-hidden /> Drafts judged by AI</span>
        <h1 className="text-5xl leading-[1.05] md:text-7xl">Draft <span className="text-accent">anything.</span><br />Choose the <span className="text-secondary">top pic.</span></h1>
        <p className="max-w-xl text-lg text-muted-foreground">Choose the TopPic, decide how to draft it, and let the AI judge crown the winner.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/play/spin?pool=superheroes" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-black shadow-[0_0_30px_-6px_var(--accent)] transition-transform hover:-translate-y-0.5"><Sparkles className="h-5 w-5" aria-hidden /> Quick play</Link>
          <Link href="/toppic" className="inline-flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 font-semibold hover:bg-white/10">Play party mode</Link>
        </div>
        <div className="grid max-w-2xl gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); void hostRoom(); }} className="space-y-2">
            <p className="text-sm font-semibold">Play with friends online</p>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="host-name">Your name</label>
              <input id="host-name" value={hostName} maxLength={20} onChange={(e) => setHostName(e.target.value)} placeholder="Your name" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 outline-none focus:border-secondary" />
              <button type="submit" disabled={creating} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 font-semibold disabled:opacity-50"><Users className="h-4 w-4" aria-hidden /> {creating ? "Opening…" : "Create room"}</button>
            </div>
            {roomError && <p role="alert" className="text-xs text-accent">{roomError}</p>}
          </form>
          <form onSubmit={(e) => { e.preventDefault(); if (joinCode.trim()) router.push(`/room/${joinCode.trim().toUpperCase()}`); }} className="space-y-2">
            <p className="text-sm font-semibold">Got a code?</p>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="join-code">Room code</label>
              <input id="join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="Room code" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 font-display uppercase tracking-widest outline-none focus:border-secondary" />
              <button type="submit" disabled={!joinCode.trim()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 font-semibold hover:bg-white/10 disabled:opacity-50"><LogIn className="h-4 w-4" aria-hidden /> Join</button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground sm:col-span-2">One room for the whole night: pick a game, play, then pick the next one. Nobody has to rejoin.</p>
        </div>
        {resume && (
          <Link href={`/play/${resume.format}/game`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-secondary/50 bg-primary/15 px-4 text-sm font-semibold">
            <RotateCcw className="h-4 w-4" aria-hidden /> Resume your {formatMeta(resume.format)?.title}
          </Link>
        )}
      </motion.header>

      <Group title="Choose the TopPic" sub="Pick a topic, then how to play it: auctions, blind rankings, stat drafts and more.">
        {TOPICS.map((t) => (
          <motion.div key={t.id} variants={item}><GameTile title={t.title} blurb={t.blurb} iconSrc={t.iconSrc} gradient={t.gradient} href={`/category/${t.id}`} /></motion.div>
        ))}
      </Group>
    </PageShell>
  );
}
