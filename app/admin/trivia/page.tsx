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
type Item = {
  kind: "category" | "survey"; id: string; pool: string; title: string; source: string; uses: number; retired: boolean;
  summary: Summary; clues?: { index: number; q: string; right: string; summary: Summary }[]; answers?: string[];
};

const stars = (q: number | null) => (q == null ? "no stars yet" : `${q.toFixed(1)} / 5`);
const diff = (d: number | null) => (d == null ? "no votes" : `${DIFF[Math.round(d)]} (${d.toFixed(1)})`);

function Stats({ s }: { s: Summary }) {
  return <span className="text-sm text-muted-foreground">{s.votes} vote{s.votes === 1 ? "" : "s"} · quality {stars(s.quality)} · difficulty {diff(s.difficulty)}{s.wrongFlags ? <span className="text-accent"> · {s.wrongFlags} say the answer is wrong</span> : null}</span>;
}

export default function TriviaReviewPage() {
  const { user, token } = useAuth();
  const [kind, setKind] = useState<"category" | "survey">("category");
  const [pool, setPool] = useState("");
  const [sort, setSort] = useState<"worst" | "best" | "votes">("worst");
  const [retired, setRetired] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const q = new URLSearchParams({ kind, sort, retired: retired ? "1" : "0", ...(pool ? { pool } : {}) });
      const res = await fetch(`${API_URL}/admin/trivia/review?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items);
    } catch (e: any) {
      setError(e.message);
    }
  }, [token, kind, sort, retired, pool]);

  useEffect(() => { if (user?.isAdmin) load(); }, [user?.isAdmin, load]);

  async function setItemRetired(item: Item, value: boolean) {
    if (!token) return;
    const res = await fetch(`${API_URL}/admin/trivia/retire`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind: item.kind, id: item.id, retired: value }) });
    if (res.ok) setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
    else setError("Could not update that item.");
  }

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
          <h1 className="text-3xl font-bold text-secondary">Trivia ratings</h1>
          <p className="text-sm text-muted-foreground">What players think of each category and survey. Items with at least 5 star votes under 2.4, or repeated &quot;answer is wrong&quot; flags, retire themselves. Retire or restore anything by hand.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Type <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as "category" | "survey")}><option value="category">Jeopardy categories</option><option value="survey">Feud surveys</option></select></label>
          <label className="text-sm">Topic <select className={sel} value={pool} onChange={(e) => setPool(e.target.value)}><option value="">All</option>{TRIVIA_POOLS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Sort <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as "worst" | "best" | "votes")}><option value="worst">Lowest quality first</option><option value="best">Highest quality first</option><option value="votes">Most votes first</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} /> Show retired</label>
        </div>
        {error && <p role="alert" className="text-accent">{error}</p>}
        {items == null ? <p className="text-muted-foreground">Loading…</p> : items.length === 0 ? <p className="text-muted-foreground">Nothing has been rated here yet.</p> : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="space-y-2 rounded-xl border border-white/10 bg-card/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{it.title} <span className="text-xs font-normal text-muted-foreground">· {it.pool} · {it.source} · played {it.uses}×</span></p>
                    <Stats s={it.summary} />
                  </div>
                  <button onClick={() => setItemRetired(it, !it.retired)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${it.retired ? "bg-primary" : "bg-accent/80"}`}>{it.retired ? "Restore" : "Retire"}</button>
                </div>
                {it.answers && <p className="text-sm text-muted-foreground">Board: {it.answers.join(", ")}</p>}
                {it.clues?.some((c) => c.summary.votes > 0) && (
                  <ul className="space-y-1 border-t border-white/10 pt-2 text-sm">
                    {it.clues.map((c) => <li key={c.index}><span className="text-muted-foreground">Clue {c.index + 1}:</span> {c.q} <span className="text-secondary">→ {c.right}</span><br /><Stats s={c.summary} /></li>)}
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
