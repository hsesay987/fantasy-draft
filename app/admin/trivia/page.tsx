// app/admin/trivia/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { TRIVIA_POOLS } from "../../topicDraft/trivia";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const DIFF = ["", "Too easy", "Easy", "Just right", "Hard", "Too hard"];

type Summary = { votes: number; quality: number | null; qualityVotes: number; difficulty: number | null; wrongFlags: number };
type Mine = { quality: number | null; difficulty: number | null; wrong: boolean } | null;
type Clue = { index: number; q: string; right: string; wrong: string[]; summary: Summary; mine: Mine };
type Item = {
  kind: "category" | "survey"; id: string; pool: string; title: string; source: string; uses: number; retired: boolean; flagged: boolean;
  summary: Summary; mine: Mine; clues?: Clue[]; answers?: string[];
};

const stars = (q: number | null) => (q == null ? "no stars yet" : `${q.toFixed(1)} / 5`);
const diff = (d: number | null) => (d == null ? "no votes" : `${DIFF[Math.round(d)]} (${d.toFixed(1)})`);

function PlayerStats({ s }: { s: Summary }) {
  return <span className="text-sm text-muted-foreground">Players: {s.votes} vote{s.votes === 1 ? "" : "s"} · quality {stars(s.quality)} · difficulty {diff(s.difficulty)}{s.wrongFlags ? <span className="text-accent"> · {s.wrongFlags} say the answer is wrong</span> : null}</span>;
}

