// app/online/room/[code]/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Crown, Users, Play, X } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const NFL_LINEUP = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF"];
const CARTOON_CHANNELS = [
  "Disney",
  "DisneyXD",
  "Nickelodeon",
  "CartoonNetwork",
  "AdultSwim",
  "Netflix",
  "Other",
];
type League = "NBA" | "NFL" | "CARTOON";

type Room = {
  id: string;
  code: string;
  hostId: string;
  status: string;
  gameId?: string | null;
  league?: League;
  settings?: any;
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

type CartoonConfig = {
  draftType: "character" | "show";
  channel: string;
  ageRating: "" | "baby" | "kids" | "adult";
  randomEra: boolean;
  eraFrom: number | "";
  eraTo: number | "";
  superheroOnly: boolean;
  femaleOnly: boolean;
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
  const [league, setLeague] = useState<League>(
    queryLeague === "NFL"
      ? "NFL"
      : queryLeague === "CARTOON"
      ? "CARTOON"
      : "NBA"
  );

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      queryLeague === "NFL" ||
      queryLeague === "CARTOON" ||
      queryLeague === "NBA"
    ) {
      setLeague(queryLeague as League);
    }
  }, [queryLeague]);

  // online game mode: classic (2 players) or casual (up to 5)
  const [mode, setMode] = useState<"classic" | "casual">("classic");

  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const basePlayersPerTeam = useMemo(
    () =>
      league === "NFL" ? NFL_LINEUP.length : league === "CARTOON" ? 5 : 6,
    [league]
  );

  const [casualConfig, setCasualConfig] = useState<CasualConfig>({
    playersPerTeam: basePlayersPerTeam,
    pickTimerSeconds: 0,
    maxPpgCap: "",
    autoPickEnabled: false,
    suggestionsEnabled: true,
  });
  const [cartoonConfig, setCartoonConfig] = useState<CartoonConfig>({
    draftType: "character",
    channel: "",
    ageRating: "",
    randomEra: true,
    eraFrom: "",
    eraTo: "",
    superheroOnly: false,
    femaleOnly: false,
  });
  const appliedSettingsRef = useRef(false);

  const isHost = room?.hostId === user?.id;
  const participantCount = room?.participants.length ?? 0;
  const maxForMode =
    league === "CARTOON" && mode === "casual" ? 10 : mode === "classic" ? 2 : 5;

  const tooFew = participantCount < 2;
  const tooMany = participantCount > maxForMode;

  const canStart =
    !!room && isHost && !tooFew && !tooMany && !!token && !starting;

  useEffect(() => {
    setCasualConfig((prev) => ({
      ...prev,
      playersPerTeam: basePlayersPerTeam,
    }));
    if (league !== "CARTOON") {
      appliedSettingsRef.current = false;
    }
  }, [basePlayersPerTeam, league]);

  function applyRoomSettings(settings: any) {
    if (!settings || typeof settings !== "object") return;
    if (!isHost || !appliedSettingsRef.current) {
      if (
        settings.mode === "classic" ||
        settings.mode === "casual"
      ) {
        setMode(settings.mode);
      }
      if (settings.casualConfig) {
        setCasualConfig((prev) => ({
          ...prev,
          ...settings.casualConfig,
          playersPerTeam:
            settings.casualConfig.playersPerTeam || basePlayersPerTeam,
        }));
      }
      if (settings.cartoonConfig) {
        setCartoonConfig((prev) => ({
          ...prev,
          ...settings.cartoonConfig,
        }));
      }
      appliedSettingsRef.current = true;
    }
  }

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
      if (data.league) {
        setLeague((data.league as League) || "NBA");
      }
      applyRoomSettings(data.settings);
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
    if (!isHost || !token || !room) return;
    const timer = setTimeout(() => {
      fetch(`${API_URL}/rooms/${code}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: {
            mode,
            casualConfig,
            cartoonConfig,
          },
        }),
      }).catch(() => {});
    }, 350);

    return () => clearTimeout(timer);
  }, [cartoonConfig, casualConfig, mode, isHost, token, room, code]);

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
    socket.on("room:settings", (settings: any) => {
      applyRoomSettings(settings);
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
    const maxSeats = maxForMode;

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
      casualConfig.playersPerTeam > 0
        ? casualConfig.playersPerTeam
        : basePlayersPerTeam;
    const parsedTimerRaw = Number(casualConfig.pickTimerSeconds);
    const parsedPickTimer =
      Number.isFinite(parsedTimerRaw) && parsedTimerRaw > 0
        ? parsedTimerRaw
        : null;
    const parsedPpgCap =
      casualConfig.maxPpgCap.trim() === ""
        ? null
        : Math.max(0, Number(casualConfig.maxPpgCap));
    let playersPerTeamValue =
      mode === "classic"
        ? league === "NFL"
          ? NFL_LINEUP.length
          : league === "CARTOON"
          ? 5
          : 6
        : parsedPlayersPerTeam;
    if (league === "NFL" && playersPerTeamValue < NFL_LINEUP.length) {
      playersPerTeamValue = NFL_LINEUP.length;
    }
    if (league === "CARTOON" && playersPerTeamValue < 3) {
      playersPerTeamValue = 3;
    }

    const rules: any = {
      online: true,
      roomCode: room.code,
      seatAssignments,
      seatDisplayNames,
      hostUserId: room.hostId,
    };

    if (mode === "casual") {
      rules.participants = seatsToUse;
      rules.playersPerTeam = playersPerTeamValue;
      rules.pickTimerSeconds = parsedPickTimer;
      rules.autoPickEnabled = casualConfig.autoPickEnabled;
      rules.suggestionsEnabled = casualConfig.suggestionsEnabled;
      if (parsedPpgCap && !Number.isNaN(parsedPpgCap)) {
        rules.maxPpgCap = parsedPpgCap;
      }
    } else if (mode === "classic") {
      rules.playersPerTeam = playersPerTeamValue;
      rules.statMode = "peak-era-team";
      rules.pickTimerSeconds = 60;
      rules.autoPickEnabled = true;
      rules.suggestionsEnabled = false;
    }

    if (league === "NFL") {
      rules.lineup = NFL_LINEUP;
      rules.allowDefense = true;
      rules.fantasyScoring = false;
    }

    if (league === "CARTOON") {
      rules.participants = seatsToUse;
      rules.playersPerTeam = playersPerTeamValue;
      rules.cartoonDraftType = cartoonConfig.draftType;
      rules.cartoonChannel = cartoonConfig.channel || null;
      rules.cartoonAgeRating = cartoonConfig.ageRating || null;
      rules.cartoonEraFrom = cartoonConfig.randomEra
        ? null
        : cartoonConfig.eraFrom || null;
      rules.cartoonEraTo = cartoonConfig.randomEra
        ? null
        : cartoonConfig.eraTo || null;
      rules.cartoonRequireSuperhero = cartoonConfig.superheroOnly;
      rules.cartoonGender = cartoonConfig.femaleOnly ? "female" : undefined;
      rules.allowShows = cartoonConfig.draftType === "show";
      rules.allowCharacters = cartoonConfig.draftType === "character";
      rules.cartoonMode = mode;
      rules.cartoonScoring = "community";
      rules.communityVoteEnabled = true;
      rules.pickTimerSeconds = mode === "classic" ? 60 : parsedPickTimer;
      rules.autoPickEnabled =
        mode === "classic" ? true : casualConfig.autoPickEnabled;
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
          randomEra:
            league === "CARTOON" ? cartoonConfig.randomEra : true,
          randomTeam: league === "CARTOON" ? false : true,
          participants: seatsToUse,
          scoringMethod: league === "CARTOON" ? "community" : undefined,
          cartoonDraftType:
            league === "CARTOON" ? cartoonConfig.draftType : undefined,
          cartoonChannel:
            league === "CARTOON" ? cartoonConfig.channel || null : undefined,
          cartoonAgeRating:
            league === "CARTOON" ? cartoonConfig.ageRating || null : undefined,
          cartoonEraFrom:
            league === "CARTOON" && !cartoonConfig.randomEra
              ? cartoonConfig.eraFrom || null
              : undefined,
          cartoonEraTo:
            league === "CARTOON" && !cartoonConfig.randomEra
              ? cartoonConfig.eraTo || null
              : undefined,
          cartoonRequireSuperhero:
            league === "CARTOON" ? cartoonConfig.superheroOnly : undefined,
          cartoonGender:
            league === "CARTOON" && cartoonConfig.femaleOnly
              ? "female"
              : undefined,
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

  const leagueLabel = (room.league || league || "NBA").toString();
  const casualLimitLabel = maxForMode;
  const classicSummary =
    leagueLabel === "NFL"
      ? `Classic locks ${NFL_LINEUP.length} NFL lineup slots with a 60s timer.`
      : leagueLabel === "CARTOON"
      ? "Classic locks 2 players, 5 picks each, with a 60s timer."
      : "Classic uses exactly 2 players and 6 picks each (6v6).";
  const casualSummary =
    leagueLabel === "CARTOON"
      ? `Casual supports up to ${casualLimitLabel} players with channel/era filters.`
      : `Casual supports up to ${casualLimitLabel} players with customizable rules.`;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      {/* HEADER */}
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-300">
            Room {room.code}
          </h1>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-[2px] text-[11px] uppercase tracking-[0.08em]">
              League: {leagueLabel}
            </span>
            {leagueLabel === "NFL" || leagueLabel === "CARTOON" ? (
              <span className="text-amber-300">
                Premium online room
              </span>
            ) : null}
          </div>
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
                Classic (2 players)
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
                Casual (up to {casualLimitLabel})
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

      {league === "CARTOON" && (
        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-indigo-200">
                Cartoon draft settings
              </p>
              <p className="text-xs text-slate-400">
                Community voting only. Choose character or show drafts.
              </p>
            </div>
            {!isHost && (
              <span className="text-[11px] text-slate-500">View only</span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Draft focus</div>
              <div className="inline-flex rounded-full bg-slate-900 border border-slate-800 p-1">
                {(["character", "show"] as const).map((type) => (
                  <button
                    key={type}
                    disabled={!isHost}
                    onClick={() =>
                      isHost &&
                      setCartoonConfig((prev) => ({ ...prev, draftType: type }))
                    }
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      cartoonConfig.draftType === type
                        ? "bg-indigo-500 text-slate-900"
                        : "text-slate-200"
                    } ${!isHost ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {type === "character" ? "Characters" : "Shows"}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-slate-300 space-y-1">
                <span>Channel filter</span>
                <select
                  disabled={!isHost}
                  value={cartoonConfig.channel}
                  onChange={(e) =>
                    isHost &&
                    setCartoonConfig((prev) => ({
                      ...prev,
                      channel: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="">Any</option>
                  {CARTOON_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-300 space-y-1">
                <span>Age rating</span>
                <select
                  disabled={!isHost}
                  value={cartoonConfig.ageRating}
                  onChange={(e) =>
                    isHost &&
                    setCartoonConfig((prev) => ({
                      ...prev,
                      ageRating: e.target.value as CartoonConfig["ageRating"],
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="">Any</option>
                  <option value="baby">Baby</option>
                  <option value="kids">Kids</option>
                  <option value="adult">Adult</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  disabled={!isHost || cartoonConfig.draftType !== "character"}
                  checked={cartoonConfig.superheroOnly}
                  onChange={(e) =>
                    isHost &&
                    setCartoonConfig((prev) => ({
                      ...prev,
                      superheroOnly: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Superhero-only (characters)
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  disabled={!isHost || cartoonConfig.draftType !== "character"}
                  checked={cartoonConfig.femaleOnly}
                  onChange={(e) =>
                    isHost &&
                    setCartoonConfig((prev) => ({
                      ...prev,
                      femaleOnly: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Female-only (characters)
              </label>
            </div>

            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  disabled={!isHost}
                  checked={cartoonConfig.randomEra}
                  onChange={(e) =>
                    isHost &&
                    setCartoonConfig((prev) => ({
                      ...prev,
                      randomEra: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Random era spin
              </label>

              {!cartoonConfig.randomEra && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Era from"
                    disabled={!isHost}
                    value={cartoonConfig.eraFrom}
                    onChange={(e) =>
                      isHost &&
                      setCartoonConfig((prev) => ({
                        ...prev,
                        eraFrom: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Era to"
                    disabled={!isHost}
                    value={cartoonConfig.eraTo}
                    onChange={(e) =>
                      isHost &&
                      setCartoonConfig((prev) => ({
                        ...prev,
                        eraTo: e.target.value === "" ? "" : Number(e.target.value),
                      }))
                    }
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mt-3">
            Cartoon drafts ignore stats and rely on community voting. Classic mode uses a 60s timer and 5 picks per team.
          </p>
        </section>
      )}

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
        ℹ {classicSummary} {casualSummary} Draft starts when the host clicks
        “Start Draft”. All players will automatically be moved into the draft.
      </p>

      {(tooFew || tooMany) && isHost && (
        <p className="text-xs text-amber-300 mt-2">
          {!tooFew && tooMany
            ? mode === "classic"
              ? "Classic mode supports only 2 players. Kick extra players or switch to Casual."
              : `Casual mode supports up to ${casualLimitLabel} players. Kick extra players to start.`
            : "You need at least 2 players in the room to start a draft."}
        </p>
      )}
    </main>
  );
}
