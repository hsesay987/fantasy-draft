"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RoomStatusBanner() {
  const { token } = useAuth();
  const router = useRouter();

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const clearRoom = useCallback(() => {
    localStorage.removeItem("activeRoomCode");
    localStorage.removeItem("activeRoomDraftId");
    setRoomCode(null);
    setActiveDraftId(null);
  }, []);

  useEffect(() => {
    const storedCode = localStorage.getItem("activeRoomCode");
    const storedDraft = localStorage.getItem("activeRoomDraftId");
    setRoomCode(storedCode);
    setActiveDraftId(storedDraft);
  }, []);

  useEffect(() => {
    if (!roomCode || !token) return;

    setChecking(true);
    fetch(`${API_URL}/rooms/${roomCode}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((room) => {
        if (!room) {
          clearRoom();
          return;
        }

        if (room.status === "in_progress" && room.gameId) {
          setActiveDraftId(room.gameId);
          localStorage.setItem("activeRoomDraftId", room.gameId);
        } else {
          setActiveDraftId(null);
          localStorage.removeItem("activeRoomDraftId");
        }
      })
      .catch(() => clearRoom())
      .finally(() => setChecking(false));
  }, [roomCode, token, clearRoom]);

  const handleLeave = useCallback(async () => {
    if (!roomCode) return;

    try {
      if (token) {
        await fetch(`${API_URL}/rooms/${roomCode}/leave`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } finally {
      clearRoom();
      router.push("/online");
    }
  }, [roomCode, token, clearRoom, router]);

  if (!roomCode) return null;

  return (
    <div className="flex items-center gap-3 rounded-full border border-indigo-500/40 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-200">
      <span className="font-semibold text-indigo-200">Room {roomCode}</span>
      {activeDraftId ? (
        <button
          onClick={() => router.push(`/draft/${activeDraftId}`)}
          className="rounded-full bg-indigo-500 px-2 py-[3px] text-xs font-semibold text-slate-900 hover:bg-indigo-400"
        >
          Rejoin Draft
        </button>
      ) : (
        <button
          onClick={() => router.push(`/online/room/${roomCode}`)}
          className="rounded-full bg-indigo-500 px-2 py-[3px] text-xs font-semibold text-slate-900 hover:bg-indigo-400"
        >
          Open Lobby
        </button>
      )}

      <button
        onClick={handleLeave}
        disabled={checking}
        className="rounded-full border border-slate-700 px-2 py-[3px] text-xs font-semibold text-slate-200 hover:border-red-400 hover:text-red-200 disabled:opacity-50"
      >
        Leave
      </button>
    </div>
  );
}