/** The admin's own rating: stars, difficulty, and "answer is wrong", which takes the item out of play at once. */
function AdminRate({ token, kind, id, clue = -1, mine, wrongLabel, onRetired }: { token: string; kind: "category" | "clue" | "survey"; id: string; clue?: number; mine: Mine; wrongLabel?: string; onRetired: () => void }) {
  const [v, setV] = useState<Mine>(mine);
  const [msg, setMsg] = useState("");
  const save = async (patch: Partial<NonNullable<Mine>>) => {
    const next = { quality: v?.quality ?? null, difficulty: v?.difficulty ?? null, wrong: v?.wrong ?? false, ...patch };
    setV(next);
    const res = await fetch(`${API_URL}/admin/trivia/rate`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind, id, ...(kind === "clue" ? { clue } : {}), quality: next.quality ?? undefined, difficulty: next.difficulty ?? undefined, wrong: next.wrong }) });
    if (!res.ok) return setMsg("Could not save.");
    const data = await res.json();
    setMsg(data.retired ? "Saved. Taken out of play." : "Saved.");
    if (data.retired) onRetired();
  };
  const btn = (on: boolean, danger = false) => `min-h-9 rounded-md px-3 text-xs font-semibold ${on ? (danger ? "bg-accent text-white" : "bg-primary text-white") : "bg-white/10 text-muted-foreground hover:bg-white/15"}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white/5 p-2" aria-label="Your rating">
      <span className="text-xs uppercase tracking-wider text-secondary">Your rating</span>
      <div className="flex" role="group" aria-label="Quality">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} aria-pressed={v?.quality === n} onClick={() => save({ quality: n })} className="px-1 text-2xl leading-none" style={{ color: (v?.quality ?? 0) >= n ? "#fbbf24" : "#475569" }}>★</button>)}</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Difficulty">{DIFF.slice(1).map((d, i) => <button key={d} type="button" aria-pressed={v?.difficulty === i + 1} onClick={() => save({ difficulty: i + 1 })} className={btn(v?.difficulty === i + 1)}>{d}</button>)}</div>
      {kind !== "category" && <button type="button" aria-pressed={!!v?.wrong} onClick={() => save({ wrong: !v?.wrong })} className={btn(!!v?.wrong, true)}>{wrongLabel ?? "Answer is wrong"}</button>}
      <span className="text-xs text-muted-foreground" aria-live="polite">{msg}</span>
    </div>
  );
}

export default function TriviaReviewPage() {
  const { user, token } = useAuth();
  const [kind, setKind] = useState<"category" | "survey">("category");
  const [pool, setPool] = useState("");
  const [sort, setSort] = useState<"worst" | "best" | "votes">("worst");
  const [status, setStatus] = useState<"active" | "retired" | "flagged" | "all">("active");
  const [unrated, setUnrated] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const q = new URLSearchParams({ kind, sort, status, unrated: unrated ? "1" : "0", ...(pool ? { pool } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
      const res = await fetch(`${API_URL}/admin/trivia/review?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items);
    } catch (e: any) {
      setError(e.message);
    }
  }, [token, kind, sort, status, unrated, pool, search]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [user?.isAdmin, load, search]);

  const post = async (path: string, body: object) => {
    if (!token) return false;
    const res = await fetch(`${API_URL}/admin/trivia/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!res.ok) setError("Could not update that item.");
    return res.ok;
  };
  const patchItem = (id: string, patch: Partial<Item>) => setItems((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);
  const setRetired = async (it: Item, v: boolean) => { if (await post("retire", { kind: it.kind, id: it.id, retired: v })) patchItem(it.id, { retired: v }); };
  const setFlagged = async (it: Item, v: boolean) => { if (await post("flag", { kind: it.kind, id: it.id, flagged: v })) patchItem(it.id, { flagged: v }); };

  if (!user?.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-foreground">
        <div className="max-w-md space-y-4 text-center"><ShieldOff className="mx-auto h-10 w-10 text-amber-300" /><p className="text-lg font-semibold">Admin access only</p><Link href="/" className="text-secondary underline">Return home</Link></div>
      </main>
    );
  }

  const sel = "min-h-10 rounded-lg border border-white/10 bg-card px-3 text-sm";
  return (
    <main className="min-h-screen p-6 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground underline">Control Room</Link>
          <h1 className="text-3xl font-bold text-secondary">Trivia review</h1>
          <p className="text-sm text-muted-foreground">Rate any category, clue or survey yourself (stars, difficulty, answer is wrong), flag it for later, or retire it. Your rating is shown apart from the players&apos;. Marking an answer wrong retires the item at once. Player votes retire an item on their own after 5 or more votes under 2.4 stars, or repeated &quot;wrong&quot; flags.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Type<br /><select className={sel} value={kind} onChange={(e) => setKind(e.target.value as "category" | "survey")}><option value="category">Summit categories</option><option value="survey">Hot Air surveys</option></select></label>
          <label className="text-sm">Topic<br /><select className={sel} value={pool} onChange={(e) => setPool(e.target.value)}><option value="">All</option>{TRIVIA_POOLS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Show<br /><select className={sel} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="active">In play</option><option value="flagged">Flagged for review</option><option value="retired">Retired</option><option value="all">Everything</option></select></label>
          <label className="text-sm">Sort<br /><select className={sel} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="worst">Lowest quality first</option><option value="best">Highest quality first</option><option value="votes">Most votes first</option></select></label>
          <label className="text-sm">Search<br /><input className={sel} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, question or answer" /></label>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={unrated} onChange={(e) => setUnrated(e.target.checked)} /> Include unrated</label>
        </div>
        {error && <p role="alert" className="text-accent">{error}</p>}
        {items == null ? <p className="text-muted-foreground">Loading…</p> : items.length === 0 ? <p className="text-muted-foreground">Nothing here yet. Tick &quot;Include unrated&quot; to rate items nobody has voted on.</p> : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className={`space-y-3 rounded-xl border bg-card/70 p-4 ${it.flagged ? "border-amber-400/60" : "border-white/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{it.title} <span className="text-xs font-normal text-muted-foreground">· {it.pool} · {it.source} · played {it.uses}×</span>{it.flagged && <span className="ml-2 rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">Flagged</span>}{it.retired && <span className="ml-2 rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">Retired</span>}</p>
                    <PlayerStats s={it.summary} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setFlagged(it, !it.flagged)} className="min-h-10 rounded-lg bg-amber-400/20 px-4 text-sm font-semibold text-amber-200">{it.flagged ? "Clear flag" : "Flag"}</button>
                    <button onClick={() => setRetired(it, !it.retired)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${it.retired ? "bg-primary" : "bg-accent/80"}`}>{it.retired ? "Restore" : "Retire"}</button>
                  </div>
                </div>
                {token && <AdminRate token={token} kind={it.kind} id={it.id} mine={it.mine} wrongLabel="Board is wrong" onRetired={() => patchItem(it.id, { retired: true })} />}
                {it.answers && <p className="text-sm"><span className="text-muted-foreground">Board:</span> <span className="text-emerald-300">{it.answers.join(", ")}</span></p>}
                {it.clues && (
                  <ul className="space-y-3 border-t border-white/10 pt-3">
                    {it.clues.map((c) => (
                      <li key={c.index} className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Clue {c.index + 1}:</span> {c.q} <span className="font-semibold text-emerald-300">→ {c.right}</span>{c.wrong.length > 0 && <span className="text-rose-300"> (not: {c.wrong.join(", ")})</span>}</p>
                        <PlayerStats s={c.summary} />
                        {token && <AdminRate token={token} kind="clue" id={it.id} clue={c.index} mine={c.mine} onRetired={() => patchItem(it.id, { retired: true })} />}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
