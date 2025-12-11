// app/online/room/[code]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Crown, Users, Play, X } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Room = {
  id: string;
  code: string;
  hostId: string;
  status: string;
  participants: {
    user: {
      id: string;
      name?: string | null;
      email: string;
    };
    isHost: boolean;
  }[];
};

export default function RoomLobbyPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, token } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isHost = room?.hostId === user?.id;

  /* -------------------- POLL ROOM -------------------- */
  async function fetchRoom() {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/rooms/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Room not found");

      const data = await res.json();
      setRoom(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 3000); // POLLING
    return () => clearInterval(interval);
  }, [code, token]);

  /* -------------------- START DRAFT -------------------- */
  async function startDraft() {
    if (!room || !isHost || !token) return;

    const seatAssignments = room.participants.map((p) => p.user.id);
    const seatDisplayNames = room.participants.map(
      (p) => p.user.name || p.user.email
    );

    const res = await fetch(`${API_URL}/drafts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: `Room ${room.code} Draft`,
        league: "NBA",
        mode: "casual",
        randomEra: true,
        randomTeam: true,
        participants: room.participants.length,
        rules: {
          online: true,
          roomCode: room.code,
          seatAssignments,
          seatDisplayNames,
          hostUserId: room.hostId,
        },
      }),
    });

    const draft = await res.json();
    router.push(`/draft/${draft.id}`);
  }

  /* -------------------- KICK PLAYER -------------------- */
  async function kick(userId: string) {
    if (!isHost || !token) return;

    await fetch(`${API_URL}/rooms/${code}/kick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userIdToKick: userId }),
    });

    fetchRoom();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading room…
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-400">
        {error || "Room not found"}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      {/* HEADER */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-300">
            Room {room.code}
          </h1>
          <p className="text-slate-400 text-sm">
            Waiting in lobby ({room.participants.length} players)
          </p>
        </div>

        {isHost && (
          <button
            onClick={startDraft}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-900"
          >
            <Play className="w-4 h-4" />
            Start Draft
          </button>
        )}
      </header>

      {/* PARTICIPANTS */}
      <div className="max-w-xl space-y-3">
        {room.participants.map((p) => {
          const isSelf = p.user.id === user?.id;
          return (
            <div
              key={p.user.id}
              className="flex justify-between items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-sm">
                  {p.user.name || p.user.email}
                  {isSelf && " (you)"}
                </span>
                {p.isHost && <Crown className="w-4 h-4 text-yellow-400" />}
              </div>

              {isHost && !p.isHost && (
                <button
                  onClick={() => kick(p.user.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 mt-8">
        ℹ Draft starts when host clicks “Start Draft”
      </p>
    </main>
  );
}
