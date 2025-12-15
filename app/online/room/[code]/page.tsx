// app/online/room/[code]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Crown, Users, Play, X } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const NFL_LINEUP = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF"];

type Room = {
  id: string;
  code: string;
  hostId: string;
  status: string;
  gameId?: string | null;
  participants: {
    user: {
      id: string;
      name?: string | null;
      email: string;
    };
    isHost: boolean;
  }[];
};

type CasualConfig = {
  playersPerTeam: number;
  pickTimerSeconds: number;
  maxPpgCap: string;
  autoPickEnabled: boolean;
  suggestionsEnabled: boolean;
};

export default function RoomLobbyPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();

  const queryLeague = useMemo(
    () => (searchParams.get("league") || "").toUpperCase(),
    [searchParams]
  );
  const [league] = useState<"NBA" | "NFL">(
    queryLeague === "NFL" ? "NFL" : "NBA"
  );

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // online game mode: classic (2 players) or casual (up to 5)
  const [mode, setMode] = useState<"classic" | "casual">("classic");

  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [casualConfig, setCasualConfig] = useState<CasualConfig>({
    playersPerTeam: queryLeague === "NFL" ? NFL_LINEUP.length : 6,
    pickTimerSeconds: 0,
    maxPpgCap: "",
    autoPickEnabled: false,
    suggestionsEnabled: true,
  });

  const isHost = room?.hostId === user?.id;
  const participantCount = room?.participants.length ?? 0;
  const maxForMode = mode === "classic" ? 2 : 5;

  const tooFew = participantCount < 2;
  const tooMany = participantCount > maxForMode;

  const canStart =
    !!room && isHost && !tooFew && !tooMany && !!token && !starting;

  /* -------------------- POLL ROOM (fallback) -------------------- */
  async function fetchRoom() {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/rooms/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Room not found");
      }

      const data = (await res.json()) as Room;
      const isMember = data.participants.some((p) => p.user.id === user?.id);
      if (!isMember) {
        setError("You are not in this room.");
        setRoom(null);
        localStorage.removeItem("activeRoomCode");
        localStorage.removeItem("activeRoomDraftId");
        return;
      }

      setRoom(data);
      setError(null);

      // Persist room presence for header banner
      localStorage.setItem("activeRoomCode", data.code);
      if (data.status === "in_progress" && data.gameId) {
        localStorage.setItem("activeRoomDraftId", data.gameId);
      } else {
        localStorage.removeItem("activeRoomDraftId");
      }

      // If a draft is already running and user was seated, jump back in
      if (
        data.status === "in_progress" &&
        data.gameId &&
        data.participants.some((p) => p.user.id === user?.id)
      ) {
        router.replace(`/draft/${data.gameId}`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load room");
      setRoom(null);
      localStorage.removeItem("activeRoomCode");
      localStorage.removeItem("activeRoomDraftId");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("You must be logged in to view this room.");
      return;
    }

    fetchRoom();
    const interval = setInterval(fetchRoom, 3000); // polling fallback
    return () => clearInterval(interval);
  }, [code, token, user?.id]);

  /* -------------------- SOCKET.IO: FOLLOW DRAFT START -------------------- */
  useEffect(() => {
    // Only run on client + when we have a code
    if (!code) return;

    const socket = io(API_URL);

    // Join this room's socket channel so we can be notified when draft starts
    socket.emit("room:join", code);

    socket.on("room:draft-started", (payload: { draftId: string }) => {
      localStorage.setItem("activeRoomCode", String(code));
      localStorage.setItem("activeRoomDraftId", payload.draftId);
      router.push(`/draft/${payload.draftId}`);
    });
    socket.on("room:cancelled", () => {
      alert("Host cancelled this game. Returning to Online lobby.");
      localStorage.removeItem("activeRoomCode");
      localStorage.removeItem("activeRoomDraftId");
      router.push("/online");
    });

    return () => {
      socket.disconnect();
    };
  }, [code, router]);

  /* -------------------- START DRAFT -------------------- */
  async function startDraft() {
    if (!room || !isHost || !token) return;

    const participantCount = room.participants.length;
    const maxSeats = mode === "classic" ? 2 : 5;

    // Guard: require at least 2, and not exceed cap
    if (participantCount < 2) return;
    if (participantCount > maxSeats) return;

    const seatsToUse = Math.min(participantCount, maxSeats);
    const usedParticipants = room.participants.slice(0, seatsToUse);

    const seatAssignments = usedParticipants.map((p) => p.user.id);
    const seatDisplayNames = usedParticipants.map(
      (p) => p.user.name || p.user.email
    );

    const parsedPlayersPerTeam =
      casualConfig.playersPerTeam > 0 ? casualConfig.playersPerTeam : 6;
    const parsedTimerRaw = Number(casualConfig.pickTimerSeconds);
    const parsedPickTimer =
      Number.isFinite(parsedTimerRaw) && parsedTimerRaw > 0
        ? parsedTimerRaw
        : null;
    const parsedPpgCap =
      casualConfig.maxPpgCap.trim() === ""
        ? null
        : Math.max(0, Number(casualConfig.maxPpgCap));

    const rules: any = {
      online: true,
      roomCode: room.code,
      seatAssignments,
      seatDisplayNames,
      hostUserId: room.hostId,
    };

    if (mode === "casual") {
      rules.participants = seatsToUse;
      rules.playersPerTeam = parsedPlayersPerTeam;
      rules.pickTimerSeconds = parsedPickTimer;
      rules.autoPickEnabled = casualConfig.autoPickEnabled;
      rules.suggestionsEnabled = casualConfig.suggestionsEnabled;
      if (parsedPpgCap && !Number.isNaN(parsedPpgCap)) {
        rules.maxPpgCap = parsedPpgCap;
      }
    } else if (mode === "classic") {
      rules.playersPerTeam = league === "NFL" ? NFL_LINEUP.length : 6;
      rules.statMode = "peak-era-team";
    }

    if (league === "NFL") {
      rules.lineup = NFL_LINEUP;
      rules.allowDefense = true;
      rules.fantasyScoring = false;
    }

    setStarting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Room ${room.code} Draft`,
          league,
          mode, // "classic" or "casual" (same logic as offline, no free)
          randomEra: true,
          randomTeam: true,
          participants: seatsToUse,
          rules,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to start draft");
      }

      const draft = await res.json();
      localStorage.setItem("activeRoomCode", room.code);
      localStorage.setItem("activeRoomDraftId", draft.id);
      // Host goes straight into the draft; others are pushed via Socket.IO
      router.push(`/draft/${draft.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to start draft");
    } finally {
      setStarting(false);
    }
  }

  /* -------------------- CANCEL ROOM -------------------- */
  async function cancelRoom() {
    if (!room || !isHost || !token) return;

    const confirmed = window.confirm(
      "End this online draft room for everyone? This cannot be undone."
    );
    if (!confirmed) return;

    setCancelling(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/rooms/${code}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to cancel room");
      }

      localStorage.removeItem("activeRoomCode");
      localStorage.removeItem("activeRoomDraftId");
      router.push("/online");
    } catch (e: any) {
      setError(e.message || "Failed to cancel room");
    } finally {
      setCancelling(false);
    }
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

  /* -------------------- RENDER -------------------- */
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
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-300">
            Room {room.code}
          </h1>
          <p className="text-slate-400 text-sm">
            Waiting in lobby ({room.participants.length} players)
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Mode toggle (host chooses, others see it disabled) */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Mode:</span>
            <div className="inline-flex rounded-full bg-slate-900 border border-slate-700 p-1">
              <button
                type="button"
                disabled={!isHost}
                onClick={() => isHost && setMode("classic")}
                className={`px-3 py-1 rounded-full text-xs ${
                  mode === "classic"
                    ? "bg-indigo-500 text-slate-900"
                    : "text-slate-300"
                } ${!isHost ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                Classic (2)
              </button>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => isHost && setMode("casual")}
                className={`px-3 py-1 rounded-full text-xs ${
                  mode === "casual"
                    ? "bg-indigo-500 text-slate-900"
                    : "text-slate-300"
                } ${!isHost ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                Casual (up to 5)
              </button>
            </div>
          </div>

          {/* Host controls */}
          {isHost && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRoom}
                disabled={cancelling}
                className="flex items-center gap-2 rounded-xl bg-red-500/90 hover:bg-red-400 px-4 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
              >
                <X className="w-4 h-4" />
                {cancelling ? "Cancelling…" : "Cancel Room"}
              </button>

              <button
                type="button"
                onClick={startDraft}
                disabled={!canStart}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {starting ? "Starting…" : "Start Draft"}
              </button>
            </div>
          )}
        </div>
      </header>

      {mode === "casual" && (
        <section className="mb-6 max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-indigo-200">
                Casual settings
              </p>
              <p className="text-xs text-slate-400">
                Configure rules before starting. Host only.
              </p>
            </div>
            {!isHost && (
              <span className="text-[11px] text-slate-500">View only</span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs text-slate-300 space-y-1">
              <span>Players per team</span>
              <input
                type="number"
                min={3}
                max={10}
                value={casualConfig.playersPerTeam}
                onChange={(e) =>
                  isHost &&
                  setCasualConfig((prev) => ({
                    ...prev,
                    playersPerTeam: Number(e.target.value),
                  }))
                }
                disabled={!isHost}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-xs text-slate-300 space-y-1">
              <span>Pick timer (seconds, 0/off)</span>
              <input
                type="number"
                min={0}
                max={300}
                value={casualConfig.pickTimerSeconds}
                onChange={(e) =>
                  isHost &&
                  setCasualConfig((prev) => ({
                    ...prev,
                    pickTimerSeconds: Number(e.target.value),
                  }))
                }
                disabled={!isHost}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-xs text-slate-300 space-y-1">
              <span>PPG cap (optional)</span>
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="No cap"
                value={casualConfig.maxPpgCap}
                onChange={(e) =>
                  isHost &&
                  setCasualConfig((prev) => ({
                    ...prev,
                    maxPpgCap: e.target.value,
                  }))
                }
                disabled={!isHost}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={casualConfig.autoPickEnabled}
                  onChange={(e) =>
                    isHost &&
                    setCasualConfig((prev) => ({
                      ...prev,
                      autoPickEnabled: e.target.checked,
                    }))
                  }
                  disabled={!isHost}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Enable auto-pick when timer ends
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={casualConfig.suggestionsEnabled}
                  onChange={(e) =>
                    isHost &&
                    setCasualConfig((prev) => ({
                      ...prev,
                      suggestionsEnabled: e.target.checked,
                    }))
                  }
                  disabled={!isHost}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Show system suggestions
              </label>
            </div>
          </div>
        </section>
      )}

      {/* PARTICIPANTS LIST */}
      <div className="max-w-xl space-y-3">
        {room.participants.map((p, index) => {
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

                {/* Simple seat index indicator */}
                <span className="text-[11px] text-slate-500 ml-2">
                  Seat {index + 1}
                </span>
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

      <p className="text-xs text-slate-500 mt-6">
        ℹ Classic uses exactly 2 players and 6 picks each (6v6). Casual
        supports up to 5 players with customizable rules. Draft starts when the
        host clicks “Start Draft”. All players will automatically be moved into
        the draft.
      </p>

      {(tooFew || tooMany) && isHost && (
        <p className="text-xs text-amber-300 mt-2">
          {!tooFew && tooMany
            ? mode === "classic"
              ? "Classic mode supports only 2 players. Kick extra players or switch to Casual."
              : "Casual mode supports up to 5 players. Kick extra players to start."
            : "You need at least 2 players in the room to start a draft."}
        </p>
      )}
    </main>
  );
}
