// app/draft/nba/[id]/page.tsx
// OPTION A (UPDATED WITH FULL GAME LOGIC FROM UNCOMMENTED VERSION)

"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import TEAM_DATA, { TeamData } from "../../../teamData";
import { useAuth } from "@/app/hooks/useAuth";
import { io as socketIo, type Socket } from "socket.io-client";
import { DraftButton, DraftSection, DraftTopBar, TurnBanner } from "../../components/DraftChrome";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/* ---------------------------------- Types --------------------------------- */
type Player = {
  id: string;
  name: string;
  position: string;
  eligiblePositions?: string | null;
  imageUrl?: string | null;
  primaryTeam?: string | null;
  heightInches?: number | null;

  // best season stats
  bestSeason?: {
    season: number;
    team: string;
    ppg: number;
    apg: number;
    rpg: number;
  } | null;
};

type DraftPick = {
  id: string;
  slot: number;
  position: string;
  player: Player;
  ownerIndex?: number;
  teamUsed?: string | null;
  seasonUsed?: number | null;
};

type DraftRules = {
  hallRule?: "any" | "only" | "none";
  maxPpgCap?: number | null;
  // overallCap?: number | null;
  multiTeamOnly?: boolean;
  peakMode?:
    | "peak"
    | "average"
    | "peak-era"
    | "peak-team"
    | "peak-era-team"
    | "average-era"
    | "average-era-team"
    | "career-avg"
    | "best-any";
  playedWithPlayerId?: string | null;
  statMode?:
    | "peak"
    | "average"
    | "peak-era"
    | "peak-team"
    | "peak-era-team"
    | "average-era"
    | "average-era-team"
    | "career-avg"
    | "best-any";

  participants?: number;
  playersPerTeam?: number;

  pickTimerSeconds?: number | null;
  autoPickEnabled?: boolean;
  lineup?: string[];
  fantasyScoring?: boolean;
  allowDefense?: boolean;

  allowRespinsWithoutPick?: boolean;

  // newly added
  status?: "saved" | "in_progress" | "complete";
  savedState?: any;
  savedAt?: string;
  mode?: string;
  suggestionsEnabled?: boolean;
  online?: boolean;
  roomCode?: string | null;
  seatDisplayNames?: string[];
  seatAssignments?: string[];
  hostUserId?: string | null;
};

type Draft = {
  randomTeam: boolean;
  id: string;
  title: string | null;
  league: string;

  // mode logic
  mode: string;

  rules?: DraftRules;

  eraFrom?: number | null;
  eraTo?: number | null;
  randomEra: boolean;

  teamConstraint?: string | null;

  maxPlayers: number;
  requirePositions: boolean;

  participants: number;
  playersPerTeam: number;

  picks: DraftPick[];
};

type ScoreResponse = {
  draftId: string;
  teamScore: number;
  avgScore: number;
  totalPpg: number;
  perPlayerScores: {
    pickId: string;
    playerId: string;
    name: string;
    position: string;
    seasonUsed?: number;
    ppg: number;
    score: number;
    slot?: number;
    ownerIndex?: number;

    // NEW
    threeRate?: number | null;
    heightInches?: number;
    usgPct?: number;
  }[];

  teams?: {
    participant: number;
    teamScore: number;
    totalPpg: number;
    totalRating: number;
    picks: ScoreResponse["perPlayerScores"];
  }[];

  winner?: number;
  ruleWarnings: string[];
};

type BestCandidate = {
  name: string;
  position: string;
  ppg?: number | null;
  season?: number | null;
  score?: number | null;
  team?: string | null;
  eraLabel?: string | null;
  source: "suggestion" | "search";
};

/* --------------------------------- Constants ------------------------------- */
const POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];

const DECADES = [
  { label: "1960s", from: 1960, to: 1969 },
  { label: "1970s", from: 1970, to: 1979 },
  { label: "1980s", from: 1980, to: 1989 },
  { label: "1990s", from: 1990, to: 1999 },
  { label: "2000s", from: 2000, to: 2009 },
  { label: "2010s", from: 2010, to: 2019 },
  { label: "2020s", from: 2020, to: 2029 },
];

// era team lists
const ERA_1960s = [
  "BOS",
  "LAL",
  "NYK",
  "GSW",
  "DET",
  "SAC",
  "PHI",
  "ATL",
  "WAS",
  "CHI",
  "OKC",
  "PHX",
];
const ERA_1970s = [
  ...ERA_1960s,
  "HOU",
  "MIL",
  "LAC",
  "CLE",
  "POR",
  "UTA",
  "DEN",
  "IND",
  "BKN",
  "SAS",
];
// Timberwolves/Heat/Mavs shouldn't appear in 1980s spins
const ERA_1980s = [...ERA_1970s, "CHA", "ORL", "MIA"];
const ERA_1990s = [...ERA_1980s, "DAL", "MIA", "MIN", "TOR", "MEM"];
const ERA_2000s = [...ERA_1990s];
const ERA_MODERN = [
  "ATL",
  "BOS",
  "BKN",
  "CHA",
  "CHI",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GSW",
  "HOU",
  "IND",
  "LAC",
  "LAL",
  "MEM",
  "MIA",
  "MIL",
  "MIN",
  "NOP",
  "NYK",
  "OKC",
  "ORL",
  "PHI",
  "PHX",
  "POR",
  "SAC",
  "SAS",
  "TOR",
  "UTA",
  "WAS",
];

function isTeamValidForEra(
  team: string,
  eraFrom?: number | null,
  eraTo?: number | null
) {
  if (!eraFrom || !eraTo) return true;
  const mid = Math.floor((eraFrom + eraTo) / 2);
  if (mid < 1970) return ERA_1960s.includes(team);
  if (mid < 1980) return ERA_1970s.includes(team);
  if (mid < 1990) return ERA_1980s.includes(team);
  if (mid < 2000) return ERA_1990s.includes(team);
  if (mid < 2010) return ERA_2000s.includes(team);
  return ERA_MODERN.includes(team);
}

