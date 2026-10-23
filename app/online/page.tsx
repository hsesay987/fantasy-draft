// app/online/page.tsx
"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, PlusCircle, LogIn, Search } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Link from "next/link";
import { GameTile, PageShell, Panel } from "../components/ui";
import { Chip } from "../components/ui";
import { FORMATS } from "../play/formats";
import { PARTY } from "../topicDraft/games";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
type League = "NBA" | "NFL" | "CARTOON";

export default function OnlinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen text-foreground p-6">Loading…</div>}>
      <OnlinePageInner />
    </Suspense>
  );
}

function OnlinePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();

  const queryLeague = useMemo(
    () => (searchParams.get("league") || "").toUpperCase(),
    [searchParams]
  );
  const initialLeague: League =
    queryLeague === "NFL"
      ? "NFL"
      : queryLeague === "CARTOON"
      ? "CARTOON"
      : "NBA";

  const [joinCodeState, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<League>(initialLeague);
  const [code, setCode] = useState("");
  const [finding, setFinding] = useState(false);

  const isPremium =
    !!user?.isAdmin ||
    !!user?.isFounder ||
    (!!user?.subscriptionTier &&
      (!user?.subscriptionEnds ||
        new Date(user.subscriptionEnds).getTime() > Date.now()));

  const requiresPremium = league === "NFL" || league === "CARTOON";

  /* -------------------- CREATE ROOM -------------------- */
  async function handleCreateRoom() {
    if (!token) {
      alert("Log in to create online draft rooms.");
      router.push("/login");
      return;
    }

    if (requiresPremium && !isPremium) {
      router.push("/account/subscription");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gameType: "DRAFT",
          isPublic: false,
          name: `Online ${league} Draft`,
          league,
          settings:
            league === "CARTOON"
              ? {
                  cartoonDraftType: "character",
                  cartoonMode: "classic",
                  pickTimerSeconds: 60,
                }
              : undefined,
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to create room");
      }

      const room = await res.json();
      localStorage.setItem("activeRoomCode", room.code);
      localStorage.removeItem("activeRoomDraftId");
      router.push(`/online/room/${room.code}?league=${room.league || league}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* -------------------- JOIN ROOM -------------------- */
  async function handleJoinRoom(codeArg?: string) {
    const joinCode = (codeArg ?? joinCodeState).trim();
    if (!joinCode) return;

    if (!token) {
      alert("Log in to join online draft rooms.");
      router.push("/login");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/rooms/${joinCode}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to join room");
      }

      const room = await res.json();
      localStorage.setItem("activeRoomCode", room.code);
      if (room.status === "in_progress" && room.gameId) {
        localStorage.setItem("activeRoomDraftId", room.gameId);
        router.push(`/draft/${room.gameId}`);
        return;
      }

      localStorage.removeItem("activeRoomDraftId");
      const roomLeague =
        (room.league || league || "NBA").toString().toUpperCase();
      router.push(`/online/room/${joinCode}?league=${roomLeague}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /** One box for every kind of room: new TopPic rooms first, then NBA/NFL/Cartoon draft rooms. */
  async function handleFindRoom() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    setFinding(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/play-rooms/${encodeURIComponent(c)}`);
      if (res.ok) {
        router.push(`/room/${c}`);
        return;
      }
    } catch {
      /* fall through to the stat draft rooms */
    } finally {
      setFinding(false);
    }
    setJoinCode(c);
    if (!token) {
      setError("That is not an open TopPic room. If it is an NBA, NFL or Cartoon room, log in to join it.");
      return;
    }
    await handleJoinRoom(c);
  }

  return (
    <PageShell width="lg" className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-4xl md:text-5xl">Play online</h1>
        <p className="max-w-2xl text-muted-foreground">Host a room, share the code, and draft, bid or answer trivia against your friends. Everyone plays on their own device.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-accent">{error}</div>}

      <Panel title="Join a room" hint="Got a code from a friend? Paste it here. Works for every kind of room.">
        <form onSubmit={(e) => { e.preventDefault(); handleFindRoom(); }} className="flex max-w-lg gap-2">
          <label className="sr-only" htmlFor="room-code">Room code</label>
          <input id="room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="Room code" autoComplete="off"
            className="min-h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 font-display uppercase tracking-widest outline-none focus:border-secondary" />
          <button type="submit" disabled={code.length < 4 || finding || loading} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-black disabled:opacity-50"><Search className="h-4 w-4" aria-hidden /> {finding ? "Looking…" : "Join"}</button>
        </form>
      </Panel>

      <section className="space-y-4">
        <div><h2 className="text-2xl">Host a TopPic room</h2><p className="text-sm text-muted-foreground">Pick a game. You choose the topic and rules on the next screen, then get a room code to share. No account needed.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.filter((f) => f.id !== "loadout").map((f) => (
            <GameTile key={f.id} title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} href={`/play/${f.id}?online=1`} />
          ))}
          <GameTile title={PARTY.title} blurb="The party card game. Up to 20 players, AI or friends judge." icon={PARTY.icon} gradient={PARTY.gradient} href={PARTY.href} />
        </div>
      </section>

      <Panel title="NBA, NFL and Cartoon draft rooms" hint="The classic stat drafts, played live with friends. Needs a login; NFL and Cartoon need a premium plan.">
        <div className="flex flex-wrap items-center gap-2">
          {(["NBA", "NFL", "CARTOON"] as League[]).map((lg) => <Chip key={lg} selected={league === lg} onClick={() => setLeague(lg)}>{lg}</Chip>)}
          {requiresPremium && !isPremium && <span className="text-xs text-secondary">Premium required for {league} online rooms.</span>}
        </div>
        <button onClick={handleCreateRoom} disabled={loading} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold disabled:opacity-60"><Users className="h-4 w-4" aria-hidden /> Create {league} room</button>
        {!user && <p className="text-xs text-muted-foreground">You are not logged in. <Link href="/login" className="text-secondary underline">Log in</Link> to host or join these rooms.</p>}
      </Panel>
    </PageShell>
  );
}
