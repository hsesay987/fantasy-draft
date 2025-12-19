// app/toppic/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Sparkles, ShieldCheck, AlertTriangle, Zap, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Pool = "NBA" | "NFL" | "CARTOON" | "MULTI";
type ScoringMode = "cpu" | "vote" | "judge";

export default function TopPicLandingPage() {
  const router = useRouter();
  const { user, token } = useAuth();

  const [selectedPools, setSelectedPools] = useState<Pool[]>(["NBA", "MULTI"]);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("cpu");
  const [targetScore, setTargetScore] = useState(5);
  const [unlimited, setUnlimited] = useState(false);
  const [adultMode, setAdultMode] = useState(false);
  const [moderationRequired, setModerationRequired] = useState(true);
  const [communityReview, setCommunityReview] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseLeague = useMemo(() => {
    const first = selectedPools.find((p) => p !== "MULTI");
    return (first || "NBA") as "NBA" | "NFL" | "CARTOON";
  }, [selectedPools]);

  function togglePool(pool: Pool) {
    setSelectedPools((prev) => {
      if (prev.includes(pool)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((p) => p !== pool);
      }
      return [...prev, pool];
    });
  }

  async function handleCreateRoom() {
    if (!token) {
      router.push("/login");
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
          gameType: "TOPPIC",
          league: baseLeague,
          name: `TopPic ${baseLeague} Room`,
          settings: {
            toppicConfig: {
              pools: selectedPools,
              scoringMode,
              targetScore: unlimited ? null : targetScore,
              allowAdult: adultMode,
              requireModeration: moderationRequired,
              communityReview,
            },
          },
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to create room");
      }

      const room = await res.json();
      localStorage.setItem("activeRoomCode", room.code);
      router.push(`/toppic/room/${room.code}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinRoom() {
    if (!joinCode.trim()) return;
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/rooms/${joinCode}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to join room");
      }

      const room = await res.json();
      localStorage.setItem("activeRoomCode", room.code);
      router.push(`/toppic/room/${room.code}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10">
      <header className="mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-400/40 px-3 py-1 text-xs text-amber-200">
          <Sparkles className="w-4 h-4" />
          Online-only · Up to 20 players · Cards Against Humanity meets drafts
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-indigo-300">
          TopPic: Cards Against Humanity mode
        </h1>
        <p className="text-slate-400 max-w-3xl">
          Play a live, online-only party game (no offline mode) built around NBA, NFL, and cartoon universes. Everyone draws 7 cards and drops their best character to complete the prompt. FitTopPic eligibility enforced for sports pools.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg bg-red-900/30 border border-red-500/50 px-4 py-3 text-sm text-red-200">
          ⚠ {error}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-indigo-300" />
                Room setup
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <Users className="w-4 h-4" />
                Online-only rooms cap at 20 players per lobby.
              </div>
            </div>
            {!user && (
              <span className="text-xs text-amber-300">
                Log in to host or join online rooms.
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs text-slate-400 uppercase tracking-[0.2em]">
              Card pools (multi-select)
            </div>
            <div className="flex flex-wrap gap-2">
              {(["NBA", "NFL", "CARTOON", "MULTI"] as Pool[]).map((pool) => (
                <button
                  key={pool}
                  onClick={() => togglePool(pool)}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                    selectedPools.includes(pool)
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {pool === "MULTI" ? "Mix everything" : pool}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm text-slate-300 font-semibold">
                  Scoring mode
                </label>
                <select
                  value={scoringMode}
                  onChange={(e) => setScoringMode(e.target.value as ScoringMode)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                >
                  <option value="cpu">CPU / AI picks winner</option>
                  <option value="vote">Players vote winner</option>
                  <option value="judge">Rotating judge per round</option>
                </select>
                <p className="text-xs text-slate-400">
                  CPU mode will auto-pick using deterministic seed so everyone sees the same call.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm text-slate-300 font-semibold">
                  Score to win
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={targetScore}
                    onChange={(e) => setTargetScore(Number(e.target.value) || 1)}
                    disabled={unlimited}
                    className="w-28 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm disabled:opacity-50"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={unlimited}
                      onChange={(e) => setUnlimited(e.target.checked)}
                      className="accent-indigo-500"
                    />
                    Unlimited / manual end
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={adultMode}
                  onChange={(e) => setAdultMode(e.target.checked)}
                />
                <div>
                  <div className="font-semibold">18+ prompts & rooms</div>
                  <div className="text-xs text-slate-400">Toggle adult-only prompts & cartoons.</div>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={moderationRequired}
                  onChange={(e) => setModerationRequired(e.target.checked)}
                />
                <div>
                  <div className="font-semibold">Prompt moderation</div>
                  <div className="text-xs text-slate-400">Host must approve prompts before play.</div>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={communityReview}
                  onChange={(e) => setCommunityReview(e.target.checked)}
                />
                <div>
                  <div className="font-semibold">Community review</div>
                  <div className="text-xs text-slate-400">Enable card reviews & reporting.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              Create online room
            </button>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter join code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              />
              <button
                onClick={handleJoinRoom}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 hover:border-indigo-400 px-3 py-2 text-sm"
              >
                Join room
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-500/50 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-indigo-200">
            <ShieldCheck className="w-4 h-4" />
            Safeguards baked-in
          </div>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300 mt-1" />
              Prompt moderation (admin/host approval) plus optional adult-only toggle for 18+ rooms.
            </li>
            <li className="flex gap-2">
              <Users className="w-4 h-4 text-emerald-300 mt-1" />
              Community review + report buttons on every card to keep the deck clean.
            </li>
            <li className="flex gap-2">
              <Trophy className="w-4 h-4 text-indigo-300 mt-1" />
              Scoring options: CPU winner, player vote, or rotating judge; cap score or run unlimited.
            </li>
            <li className="flex gap-2">
              <Sparkles className="w-4 h-4 text-pink-300 mt-1" />
              500 unique prompts mapped to NBA, NFL, cartoon, or blended pools—fitTopPic eligibility enforced for sports.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