/* ================================ Component =============================== */
export default function DraftPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  /***************************************************************************/
  /*                          STATE + LOADING                                */
  /***************************************************************************/
  const params = useParams();
  const id = params?.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const isOnline = draft?.rules?.online;

  /***************************************************************************/
  /*                           SPIN LOCKS                                    */
  /***************************************************************************/
  const [lockedTeam, setLockedTeam] = useState<string | null>(null);
  const [lockedEra, setLockedEra] = useState<{
    from: number;
    to: number;
  } | null>(null);

  const [currentSpinTeam, setCurrentSpinTeam] = useState<string | null>(null);
  const [eraSpinLabel, setEraSpinLabel] = useState("-");
  const [spinning, setSpinning] = useState(false);
  const [hasSpunThisTurn, setHasSpunThisTurn] = useState(false);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [readySaving, setReadySaving] = useState(false);

  /***************************************************************************/
  /*                           SEARCH / PENDING PICK                          */
  /***************************************************************************/
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [pendingPlayer, setPendingPlayer] = useState<Player | null>(null);

  /***************************************************************************/
  /*                           SCORING                                       */
  /***************************************************************************/
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  /***************************************************************************/
  /*                           TIMER                                         */
  /***************************************************************************/
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerDeadlineRef = useRef<number | null>(null);
  const timerTurnKeyRef = useRef<string | null>(null);
  const autoPickTriggeredRef = useRef(false);

  /***************************************************************************/
  /*                         DERIVED DATA                                    */
  /***************************************************************************/
  const isHost =
    !!user && draft?.rules?.hostUserId && draft.rules.hostUserId === user.id;
  const savedState = (draft?.rules?.savedState as any) || {};
  const rematchReadyRequested = !!savedState.rematchReadyRequested;
  const rematchReadyMap: Record<string, boolean> =
    savedState.rematchReadyMap || {};
  const readyPhaseActive = rematchReadyRequested;

  const teamDataMap = useMemo(() => {
    const map = new Map<string, TeamData>();
    TEAM_DATA.forEach((t) => map.set(t.code, t));
    return map;
  }, []);

  // UPDATED: participants & playersPerTeam fallback logic matches backend
  const participants = useMemo(
    () =>
      draft
        ? Math.min(
            6,
            Math.max(1, draft.rules?.participants || draft.participants || 1)
          )
        : 1,
    [draft]
  );

  const playersPerTeam = useMemo(
    () =>
      draft
        ? draft.rules?.playersPerTeam && draft.rules.playersPerTeam > 0
          ? draft.rules.playersPerTeam
          : draft.playersPerTeam
        : 5,
    [draft]
  );

  const allSlots = useMemo(
    () =>
      draft ? Array.from({ length: draft.maxPlayers }, (_, i) => i + 1) : [],
    [draft]
  );

  const getParticipantForSlot = (slot: number) =>
    Math.floor((slot - 1) / playersPerTeam) + 1;

  const activeParticipant = useMemo(() => {
    if (!draft) return null;
    if (draft.picks.length >= draft.maxPlayers) return null;
    return (draft.picks.length % participants) + 1;
  }, [draft, participants]);

  const defaultSlotForActive = useMemo(() => {
    if (!draft || !activeParticipant) return null;
    const taken = new Set(draft.picks.map((p) => p.slot));
    const candidate = allSlots.find(
      (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
    );
    return candidate ?? null;
  }, [draft, activeParticipant, allSlots]);

  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s = socketIo(API_URL, {
      transports: ["websocket"],
    });
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !id) return;

    socket.emit("draft:join", id);

    socket.on("draft:update", (updated: Draft) => {
      if (updated.id === id) {
        setDraft(updated);
      }
    });
    socket.on(
      "draft:cancelled",
      (payload: { draftId: string; roomCode?: string }) => {
        if (payload.draftId !== id) return;
        alert("Host cancelled this draft.");
        localStorage.removeItem("activeRoomDraftId");
        if (payload.roomCode) {
          window.location.href = `/online/room/${payload.roomCode}`;
        } else {
          window.location.href = "/online";
        }
      }
    );

    return () => {
      socket.off("draft:update");
      socket.off("draft:cancelled");
    };
  }, [socket, id]);

  /***************************************************************************/
  /*                              UTIL                                       */
  /***************************************************************************/
  function getSlotPosition(slot: number | null, d: Draft | null) {
    if (!slot || !d || !d.requirePositions) return;
    const lineup =
      d.rules?.lineup && d.rules.lineup.length
        ? d.rules.lineup
        : POSITION_ORDER;
    const perTeam = d.playersPerTeam || lineup.length;

    // Map slot to its position within that team's lineup; anything past the
    // defined lineup (e.g., the 6th slot) is treated as a bench slot.
    const relative = (slot - 1) % perTeam;
    if (relative >= lineup.length) return;
    return lineup[relative];
  }

  /***************************************************************************/
  /*                          DATA LOADING                                   */
  /***************************************************************************/
  async function loadDraft() {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`${API_URL}/drafts/${id}`);
    if (!res.ok) {
      setDraft(null);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDraft(data);
    setLoading(false);
  }

  async function loadScore() {
    if (!id) return;
    setScoreLoading(true);
    const res = await fetch(`${API_URL}/drafts/${id}/score`);
    if (!res.ok) {
      setScore(null);
      setScoreLoading(false);
      return;
    }
    const data = await res.json();
    setScore(data);
    setScoreLoading(false);
  }

  useEffect(() => {
    if (id) {
      loadDraft();
      loadScore();
    }
  }, [id]);

  useEffect(() => {
    if (!isOnline || !draft?.id) return;

    const interval = setInterval(async () => {
      const res = await fetch(`${API_URL}/drafts/${draft.id}`);
      const updated = await res.json();
      setDraft(updated);
    }, 2000); // 👈 2s sync

    return () => clearInterval(interval);
  }, [draft?.id, isOnline]);

  useEffect(() => {
    if (draft?.rules?.online && draft.rules.roomCode) {
      localStorage.setItem("activeRoomCode", draft.rules.roomCode);
      localStorage.setItem("activeRoomDraftId", draft.id);
    }
  }, [draft?.id, draft?.rules?.online, draft?.rules?.roomCode]);

  const [suggestedPicks, setSuggestedPicks] = useState<
    {
      playerId: string;
      name: string;
      position: string;
      score: number;
      ppg: number;
      seasonUsed?: number;
    }[]
  >([]);
  const [bestCandidate, setBestCandidate] = useState<BestCandidate | null>(
    null
  );

  async function loadSuggestions() {
    if (!draft) return;

    if (draft.mode !== "casual") {
      setSuggestedPicks([]);
      return;
    }

    if (!draft.rules?.suggestionsEnabled) {
      setSuggestedPicks([]);
      return;
    }

    const res = await fetch(`${API_URL}/drafts/${draft.id}/suggestions`);
    if (!res.ok) {
      setSuggestedPicks([]);
      return;
    }

    const data = await res.json();
    setSuggestedPicks(data);
  }

  async function persistSavedState(
    patch: Record<string, any>,
    opts?: { silent?: boolean }
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
          status: draft.rules?.status || "in_progress",
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

  async function markReadyForRematch() {
    if (!draft?.rules?.online || !user) return;
    if (!readyPhaseActive) {
      alert("Host needs to open a new draft first.");
      return;
    }
    const map = {
      ...(rematchReadyMap || {}),
      [user.id]: true,
    };
    await persistSavedState({
      rematchReadyRequested: true,
      rematchReadyMap: map,
    });
    setShowReadyModal(true);
  }

  async function requestRematch() {
    if (!draft?.rules?.online || !isHost) return;
    const ok = confirm(
      draftComplete
        ? "Start a fresh online draft for this room?"
        : "Start a new online draft and have everyone ready up?"
    );
    if (!ok) return;

    const map = {
      ...(rematchReadyMap || {}),
      ...(user?.id ? { [user.id]: true } : {}),
    };

    await persistSavedState({
      rematchReadyRequested: true,
      rematchReadyMap: map,
    });
    setShowReadyModal(true);
  }

  /***************************************************************************/
  /*            SYNC SELECTEDSLOT WITH ACTIVE PARTICIPANT’S OPEN SLOT        */
  /***************************************************************************/
  useEffect(() => {
    if (!draft || !activeParticipant) return;

    const taken = new Set(draft.picks.map((p) => p.slot));
    const slotsForActive = allSlots.filter(
      (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
    );

    if (!slotsForActive.length) {
      setSelectedSlot(null);
      return;
    }

    setSelectedSlot((prev) => {
      if (!prev) return slotsForActive[0];
      if (getParticipantForSlot(prev) !== activeParticipant || taken.has(prev))
        return slotsForActive[0];
      return prev;
    });
  }, [draft, activeParticipant]);

  // Keep local spin locks in sync with saved state so all players see the spinner result
  useEffect(() => {
    const saved = draft?.rules?.savedState as
      | { teamLandedOn?: string; eraFrom?: number; eraTo?: number }
      | undefined;

    if (saved?.teamLandedOn) {
      setLockedTeam(saved.teamLandedOn);
      setCurrentSpinTeam(saved.teamLandedOn);
    }
    if (saved?.eraFrom && saved?.eraTo) {
      setLockedEra({ from: saved.eraFrom, to: saved.eraTo });
      setEraSpinLabel(`${saved.eraFrom}-${saved.eraTo}`);
    }
  }, [draft?.rules?.savedState]);

  useEffect(() => {
    if (draft?.rules?.online && rematchReadyRequested) {
      setShowReadyModal(true);
    }
  }, [draft?.rules?.online, rematchReadyRequested]);

  useEffect(() => {
    const nextDraftId = (savedState as any)?.rematchNextDraftId as
      | string
      | undefined;
    if (
      draft?.rules?.online &&
      nextDraftId &&
      draft.id !== nextDraftId &&
      !isHost
    ) {
      localStorage.setItem("activeRoomDraftId", nextDraftId);
      router.push(`/draft/${nextDraftId}`);
    }
  }, [draft?.rules?.online, savedState?.rematchNextDraftId, draft?.id, isHost, router]);

  /***************************************************************************/
  /*                        BUILD SEARCH PARAMS (UPDATED)                    */
  /***************************************************************************/
  function buildSearchParams(
    slot: number | null,
    extra?: { limit?: number; ignoreName?: boolean }
  ) {
    const params = new URLSearchParams();
    if (!draft) return params;

    params.set("league", draft.league || "NBA");

    // name
    // name (optionally ignored)
    if (searchQuery && !extra?.ignoreName) {
      params.set("q", searchQuery);
    }

    // UPDATED: spin-locked era overrides draft era
    const useEraFrom = lockedEra?.from ?? draft.eraFrom;
    const useEraTo = lockedEra?.to ?? draft.eraTo;
    if (useEraFrom && useEraTo) {
      params.set("eraFrom", String(useEraFrom));
      params.set("eraTo", String(useEraTo));
    }

    // position
    // position
    if (slot) {
      const pos = getSlotPosition(slot, draft);
      if (pos) params.set("position", pos);
    }

    // UPDATED: lockedTeam overrides teamConstraint
    const teamFilter = lockedTeam ?? draft.teamConstraint;
    if (teamFilter) params.set("team", teamFilter);

    // hall rule
    const hallRule = draft.rules?.hallRule;
    if (hallRule && hallRule !== "any") params.set("hallRule", hallRule);

    if (draft.rules?.mode) params.set("mode", draft.rules.mode);

    // multi-team
    if (draft.rules?.multiTeamOnly) params.set("multiTeamOnly", "true");

    if (extra?.limit) params.set("limit", String(extra.limit));
    return params;
  }

  async function searchPlayers() {
    if (!draft) return;

    const slot = selectedSlot ?? defaultSlotForActive;
    if (!slot) {
      alert("No available slot selected for this player.");
      return;
    }

    setSearchLoading(true);
    try {
      const params = buildSearchParams(slot);
      const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
      if (!res.ok) {
        setSearchResults([]);
        return;
      }
      const data = await res.json();
      setSearchResults(data);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadBestCandidate() {
    if (!draft) return;

    const slot = selectedSlot ?? defaultSlotForActive;
    if (!slot) {
      setBestCandidate(null);
      return;
    }

    const eraLabel = lockedEra
      ? `${lockedEra.from}-${lockedEra.to}`
      : draft.randomEra
      ? "Random"
      : draft.eraFrom && draft.eraTo
      ? `${draft.eraFrom}-${draft.eraTo}`
      : null;

    const teamForDisplay =
      lockedTeam ??
      (savedState as any)?.teamLandedOn ??
      draft.teamConstraint ??
      null;

    const requiredPos = getSlotPosition(slot, draft);

    try {
      const suggestionRes = await fetch(
        `${API_URL}/drafts/${draft.id}/suggestions?limit=1`
      );
      if (suggestionRes.ok) {
        const suggested = await suggestionRes.json();
        if (Array.isArray(suggested) && suggested.length) {
          const pick = suggested[0];
          setBestCandidate({
            name: pick.name,
            position: pick.position,
            ppg: pick.ppg,
            season: pick.seasonUsed ?? null,
            score: pick.score,
            team: teamForDisplay,
            eraLabel,
            source: "suggestion",
          });
          return;
        }
      }
    } catch {
      // fall back to search-based heuristic
    }

    const params = buildSearchParams(slot, { limit: 50, ignoreName: true });
    try {
      const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
      if (!res.ok) {
        setBestCandidate(null);
        return;
      }
      const data: Player[] = await res.json();
      const eligible = requiredPos
        ? data.filter((p) => isPlayerEligible(p, requiredPos))
        : data;

      if (!eligible.length) {
        setBestCandidate(null);
        return;
      }

      const sorted = eligible
        .map((p) => ({
          player: p,
          score: p.bestSeason?.ppg ?? 0,
        }))
        .sort((a, b) => b.score - a.score);

      const top = sorted[0];
      setBestCandidate({
        name: top.player.name,
        position: requiredPos ?? top.player.position,
        ppg: top.player.bestSeason?.ppg ?? null,
        season: top.player.bestSeason?.season ?? null,
        score: top.score || null,
        team: teamForDisplay ?? top.player.primaryTeam ?? null,
        eraLabel,
        source: "search",
      });
    } catch {
      setBestCandidate(null);
    }
  }

  /***************************************************************************/
  /*                            AUTO PICK (UPDATED)                          */
  /***************************************************************************/
  async function autoPickCurrentTurn() {
    if (!draft || !activeParticipant) return;

    const taken = new Set(draft.picks.map((p) => p.slot));
    const slotsForActive = allSlots.filter(
      (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
    );
    if (!slotsForActive.length) return;

    const autoSlot = slotsForActive[0];

    try {
      // First try: respect position / team / era, but ignore name query
      let params = buildSearchParams(autoSlot, {
        limit: 50,
        ignoreName: true,
      });
      let res = await fetch(`${API_URL}/players/search?${params.toString()}`);
      let data: Player[] = await res.json();

      // Fallback: relax position – just era/team/hall/etc
      if (!data.length) {
        const fallbackParams = buildSearchParams(null, {
          limit: 100,
          ignoreName: true,
        });
        res = await fetch(
          `${API_URL}/players/search?${fallbackParams.toString()}`
        );
        data = await res.json();
      }

      if (!data.length) return;

      // random pick from eligible pool
      const candidate = data[Math.floor(Math.random() * data.length)];
      await lockInPlayer(candidate, autoSlot, true);
    } catch {
      // swallow auto-pick errors so timer doesn't crash UI
    }
  }

  /***************************************************************************/
  /*                       ELIGIBLE POSITION LOGIC                           */
  /***************************************************************************/
  const [selectedPositionForPick, setSelectedPositionForPick] = useState<
    string | null
  >(null);

  function getEligiblePositions(player: Player) {
    if (!player.eligiblePositions) return [player.position];
    return player.eligiblePositions.split(",").map((s) => s.trim());
  }

  function matchesRequiredPosition(required: string, token: string) {
    const req = required.toUpperCase();
    const pos = token.toUpperCase();

    if (req === "C") {
      return pos.includes("C"); // C, C-F, F-C, G-C, etc.
    }

    if (req === "PF") {
      return (
        pos === "PF" || pos === "F" || (pos.includes("F") && pos.includes("C")) // C-F, F-C
      );
    }

    if (req === "SF") {
      return (
        pos === "SF" || pos === "F" || (pos.includes("F") && pos.includes("G")) // F-G, G-F
      );
    }

    if (req === "SG") {
      return (
        pos === "SG" || pos === "G" || (pos.includes("G") && pos.includes("F")) // F-G, G-F
      );
    }

    if (req === "PG") {
      return pos === "PG" || pos === "G";
    }

    return pos === req;
  }

  function isPlayerEligible(player: Player, requiredPos?: string) {
    if (!requiredPos) return true; // bench / free mode
    const eligibles = getEligiblePositions(player);
    return eligibles.some((pos) => matchesRequiredPosition(requiredPos, pos));
  }

  /***************************************************************************/
  /*                        LOCK IN PICK (UPDATED)                           */
  /***************************************************************************/
  async function lockInPlayer(
    player: Player,
    slotOverride?: number,
    fromAutoPick = false
  ) {
    if (!draft || !activeParticipant) return;

    // 🔹 NEW - client-side guard for online spectators
    if (
      draft.rules?.online &&
      draft.rules.seatAssignments &&
      user &&
      !draft.rules.seatAssignments.includes(user.id)
    ) {
      alert("You are spectating this draft and cannot make picks.");
      return;
    }

    const slot = slotOverride ?? selectedSlot;
    if (!slot) return;

    const slotOwner = getParticipantForSlot(slot);

    // UPDATED strict turn enforcement
    if (slotOwner !== activeParticipant) {
      alert(`It's Player ${activeParticipant}'s turn.`);
      return;
    }

    const requiredPos = getSlotPosition(slot, draft);
    const eligiblePositions = getEligiblePositions(player);

    // UPDATED eligibility check with flexible position matching
    if (requiredPos && !isPlayerEligible(player, requiredPos)) {
      if (!fromAutoPick) {
        alert("Player not eligible for this position.");
      }
      return;
    }

    // Position selection
    let position =
      requiredPos ??
      (eligiblePositions.length > 1 && selectedPositionForPick
        ? selectedPositionForPick
        : player.position);

    // NEW: backend updated route expects PATCH /drafts/:id with payload
    const res = await fetch(`${API_URL}/drafts/${draft.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        slot,
        playerId: player.id,
        position,
        autopick: fromAutoPick,
        ownerIndex: activeParticipant,
        mode: draft.rules?.mode,
        teamLandedOn:
          lockedTeam ?? draft.rules?.savedState?.teamLandedOn ?? null,
        eraFrom:
          lockedEra?.from ??
          draft.rules?.savedState?.eraFrom ??
          draft.eraFrom ??
          null,
        eraTo:
          lockedEra?.to ??
          draft.rules?.savedState?.eraTo ??
          draft.eraTo ??
          null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setPickError(err.error || "Pick failed.");
      return;
    }

    setPickError(null);
    setPendingPlayer(null);
    setSelectedPositionForPick(null);
    setSearchQuery("");
    setSearchResults([]);
    clearLocks();

    await loadDraft();
    await loadScore();
  }

  async function handlePick() {
    if (pendingPlayer && selectedSlot) {
      await lockInPlayer(pendingPlayer, selectedSlot);
    }
  }

  /***************************************************************************/
  /*                                UNDO                                      */
  /***************************************************************************/
  async function handleUndo(slot: number, e?: React.MouseEvent) {
    if (draft?.picks.length === 0) return;
    if (draft?.rules?.online) {
      alert("Undo is disabled for online drafts.");
      return;
    }

    if (e) e.stopPropagation();
    if (!draft) return;

    const res = await fetch(`${API_URL}/drafts/${draft.id}/picks/${slot}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to undo pick");
      return;
    }

    await loadDraft();
    await loadScore();

    setPendingPlayer(null);
    setSelectedSlot(slot);
  }
  /***************************************************************************/
  /*                                SAVE, PAUSE, NEW, CANCEL                 */
  /***************************************************************************/

  async function handleSaveDraft() {
    if (!draft) return;

    if (!user) {
      alert("Log in to save drafts and show up on leaderboards.");
      return;
    }

    await fetch(`${API_URL}/drafts/${draft.id}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },

      body: JSON.stringify({
        status: "saved",
      }),
    });

    alert("Draft saved");
  }

  async function handlePauseDraft() {
    if (!draft) return;

    if (!user) {
      alert("Log in to save drafts and show up on leaderboards.");
      return;
    }

    await fetch(`${API_URL}/drafts/${draft.id}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        status: "saved",
      }),
    });

    alert("Draft paused & saved");
  }

  async function handleCancelDraft() {
    if (!draft) return;

    const ok = confirm("Are you sure? This will delete the draft.");
    if (!ok) return;

    if (
      draft.rules?.online &&
      draft.rules.hostUserId &&
      user?.id !== draft.rules.hostUserId
    ) {
      alert("Only the host can cancel this online draft.");
      return;
    }

    await fetch(`${API_URL}/drafts/${draft.id}`, {
      method: "DELETE",
    });

    if (draft.rules?.online && draft.rules.roomCode) {
      localStorage.removeItem("activeRoomDraftId");
      localStorage.removeItem("activeRoomCode");
      if (token) {
        await fetch(`${API_URL}/rooms/${draft.rules.roomCode}/leave`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
      }
      window.location.href = "/online";
      return;
    }

    window.location.href = "/draft/new";
  }

  async function startOnlineRematch() {
    if (!draft || !draft.rules?.online || !token || !isHost) return;

    const rulesForNext: any = { ...(draft.rules || {}) };
    delete rulesForNext.savedState;

    const payload = {
      title: `Room ${draft.rules.roomCode} Draft`,
      league: draft.league || "NBA",
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
      requirePositions: draft.requirePositions,
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
    await persistSavedState({
      rematchReadyRequested: false,
      rematchReadyMap: {},
      rematchNextDraftId: nextDraft.id,
    });
    setShowReadyModal(false);
    localStorage.setItem("activeRoomDraftId", nextDraft.id);
    localStorage.setItem(
      "activeRoomCode",
      draft.rules.roomCode || String(draft.id)
    );
    router.push(`/draft/${nextDraft.id}`);
  }

  function handleNewDraft() {
    if (draft?.rules?.online && draft.rules.roomCode) {
      if (isHost) {
        requestRematch();
        return;
      }
      markReadyForRematch();
      return;
    }

    const ok = draftComplete
      ? true
      : confirm("Draft not finished. Start a new one anyway?");
    if (!ok) return;

    window.location.href = "/draft/new";
  }

  function handleBackToRoom() {
    if (draft?.rules?.online && draft.rules.roomCode) {
      window.location.href = `/online/room/${draft.rules.roomCode}`;
    }
  }

  /***************************************************************************/
  /*                               SPIN LOGIC                                */
  /***************************************************************************/
  type EraTeamCombo = { era: (typeof DECADES)[number]; team: string };
  const NBA_TEAMS = TEAM_DATA.map((t) => t.code);

  function buildValidEraTeamCombos(): EraTeamCombo[] {
    const combos: EraTeamCombo[] = [];
    for (const era of DECADES) {
      for (const team of NBA_TEAMS) {
        if (isTeamValidForEra(team, era.from, era.to)) {
          combos.push({ era, team });
        }
      }
    }
    return combos;
  }

  function spin<T>(
    items: T[],
    setItem: (v: T) => void,
    setFlag: (v: boolean) => void,
    onDone: (item: T) => void
  ) {
    if (!items.length) return;
    setFlag(true);
    let i = 0;
    const interval = setInterval(() => {
      setItem(items[i % items.length]);
      i++;
    }, 90);

    setTimeout(() => {
      clearInterval(interval);
      const final = items[Math.floor(Math.random() * items.length)];
      setItem(final);
      onDone(final);
      setFlag(false);
    }, 1400);
  }

  // After a spin lands (or the slot / player changes) show matching players straight away — no extra Search click.
  useEffect(() => {
    if (draft && (lockedTeam || lockedEra) && (selectedSlot ?? defaultSlotForActive)) void searchPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedTeam, lockedEra, selectedSlot, activeParticipant]);

  function handleSpinEraTeam() {
    if (!draft) return;
    if (draft.rules?.online && !amOnClock) {
      alert("Only the active player can spin right now.");
      return;
    }

    const isClassicMode = draft.mode === "classic";
    const allowRespin = draft.rules?.allowRespinsWithoutPick || !isClassicMode;

    // In classic mode, 1 spin per turn unless explicitly allowed
    if (isClassicMode && hasSpunThisTurn && !allowRespin) {
      alert("Already spun this turn.");
      return;
    }

    const combos = buildValidEraTeamCombos();

    spin<EraTeamCombo>(
      combos,
      (item) => {
        setCurrentSpinTeam(item.team);
        setEraSpinLabel(item.era.label);
      },
      setSpinning,
      async (final) => {
        setCurrentSpinTeam(final.team);
        setEraSpinLabel(final.era.label);
        setLockedTeam(final.team);
        setLockedEra({ from: final.era.from, to: final.era.to });
        setHasSpunThisTurn(true);

        // SAVE SPIN TO BACKEND (IMPORTANT)
        await persistSavedState(
          {
            teamLandedOn: final.team,
            eraFrom: final.era.from,
            eraTo: final.era.to,
          },
          { silent: true }
        );

        // refresh suggestions immediately with new era/team context
        loadSuggestions();
      }
    );
  }

  useEffect(() => {
    setHasSpunThisTurn(false);
    clearLocks();
  }, [activeParticipant]);

  function clearLocks() {
    setLockedEra(null);
    setLockedTeam(null);
    setCurrentSpinTeam(null);
    setEraSpinLabel("-");
    setHasSpunThisTurn(false);
  }

  /***************************************************************************/
  /*                               TIMER Updated                             */
  /***************************************************************************/
  useEffect(() => {
    const clearIntervalOnly = () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };

    const resetTimer = () => {
      clearIntervalOnly();
      timerDeadlineRef.current = null;
      timerTurnKeyRef.current = null;
      autoPickTriggeredRef.current = false;
      setTimerActive(false);
      setTimeLeft(null);
    };

    if (!draft || !activeParticipant) {
      resetTimer();
      return;
    }

    const seconds = draft.rules?.pickTimerSeconds ?? null;
    const auto = draft.rules?.autoPickEnabled;
    const needsEraSpin =
      draft.mode === "classic" && draft.randomEra && !lockedEra;
    const needsTeamSpin =
      draft.mode === "classic" && draft.randomTeam && !lockedTeam;

    if (!seconds || !auto || needsEraSpin || needsTeamSpin) {
      resetTimer();
      return;
    }

    const picksForActive = draft.picks.filter(
      (p) => p.ownerIndex === activeParticipant
    );
    if (picksForActive.length >= playersPerTeam) {
      resetTimer();
      return;
    }

    const turnKey = `${draft.id}-${activeParticipant}-${draft.picks.length}`;
    const timerAlreadyRunning = timerTurnKeyRef.current === turnKey;

    if (!timerAlreadyRunning) {
      timerTurnKeyRef.current = turnKey;
      timerDeadlineRef.current = Date.now() + seconds * 1000;
      autoPickTriggeredRef.current = false;
    }

    setTimerActive(true);

    const tick = () => {
      const deadline = timerDeadlineRef.current;
      if (!deadline) return;
      const remainingMs = deadline - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

      setTimeLeft((prev) =>
        prev === remainingSeconds ? prev : remainingSeconds
      );

      if (remainingMs <= 0 && !autoPickTriggeredRef.current) {
        autoPickTriggeredRef.current = true;
        resetTimer();
        if (!pendingPlayer) {
          autoPickCurrentTurn();
        }
      }
    };

    tick();
    clearIntervalOnly();
    timerIntervalRef.current = setInterval(tick, 250);

    return () => clearIntervalOnly();
  }, [
    draft,
    activeParticipant,
    lockedEra,
    lockedTeam,
    playersPerTeam,
    pendingPlayer,
  ]);

  // Player cards rendered via memoized component near bottom of file
  /***************************************************************************/
  /*                   AUTO SCROLL TO ACTIVE PARTICIPANT                   */
  /***************************************************************************/
  const teamRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!activeParticipant || !teamRefs.current[activeParticipant - 1]) return;
    teamRefs.current[activeParticipant - 1]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeParticipant]);

  /***************************************************************************/
  /*                        KEYBOARD SHORTCUTS                             */
  /***************************************************************************/
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!draft || !activeParticipant) return;

      // 1–6 jump
      const teamNum = Number(e.key);
      if (teamNum >= 1 && teamNum <= participants) {
        const taken = new Set(draft.picks.map((p) => p.slot));
        const slots = allSlots.filter(
          (s) => getParticipantForSlot(s) === teamNum && !taken.has(s)
        );
        if (slots.length) {
          setSelectedSlot(slots[0]);
          teamRefs.current[teamNum - 1]?.scrollIntoView({
            behavior: "smooth",
            inline: "center",
          });
        }
      }

      if (e.key === "Enter") {
        if (pendingPlayer && selectedSlot) handlePick();
      }

      if (e.key === "Backspace") {
        setPendingPlayer(null);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingPlayer, selectedSlot, draft, participants, allSlots]);

  useEffect(() => {
    if (!draft || !activeParticipant) return;
    loadSuggestions();
  }, [
    draft?.picks.length,
    activeParticipant,
    draft?.rules?.suggestionsEnabled,
    lockedTeam,
    lockedEra?.from,
    lockedEra?.to,
  ]);

  useEffect(() => {
    loadBestCandidate();
  }, [
    draft?.id,
    draft?.picks.length,
    lockedTeam,
    lockedEra?.from,
    lockedEra?.to,
    selectedSlot,
    defaultSlotForActive,
  ]);

  // helpers / derived values that shouldn't change hook order
  const safeLen = (arr?: any[]) => (arr && arr.length ? arr.length : 1);
  const draftComplete = draft ? draft.picks.length >= draft.maxPlayers : false;

  const activeSeatName =
    activeParticipant &&
    draft?.rules?.seatDisplayNames &&
    draft.rules.seatDisplayNames[activeParticipant - 1]
      ? draft.rules.seatDisplayNames[activeParticipant - 1]
      : null;

  const isSpectator =
    !!user &&
    draft?.rules?.online &&
    draft.rules?.seatAssignments &&
    !draft.rules.seatAssignments.includes(user.id);

  const activeSeatUserId =
    draft?.rules?.seatAssignments && activeParticipant
      ? draft.rules.seatAssignments[activeParticipant - 1]
      : null;

  const amOnClock = !!user && activeSeatUserId === user.id;

  const readyParticipants =
    draft?.rules?.seatAssignments?.map((uid, idx) => ({
      userId: uid,
      name:
        draft?.rules?.seatDisplayNames?.[idx] ||
        `Player ${idx + 1}`,
      ready: !!rematchReadyMap[uid],
    })) ?? [];

  const totalReady = readyParticipants.filter((p) => p.ready).length;

  const allTeams = (score?.teams ?? []) as Array<
    NonNullable<ScoreResponse["teams"]>[number]
  >;

  useEffect(() => {
    if (!draft || !draftComplete) return;

    if (!user) {
      alert("Log in to save drafts and show up on leaderboards.");
      return;
    }

    fetch(`${API_URL}/drafts/${draft.id}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ status: "complete" }),
    });
  }, [draft, draftComplete]);

  /***************************************************************************/
  /*                                 UI LOADING                             */
  /***************************************************************************/
  if (loading || !draft) {
    return (
      <main className="min-h-screen text-foreground flex items-center justify-center">
        <p className="text-lg">Loading draft...</p>
      </main>
    );
  }

  const participantNumbers = Array.from(
    { length: participants },
    (_, i) => i + 1
  );

  type TeamSummary = NonNullable<ScoreResponse["teams"]>[number] & {
    spacing?: number;
    size?: number;
    usageBalance?: number;
  };

  const teamsWithChemistry: TeamSummary[] = allTeams.map((t) => {
    const picks = t.picks ?? [];
    const spacing =
      (picks.filter((p) => (p.threeRate ?? 0) >= 0.33).length /
        safeLen(picks)) *
      100;

    const avgHeight =
      picks.reduce((s, p) => s + (p.heightInches ?? 78), 0) / safeLen(picks);

    const size = Math.min(100, (avgHeight - 72) * 6);

    const avgUsage =
      picks.reduce((s, p) => s + (p.usgPct ?? 20), 0) / safeLen(picks);

    const usageBalance = 100 - Math.min(100, Math.abs(avgUsage - 22) * 6);

    return { ...t, spacing, size, usageBalance };
  });

  const leaderBy = <K extends keyof TeamSummary>(key: K) => {
    if (!teamsWithChemistry.length) return null;
    return teamsWithChemistry.reduce((best, t) =>
      (t[key] ?? 0) > (best[key] ?? 0) ? t : best
    );
  };

  const leaderTeam =
    teamsWithChemistry.length > 0
      ? teamsWithChemistry.reduce((best, t) =>
          (t.teamScore ?? 0) > (best.teamScore ?? 0) ? t : best
        )
      : null;

  function ChemistryBar({
    label,
    value,
    good,
  }: {
    label: string;
    value: number;
    good: boolean;
  }) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{label}</span>
          <span className={good ? "text-emerald-300" : "text-orange-300"}>
            {value.toFixed(0)}
          </span>
        </div>
        <div className="h-1.5 rounded bg-white/10 overflow-hidden">
          <div
            className={`h-full ${good ? "bg-emerald-500" : "bg-orange-400"}`}
            style={{ width: `${Math.min(100, value)}%` }}
          />
        </div>
      </div>
    );
  }

  /***************************************************************************/
  /*                           MAIN RENDER LAYOUT                            */
  /***************************************************************************/
  return (
    <>
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
                className="text-[11px] text-muted-foreground hover:text-white"
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
                <div className="text-[11px] text-muted-foreground">
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
                {readySaving ? "Starting..." : "Start anyways"}
              </button>
            )}

            {isHost && (
              <p className="text-[10px] text-muted-foreground text-center">
                Start now or wait for more players to ready up.
              </p>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl space-y-6 overflow-x-hidden px-4 py-6 text-foreground md:px-6 md:py-10">
        <DraftTopBar
          league="NBA"
          title={draft.title || "NBA Era Draft"}
          back={isOnline ? undefined : { href: "/draft/my-drafts", label: "My drafts" }}
          facts={[
            draft.mode === "classic" ? "Classic" : draft.mode === "casual" ? "Casual" : draft.mode,
            draft.randomEra ? "Random era" : `${draft.eraFrom ?? "?"}–${draft.eraTo ?? "?"}`,
            `${participants} teams · ${playersPerTeam} slots`,
            isOnline && "Live room · saves after every pick",
          ]}
          actions={
            <>
              {!isOnline && <DraftButton tone="success" onClick={handleSaveDraft}>Save</DraftButton>}
              {!draftComplete && !isOnline && <DraftButton onClick={handlePauseDraft}>Pause</DraftButton>}
              {isOnline && <DraftButton onClick={handleBackToRoom}>Back to room</DraftButton>}
              {isOnline && !isHost ? (
                <DraftButton tone={readyPhaseActive ? "success" : "ghost"} onClick={handleNewDraft} disabled={!readyPhaseActive || readySaving || (!!user && rematchReadyMap[user.id])}>
                  {user && rematchReadyMap[user.id] ? "Ready" : readyPhaseActive ? "Ready up" : "Waiting for host"}
                </DraftButton>
              ) : (
                <DraftButton tone="primary" onClick={handleNewDraft}>New draft</DraftButton>
              )}
              <DraftButton tone="danger" onClick={handleCancelDraft} title={isOnline ? "Ends the room for everyone" : undefined}>Cancel</DraftButton>
            </>
          }
        />

        <TurnBanner
          who={activeParticipant ? activeSeatName ?? `Player ${activeParticipant}` : null}
          detail={activeParticipant ? `Player ${activeParticipant} · slot ${selectedSlot ?? defaultSlotForActive ?? "–"}` : undefined}
          seconds={timerActive ? timeLeft : null}
          mine={isOnline ? amOnClock : !draftComplete}
          done={draftComplete}
          note={isOnline && user ? (isSpectator ? <span className="text-amber-300">You are watching this draft.</span> : <span className="text-emerald-300">You have a seat in this draft.</span>) : undefined}
        >
          {bestCandidate && !draftComplete && (
            <div className="min-w-[220px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
              <div className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">Best available</div>
              <div className="text-sm font-semibold text-emerald-200">{bestCandidate.name}</div>
              <div className="text-muted-foreground">
                {[bestCandidate.position, bestCandidate.team, bestCandidate.season, bestCandidate.ppg ? `${bestCandidate.ppg.toFixed(1)} PPG` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
        </TurnBanner>

      {/* ============================ MAIN BODY ============================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        {/* ====================== LEFT SIDE: FULL WIDTH BOARD ====================== */}
        <DraftSection title="Lineups" hint="Tap an open slot to pick for it.">
          {/* BOARD WRAPPER: one column per team, wrapping on wide screens and scrolling sideways on phones */}
          <div className="no-scrollbar -mx-1 w-full overflow-x-auto px-1 pb-1">
            <div className="grid min-w-max auto-cols-[minmax(240px,1fr)] grid-flow-col gap-4 md:min-w-0 md:grid-flow-row md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              {participantNumbers.map((pNum, idx) => {
                const slots = allSlots.filter(
                  (s) => getParticipantForSlot(s) === pNum
                );
                const isCurrent = activeParticipant === pNum;

                const filledCount = slots.filter((s) =>
                  draft.picks.some((p) => p.slot === s)
                ).length;

                const teamScore = score?.teams?.find(
                  (t) => t.participant === pNum
                );

                return (
                  <div
                    key={pNum}
                    ref={(el) => {
                      teamRefs.current[idx] = el;
                    }}
                    className={`
                      flex flex-col
                      rounded-2xl
                      border-[1.5px]
                      bg-background/60
                      p-3
                      transition-all
                      ${
                        isCurrent
                          ? "border-secondary shadow-lg shadow-indigo-500/30"
                          : "border-white/10"
                      }
                    `}
                  >
                    {/* Team Header + Score + Chemistry */}
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex flex-col">
                        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Team {pNum}
                        </span>
                        <span className="text-sm font-semibold">
                          {isCurrent ? "On the clock" : "Lineup"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {filledCount}/{slots.length} filled
                        </span>
                      </div>

                      {teamScore && (
                        <div className="text-right text-[10px] leading-tight">
                          <div className="text-muted-foreground">Score</div>
                          <div className="text-sm font-semibold text-emerald-300">
                            {teamScore.teamScore.toFixed(1)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {teamScore.totalPpg.toFixed(1)} PPG
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Player slots */}
                    <div className="flex flex-col gap-2">
                      {slots.map((slot) => {
                        const pick = draft.picks.find((p) => p.slot === slot);
                        const positionLabel = getSlotPosition(slot, draft);
                        const playerScore =
                          score?.perPlayerScores.find((s) => s.slot === slot) ??
                          null;
                        const teamCode =
                          pick?.teamUsed || pick?.player.primaryTeam || null;
                        const teamData = teamCode
                          ? teamDataMap.get(teamCode)
                          : undefined;
                        return (
                          <PlayerCard
                            key={slot}
                            pick={pick}
                            slot={slot}
                            positionLabel={positionLabel}
                            isSelected={selectedSlot === slot}
                            playerScore={playerScore}
                            teamData={teamData}
                            teamCode={teamCode}
                            canUndo={!draft?.rules?.online}
                            onSelect={setSelectedSlot}
                            onUndo={
                              draft?.rules?.online ? undefined : handleUndo
                            }
                          />
                        );
                      })}
                    </div>

                    {teamScore && (
                      <div className="mb-2 mt-1 flex gap-2">
                        <div className="flex-1 space-y-1.5">
                          <ChemistryBar
                            label="Spacing"
                            value={
                              (teamScore.picks.filter(
                                (p) => (p.threeRate ?? 0) >= 0.33
                              ).length /
                                safeLen(teamScore.picks)) *
                              100
                            }
                            good={true}
                          />
                          <ChemistryBar
                            label="Size"
                            value={Math.min(
                              100,
                              (teamScore.picks.reduce(
                                (s, p) => s + (p.heightInches ?? 78),
                                0
                              ) /
                                safeLen(teamScore.picks) -
                                72) *
                                6
                            )}
                            good={true}
                          />
                          <ChemistryBar
                            label="Usage Balance"
                            value={
                              100 -
                              Math.min(
                                100,
                                Math.abs(
                                  teamScore.picks.reduce(
                                    (s, p) => s + (p.usgPct ?? 20),
                                    0
                                  ) /
                                    safeLen(teamScore.picks) -
                                    22
                                ) * 6
                              )
                            }
                            good={true}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {participants > 1 && <p className="text-xs text-muted-foreground md:hidden">Swipe sideways to see every team.</p>}
        </DraftSection>

        {/* =========================== RIGHT SIDE =========================== */}
        <section className="space-y-6">
          {/* Spin Controls */}
          <DraftSection
            title="Spin"
            hint="Land on a team and an era, then pick from them."
            actions={
              <div className="flex items-center gap-2">
                <DraftButton onClick={clearLocks} disabled={!lockedEra && !lockedTeam}>Clear</DraftButton>
                <button
                  onClick={handleSpinEraTeam}
                  disabled={spinning}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-black shadow-[0_0_24px_-8px_var(--accent)] disabled:opacity-60"
                >
                  🎲 {spinning ? "Spinning…" : "Spin"}
                </button>
              </div>
            }
          >

            <div className="grid grid-cols-2 gap-3">
              {/* TEAM */}
              <div className="rounded-xl border border-white/10 bg-background/60 p-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Team</div>

                <div className="flex flex-col items-center justify-center h-20">
                  {currentSpinTeam ? (
                    <>
                      <div className="h-14 w-14 rounded-full bg-background flex items-center justify-center">
                        <Image
                          src={
                            teamDataMap.get(currentSpinTeam)?.logoUrl ||
                            "/logos/default.svg"
                          }
                          alt={currentSpinTeam}
                          width={44}
                          height={44}
                        />
                      </div>
                      <span className="text-xs mt-1 font-semibold">
                        {currentSpinTeam}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      No team yet
                    </span>
                  )}
                </div>

                <div className="mt-1 text-[11px] text-muted-foreground">
                  Locked:{" "}
                  <span className="font-semibold">
                    {lockedTeam || draft.teamConstraint || "Any"}
                  </span>
                </div>
              </div>

              {/* ERA */}
              <div className="rounded-xl border border-white/10 bg-background/60 p-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Era</div>

                <div className="flex flex-col items-center justify-center h-20">
                  <span className="text-2xl font-bold">
                    {eraSpinLabel !== "-" ? eraSpinLabel : "—"}
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-muted-foreground">
                  Locked:{" "}
                  <span className="font-semibold">
                    {lockedEra
                      ? `${lockedEra.from}–${lockedEra.to}`
                      : draft.randomEra
                      ? "Random"
                      : `${draft.eraFrom ?? "?"}–${draft.eraTo ?? "?"}`}
                  </span>
                </div>
              </div>
            </div>
          </DraftSection>

          {/* Suggested Picks */}
          {suggestedPicks.length > 0 && (
            <DraftSection title="Suggested picks" className="!space-y-2">

              {suggestedPicks.map((p) => (
                <button
                  key={p.playerId}
                  onClick={() =>
                    setPendingPlayer({
                      id: p.playerId,
                      name: p.name,
                      position: p.position,
                    } as Player)
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10/60 text-xs"
                >
                  <div className="flex flex-col text-left">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.position} • {p.seasonUsed ?? "—"} • {p.ppg.toFixed(1)}{" "}
                      PPG
                    </span>
                  </div>
                  <span className="text-emerald-300 font-semibold">
                    {p.score.toFixed(1)}
                  </span>
                </button>
              ))}
            </DraftSection>
          )}

          {/* Search */}
          <DraftSection
            title="Find a player"
            hint={activeParticipant ? `For Player ${activeParticipant} · slot ${selectedSlot ?? defaultSlotForActive ?? "–"}` : "Draft complete"}
          >
            {pickError && (
              <div className="mb-2 rounded-lg bg-red-900/30 border border-red-500/50 px-3 py-2 text-xs text-red-200">
                ⚠ {pickError}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name..."
                className="min-h-10 flex-1 rounded-xl border border-white/10 bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-secondary"
              />
              <button
                onClick={searchPlayers}
                disabled={
                  searchLoading || (!selectedSlot && !defaultSlotForActive)
                }
                className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold disabled:opacity-50"
              >
                {searchLoading ? "..." : "Search"}
              </button>
            </div>

            <div className="text-[10px] text-muted-foreground">
              Filters:{" "}
              <span className="font-medium">
                {lockedTeam || draft.teamConstraint || "Any"}
              </span>{" "}
              •{" "}
              <span className="font-medium">
                {lockedEra
                  ? `${lockedEra.from}-${lockedEra.to}`
                  : draft.randomEra
                  ? "Random"
                  : `${draft.eraFrom ?? "?"}-${draft.eraTo ?? "?"}`}
              </span>{" "}
              •{" "}
              <span className="font-medium">
                {selectedSlot
                  ? getSlotPosition(selectedSlot, draft) || "Bench"
                  : ""}
              </span>
            </div>
            {/* Search results */}
            <div className="max-h-72 overflow-y-auto border border-white/10 rounded-xl">
              {searchResults.length === 0 && !searchLoading && (
                <div className="px-3 py-3 text-[11px] text-muted-foreground">
                  No players yet.
                </div>
              )}

              {searchResults.map((player) => {
                const isPending = pendingPlayer?.id === player.id;
                const requiredPos = selectedSlot
                  ? getSlotPosition(selectedSlot, draft)
                  : undefined;
                const eligible = isPlayerEligible(player, requiredPos);

                const teamData = player.primaryTeam
                  ? teamDataMap.get(player.primaryTeam)
                  : undefined;
                const primaryColor = teamData?.colors[0] || "#4f46e5";

                return (
                  <button
                    key={player.id}
                    onClick={() => setPendingPlayer(player)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs border-b border-white/10 last:border-0 ${
                      isPending ? "bg-primary/30" : "hover:bg-white/10/60"
                    }`}
                    style={{
                      borderLeft: isPending
                        ? `3px solid ${primaryColor}`
                        : eligible
                        ? "3px solid transparent"
                        : "3px solid #b91c1c",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full overflow-hidden border border-white/10">
                        <Image
                          src={
                            player.imageUrl ||
                            `https://www.basketball-reference.com/req/202106291/images/players/${player.id}.jpg`
                          }
                          alt={player.name}
                          width={32}
                          height={32}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      </div>

                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-foreground">
                          {player.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {player.position} • {player.primaryTeam || "N/A"}
                          {player.bestSeason &&
                            ` • Best ${
                              player.bestSeason.season
                            } (${player.bestSeason.ppg.toFixed(1)} PPG)`}
                        </span>
                      </div>
                    </div>

                    {!eligible && requiredPos && (
                      <span className="text-[10px] text-red-300">
                        Not {requiredPos}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Pending confirmation */}
            {pendingPlayer && selectedSlot && (
              <div className="rounded-xl border border-emerald-500/70 bg-emerald-900/20 px-3 py-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-200">
                    Confirm pick: {pendingPlayer.name}
                  </span>
                  <span className="text-[11px] text-emerald-200">
                    Slot {selectedSlot}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Primary:</span>{" "}
                    {pendingPlayer.position}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Eligible:</span>{" "}
                    {pendingPlayer.eligiblePositions || pendingPlayer.position}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Best PPG:</span>{" "}
                    {pendingPlayer.bestSeason?.ppg.toFixed(1) ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Season:</span>{" "}
                    {pendingPlayer.bestSeason?.season ?? "—"}
                  </div>
                </div>

                {/* Bench position choice */}
                {!getSlotPosition(selectedSlot, draft) &&
                  getEligiblePositions(pendingPlayer).length > 1 && (
                    <div className="pt-1">
                      <label className="block text-[11px] mb-1">
                        Bench position:
                      </label>
                      <select
                        value={
                          selectedPositionForPick || pendingPlayer.position
                        }
                        onChange={(e) =>
                          setSelectedPositionForPick(e.target.value)
                        }
                        className="w-full rounded-md border border-white/10 bg-background px-2 py-1 text-[11px]"
                      >
                        {getEligiblePositions(pendingPlayer).map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                <button
                  onClick={handlePick}
                  className="min-h-10 w-full rounded-xl bg-emerald-400 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  Draft {pendingPlayer.name}
                </button>
              </div>
            )}
          </DraftSection>

          {/* Score & Leaders Summary */}
          {score && (
            <DraftSection title="Standings" className="text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  Draft status
                </span>
                {leaderTeam && (
                  <span className="text-emerald-300 font-semibold">
                    {draftComplete
                      ? `Winner: Player ${leaderTeam.participant}`
                      : `Player ${leaderTeam.participant} is in the lead`}
                  </span>
                )}
              </div>

              {/* Per-team scores */}
              {teamsWithChemistry.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {teamsWithChemistry.map((t) => (
                    <div
                      key={t.participant}
                      className="rounded-lg bg-white/10 px-2 py-1 flex items-center justify-between"
                    >
                      <div className="text-xs text-muted-foreground">
                        Team {t.participant}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-300">
                          {t.teamScore.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t.totalPpg.toFixed(1)} PPG
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Category leaders */}
              {teamsWithChemistry.length > 1 && (
                <div className="mt-3 border-t border-white/10 pt-2 text-xs space-y-1">
                  <div className="font-semibold text-foreground mb-1">
                    Category leaders
                  </div>
                  {leaderBy("teamScore") && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Highest score</span>
                      <span className="text-foreground">
                        Team {leaderBy("teamScore")!.participant} (
                        {leaderBy("teamScore")!.teamScore.toFixed(1)})
                      </span>
                    </div>
                  )}
                  {leaderBy("totalPpg") && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Most PPG</span>
                      <span className="text-foreground">
                        Team {leaderBy("totalPpg")!.participant} (
                        {leaderBy("totalPpg")!.totalPpg.toFixed(1)})
                      </span>
                    </div>
                  )}
                  {leaderBy("totalRating") && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Best avg score</span>
                      <span className="text-foreground">
                        Team {leaderBy("totalRating")!.participant} (
                        {leaderBy("totalRating")!.totalRating.toFixed(1)})
                      </span>
                    </div>
                  )}
                  {leaderBy("spacing") && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Best spacing</span>
                      <span className="text-foreground">
                        Team {leaderBy("spacing")!.participant} (
                        {leaderBy("spacing")!.spacing!.toFixed(0)}%)
                      </span>
                    </div>
                  )}
                  {leaderBy("size") && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Best size</span>
                      <span className="text-foreground">
                        Team {leaderBy("size")!.participant} (
                        {leaderBy("size")!.size!.toFixed(0)})
                      </span>
                    </div>
                  )}
                  {leaderBy("usageBalance") && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Best usage balance</span>
                      <span className="text-foreground">
                        Team {leaderBy("usageBalance")!.participant} (
                        {leaderBy("usageBalance")!.usageBalance!.toFixed(0)})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {score.ruleWarnings.length > 0 && (
                <div className="text-xs text-red-300 mt-1 max-h-20 overflow-y-auto">
                  {score.ruleWarnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}

              <DraftButton onClick={loadScore} disabled={scoreLoading} className="w-full">
                {scoreLoading ? "Recalculating…" : "Recalculate"}
              </DraftButton>
            </DraftSection>
          )}
        </section>
      </div>
      </main>
    </>
  );
}

type PlayerCardProps = {
  pick?: DraftPick;
  slot: number;
  positionLabel?: string;
  isSelected: boolean;
  playerScore?: ScoreResponse["perPlayerScores"][number] | null;
  teamData?: TeamData;
  teamCode?: string | null;
  canUndo: boolean;
  onSelect: (slot: number) => void;
  onUndo?: (slot: number, e?: React.MouseEvent) => void;
};

const PlayerCard = memo(
  ({
    pick,
    slot,
    positionLabel,
    isSelected,
    playerScore,
    teamData,
    teamCode,
    canUndo,
    onSelect,
    onUndo,
  }: PlayerCardProps) => {
    const seasonUsed = pick?.seasonUsed || pick?.player.bestSeason?.season;
    const primaryColor = teamData?.colors[0] || "#4f46e5";
    const secondaryColor = teamData?.colors[1] || "#22c55e";

    return (
      <div
        onClick={() => onSelect(slot)}
        className={`relative flex flex-col rounded-xl border-[1.5px] overflow-hidden cursor-pointer transition-all duration-200
          ${
            isSelected
              ? "border-secondary shadow-lg shadow-indigo-500/40 scale-[1.01]"
              : "border-white/10 hover:border-white/30"
          }
        `}
        style={{
          background: pick
            ? `radial-gradient(circle at 10% 0%, ${primaryColor}33 0, #020617 50%)`
            : "#020617",
        }}
      >
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <div className="flex flex-col">
            <span className="text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground">
              Slot {slot} {positionLabel ? `• ${positionLabel}` : "• Bench"}
            </span>
            <span className="text-xs font-semibold text-white truncate max-w-[150px]">
              {pick ? pick.player.name : "Empty"}
            </span>
          </div>

          {pick && teamData && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-foreground">
                {teamData.code}
              </span>
              <Image
                src={teamData?.logoUrl || "/logos/default.svg"}
                alt={teamCode || "TEAM"}
                width={22}
                height={22}
                className="h-5 w-5 object-contain drop-shadow"
              />
            </div>
          )}
        </div>

        {pick ? (
          <div className="relative flex items-end px-2 pb-2.5 pt-1 min-h-[72px]">
            <div className="flex flex-col gap-0.5 z-10 pr-12">
              <span className="text-[10px] text-foreground">
                {pick.player.position}
                {seasonUsed ? ` • ${seasonUsed}` : ""}
              </span>

              {playerScore && (
                <div className="flex items-center flex-wrap gap-1">
                  <span className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    Score {playerScore.score.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {playerScore.ppg.toFixed(1)} PPG
                  </span>
                  {playerScore?.seasonUsed && (
                    <span className="text-[9px] text-muted-foreground">
                      • {playerScore.seasonUsed}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="absolute right-1 bottom-0 h-16 w-16 opacity-85">
              <Image
                src={
                  pick.player.imageUrl ||
                  `https://www.basketball-reference.com/req/202106291/images/players/${pick.player.id}.jpg`
                }
                alt={pick.player.name}
                width={70}
                height={70}
                className="h-full w-full object-contain drop-shadow-lg"
                unoptimized
              />
            </div>

            {canUndo && onUndo && (
              <button
                onClick={(e) => onUndo(slot, e)}
                className="absolute top-1 right-1 z-20 rounded-full bg-background/80 px-1.5 py-[1px] text-[8px] font-semibold text-red-300 hover:text-red-100 hover:bg-red-700/60 border border-red-500/40"
              >
                Undo
              </button>
            )}

            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#020617dd] to-transparent" />
          </div>
        ) : (
          <div className="px-2 pb-2.5 pt-1 text-[10px] text-muted-foreground italic">
            Awaiting pick...
          </div>
        )}

        <div
          className="h-[2px] w-full"
          style={{
            background: `linear-gradient(90deg,${primaryColor},${secondaryColor})`,
          }}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.slot === next.slot &&
    prev.isSelected === next.isSelected &&
    prev.canUndo === next.canUndo &&
    prev.positionLabel === next.positionLabel &&
    prev.teamCode === next.teamCode &&
    prev.pick?.id === next.pick?.id &&
    prev.pick?.player.id === next.pick?.player.id &&
    prev.playerScore?.score === next.playerScore?.score
);

