// app/online/page.tsx
"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, PlusCircle, LogIn } from "lucide-react";
import { useAuth } from "../hooks/useAuth"; // adjust path if needed

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
type League = "NBA" | "NFL" | "CARTOON";

export default function OnlinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-50 p-6">Loading…</div>}>
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

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<League>(initialLeague);

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
  async function handleJoinRoom() {
    if (!joinCode.trim()) return;

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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-indigo-300">
          Online Drafts
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Create or join live draft rooms with friends.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg bg-red-900/30 border border-red-500/50 px-4 py-3 text-sm text-red-200">
      ⚠ {error}
    </div>
  )}

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-300">Choose league:</span>
        <div className="inline-flex rounded-full bg-slate-900 border border-slate-800 p-1">
          {(["NBA", "NFL", "CARTOON"] as League[]).map((lg) => (
            <button
              key={lg}
              onClick={() => setLeague(lg)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                league === lg
                  ? "bg-indigo-500 text-slate-900"
                  : "text-slate-200 hover:text-white"
              }`}
            >
              {lg}
            </button>
          ))}
        </div>
        {requiresPremium && !isPremium && (
          <span className="text-xs text-amber-300">
            Premium required for {league} online rooms.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* CREATE ROOM */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
          <div className="flex items-center gap-3 mb-3">
            <PlusCircle className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-semibold">Create Room</h2>
          </div>

          <p className="text-sm text-slate-400 mb-6">
            Host a private online {league} draft and invite others with a code.
          </p>

          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Users className="w-4 h-4" />
            Create Online Draft Room
          </button>
        </div>

        {/* JOIN ROOM */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
          <div className="flex items-center gap-3 mb-3">
            <LogIn className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-semibold">Join Room</h2>
          </div>

          <p className="text-sm text-slate-400 mb-4">
            Enter a room code to join an existing online draft.
          </p>

          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Enter room code"
            className="w-full mb-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm tracking-widest uppercase"
          />

          <button
            onClick={handleJoinRoom}
            disabled={loading || joinCode.length < 4}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 py-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            Join Room
          </button>
        </div>
      </div>

      {!user && (
        <p className="text-xs text-slate-500 mt-10">
          ℹ Online drafts require login. Offline drafts are available without an
          account.
        </p>
      )}
    </main>
  );
}
