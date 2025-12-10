"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, PlusCircle, LogIn } from "lucide-react";
import { useAuth } from "../hooks/useAuth"; // adjust path if needed

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function OnlinePage() {
  const router = useRouter();
  const { user, token } = useAuth();

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------------------- CREATE ROOM -------------------- */
  async function handleCreateRoom() {
    if (!token) {
      alert("Log in to create online draft rooms.");
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
          gameType: "DRAFT",
          isPublic: false,
          name: "Online NBA Draft",
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to create room");
      }

      const room = await res.json();
      router.push(`/online/room/${room.code}`);
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

      router.push(`/online/room/${joinCode}`);
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* CREATE ROOM */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
          <div className="flex items-center gap-3 mb-3">
            <PlusCircle className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-semibold">Create Room</h2>
          </div>

          <p className="text-sm text-slate-400 mb-6">
            Host a private online NBA draft and invite others with a code.
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
