// app/draft/[id]/page.tsx
// OPTION A (UPDATED WITH FULL GAME LOGIC FROM UNCOMMENTED VERSION)

"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import TEAM_DATA, { TeamData } from "../../teamData";

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
  overallCap?: number | null;
  multiTeamOnly?: boolean;
  peakMode?: "peak" | "average";

  participants?: number;
  playersPerTeam?: number;

  pickTimerSeconds?: number | null;
  autoPickEnabled?: boolean;

  allowRespinsWithoutPick?: boolean;

  // newly added
  status?: "saved" | "in_progress" | "complete";
  savedState?: any;
  savedAt?: string;
  mode?: string;
};

type Draft = {
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
  "HOU",
  "OKC",
  "PHX",
  "MIL",
];
const ERA_1970s = [
  ...ERA_1960s,
  "LAC",
  "CLE",
  "POR",
  "UTA",
  "DEN",
  "IND",
  "BKN",
  "SAS",
];
const ERA_1980s = [...ERA_1970s, "DAL", "CHA", "MIA", "MIN", "ORL"];
const ERA_1990s = [...ERA_1980s, "TOR", "MEM"];
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
  /***************************************************************************/
  /*                          STATE + LOADING                                */
  /***************************************************************************/
  const params = useParams();
  const id = params?.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

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

  /***************************************************************************/
  /*                         DERIVED DATA                                    */
  /***************************************************************************/
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

  /***************************************************************************/
  /*                              UTIL                                       */
  /***************************************************************************/
  function getSlotPosition(slot: number | null, d: Draft | null) {
    if (!slot || !d || !d.requirePositions) return;
    const relative = (slot - 1) % playersPerTeam;
    return POSITION_ORDER[relative];
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

  /***************************************************************************/
  /*                        BUILD SEARCH PARAMS (UPDATED)                    */
  /***************************************************************************/
  function buildSearchParams(slot: number | null, extra?: { limit?: number }) {
    const params = new URLSearchParams();
    if (!draft || !slot) return params;

    // name
    if (searchQuery) params.set("q", searchQuery);

    // UPDATED: spin-locked era overrides draft era
    const useEraFrom = lockedEra?.from ?? draft.eraFrom;
    const useEraTo = lockedEra?.to ?? draft.eraTo;
    if (useEraFrom && useEraTo) {
      params.set("eraFrom", String(useEraFrom));
      params.set("eraTo", String(useEraTo));
    }

    // position
    const pos = getSlotPosition(slot, draft);
    if (pos) params.set("position", pos);

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
    if (!draft || !selectedSlot) return;
    setSearchLoading(true);
    const params = buildSearchParams(selectedSlot);
    const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
    const data = await res.json();
    setSearchResults(data);
    setSearchLoading(false);
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
      const params = buildSearchParams(autoSlot, { limit: 50 });
      const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
      const data: Player[] = await res.json();

      if (!data.length) return;

      // random pick from eligible pool
      const candidate = data[Math.floor(Math.random() * data.length)];

      await lockInPlayer(candidate, autoSlot, true);
    } catch {}
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

  function isPlayerEligible(player: Player, requiredPos?: string) {
    if (!requiredPos) return true;
    return getEligiblePositions(player).includes(requiredPos);
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

    // UPDATED eligibility check
    if (requiredPos && !eligiblePositions.includes(requiredPos)) {
      if (!fromAutoPick) alert("Player not eligible for this position.");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot,
        playerId: player.id,
        position,
        mode: draft.rules?.mode,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to make pick");
      return;
    }

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

  function handleSpinEraTeam() {
    if (!draft) return;

    const defaultMode = draft.mode === "default";
    const allowRespin =
      draft.rules?.allowRespinsWithoutPick || draft.mode !== "default";

    if (defaultMode && hasSpunThisTurn && !allowRespin) {
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
        await fetch(`${API_URL}/drafts/${draft.id}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            savedState: {
              teamLandedOn: final.team,
              eraFrom: final.era.from,
              eraTo: final.era.to,
            },
            status: "in_progress",
          }),
        });
      }
    );
  }

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
    if (!draft || !activeParticipant) {
      setTimerActive(false);
      setTimeLeft(null);
      return;
    }

    const seconds = draft.rules?.pickTimerSeconds ?? null;
    const auto = draft.rules?.autoPickEnabled;

    if (!seconds || !auto) {
      setTimerActive(false);
      setTimeLeft(null);
      return;
    }

    const picksForActive = draft.picks.filter(
      (p) => p.ownerIndex === activeParticipant
    );
    if (picksForActive.length >= playersPerTeam) {
      setTimerActive(false);
      setTimeLeft(null);
      return;
    }

    setTimeLeft(seconds);
    setTimerActive(true);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          setTimerActive(false);
          autoPickCurrentTurn();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [draft, activeParticipant]);

  /***************************************************************************/
  /*                      PLAYER CARD COMPONENT (UNCHANGED UI)               */
  /***************************************************************************/
  const PlayerCard = ({
    pick,
    slot,
    isSelected,
    onSelect,
    onUndo,
  }: {
    pick: DraftPick | undefined;
    slot: number;
    isSelected: boolean;
    onSelect: (slot: number) => void;
    onUndo: (slot: number, e: React.MouseEvent) => void;
  }) => {
    const pos = getSlotPosition(slot, draft);
    const playerScore =
      score?.perPlayerScores.find((s) => s.slot === slot) ?? null;
    const teamCode = pick?.teamUsed || pick?.player.primaryTeam;
    const teamData = teamCode ? teamDataMap.get(teamCode) : undefined;

    const primaryColor = teamData?.colors[0] || "#4f46e5";
    const secondaryColor = teamData?.colors[1] || "#22c55e";

    return (
      <div
        key={slot}
        onClick={() => onSelect(slot)}
        className={`relative flex flex-col rounded-xl border-[1.5px] overflow-hidden cursor-pointer transition-all duration-200
          ${
            isSelected
              ? "border-indigo-400 shadow-lg shadow-indigo-500/40 scale-[1.01]"
              : "border-slate-700 hover:border-slate-500"
          }
        `}
        style={{
          background: pick
            ? `radial-gradient(circle at 10% 0%, ${primaryColor}33 0, #020617 50%)`
            : "#020617",
        }}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <div className="flex flex-col">
            <span className="text-[8.5px] uppercase tracking-[0.16em] text-slate-400">
              Slot {slot} {pos ? `• ${pos}` : "• Bench"}
            </span>
            <span className="text-xs font-semibold text-white truncate max-w-[150px]">
              {pick ? pick.player.name : "Empty"}
            </span>
          </div>

          {pick && teamData && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-100">
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

        {/* BODY */}
        {pick ? (
          <div className="relative flex items-end px-2 pb-2.5 pt-1 min-h-[72px]">
            <div className="flex flex-col gap-0.5 z-10 pr-12">
              <span className="text-[10px] text-slate-200">
                {pick.player.position}
                {pick.player.bestSeason?.season
                  ? ` • ${pick.player.bestSeason.season}`
                  : ""}
              </span>

              {playerScore && (
                <div className="flex items-center flex-wrap gap-1">
                  <span className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    Score {playerScore.score.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-slate-300">
                    {playerScore.ppg.toFixed(1)} PPG
                  </span>
                  {playerScore?.seasonUsed && (
                    <span className="text-[9px] text-slate-300">
                      • {playerScore.seasonUsed}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Player image */}
            <div className="absolute right-1 bottom-0 h-16 w-16 opacity-85">
              <Image
                src={
                  pick.player.imageUrl ||
                  `https://cdn.nba.com/headshots/nba/latest/1040x760/${pick.player.id}.png`
                }
                alt={pick.player.name}
                width={70}
                height={70}
                className="h-full w-full object-contain drop-shadow-lg"
              />
            </div>

            {/* Undo */}
            <button
              onClick={(e) => onUndo(slot, e)}
              className="absolute top-1 right-1 z-20 rounded-full bg-slate-950/80 px-1.5 py-[1px] text-[8px] font-semibold text-red-300 hover:text-red-100 hover:bg-red-700/60 border border-red-500/40"
            >
              Undo
            </button>

            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#020617dd] to-transparent" />
          </div>
        ) : (
          <div className="px-2 pb-2.5 pt-1 text-[10px] text-slate-500 italic">
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
  };

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

  /***************************************************************************/
  /*                                 UI LOADING                             */
  /***************************************************************************/
  if (loading || !draft) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-lg">Loading draft...</p>
      </main>
    );
  }

  const participantNumbers = Array.from(
    { length: participants },
    (_, i) => i + 1
  );

  /***************************************************************************/
  /*                           MAIN RENDER LAYOUT                            */
  /***************************************************************************/
  return (
    <main className="min-h-screen w-full bg-slate-950 text-slate-50 overflow-x-hidden">
      {/* FULL WIDTH HEADER */}
      <header className="px-4 py-6 border-b border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: Title */}
          <div className="flex-1 min-w-[260px]">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-indigo-300">
              {draft.title || "NBA Era Fantasy Draft"}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Draft ID: {draft.id} • Mode: {draft.mode}
            </p>
            <p className="text-xs text-slate-400">
              Era:{" "}
              {draft.randomEra
                ? "Random Era"
                : `${draft.eraFrom ?? "?"}–${draft.eraTo ?? "?"}`}
            </p>

            {activeParticipant && (
              <p className="text-xs mt-1 text-indigo-300">
                On the clock: Player {activeParticipant}
                {timerActive && timeLeft !== null && <> • {timeLeft}s</>}
              </p>
            )}
          </div>

          {/* Score Summary */}
          {score && (
            <div className="rounded-2xl bg-slate-900 border border-slate-700 px-4 py-3 text-xs flex flex-col gap-2 min-w-[240px] max-w-[320px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Score</span>
                {score.winner && (
                  <span className="text-emerald-300 font-semibold">
                    Winner: Player {score.winner}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-800 px-2 py-1 text-center">
                  <div className="text-[10px] text-slate-400">Team</div>
                  <div className="text-sm font-semibold">
                    {score.teamScore.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800 px-2 py-1 text-center">
                  <div className="text-[10px] text-slate-400">Avg</div>
                  <div className="text-sm font-semibold">
                    {score.avgScore.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800 px-2 py-1 text-center">
                  <div className="text-[10px] text-slate-400">PPG</div>
                  <div className="text-sm font-semibold">
                    {score.totalPpg.toFixed(1)}
                  </div>
                </div>
              </div>

              {score.ruleWarnings.length > 0 && (
                <div className="text-[10px] text-red-300 mt-1 max-h-20 overflow-y-auto">
                  {score.ruleWarnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}

              <button
                onClick={loadScore}
                disabled={scoreLoading}
                className="mt-1 w-full rounded-md bg-yellow-500/90 hover:bg-yellow-400 text-[11px] font-semibold text-slate-900 py-1.5 disabled:opacity-60"
              >
                {scoreLoading ? "Recalculating..." : "Recalculate"}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ============================ MAIN BODY ============================ */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] gap-6 px-0 py-6">
        {/* ====================== LEFT SIDE: FULL WIDTH BOARD ====================== */}
        <section className="px-4 lg:px-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-xl font-semibold">Lineup Board</h2>
            <span className="text-xs text-slate-400">
              {participants} teams • {playersPerTeam} slots each
            </span>
          </div>

          {/* BOARD WRAPPER */}
          <div className="w-full overflow-x-auto no-scrollbar py-3">
            <div className="flex gap-4 px-2 min-w-max">
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
                      bg-slate-900/80
                      p-3
                      w-[240px] sm:w-[240px] md:w-[250px]
                      transition-all
                      ${
                        isCurrent
                          ? "border-indigo-400 shadow-lg shadow-indigo-500/30"
                          : "border-slate-700"
                      }
                    `}
                  >
                    {/* Team Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                          Team {pNum}
                        </span>
                        <span className="text-sm font-semibold">
                          {isCurrent ? "On the clock" : "Lineup"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {filledCount}/{slots.length} filled
                        </span>
                      </div>

                      {teamScore && (
                        <div className="text-right text-[10px] leading-tight">
                          <div className="text-slate-400">Score</div>
                          <div className="text-sm font-semibold text-emerald-300">
                            {teamScore.teamScore.toFixed(1)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {teamScore.totalPpg.toFixed(1)} PPG
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Player slots */}
                    <div className="flex flex-col gap-2">
                      {slots.map((slot) => {
                        const pick = draft.picks.find((p) => p.slot === slot);
                        return (
                          <PlayerCard
                            key={slot}
                            pick={pick}
                            slot={slot}
                            isSelected={selectedSlot === slot}
                            onSelect={setSelectedSlot}
                            onUndo={handleUndo}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 text-right pr-4">
            Swipe/scroll horizontally →
          </p>
        </section>

        {/* =========================== RIGHT SIDE =========================== */}
        <section className="px-4 lg:px-0 space-y-6">
          {/* Spin Controls */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">Spin</h2>
                <p className="text-xs text-slate-400">Lock a team + era</p>
              </div>
              <button
                onClick={clearLocks}
                disabled={!lockedEra && !lockedTeam}
                className="text-[11px] underline text-slate-300 hover:text-white disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* TEAM */}
              <div className="rounded-xl bg-slate-900 border border-slate-700 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-slate-400">Team</span>
                  <button
                    onClick={handleSpinEraTeam}
                    disabled={spinning}
                    className="px-2 py-[2px] rounded-md bg-indigo-500 hover:bg-indigo-600 text-[10px] font-semibold disabled:opacity-60"
                  >
                    {spinning ? "..." : "Spin"}
                  </button>
                </div>

                <div className="flex flex-col items-center justify-center h-20">
                  {currentSpinTeam ? (
                    <>
                      <div className="h-14 w-14 rounded-full bg-slate-950 flex items-center justify-center">
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
                    <span className="text-[11px] text-slate-500">
                      No team yet
                    </span>
                  )}
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
                  Locked:{" "}
                  <span className="font-semibold">
                    {lockedTeam || draft.teamConstraint || "Any"}
                  </span>
                </div>
              </div>

              {/* ERA */}
              <div className="rounded-xl bg-slate-900 border border-slate-700 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-slate-400">Era</span>
                  <button
                    onClick={handleSpinEraTeam}
                    disabled={spinning}
                    className="px-2 py-[2px] rounded-md bg-indigo-500 hover:bg-indigo-600 text-[10px] font-semibold disabled:opacity-60"
                  >
                    {spinning ? "..." : "Spin"}
                  </button>
                </div>

                <div className="flex flex-col items-center justify-center h-20">
                  <span className="text-2xl font-bold">
                    {eraSpinLabel !== "-" ? eraSpinLabel : "—"}
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-slate-400">
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
          </div>

          {/* Search */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-50">
                Search Player
              </h2>
              <span className="text-[11px] text-slate-400">
                {activeParticipant
                  ? `Player ${activeParticipant} • Slot ${
                      selectedSlot ?? defaultSlotForActive ?? "–"
                    }`
                  : "Draft complete"}
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-50 placeholder:text-slate-500"
              />
              <button
                onClick={searchPlayers}
                disabled={searchLoading || !selectedSlot}
                className="px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-50"
              >
                {searchLoading ? "..." : "Search"}
              </button>
            </div>

            <div className="text-[10px] text-slate-400">
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
            <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl">
              {searchResults.length === 0 && !searchLoading && (
                <div className="px-3 py-3 text-[11px] text-slate-500">
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
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs border-b border-slate-800 last:border-0 ${
                      isPending ? "bg-indigo-600/30" : "hover:bg-slate-800/60"
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
                      <div className="h-8 w-8 rounded-full overflow-hidden border border-slate-700">
                        <img
                          src={
                            player.imageUrl ||
                            `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.id}.png`
                          }
                          alt={player.name}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-slate-50">
                          {player.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
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
                    <span className="text-slate-400">Primary:</span>{" "}
                    {pendingPlayer.position}
                  </div>
                  <div>
                    <span className="text-slate-400">Eligible:</span>{" "}
                    {pendingPlayer.eligiblePositions || pendingPlayer.position}
                  </div>
                  <div>
                    <span className="text-slate-400">Best PPG:</span>{" "}
                    {pendingPlayer.bestSeason?.ppg.toFixed(1) ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-400">Season:</span>{" "}
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
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px]"
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
                  className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-[12px] font-semibold text-slate-900 py-1.5"
                >
                  Draft {pendingPlayer.name}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// // app/draft/[id]/page.tsx  (OPTION B - CLEAN DRAFT ROOM)
// "use client";

// import { useEffect, useMemo, useState } from "react";
// import { useParams, useRouter } from "next/navigation";
// import Image from "next/image";
// import TEAM_DATA, { TeamData } from "../../teamData";

// const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// type Player = {
//   id: string;
//   name: string;
//   position: string;
//   eligiblePositions?: string | null;
//   imageUrl?: string | null;
//   primaryTeam?: string | null;
//   heightInches?: number | null;
//   bestSeason?: {
//     season: number;
//     team: string;
//     ppg: number;
//     apg: number;
//     rpg: number;
//   } | null;
// };

// type DraftPick = {
//   id: string;
//   slot: number;
//   position: string;
//   player: Player;
//   ownerIndex?: number;
// };

// type DraftRules = {
//   hallRule?: "any" | "only" | "none";
//   maxPpgCap?: number | null;
//   overallCap?: number | null;
//   multiTeamOnly?: boolean;
//   peakMode?: "peak" | "average";
//   participants?: number;
//   playersPerTeam?: number;
//   pickTimerSeconds?: number | null;
//   autoPickEnabled?: boolean;
//   allowRespinsWithoutPick?: boolean;
//   status: string;
// };

// type Draft = {
//   id: string;
//   title: string | null;
//   league: string;
//   mode: string;
//   rules?: DraftRules;
//   eraFrom?: number | null;
//   eraTo?: number | null;
//   randomEra: boolean;
//   teamConstraint?: string | null;
//   maxPlayers: number;
//   requirePositions: boolean;
//   participants: number;
//   playersPerTeam: number;
//   picks: DraftPick[];
// };

// type ScoreResponse = {
//   draftId: string;
//   teamScore: number;
//   avgScore: number;
//   totalPpg: number;
//   perPlayerScores: {
//     pickId: string;
//     playerId: string;
//     name: string;
//     position: string;
//     seasonUsed?: number;
//     ppg: number;
//     score: number;
//     slot?: number;
//     ownerIndex?: number;
//     usgPct?: number;
//   }[];
//   teams?: {
//     participant: number;
//     teamScore: number;
//     totalPpg: number;
//     totalRating: number;
//     picks: ScoreResponse["perPlayerScores"];
//   }[];
//   winner?: number;
//   ruleWarnings: string[];
// };

// const POSITION_ORDER: string[] = ["PG", "SG", "SF", "PF", "C"];

// const NBA_TEAMS = TEAM_DATA.map((t) => t.code);

// const DECADES = [
//   { label: "1960s", from: 1960, to: 1969 },
//   { label: "1970s", from: 1970, to: 1979 },
//   { label: "1980s", from: 1980, to: 1989 },
//   { label: "1990s", from: 1990, to: 1999 },
//   { label: "2000s", from: 2000, to: 2009 },
//   { label: "2010s", from: 2010, to: 2019 },
//   { label: "2020s", from: 2020, to: 2029 },
// ];

// // Era → allowed teams mapping
// const ERA_1960s = [
//   "BOS",
//   "LAL",
//   "NYK",
//   "GSW",
//   "DET",
//   "SAC",
//   "PHI",
//   "ATL",
//   "WAS",
//   "CHI",
//   "HOU",
//   "OKC",
//   "PHX",
//   "MIL",
// ];

// const ERA_1970s = [
//   ...ERA_1960s,
//   "LAC",
//   "CLE",
//   "POR",
//   "UTA",
//   "DEN",
//   "IND",
//   "BKN",
//   "SAS",
// ];

// const ERA_1980s = [...ERA_1970s, "DAL", "CHA", "MIA", "MIN", "ORL"];

// const ERA_1990s = [...ERA_1980s, "TOR", "MEM"];

// const ERA_2000s = [...ERA_1990s];

// const ERA_MODERN = [
//   "ATL",
//   "BOS",
//   "BKN",
//   "CHA",
//   "CHI",
//   "CLE",
//   "DAL",
//   "DEN",
//   "DET",
//   "GSW",
//   "HOU",
//   "IND",
//   "LAC",
//   "LAL",
//   "MEM",
//   "MIA",
//   "MIL",
//   "MIN",
//   "NOP",
//   "NYK",
//   "OKC",
//   "ORL",
//   "PHI",
//   "PHX",
//   "POR",
//   "SAC",
//   "SAS",
//   "TOR",
//   "UTA",
//   "WAS",
// ];

// function isTeamValidForEra(
//   team: string,
//   eraFrom?: number | null,
//   eraTo?: number | null
// ) {
//   if (!eraFrom || !eraTo) return true;
//   const mid = Math.floor((eraFrom + eraTo) / 2);

//   if (mid < 1970) return ERA_1960s.includes(team);
//   if (mid < 1980) return ERA_1970s.includes(team);
//   if (mid < 1990) return ERA_1980s.includes(team);
//   if (mid < 2000) return ERA_1990s.includes(team);
//   if (mid < 2010) return ERA_2000s.includes(team);
//   return ERA_MODERN.includes(team);
// }

// export default function DraftPage() {
//   const params = useParams();
//   const id = params?.id as string;
//   const router = useRouter();

//   const [draft, setDraft] = useState<Draft | null>(null);
//   const [loading, setLoading] = useState(true);

//   const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

//   // spin locks
//   const [lockedTeam, setLockedTeam] = useState<string | null>(null);
//   const [lockedEra, setLockedEra] = useState<{
//     from: number;
//     to: number;
//   } | null>(null);
//   const [currentSpinTeam, setCurrentSpinTeam] = useState<string | null>(null);
//   const [eraSpinLabel, setEraSpinLabel] = useState<string>("-");
//   const [spinning, setSpinning] = useState(false);
//   const [hasSpunThisTurn, setHasSpunThisTurn] = useState(false);

//   // search
//   const [searchQuery, setSearchQuery] = useState("");
//   const [searchResults, setSearchResults] = useState<Player[]>([]);
//   const [searchLoading, setSearchLoading] = useState(false);
//   const [pendingPlayer, setPendingPlayer] = useState<Player | null>(null);

//   // score
//   const [score, setScore] = useState<ScoreResponse | null>(null);
//   const [scoreLoading, setScoreLoading] = useState(false);

//   // timer/autopick
//   const [timeLeft, setTimeLeft] = useState<number | null>(null);
//   const [timerActive, setTimerActive] = useState(false);
//   const [showRules, setShowRules] = useState(false);
//   const [rulesTab, setRulesTab] = useState<"classic" | "casual" | "free">(
//     "classic"
//   );

//   const teamDataMap = useMemo(() => {
//     const map = new Map<string, TeamData>();
//     TEAM_DATA.forEach((t) => map.set(t.code, t));
//     return map;
//   }, []);

//   const participants = useMemo(
//     () =>
//       draft
//         ? Math.max(1, draft.rules?.participants || draft.participants || 1)
//         : 1,
//     [draft]
//   );

//   const playersPerTeam = useMemo(
//     () =>
//       draft
//         ? draft.rules?.playersPerTeam && draft.rules.playersPerTeam > 0
//           ? draft.rules.playersPerTeam
//           : draft.playersPerTeam
//         : 5,
//     [draft]
//   );

//   const allSlots = useMemo(
//     () =>
//       draft
//         ? Array.from({ length: draft.maxPlayers }, (_, i) => i + 1)
//         : ([] as number[]),
//     [draft]
//   );

//   const getParticipantForSlot = (slot: number) =>
//     Math.floor((slot - 1) / playersPerTeam) + 1;

//   const activeParticipant = useMemo(() => {
//     if (!draft) return null;
//     if (draft.picks.length >= draft.maxPlayers) return null;
//     return (draft.picks.length % participants) + 1;
//   }, [draft, participants]);

//   const defaultSlotForActive = useMemo(() => {
//     if (!draft || !activeParticipant) return null;
//     const taken = new Set(draft.picks.map((p) => p.slot));
//     const candidate = allSlots.find(
//       (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
//     );
//     return candidate ?? null;
//   }, [draft, activeParticipant, allSlots, getParticipantForSlot]);

//   function getSlotPosition(
//     slot: number | null,
//     d: Draft | null
//   ): string | undefined {
//     if (!slot || !d || !d.requirePositions) return undefined;
//     const relative = (slot - 1) % playersPerTeam;
//     if (relative < POSITION_ORDER.length) return POSITION_ORDER[relative];
//     return undefined;
//   }

//   // API load
//   async function loadDraft() {
//     if (!id) return;
//     setLoading(true);
//     const res = await fetch(`${API_URL}/drafts/${id}`);
//     if (!res.ok) {
//       setDraft(null);
//       setLoading(false);
//       return;
//     }
//     const data = await res.json();
//     setDraft(data);
//     setLoading(false);
//   }

//   async function loadScore() {
//     if (!id) return;
//     setScoreLoading(true);
//     const res = await fetch(`${API_URL}/drafts/${id}/score`);
//     if (!res.ok) {
//       setScore(null);
//       setScoreLoading(false);
//       return;
//     }
//     const data = await res.json();
//     setScore(data);
//     setScoreLoading(false);
//   }

//   useEffect(() => {
//     if (!id) return;
//     (async () => {
//       await loadDraft();
//       await loadScore();
//     })();
//   }, [id]);

//   // keep selectedSlot synced with active player's open slots
//   useEffect(() => {
//     if (!draft) return;
//     if (!activeParticipant) return;

//     const taken = new Set(draft.picks.map((p) => p.slot));
//     const slotsForActive = allSlots.filter(
//       (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
//     );

//     if (!slotsForActive.length) {
//       setSelectedSlot(null);
//       return;
//     }

//     setSelectedSlot((prev) => {
//       if (!prev) return slotsForActive[0];
//       if (
//         getParticipantForSlot(prev) !== activeParticipant ||
//         taken.has(prev)
//       ) {
//         return slotsForActive[0];
//       }
//       return prev;
//     });
//   }, [draft, activeParticipant, allSlots, getParticipantForSlot]);

//   function buildSearchParams(slot: number | null, extra?: { limit?: number }) {
//     const params = new URLSearchParams();
//     if (!draft || !slot) return params;

//     if (searchQuery) params.set("q", searchQuery);

//     const useEraFrom = lockedEra?.from ?? draft.eraFrom ?? undefined;
//     const useEraTo = lockedEra?.to ?? draft.eraTo ?? undefined;
//     if (useEraFrom && useEraTo) {
//       params.set("eraFrom", String(useEraFrom));
//       params.set("eraTo", String(useEraTo));
//     }

//     const pos = getSlotPosition(slot, draft);
//     if (pos) params.set("position", pos);

//     const teamFilter = lockedTeam ?? draft.teamConstraint ?? undefined;
//     if (teamFilter) params.set("team", teamFilter);

//     const hallRule = draft.rules?.hallRule;
//     if (hallRule && hallRule !== "any") params.set("hallRule", hallRule);
//     if (draft.rules?.multiTeamOnly) params.set("multiTeamOnly", "true");

//     if (extra?.limit) params.set("limit", String(extra.limit));

//     return params;
//   }

//   async function searchPlayers() {
//     if (!draft || !selectedSlot) return;
//     setSearchLoading(true);
//     const params = buildSearchParams(selectedSlot);
//     const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
//     const data = await res.json();
//     setSearchResults(data);
//     setSearchLoading(false);
//   }

//   // autopick
//   async function autoPickCurrentTurn() {
//     if (!draft || !activeParticipant) return;

//     const taken = new Set(draft.picks.map((p) => p.slot));
//     const slotsForActive = allSlots.filter(
//       (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
//     );
//     if (!slotsForActive.length) return;

//     const autoSlot = slotsForActive[0];

//     try {
//       const params = buildSearchParams(autoSlot, { limit: 50 });
//       const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
//       const data: Player[] = await res.json();
//       if (!data.length) return;

//       const candidate = data[Math.floor(Math.random() * data.length)];
//       await lockInPlayer(candidate, autoSlot, true);
//     } catch (err) {
//       console.error("Autopick failed", err);
//     }
//   }

//   const [selectedPositionForPick, setSelectedPositionForPick] = useState<
//     string | null
//   >(null);

//   function getEligiblePositions(player: Player): string[] {
//     if (!player.eligiblePositions) return [player.position];
//     return player.eligiblePositions.split(",").map((p) => p.trim());
//   }

//   function isPlayerEligible(
//     player: Player,
//     requiredPos: string | undefined
//   ): boolean {
//     if (!requiredPos) return true;
//     const eligible = getEligiblePositions(player);
//     return eligible.includes(requiredPos);
//   }

//   async function lockInPlayer(
//     player: Player,
//     slotOverride?: number,
//     fromAutoPick = false
//   ) {
//     if (!draft || !activeParticipant) return;

//     const slot = slotOverride ?? selectedSlot;
//     if (!slot) return;

//     const slotOwner = getParticipantForSlot(slot);
//     if (slotOwner !== activeParticipant) {
//       alert(
//         `It's Player ${activeParticipant}'s turn. You can only pick in Player ${slotOwner}'s slot.`
//       );
//       return;
//     }

//     const existing = draft.picks.find((p) => p.slot === slot);
//     if (existing) {
//       alert("This slot already has a player. Undo first to change it.");
//       return;
//     }

//     const requiredPos = getSlotPosition(slot, draft);
//     const eligiblePositions = getEligiblePositions(player);

//     if (requiredPos && !eligiblePositions.includes(requiredPos)) {
//       if (!fromAutoPick) {
//         alert(
//           `Player ${
//             player.name
//           } is not eligible for ${requiredPos}. Eligible: ${eligiblePositions.join(
//             ", "
//           )}`
//         );
//       }
//       return;
//     }

//     let position: string;
//     if (requiredPos) {
//       position = requiredPos;
//     } else if (eligiblePositions.length > 1 && selectedPositionForPick) {
//       position = selectedPositionForPick;
//     } else {
//       position = player.position || "SF";
//     }

//     const res = await fetch(`${API_URL}/drafts/${draft.id}`, {
//       method: "PATCH",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         slot,
//         playerId: player.id,
//         position,
//       }),
//     });

//     if (!res.ok) {
//       const err = await res.json().catch(() => ({}));
//       alert(err.error || "Failed to update pick");
//       return;
//     }

//     setPendingPlayer(null);
//     setSelectedPositionForPick(null);
//     await loadDraft();
//     await loadScore();
//     setHasSpunThisTurn(false);
//   }

//   async function handleUndo(slot: number, e?: React.MouseEvent) {
//     if (e) e.stopPropagation();
//     if (!draft) return;

//     const res = await fetch(`${API_URL}/drafts/${draft.id}/picks/${slot}`, {
//       method: "DELETE",
//     });

//     if (!res.ok) {
//       const err = await res.json().catch(() => ({}));
//       alert(err.error || "Failed to undo pick");
//       return;
//     }

//     await loadDraft();
//     await loadScore();
//     setPendingPlayer(null);
//     setSelectedSlot(slot);
//   }

//   // SPINNER
//   type EraTeamCombo = { era: (typeof DECADES)[number]; team: string };

//   function buildValidEraTeamCombos(): EraTeamCombo[] {
//     const combos: EraTeamCombo[] = [];
//     for (const era of DECADES) {
//       for (const team of NBA_TEAMS) {
//         if (isTeamValidForEra(team, era.from, era.to)) {
//           combos.push({ era, team });
//         }
//       }
//     }
//     return combos;
//   }

//   function spin<T>(
//     items: T[],
//     setItem: (v: T) => void,
//     setSpinningFlag: (v: boolean) => void,
//     onDone: (item: T) => void
//   ) {
//     if (!items.length) return;
//     setSpinningFlag(true);
//     let i = 0;
//     const interval = setInterval(() => {
//       const item = items[i % items.length];
//       setItem(item);
//       i++;
//     }, 90);

//     setTimeout(() => {
//       clearInterval(interval);
//       const final = items[Math.floor(Math.random() * items.length)];
//       setItem(final);
//       onDone(final);
//       setSpinningFlag(false);
//     }, 1400);
//   }

//   function handleSpinEraTeam() {
//     if (!draft) return;

//     const defaultMode = draft.mode === "default";
//     const allowRespin =
//       draft.rules?.allowRespinsWithoutPick || draft.mode !== "default";

//     if (defaultMode && hasSpunThisTurn && !allowRespin) {
//       alert("You already spun this turn. Lock in a player before re-spinning.");
//       return;
//     }

//     const combos = buildValidEraTeamCombos();
//     spin<EraTeamCombo>(
//       combos,
//       (item) => {
//         setCurrentSpinTeam(item.team);
//         setEraSpinLabel(item.era.label);
//       },
//       setSpinning,
//       (final) => {
//         setCurrentSpinTeam(final.team);
//         setEraSpinLabel(final.era.label);
//         setLockedTeam(final.team);
//         setLockedEra({ from: final.era.from, to: final.era.to });
//         setHasSpunThisTurn(true);

// // SAVE SPIN TO BACKEND (IMPORTANT)
//   await fetch(`${API_URL}/drafts/${draft.id}/save`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       savedState: {
//         teamLandedOn: final.team,
//         eraFrom: final.era.from,
//         eraTo: final.era.to,
//       },
//       status: "in_progress",
//     }),
//   });
//       }
//     );
//   }

//   function clearLocks() {
//     setLockedEra(null);
//     setLockedTeam(null);
//     setCurrentSpinTeam(null);
//     setEraSpinLabel("-");
//     setHasSpunThisTurn(false);
//   }

//   // TIMER
//   useEffect(() => {
//     if (!draft || !activeParticipant) {
//       setTimerActive(false);
//       setTimeLeft(null);
//       return;
//     }

//     const seconds = draft.rules?.pickTimerSeconds ?? null;
//     const auto = draft.rules?.autoPickEnabled;

//     if (!seconds || !auto) {
//       setTimerActive(false);
//       setTimeLeft(null);
//       return;
//     }

//     const picksForActive = draft.picks.filter(
//       (p) => p.ownerIndex === activeParticipant
//     );
//     if (picksForActive.length >= playersPerTeam) {
//       setTimerActive(false);
//       setTimeLeft(null);
//       return;
//     }

//     setTimeLeft(seconds);
//     setTimerActive(true);

//     const interval = setInterval(() => {
//       setTimeLeft((prev) => {
//         if (prev === null) return null;
//         if (prev <= 1) {
//           clearInterval(interval);
//           setTimerActive(false);
//           autoPickCurrentTurn();
//           return 0;
//         }
//         return prev - 1;
//       });
//     }, 1000);

//     return () => clearInterval(interval);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [draft, activeParticipant]);

//   const lineupSlots = allSlots;

//   const getPlayerImage = (playerId: string) =>
//     `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`;

//   const isDraftComplete =
//     draft?.picks?.length && draft.picks.length >= draft.maxPlayers;
//   const draftStatus =
//     draft?.rules?.status || (isDraftComplete ? "complete" : "in_progress");

//   async function handleCancelDraft() {
//     if (!draft) return;
//     const confirmed = window.confirm(
//       "Are you sure you want to cancel? This will delete the draft."
//     );
//     if (!confirmed) return;
//     await fetch(`${API_URL}/drafts/${draft.id}`, { method: "DELETE" });
//     router.push("/");
//   }

//   async function handleSaveDraft(status: "saved" | "in_progress") {
//     if (!draft) return;
//     const savedState = {
//       selectedSlot,
//       lockedTeam,
//       lockedEra,
//       hasSpunThisTurn,
//       activeParticipant,
//     };
//     const res = await fetch(`${API_URL}/drafts/${draft.id}/save`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ savedState, status }),
//     });
//     if (!res.ok) {
//       alert("Failed to save draft");
//       return;
//     }
//     if (status === "in_progress") {
//       router.push("/");
//     } else {
//       await loadDraft();
//     }
//   }

//   async function handleExitDraft() {
//     if (!isDraftComplete) {
//       const proceed = window.confirm(
//         "Draft not saved/finalized. Save before exiting?"
//       );
//       if (!proceed) return;
//     }
//     router.push("/");
//   }

//   async function handleGoBack() {
//     if (!draft) return;
//     if (!isDraftComplete) {
//       const choice = window.confirm(
//         "Do you want to save and exit before going back?"
//       );
//       if (choice) {
//         await handleSaveDraft("in_progress");
//         return;
//       }
//     }
//     router.back();
//   }

//   if (loading || !draft) {
//     return (
//       <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
//         <p>Loading draft...</p>
//       </main>
//     );
//   }

//   return (
//     <main className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 space-y-6">
//       {/* HEADER */}
//       <header className="flex flex-wrap items-center justify-between gap-4">
//         <div>
//           <h1 className="text-2xl md:text-3xl font-bold">
//             {draft.title || "NBA Hypothetical Lineup Draft"}
//           </h1>
//           <p className="text-xs text-slate-300 mt-1">
//             Era:{" "}
//             {draft.randomEra
//               ? "Random"
//               : `${draft.eraFrom ?? "?"} - ${draft.eraTo ?? "?"}`}{" "}
//             {draft.teamConstraint &&
//               `| Team Constraint: ${draft.teamConstraint}`}
//           </p>
//           {activeParticipant && (
//             <p className="text-xs text-indigo-300 mt-1">
//               On the clock: Player {activeParticipant}
//               {timerActive && timeLeft !== null && ` • ${timeLeft}s`}
//             </p>
//           )}
//         </div>

//         <div className="flex flex-col items-end gap-1 text-xs">
//           <div className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 min-w-[180px]">
//             <div className="flex justify-between">
//               <span className="font-semibold">Team Score</span>
//               <span>{score ? score.teamScore.toFixed(1) : "—"}</span>
//             </div>
//             {score && (
//               <div className="flex justify-between text-[11px] text-slate-400 mt-1">
//                 <span>Avg: {score.avgScore.toFixed(1)}</span>
//                 <span>PPG: {score.totalPpg.toFixed(1)}</span>
//               </div>
//             )}
//           </div>
//           <button
//             onClick={loadScore}
//             disabled={scoreLoading}
//             className="text-[11px] rounded bg-yellow-500/90 hover:bg-yellow-400 text-slate-900 font-semibold px-3 py-1 disabled:opacity-60"
//           >
//             {scoreLoading ? "Recalculating..." : "Recalculate Score"}
//           </button>
//         </div>
//       </header>

//       {/* ACTIONS */}
//       <div className="flex flex-wrap items-center gap-2 text-xs">
//         <button
//           onClick={() => setShowRules(true)}
//           className="px-3 py-2 rounded-md border border-slate-700 hover:border-indigo-400"
//         >
//           Rules
//         </button>
//         <button
//           onClick={handleGoBack}
//           className="px-3 py-2 rounded-md border border-slate-700 hover:border-slate-500"
//         >
//           Go Back
//         </button>
//         {!isDraftComplete && (
//           <button
//             onClick={() => handleSaveDraft("in_progress")}
//             className="px-3 py-2 rounded-md bg-amber-500/80 text-slate-900 font-semibold hover:bg-amber-400"
//           >
//             Save & Exit
//           </button>
//         )}
//         {isDraftComplete && (
//           <button
//             onClick={() => handleSaveDraft("saved")}
//             className="px-3 py-2 rounded-md bg-emerald-500/80 text-slate-900 font-semibold hover:bg-emerald-400"
//           >
//             Save Draft
//           </button>
//         )}
//         <button
//           onClick={handleCancelDraft}
//           className="px-3 py-2 rounded-md bg-red-600/80 text-white font-semibold hover:bg-red-500"
//         >
//           Cancel Draft
//         </button>
//         {isDraftComplete && (
//           <button
//             onClick={handleExitDraft}
//             className="px-3 py-2 rounded-md border border-slate-700 hover:border-emerald-400"
//           >
//             Exit Draft
//           </button>
//         )}
//       </div>

//       {/* RULE WARNINGS / SCOREBOARD */}
//       {score && (
//         <section className="space-y-2">
//           {score.teams && score.teams.length > 1 && (
//             <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 text-xs">
//               <div className="flex items-center justify-between mb-2">
//                 <span className="font-semibold">Scoreboard</span>
//                 {score.winner && (
//                   <span className="text-emerald-400">
//                     Winner: Player {score.winner}
//                   </span>
//                 )}
//               </div>
//               <div className="grid gap-2 md:grid-cols-2">
//                 {score.teams.map((t) => (
//                   <div
//                     key={t.participant}
//                     className={`rounded border px-3 py-2 ${
//                       score.winner === t.participant
//                         ? "border-emerald-500 bg-emerald-900/15"
//                         : "border-slate-700"
//                     }`}
//                   >
//                     <div className="flex justify-between text-xs">
//                       <span className="font-semibold">
//                         Player {t.participant}
//                       </span>
//                       <span className="text-slate-400">
//                         Picks {t.picks.length}
//                       </span>
//                     </div>
//                     <div className="text-[11px] text-slate-300 mt-1">
//                       Score {t.teamScore.toFixed(1)} • PPG{" "}
//                       {t.totalPpg.toFixed(1)}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}
//           {score.ruleWarnings.length > 0 && (
//             <div className="rounded-lg bg-red-950/60 border border-red-700/70 p-3 text-[11px] text-red-100 space-y-1">
//               {score.ruleWarnings.map((w, i) => (
//                 <div key={i}>⚠ {w}</div>
//               ))}
//             </div>
//           )}
//         </section>
//       )}

//       {/* MAIN LAYOUT */}
//       <section className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)]">
//         {/* LINEUP TABLE */}
//         <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-3">
//           <div className="flex justify-between items-center mb-1">
//             <h2 className="text-sm font-semibold">Lineups</h2>
//             <span className="text-[11px] text-slate-400">
//               Players: {participants} • Slots per player: {playersPerTeam}
//             </span>
//           </div>
//           <div className="space-y-3">
//             {Array.from({ length: participants }, (_, idx) => idx + 1).map(
//               (pNum) => {
//                 const start = (pNum - 1) * playersPerTeam;
//                 const slots = lineupSlots.slice(start, start + playersPerTeam);
//                 const isCurrent = activeParticipant === pNum;

//                 return (
//                   <div
//                     key={pNum}
//                     className={`rounded border px-3 py-2 bg-slate-950/60 ${
//                       isCurrent
//                         ? "border-indigo-500 shadow-md shadow-indigo-500/25"
//                         : "border-slate-700"
//                     }`}
//                   >
//                     <div className="flex justify-between items-center mb-1">
//                       <span className="text-xs font-semibold">
//                         Player {pNum} {isCurrent && "(On the clock)"}
//                       </span>
//                       <span className="text-[10px] text-slate-400">
//                         {
//                           slots.filter((s) =>
//                             draft.picks.some((p) => p.slot === s)
//                           ).length
//                         }{" "}
//                         / {slots.length} filled
//                       </span>
//                     </div>
//                     <div className="divide-y divide-slate-800">
//                       {slots.map((slot) => {
//                         const pick = draft.picks.find((p) => p.slot === slot);
//                         const pos = getSlotPosition(slot, draft);
//                         const playerScore =
//                           score?.perPlayerScores.find((s) => s.slot === slot) ??
//                           null;
//                         const isSelected = selectedSlot === slot;
//                         const teamCode = pick?.teamUsed || pick?.player.primaryTeam;
//                         const teamData = teamCode
//                           ? teamDataMap.get(teamCode)
//                           : undefined;

//                         return (
//                           <div
//                             key={slot}
//                             role="button"
//                             tabIndex={0}
//                             onClick={() => setSelectedSlot(slot)}
//                             onKeyDown={(e) => {
//                               if (e.key === "Enter" || e.key === " ") {
//                                 setSelectedSlot(slot);
//                               }
//                             }}
//                             className={`w-full flex items-center justify-between gap-2 px-1 py-1.5 text-xs text-left rounded ${
//                               isSelected
//                                 ? "bg-indigo-600/15"
//                                 : "hover:bg-slate-800/70"
//                             }`}
//                           >
//                             <div className="flex items-center gap-2 min-w-0">
//                               <div className="flex flex-col items-center w-10">
//                                 <span className="text-[10px] text-slate-400">
//                                   {pos || "BN"}
//                                 </span>
//                                 <span className="text-[10px] text-slate-500">
//                                   #{slot}
//                                 </span>
//                               </div>
//                               <div className="relative h-8 w-8 rounded-full overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
//                                 {pick && (
//                                   <Image
//                                     src={
//                                       pick.player.imageUrl ||
//                                       getPlayerImage(pick.player.id)
//                                     }
//                                     alt={pick.player.name}
//                                     width={32}
//                                     height={32}
//                                     className="h-full w-full object-cover"
//                                   />
//                                 )}
//                               </div>
//                               <div className="flex flex-col min-w-0">
//                                 <span className="truncate font-medium">
//                                   {pick ? pick.player.name : "Empty"}
//                                 </span>
//                                 <span className="text-[10px] text-slate-400 truncate">
//                                   {pick
//                                     ? `${pick.player.position}${
//                                         pick.player.primaryTeam
//                                           ? ` • ${pick.player.primaryTeam}`
//                                           : ""
//                                       }`
//                                     : "Awaiting pick"}
//                                 </span>
//                               </div>
//                             </div>
//                             <div className="flex items-center gap-2 flex-shrink-0">
//                               {teamData && (
// //                                 <Image
//   src={teamData?.logoUrl || "/logos/default.svg"}
//   alt={teamCode || "TEAM"}
//   width={22}
//   height={22}
//   className="h-5 w-5 object-contain drop-shadow"
// />

//                               )}
//                               {playerScore && (
//                                 <div className="text-right text-[10px] text-slate-300">
//                                   <div>{playerScore.ppg.toFixed(1)} PPG</div>
// {playerScore?.seasonUsed && (
//   <span className="text-[9px] text-slate-300">
//     • {playerScore.seasonUsed}
//   </span>
// )}

//                                   <div className="text-emerald-300">
//                                     {playerScore.score.toFixed(1)}
//                                   </div>
//                                 </div>
//                               )}
//                               {pick && (
//                                 <button
//                                   onClick={(e) => handleUndo(slot, e)}
//                                   className="text-[9px] border border-red-500/60 text-red-300 rounded px-1 py-[1px] hover:bg-red-500/10"
//                                 >
//                                   Undo
//                                 </button>
//                               )}
//                             </div>
//                           </div>
//                         );
//                       })}
//                     </div>
//                   </div>
//                 );
//               }
//             )}
//           </div>
//         </div>

//         {/* RIGHT: Constraints + Player Search */}
//         <div className="space-y-4">
//           {/* SPIN CONSTRAINTS */}
//           <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-3">
//             <div className="flex items-center justify-between">
//               <div>
//                 <h2 className="text-sm font-semibold">Constraints</h2>
//                 <p className="text-[11px] text-slate-400">
//                   Spin once per turn (default mode) to lock team & decade.
//                 </p>
//               </div>
//               <button
//                 onClick={clearLocks}
//                 className="text-[11px] text-slate-300 underline hover:text-white"
//               >
//                 Clear
//               </button>
//             </div>
//             <div className="grid grid-cols-2 gap-3 text-xs">
//               <div className="rounded bg-slate-950 border border-slate-800 p-2">
//                 <div className="flex items-center justify-between mb-2">
//                   <span className="text-[11px] text-slate-400">Team</span>
//                   <button
//                     onClick={handleSpinEraTeam}
//                     disabled={spinning}
//                     className="px-2 py-[2px] rounded bg-indigo-500 hover:bg-indigo-600 text-[10px] font-semibold disabled:opacity-60"
//                   >
//                     {spinning ? "..." : "Spin"}
//                   </button>
//                 </div>
//                 <div className="flex items-center gap-2 h-10">
//                   {currentSpinTeam ? (
//                     <>
//                       <div className="h-7 w-7 rounded-full bg-slate-900 flex items-center justify-center">
//                         <Image
//                           src={
//                             teamDataMap.get(currentSpinTeam)?.logoUrl ||
//                             "/logos/default.svg"
//                           }
//                           alt={currentSpinTeam}
//                           width={20}
//                           height={20}
//                           className="h-5 w-5 object-contain"
//                         />
//                       </div>
//                       <span className="font-semibold text-xs">
//                         {currentSpinTeam}
//                       </span>
//                     </>
//                   ) : (
//                     <span className="text-[11px] text-slate-500">
//                       No team yet
//                     </span>
//                   )}
//                 </div>
//                 <div className="mt-2 text-[11px] text-slate-400">
//                   Locked:{" "}
//                   <span className="font-semibold text-slate-100">
//                     {lockedTeam ? lockedTeam : draft.teamConstraint || "Any"}
//                   </span>
//                 </div>
//               </div>

//               <div className="rounded bg-slate-950 border border-slate-800 p-2">
//                 <div className="flex items-center justify-between mb-2">
//                   <span className="text-[11px] text-slate-400">Decade</span>
//                   <button
//                     onClick={handleSpinEraTeam}
//                     disabled={spinning}
//                     className="px-2 py-[2px] rounded bg-indigo-500 hover:bg-indigo-600 text-[10px] font-semibold disabled:opacity-60"
//                   >
//                     {spinning ? "..." : "Spin"}
//                   </button>
//                 </div>
//                 <div className="h-10 flex items-center">
//                   <span className="text-lg font-bold">
//                     {eraSpinLabel !== "-" ? eraSpinLabel : "—"}
//                   </span>
//                 </div>
//                 <div className="mt-2 text-[11px] text-slate-400">
//                   Locked:{" "}
//                   <span className="font-semibold text-slate-100">
//                     {lockedEra
//                       ? `${lockedEra.from}-${lockedEra.to}`
//                       : draft.randomEra
//                       ? "Random"
//                       : `${draft.eraFrom ?? "?"}-${draft.eraTo ?? "?"}`}
//                   </span>
//                 </div>
//               </div>
//             </div>
//           </div>

//           {/* PLAYER SEARCH & PICK */}
//           <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-3">
//             <div className="flex items-center justify-between">
//               <h2 className="text-sm font-semibold">Select Player</h2>
//               <span className="text-[11px] text-slate-400">
//                 {activeParticipant
//                   ? `Active: Player ${activeParticipant}${
//                       selectedSlot
//                         ? ` • Slot ${selectedSlot} ${
//                             getSlotPosition(selectedSlot, draft)
//                               ? `(${getSlotPosition(selectedSlot, draft)})`
//                               : "(Bench)"
//                           }`
//                         : ""
//                     }`
//                   : "Draft complete"}
//               </span>
//             </div>
//             <p className="text-[11px] text-slate-400">
//               Filters: {lockedTeam ? `Team ${lockedTeam}` : "Any team"},{" "}
//               {lockedEra
//                 ? `${lockedEra.from}-${lockedEra.to}`
//                 : draft.randomEra
//                 ? "Draft era"
//                 : `${draft.eraFrom ?? "?"}-${draft.eraTo ?? "?"}`}
//               , {draft.requirePositions ? "Position enforced" : "Flexible"}
//             </p>

//             <div className="flex gap-2">
//               <input
//                 placeholder="Search by name (LeBron, Curry, Wilt)..."
//                 value={searchQuery}
//                 onChange={(e) => setSearchQuery(e.target.value)}
//                 className="flex-1 rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs"
//               />
//               <button
//                 onClick={searchPlayers}
//                 disabled={searchLoading || !selectedSlot || !activeParticipant}
//                 className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[11px] font-semibold disabled:opacity-50"
//               >
//                 {searchLoading ? "Searching..." : "Search"}
//               </button>
//             </div>

//             {/* Pending pick banner */}
//             {pendingPlayer && (
//               <div className="rounded bg-emerald-900/30 border border-emerald-600/70 px-3 py-2 text-[11px] text-emerald-50">
//                 Pending pick: {pendingPlayer.name} ({pendingPlayer.position}){" "}
//                 {pendingPlayer.primaryTeam && `• ${pendingPlayer.primaryTeam}`}
//               </div>
//             )}

//             {/* Search results list */}
//             <div className="space-y-1 max-h-64 overflow-y-auto">
//               {searchResults.map((p) => {
//                 const isPending = pendingPlayer?.id === p.id;
//                 const requiredPos = getSlotPosition(selectedSlot, draft);
//                 const eligible = isPlayerEligible(p, requiredPos);

//                 return (
//                   <button
//                     key={p.id}
//                     onClick={() => setPendingPlayer(p)}
//                     className={`w-full flex items-center justify-between rounded border px-2 py-1.5 text-xs ${
//                       isPending
//                         ? "border-indigo-500 bg-indigo-600/15"
//                         : "border-slate-800 bg-slate-950 hover:border-indigo-500/60"
//                     }`}
//                   >
//                     <div className="flex items-center gap-2">
//                       <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-900 border border-slate-700">
//                         <Image
//                           src={p.imageUrl || getPlayerImage(p.id)}
//                           alt={p.name}
//                           width={32}
//                           height={32}
//                           className="h-full w-full object-cover"
//                         />
//                       </div>
//                       <div className="flex flex-col text-left">
//                         <span className="font-medium truncate">{p.name}</span>
//                         <span className="text-[10px] text-slate-400 truncate">
//                           {p.position} {p.primaryTeam && `• ${p.primaryTeam}`}{" "}
//                           {p.bestSeason &&
//                             `• Best ${
//                               p.bestSeason.season
//                             } (${p.bestSeason.ppg.toFixed(1)} PPG)`}
//                         </span>
//                       </div>
//                     </div>
//                     {!eligible && requiredPos && (
//                       <span className="text-[10px] text-red-300">
//                         Not {requiredPos}
//                       </span>
//                     )}
//                   </button>
//                 );
//               })}
//               {searchResults.length === 0 && !searchLoading && (
//                 <p className="text-[11px] text-slate-500">
//                   No players found yet. Try spinning or a different name.
//                 </p>
//               )}
//             </div>

//             {/* Confirm pick */}
//             {pendingPlayer && selectedSlot && (
//               <div className="space-y-2 pt-2 border-t border-slate-800 text-[11px]">
//                 <div className="flex flex-wrap items-center justify-between gap-2">
//                   <div>
//                     <span className="font-semibold">
//                       Draft {pendingPlayer.name}
//                     </span>
//                     <span className="text-slate-400">
//                       {" "}
//                       into slot {selectedSlot}{" "}
//                       {getSlotPosition(selectedSlot, draft) &&
//                         `(${getSlotPosition(selectedSlot, draft)})`}
//                     </span>
//                   </div>
//                   <button
//                     onClick={() => setPendingPlayer(null)}
//                     className="text-[10px] px-2 py-[2px] rounded border border-slate-600 text-slate-200 hover:bg-slate-800"
//                   >
//                     Clear pending
//                   </button>
//                 </div>
//                 <div className="grid grid-cols-2 gap-2 text-slate-200">
//                   <div>
//                     <span className="text-slate-400">Primary:</span>{" "}
//                     {pendingPlayer.position}
//                   </div>
//                   <div>
//                     <span className="text-slate-400">Eligible:</span>{" "}
//                     {pendingPlayer.eligiblePositions || pendingPlayer.position}
//                   </div>
//                   <div>
//                     <span className="text-slate-400">Best PPG:</span>{" "}
//                     {pendingPlayer.bestSeason?.ppg.toFixed(1) ?? "—"}
//                   </div>
//                   <div>
//                     <span className="text-slate-400">Best Season:</span>{" "}
//                     {pendingPlayer.bestSeason?.season ?? "—"}
//                   </div>
//                 </div>

//                 {!getSlotPosition(selectedSlot, draft) &&
//                   getEligiblePositions(pendingPlayer).length > 1 && (
//                     <div className="pt-1">
//                       <label className="block text-slate-200 mb-1">
//                         Bench slot position:
//                       </label>
//                       <select
//                         value={
//                           selectedPositionForPick || pendingPlayer.position
//                         }
//                         onChange={(e) =>
//                           setSelectedPositionForPick(e.target.value)
//                         }
//                         className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
//                       >
//                         {getEligiblePositions(pendingPlayer).map((pos) => (
//                           <option key={pos} value={pos}>
//                             {pos}
//                           </option>
//                         ))}
//                       </select>
//                     </div>
//                   )}

//                 <button
//                   onClick={() => lockInPlayer(pendingPlayer, selectedSlot)}
//                   className="w-full rounded bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-[12px] py-1.5 mt-1"
//                 >
//                   Lock in pick
//                 </button>
//               </div>
//             )}
//           </div>
//         </div>
//       </section>

//       {showRules && (
//         <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
//           <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-xl space-y-4">
//             <div className="flex items-center justify-between">
//               <h3 className="text-lg font-semibold">Draft Rules</h3>
//               <button
//                 onClick={() => setShowRules(false)}
//                 className="text-sm text-slate-300 hover:text-white"
//               >
//                 Close
//               </button>
//             </div>

//             <div className="flex gap-2 text-xs">
//               {(["classic", "casual", "free"] as const).map((tab) => (
//                 <button
//                   key={tab}
//                   onClick={() => setRulesTab(tab)}
//                   className={`px-3 py-1 rounded border ${
//                     rulesTab === tab
//                       ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
//                       : "border-slate-700 text-slate-300"
//                   }`}
//                 >
//                   {tab[0].toUpperCase() + tab.slice(1)}
//                 </button>
//               ))}
//             </div>

//             {rulesTab === "classic" && (
//               <ul className="text-sm text-slate-200 space-y-2">
//                 <li>• Random era + team; one spin per turn.</li>
//                 <li>• Unique players only, positions enforced.</li>
//                 <li>• Scoring uses best season for that team in the era.</li>
//               </ul>
//             )}
//             {rulesTab === "casual" && (
//               <ul className="text-sm text-slate-200 space-y-2">
//                 <li>
//                   • Tweak era/team, allow duplicate versions across teams.
//                 </li>
//                 <li>
//                   • Choose stat mode: peak in era, average in era, or team
//                   tenure.
//                 </li>
//                 <li>• Optional custom scoring weights.</li>
//               </ul>
//             )}
//             {rulesTab === "free" && (
//               <ul className="text-sm text-slate-200 space-y-2">
//                 <li>• No position enforcement; sandbox picks.</li>
//                 <li>• Up to 5 participants, any lineup size.</li>
//                 <li>• You decide ordering and scoring.</li>
//               </ul>
//             )}
//           </div>
//         </div>
//       )}
//     </main>
//   );
// }
