// app/draft/cartoon/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io as socketIo, type Socket } from "socket.io-client";
import { useAuth } from "@/app/hooks/useAuth";
import { DraftButton, DraftSection, DraftTopBar, TurnBanner } from "../../components/DraftChrome";
import {
  Wand2,
  Save,
  Pause,
  X,
  PlusCircle,
  LogOut,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type CartoonShow = {
  id: string;
  name: string;
  channel?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  ageRating?: string | null;
};

type CartoonCharacter = {
  id: string;
  name: string;
  gender?: string | null;
  isSuperhero?: boolean | null;
  show?: CartoonShow | null;
};

type CartoonPick = {
  id: string;
  slot: number;
  ownerIndex?: number;
  entityType?: string;
  show?: CartoonShow | null;
  character?: CartoonCharacter | null;
};

type DraftRules = {
  participants?: number;
  playersPerTeam?: number;
  pickTimerSeconds?: number | null;
  autoPickEnabled?: boolean;
  online?: boolean;
  seatAssignments?: string[];
  seatDisplayNames?: string[];
  hostUserId?: string | null;
  cartoonDraftType?: "show" | "character";
  cartoonChannel?: string | null;
  cartoonAgeRating?: "baby" | "kids" | "adult" | null;
  cartoonEraFrom?: number | null;
  cartoonEraTo?: number | null;
  cartoonRequireSuperhero?: boolean;
  cartoonGender?: string | null;
  cartoonScoring?: string;
  communityVoteEnabled?: boolean;
  savedState?: Record<string, any>;
  status?: string | null;
  roomCode?: string | null;
};

type Draft = {
  id: string;
  title: string | null;
  league: string;
  mode: string;
  rules?: DraftRules;
  participants: number;
  playersPerTeam: number;
  maxPlayers: number;
  picks: CartoonPick[];
  randomEra?: boolean;
  randomTeam?: boolean;
  eraFrom?: number | null;
  eraTo?: number | null;
  teamConstraint?: string | null;
};

type SearchResult = CartoonShow | CartoonCharacter;

export default function CartoonDraftPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { user, token } = useAuth();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoPickTriggeredRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const [readySaving, setReadySaving] = useState(false);
  const [showReadyModal, setShowReadyModal] = useState(false);

  const participants = useMemo(() => {
    if (!draft) return 0;
    return (
      draft.rules?.participants ||
      draft.participants ||
      Math.max(1, draft.picks.length)
    );
  }, [draft]);

  const playersPerTeam = useMemo(() => {
    if (!draft) return 0;
    return draft.rules?.playersPerTeam || draft.playersPerTeam || 5;
  }, [draft]);

  const allSlots = useMemo(
    () =>
      draft ? Array.from({ length: draft.maxPlayers }, (_, i) => i + 1) : [],
    [draft]
  );

  const getParticipantForSlot = (slot: number) =>
    Math.floor((slot - 1) / Math.max(playersPerTeam, 1)) + 1;

  const activeParticipant = useMemo(() => {
    if (!draft) return null;
    if (draft.picks.length >= draft.maxPlayers) return null;
    return (draft.picks.length % Math.max(participants, 1)) + 1;
  }, [draft, participants]);

  const defaultSlotForActive = useMemo(() => {
    if (!draft || !activeParticipant) return null;
    const taken = new Set(draft.picks.map((p) => p.slot));
    const candidate = allSlots.find(
      (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
    );
    return candidate ?? null;
  }, [draft, activeParticipant, allSlots, playersPerTeam]);

  const draftType = (draft?.rules?.cartoonDraftType || "character") as
    | "character"
    | "show";
  const savedState = (draft?.rules as any)?.savedState || {};
  const rematchReadyRequested = !!savedState.rematchReadyRequested;
  const rematchReadyMap: Record<string, boolean> =
    savedState.rematchReadyMap || {};
  const readyPhaseActive = rematchReadyRequested;
  const isOnline = !!draft?.rules?.online;

  const seatAssignments = draft?.rules?.seatAssignments || [];
  const seatDisplayNames = draft?.rules?.seatDisplayNames || [];
  const activeSeatUserId =
    activeParticipant && seatAssignments[activeParticipant - 1];
  const isSeatOwner =
    !draft?.rules?.online ||
    !activeSeatUserId ||
    (user && activeSeatUserId === user.id);
  const isHost = user && draft?.rules?.hostUserId === user.id;
  const canPick = !!draft && (!!isSeatOwner || !draft.rules?.online);
  const draftComplete = draft ? draft.picks.length >= draft.maxPlayers : false;
  const readyParticipants =
    draft?.rules?.seatAssignments?.map((uid, idx) => ({
      userId: uid,
      name: draft?.rules?.seatDisplayNames?.[idx] || `Player ${idx + 1}`,
      ready: !!rematchReadyMap[uid],
    })) ?? [];
  const totalReady = readyParticipants.filter((p) => p.ready).length;

  async function loadDraft() {
    if (!id) return;
    try {
      const res = await fetch(`${API_URL}/drafts/${id}`);
      if (!res.ok) throw new Error("Draft not found");
      const data = await res.json();
      setDraft(data);
    } catch (e: any) {
      setError(e.message || "Failed to load draft");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDraft();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const socket = socketIo(API_URL);
    socket.emit("draft:join", id);
    socket.on("draft:update", (payload: Draft) => {
      setDraft(payload);
      setSelectedSlot(null);
    });
    socket.on("draft:cancelled", () => {
      alert("Host cancelled this draft.");
      router.push("/online");
    });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
    };
  }, [id, router]);

  useEffect(() => {
    if (!draft || !draft.rules?.pickTimerSeconds || !activeParticipant) {
      deadlineRef.current = null;
      setTimeLeft(null);
      return;
    }
    const seconds = draft.rules.pickTimerSeconds;
    deadlineRef.current = Date.now() + seconds * 1000;
    autoPickTriggeredRef.current = false;

    function tick() {
      if (!deadlineRef.current) return;
      const remainingMs = deadlineRef.current - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remainingSeconds);

      if (
        remainingMs <= 0 &&
        draft?.rules?.autoPickEnabled &&
        !autoPickTriggeredRef.current
      ) {
        autoPickTriggeredRef.current = true;
        handleAutoPick();
      }
    }

    tick();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [draft?.picks.length, draft?.rules?.pickTimerSeconds, activeParticipant]);

  useEffect(() => {
    if (!draft || !draftComplete) return;
    if (!user) {
      alert("Log in to save drafts.");
      return;
    }
    persistSavedState({}, { status: "complete" });
  }, [draft, draftComplete]);

  useEffect(() => {
    if (readyPhaseActive) {
      setShowReadyModal(true);
    }
  }, [readyPhaseActive]);

  async function searchCandidates() {
    if (!draft) return;
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (draft.rules?.cartoonChannel)
        params.set("channel", draft.rules.cartoonChannel);
      if (draft.rules?.cartoonAgeRating)
        params.set("ageRating", draft.rules.cartoonAgeRating);
      if (draftType === "character") {
        if (draft.rules?.cartoonGender)
          params.set("gender", draft.rules.cartoonGender);
        if (draft.rules?.cartoonRequireSuperhero)
          params.set("isSuperhero", "true");
      }
      params.set("limit", "20");
      const endpoint = draftType === "show" ? "shows" : "characters";
      const res = await fetch(
        `${API_URL}/cartoons/${endpoint}?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!draft) return;
    searchCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftType, draft?.rules?.cartoonChannel, draft?.rules?.cartoonAgeRating]);

  useEffect(() => {
    if (!draft) return;
    setSelectedSlot((prev) => prev ?? defaultSlotForActive);
  }, [draft, defaultSlotForActive]);

  async function persistSavedState(
    patch: Record<string, any>,
    opts?: { silent?: boolean; status?: "saved" | "in_progress" | "complete" }
  ) {
    if (!draft) return;
    const mergedState = { ...(draft.rules?.savedState || {}), ...patch };
    if (!opts?.silent) setReadySaving(true);
    try {
      await fetch(`${API_URL}/drafts/${draft.id}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          savedState: mergedState,
          status: opts?.status || draft.rules?.status || "in_progress",
        }),
      });
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              rules: { ...(prev.rules || {}), savedState: mergedState },
            }
          : prev
      );
    } finally {
      if (!opts?.silent) setReadySaving(false);
    }
  }

  async function handleSaveDraft(
    status: "saved" | "in_progress" | "complete" = "saved"
  ) {
    if (!draft) return;
    if (!user) {
      alert("Log in to save drafts.");
      return;
    }
    await persistSavedState({}, { status });
    alert("Draft saved");
  }

  async function handlePauseDraft() {
    await handleSaveDraft("saved");
  }

  async function handleCancelDraft() {
    if (!draft) return;
    const ok = confirm("Cancel and delete this draft?");
    if (!ok) return;

    if (
      draft.rules?.online &&
      draft.rules.hostUserId &&
      user?.id !== draft.rules.hostUserId
    ) {
      alert("Only the host can cancel this online draft.");
      return;
    }

    await fetch(`${API_URL}/drafts/${draft.id}`, { method: "DELETE" }).catch(
      () => null
    );

    if (draft.rules?.online && draft.rules.roomCode) {
      localStorage.removeItem("activeRoomDraftId");
      localStorage.removeItem("activeRoomCode");
      if (token) {
        await fetch(`${API_URL}/rooms/${draft.rules.roomCode}/leave`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
      }
      router.push("/online");
    } else {
      router.push("/draft/new?league=CARTOON");
    }
  }

  async function leaveDraft() {
    if (!draft?.rules?.online) return;
    if (token && draft.rules.roomCode) {
      await fetch(`${API_URL}/rooms/${draft.rules.roomCode}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }
    localStorage.removeItem("activeRoomDraftId");
    localStorage.removeItem("activeRoomCode");
    router.push("/online");
  }

  async function requestRematch() {
    if (!draft?.rules?.online || !isHost) return;
    const ok = confirm(
      draftComplete
        ? "Start a new cartoon draft and have everyone ready up?"
        : "Start a new draft and ready up?"
    );
    if (!ok) return;
    const map = {
      ...(rematchReadyMap || {}),
      ...(user?.id ? { [user.id]: true } : {}),
    };
    await persistSavedState(
      { rematchReadyRequested: true, rematchReadyMap: map },
      { silent: true }
    );
    setShowReadyModal(true);
  }

  async function markReadyForRematch() {
    if (!draft?.rules?.online || !user) return;
    if (!readyPhaseActive) {
      alert("Host needs to open a new draft first.");
      return;
    }
    const map = { ...(rematchReadyMap || {}), [user.id]: true };
    await persistSavedState({
      rematchReadyRequested: true,
      rematchReadyMap: map,
    });
    setShowReadyModal(true);
  }

  async function startOnlineRematch() {
    if (!draft || !draft.rules?.online || !token || !isHost) return;
    const rulesForNext: any = { ...(draft.rules || {}) };
    delete rulesForNext.savedState;

    const payload = {
      title: `Room ${draft.rules.roomCode} Draft`,
      league: "CARTOON",
      mode: draft.mode,
      participants:
        rulesForNext.seatAssignments?.length ||
        draft.participants ||
        participants,
      rules: rulesForNext,
      randomEra: draft.randomEra,
      randomTeam: draft.randomTeam,
      eraFrom: draft.eraFrom,
      eraTo: draft.eraTo,
      teamConstraint: draft.teamConstraint,
      playersPerTeam: draft.playersPerTeam,
      requirePositions: false,
      scoringMethod: "community",
      cartoonDraftType: draft.rules?.cartoonDraftType,
      cartoonChannel: draft.rules?.cartoonChannel,
      cartoonAgeRating: draft.rules?.cartoonAgeRating,
      cartoonEraFrom: draft.rules?.cartoonEraFrom,
      cartoonEraTo: draft.rules?.cartoonEraTo,
      cartoonRequireSuperhero: draft.rules?.cartoonRequireSuperhero,
      cartoonGender: draft.rules?.cartoonGender,
    };

    const res = await fetch(`${API_URL}/drafts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to start a new draft.");
      return;
    }

    const nextDraft = await res.json();
    await persistSavedState(
      {
        rematchReadyRequested: false,
        rematchReadyMap: {},
        rematchNextDraftId: nextDraft.id,
      },
      { silent: true }
    );
    setShowReadyModal(false);
    localStorage.setItem("activeRoomDraftId", nextDraft.id);
    localStorage.setItem(
      "activeRoomCode",
      draft.rules.roomCode || String(draft.id)
    );
    router.push(`/draft/cartoon/${nextDraft.id}`);
  }

  async function makePick(target: SearchResult, autopick = false) {
    if (!draft || !activeParticipant) return;
    const slot = autopick
      ? defaultSlotForActive
      : selectedSlot ?? defaultSlotForActive;
    if (!slot) return;
    if (!canPick && !autopick) {
      setPickError("It's not your turn to pick.");
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const body: any = { slot, autopick };
    if (draftType === "show") {
      body.cartoonShowId = (target as CartoonShow).id;
    } else {
      body.cartoonCharacterId = (target as CartoonCharacter).id;
    }

    try {
      const res = await fetch(`${API_URL}/drafts/${draft.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPickError(err.error || "Pick failed.");
        return;
      }
      setPickError(null);
      setSearchResults([]);
      setSearchQuery("");
      await loadDraft();
    } catch (e: any) {
      setPickError(e.message || "Pick failed");
    }
  }

  async function handleAutoPick() {
    if (!draft || !draft.rules?.autoPickEnabled) return;
    if (!isSeatOwner && !isHost) return;
    const slot = defaultSlotForActive;
    if (!slot) return;
    try {
      const params = new URLSearchParams();
      params.set("limit", "1");
      if (draft.rules?.cartoonChannel)
        params.set("channel", draft.rules.cartoonChannel);
      if (draft.rules?.cartoonAgeRating)
        params.set("ageRating", draft.rules.cartoonAgeRating);
      if (draftType === "character" && draft.rules?.cartoonRequireSuperhero) {
        params.set("isSuperhero", "true");
      }
      const endpoint = draftType === "show" ? "shows" : "characters";
      const res = await fetch(
        `${API_URL}/cartoons/${endpoint}?${params.toString()}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const candidate = Array.isArray(data) && data.length ? data[0] : null;
      if (candidate) {
        await makePick(candidate, true);
      }
    } catch {
      // ignore autopick errors
    }
  }

  const teams = useMemo(() => {
    const list = Array.from({ length: Math.max(1, participants) }, (_, i) => ({
      name: seatDisplayNames[i] || `Team ${i + 1}`,
      picks: Array.from(
        { length: Math.max(playersPerTeam, 1) },
        () => null
      ) as (CartoonPick | null)[],
    }));
    if (draft) {
      draft.picks.forEach((pick) => {
        const owner = getParticipantForSlot(pick.slot);
        const slotIndex = (pick.slot - 1) % Math.max(playersPerTeam, 1);
        if (list[owner - 1] && slotIndex >= 0) {
          list[owner - 1].picks[slotIndex] = pick;
        }
      });
    }
    return list;
  }, [draft, participants, seatDisplayNames, playersPerTeam]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        Loading draft...
      </main>
    );
  }

  if (error || !draft) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-red-300">
        {error || "Draft not found"}
      </main>
    );
  }

  const currentSlot = selectedSlot ?? defaultSlotForActive;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-foreground md:px-6 md:py-10">
      {showReadyModal && draft.rules?.online && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-card/95 p-4 space-y-3 shadow-xl shadow-indigo-500/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Waiting for players to ready up
                </h3>
                <p className="text-xs text-muted-foreground">
                  Host will start a new draft once everyone is set.
                </p>
              </div>
              <button
                onClick={() => setShowReadyModal(false)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              {totalReady}/{readyParticipants.length || participants} ready
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {readyParticipants.map((p, idx) => (
                <div
                  key={p.userId || idx}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-background/60 px-3 py-2"
                >
                  <span className="text-sm text-foreground">
                    {p.name || `Player ${idx + 1}`}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      p.ready ? "text-emerald-300" : "text-muted-foreground"
                    }`}
                  >
                    {p.ready ? "Ready" : "Waiting"}
                  </span>
                </div>
              ))}
              {readyParticipants.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Seats will appear once players join.
                </div>
              )}
            </div>

            {!isHost && (
              <button
                onClick={markReadyForRematch}
                disabled={
                  !readyPhaseActive ||
                  readySaving ||
                  (user?.id ? !!rematchReadyMap[user.id] : false)
                }
                className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-[12px] font-semibold text-slate-900 py-2 disabled:opacity-60"
              >
                {user && rematchReadyMap[user.id]
                  ? "You're ready"
                  : readySaving
                  ? "Saving..."
                  : "Ready Up"}
              </button>
            )}

            {isHost && (
              <button
                onClick={startOnlineRematch}
                disabled={readySaving}
                className="w-full rounded-md bg-primary hover:bg-primary text-[12px] font-semibold text-foreground py-2 disabled:opacity-60"
              >
                {readySaving ? "Starting..." : "Start draft"}
              </button>
            )}
          </div>
        </div>
      )}

      <DraftTopBar
        league="Cartoon"
        title={draft.title || "Cartoon Draft"}
        back={isOnline ? undefined : { href: "/draft/my-drafts", label: "My drafts" }}
        facts={[
          draft.mode === "classic" ? "Classic" : draft.mode === "casual" ? "Casual" : draft.mode,
          draftType === "show" ? "Shows" : "Characters",
          "Scored by community vote",
          draft.rules?.pickTimerSeconds ? `${draft.rules.pickTimerSeconds}s per pick` : "No pick timer",
          isOnline && "Live room · saves after every pick",
        ]}
        actions={
          <>
            {!isOnline && <DraftButton tone="success" onClick={() => handleSaveDraft("saved")}><Save className="h-4 w-4" aria-hidden /> Save</DraftButton>}
            {!isOnline && !draftComplete && <DraftButton onClick={handlePauseDraft}><Pause className="h-4 w-4" aria-hidden /> Pause</DraftButton>}
            {isOnline && isHost ? (
              <DraftButton tone="primary" onClick={requestRematch}><PlusCircle className="h-4 w-4" aria-hidden /> New online draft</DraftButton>
            ) : (
              <DraftButton tone="primary" onClick={() => router.push("/draft/new?league=CARTOON")}><PlusCircle className="h-4 w-4" aria-hidden /> New draft</DraftButton>
            )}
            {isOnline && !isHost && <DraftButton onClick={leaveDraft}><LogOut className="h-4 w-4" aria-hidden /> Leave</DraftButton>}
            <DraftButton tone="danger" onClick={handleCancelDraft} title={isOnline ? "Ends the room for everyone" : undefined}><X className="h-4 w-4" aria-hidden /> Cancel</DraftButton>
          </>
        }
      />

      <TurnBanner
        who={activeParticipant ? seatDisplayNames[activeParticipant - 1] || `Player ${activeParticipant}` : null}
        detail={activeParticipant && currentSlot ? `Team ${activeParticipant} · slot ${currentSlot}` : undefined}
        seconds={timeLeft}
        mine={isOnline ? !!user && activeSeatUserId === user.id : !draftComplete}
        done={draftComplete}
        note={<span className="inline-flex items-center gap-1"><Wand2 className="h-3.5 w-3.5" aria-hidden /> When the timer runs out, the top search result is picked automatically.</span>}
      />

      {pickError && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-900/30 px-4 py-3 text-sm text-amber-100">
          {pickError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          <DraftSection title="Lineups" hint="Tap an open slot to pick for it.">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {teams.map((team, idx) => (
                <div
                  key={team.name}
                  className={`rounded-xl border ${
                    activeParticipant === idx + 1
                      ? "border-secondary bg-primary/5"
                      : "border-white/10 bg-card/40"
                  } p-3`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-foreground">
                      {team.name}
                    </div>
                    {activeParticipant === idx + 1 && (
                      <span className="rounded-full bg-primary/25 px-2 py-0.5 text-xs font-semibold text-secondary">
                        On the clock
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {team.picks.map((pick, slotIdx) => {
                      const slotNumber = idx * playersPerTeam + slotIdx + 1;
                      const isSelected = currentSlot === slotNumber;
                      const display =
                        pick?.character?.name ||
                        pick?.show?.name ||
                        pick?.character?.show?.name;
                      return (
                        <button
                          key={slotNumber}
                          onClick={() => setSelectedSlot(slotNumber)}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${
                            pick
                              ? "border-white/10 bg-card/70"
                              : "border-dashed border-white/10 bg-background/40"
                          } ${isSelected ? "ring-2 ring-secondary" : ""}`}
                        >
                          <div className="text-foreground">
                            {display || "Empty slot"}
                          </div>
                          {pick?.show?.channel && (
                            <div className="text-xs text-muted-foreground">
                              {pick.show.channel}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DraftSection>
        </section>

        <section className="space-y-3">
          <DraftSection
            title={`Find ${draftType === "show" ? "a show" : "a character"}`}
            hint={`${draft.rules?.cartoonChannel || "Any channel"} · ${draft.rules?.cartoonAgeRating || "any rating"}`}
          >
            <form onSubmit={(e) => { e.preventDefault(); void searchCandidates(); }} className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${draftType === "show" ? "shows" : "characters"}`}
                aria-label={`Search ${draftType === "show" ? "shows" : "characters"}`}
                className="min-h-10 flex-1 rounded-xl border border-white/10 bg-background px-3 text-sm outline-none focus:border-secondary"
              />
              <button type="submit" disabled={searching} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold hover:bg-[#8b5cf6] disabled:opacity-60">
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

          <div className="max-h-[32rem] space-y-2 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {searching
                  ? "Loading..."
                  : "No results yet. Try searching for a show or character."}
              </p>
            ) : (
              searchResults.map((result: any) => {
                const isCharacter = draftType === "character";
                const show = isCharacter
                  ? (result as CartoonCharacter).show
                  : (result as CartoonShow);
                return (
                  <div
                    key={result.id}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {result.name}
                        </div>
                        {show?.name && (
                          <div className="text-xs text-muted-foreground">
                            {show.name}
                          </div>
                        )}
                        {show?.channel && (
                          <div className="text-xs text-muted-foreground">
                            Channel: {show.channel}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => makePick(result)}
                        disabled={!canPick}
                        className="min-h-9 rounded-lg bg-emerald-400 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                      >
                        Draft
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </DraftSection>
        </section>
      </div>
    </main>
  );
}
