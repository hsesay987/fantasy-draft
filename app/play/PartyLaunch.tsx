"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { createRoom, saveToken } from "./onlineApi";
import { loadPrefs, savePrefs } from "./storage";
import { PARTY_GAMES } from "./formats";
import { track } from "../lib/analytics";

/** Opens an empty room for party games: friends join on their phones, then the host picks Imposter or a vote deck. */
export function PartyLaunch() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(loadPrefs().name ?? ""), []);

  const open = async () => {
    if (!name.trim()) return setError("Enter your name first.");
    setBusy(true);
    setError(null);
    const r = await createRoom(null, name.trim());
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Couldn't open the room");
    saveToken(r.data.code, r.data.token);
    savePrefs({ name: name.trim() });
    track("room_created", { format: "party", pool: "none", seats_max: 10 });
    router.push(`/room/${r.data.code}`);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-secondary/30 bg-gradient-to-br from-primary/20 to-accent/10 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary">New · party games</p>
        <h2 className="text-2xl">Get the group on their phones</h2>
        <p className="text-sm text-muted-foreground">Open a room, everyone joins with the code, up to 10 players.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PARTY_GAMES.map((g) => (
          <li key={g.id} className="flex items-start gap-3 rounded-xl bg-black/20 p-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${g.gradient}`}><g.icon className="h-5 w-5" aria-hidden /></span>
            <span><b className="block">{g.title}</b><span className="text-sm text-muted-foreground">{g.tagline}</span></span>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); void open(); }} className="flex max-w-lg gap-2">
        <label className="sr-only" htmlFor="party-name">Your name</label>
        <input id="party-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 outline-none focus:border-secondary" />
        <button type="submit" disabled={busy} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-black disabled:opacity-50"><PartyPopper className="h-4 w-4" aria-hidden /> {busy ? "Opening…" : "Open room"}</button>
      </form>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    </section>
  );
}
