// app/draft/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Player = {
  id: string;
  name: string;
  position: string;
  primaryTeam?: string | null;
  heightInches?: number | null;
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
};

type Draft = {
  id: string;
  title: string | null;
  league: string;
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

const POSITION_ORDER: string[] = ["PG", "SG", "SF", "PF", "C"];

const NBA_TEAMS = [
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

const TEAM_LOGOS: Record<string, string> = {
  ATL: "https://a.espncdn.com/i/teamlogos/nba/500/ATL.png",
  BOS: "https://a.espncdn.com/i/teamlogos/nba/500/BOS.png",
  BKN: "https://a.espncdn.com/i/teamlogos/nba/500/BKN.png",
  CHA: "https://a.espncdn.com/i/teamlogos/nba/500/CHA.png",
  CHI: "https://a.espncdn.com/i/teamlogos/nba/500/CHI.png",
  CLE: "https://a.espncdn.com/i/teamlogos/nba/500/CLE.png",
  DAL: "https://a.espncdn.com/i/teamlogos/nba/500/DAL.png",
  DEN: "https://a.espncdn.com/i/teamlogos/nba/500/DEN.png",
  DET: "https://a.espncdn.com/i/teamlogos/nba/500/DET.png",
  GSW: "https://a.espncdn.com/i/teamlogos/nba/500/GSW.png",
  HOU: "https://a.espncdn.com/i/teamlogos/nba/500/HOU.png",
  IND: "https://a.espncdn.com/i/teamlogos/nba/500/IND.png",
  LAC: "https://a.espncdn.com/i/teamlogos/nba/500/LAC.png",
  LAL: "https://a.espncdn.com/i/teamlogos/nba/500/LAL.png",
  MEM: "https://a.espncdn.com/i/teamlogos/nba/500/MEM.png",
  MIA: "https://a.espncdn.com/i/teamlogos/nba/500/MIA.png",
  MIL: "https://a.espncdn.com/i/teamlogos/nba/500/MIL.png",
  MIN: "https://a.espncdn.com/i/teamlogos/nba/500/MIN.png",
  NOP: "https://a.espncdn.com/i/teamlogos/nba/500/NOP.png",
  NYK: "https://a.espncdn.com/i/teamlogos/nba/500/NYK.png",
  OKC: "https://a.espncdn.com/i/teamlogos/nba/500/OKC.png",
  ORL: "https://a.espncdn.com/i/teamlogos/nba/500/ORL.png",
  PHI: "https://a.espncdn.com/i/teamlogos/nba/500/PHI.png",
  PHX: "https://a.espncdn.com/i/teamlogos/nba/500/PHX.png",
  POR: "https://a.espncdn.com/i/teamlogos/nba/500/POR.png",
  SAC: "https://a.espncdn.com/i/teamlogos/nba/500/SAC.png",
  SAS: "https://a.espncdn.com/i/teamlogos/nba/500/SAS.png",
  TOR: "https://a.espncdn.com/i/teamlogos/nba/500/TOR.png",
  UTA: "https://a.espncdn.com/i/teamlogos/nba/500/UTA.png",
  WAS: "https://a.espncdn.com/i/teamlogos/nba/500/WAS.png",
};

const DECADES = [
  { label: "1960s", from: 1960, to: 1969 },
  { label: "1970s", from: 1970, to: 1979 },
  { label: "1980s", from: 1980, to: 1989 },
  { label: "1990s", from: 1990, to: 1999 },
  { label: "2000s", from: 2000, to: 2009 },
  { label: "2010s", from: 2010, to: 2019 },
  { label: "2020s", from: 2020, to: 2029 },
];

// Era → allowed teams mapping (modern codes, respecting history)
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

const ERA_2000s = [...ERA_1990s]; // effectively all 30; CHA represents Hornets/Bobcats history

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

export default function DraftPage() {
  const params = useParams();
  const id = params?.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // spin locks
  const [lockedTeam, setLockedTeam] = useState<string | null>(null);
  const [lockedEra, setLockedEra] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [currentSpinTeam, setCurrentSpinTeam] = useState<string | null>(null);
  const [eraSpinLabel, setEraSpinLabel] = useState<string>("-");
  const [spinning, setSpinning] = useState(false);
  const [hasSpunThisTurn, setHasSpunThisTurn] = useState(false);

  // search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pendingPlayer, setPendingPlayer] = useState<Player | null>(null);

  // score
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // timer/autopick
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);

  const participants = useMemo(
    () =>
      draft
        ? Math.max(1, draft.rules?.participants || draft.participants || 1)
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
      draft
        ? Array.from({ length: draft.maxPlayers }, (_, i) => i + 1)
        : ([] as number[]),
    [draft]
  );

  const getParticipantForSlot = (slot: number) =>
    Math.floor((slot - 1) / playersPerTeam) + 1;

  // activeParticipant: based on how many picks have been made (round-robin)
  const activeParticipant = useMemo(() => {
    if (!draft) return null;
    if (draft.picks.length >= draft.maxPlayers) return null;
    return (draft.picks.length % participants) + 1;
  }, [draft, participants]);

  // default slot for the active participant (first empty in their range)
  const defaultSlotForActive = useMemo(() => {
    if (!draft || !activeParticipant) return null;
    const taken = new Set(draft.picks.map((p) => p.slot));
    const candidate = allSlots.find(
      (s) => getParticipantForSlot(s) === activeParticipant && !taken.has(s)
    );
    return candidate ?? null;
  }, [draft, activeParticipant, allSlots, getParticipantForSlot]);

  function getSlotPosition(
    slot: number | null,
    d: Draft | null
  ): string | undefined {
    if (!slot || !d || !d.requirePositions) return undefined;
    const relative = (slot - 1) % playersPerTeam;
    if (relative < POSITION_ORDER.length) return POSITION_ORDER[relative];
    return undefined; // bench
  }

  // ---------------- API loaders ----------------

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
    if (!id) return;
    (async () => {
      await loadDraft();
      await loadScore();
    })();
  }, [id]);

  // keep selectedSlot synced with activeParticipant's open slots
  useEffect(() => {
    if (!draft) return;
    if (!activeParticipant) return;

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
      if (
        getParticipantForSlot(prev) !== activeParticipant ||
        taken.has(prev)
      ) {
        return slotsForActive[0];
      }
      return prev;
    });
  }, [draft, activeParticipant, allSlots, getParticipantForSlot]);

  // -------------- search helpers ----------------

  function buildSearchParams(slot: number | null, extra?: { limit?: number }) {
    const params = new URLSearchParams();
    if (!draft || !slot) return params;

    if (searchQuery) params.set("q", searchQuery);

    const useEraFrom = lockedEra?.from ?? draft.eraFrom ?? undefined;
    const useEraTo = lockedEra?.to ?? draft.eraTo ?? undefined;
    if (useEraFrom && useEraTo) {
      params.set("eraFrom", String(useEraFrom));
      params.set("eraTo", String(useEraTo));
    }

    const pos = getSlotPosition(slot, draft);
    if (pos) params.set("position", pos);

    const teamFilter = lockedTeam ?? draft.teamConstraint ?? undefined;
    if (teamFilter) params.set("team", teamFilter);

    const hallRule = draft.rules?.hallRule;
    if (hallRule && hallRule !== "any") params.set("hallRule", hallRule);
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

  // -------------- autopick ----------------

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

      const candidate = data[Math.floor(Math.random() * data.length)];
      await lockInPlayer(candidate, autoSlot, true);
    } catch (err) {
      console.error("Autopick failed", err);
    }
  }

  // -------------- pick & undo ----------------

  async function lockInPlayer(
    player: Player,
    slotOverride?: number,
    fromAutoPick = false
  ) {
    if (!draft || !activeParticipant) return;

    const slot = slotOverride ?? selectedSlot;
    if (!slot) return;

    const slotOwner = getParticipantForSlot(slot);
    if (slotOwner !== activeParticipant) {
      alert(
        `It's Player ${activeParticipant}'s turn. You can only pick in Player ${activeParticipant}'s slots.`
      );
      return;
    }

    const existing = draft.picks.find((p) => p.slot === slot);
    if (existing) {
      alert("This slot already has a player. Undo first to change it.");
      return;
    }

    const position = getSlotPosition(slot, draft) || player.position || "SF";

    const res = await fetch(`${API_URL}/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot,
        playerId: player.id,
        position,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add player");
      return;
    }

    await loadDraft();
    await loadScore();

    setPendingPlayer(null);
    setSearchResults((prev) => (fromAutoPick ? prev : prev));
    setHasSpunThisTurn(false);
    setLockedTeam(null);
    setLockedEra(null);
    setCurrentSpinTeam(null);
    setEraSpinLabel("-");
  }

  async function handleLockIn() {
    if (!pendingPlayer || !selectedSlot) return;
    await lockInPlayer(pendingPlayer, selectedSlot, false);
  }

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

  // -------------- spinner (team+era together) --------------

  type EraTeamCombo = {
    era: (typeof DECADES)[number];
    team: string;
  };

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
    setSpinningFlag: (v: boolean) => void,
    onDone: (item: T) => void
  ) {
    if (!items.length) return;
    setSpinningFlag(true);
    let i = 0;
    const interval = setInterval(() => {
      const item = items[i % items.length];
      setItem(item);
      i++;
    }, 90);

    setTimeout(() => {
      clearInterval(interval);
      const final = items[Math.floor(Math.random() * items.length)];
      setItem(final);
      onDone(final);
      setSpinningFlag(false);
    }, 1400);
  }

  function handleSpinEraTeam() {
    if (!draft) return;

    const defaultMode = draft.mode === "default";
    const allowRespin =
      draft.rules?.allowRespinsWithoutPick || draft.mode !== "default";

    if (defaultMode && hasSpunThisTurn && !allowRespin) {
      alert("You already spun this turn. Lock in a player before re-spinning.");
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
      (final) => {
        setCurrentSpinTeam(final.team);
        setEraSpinLabel(final.era.label);
        setLockedTeam(final.team);
        setLockedEra({ from: final.era.from, to: final.era.to });
        setHasSpunThisTurn(true);
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

  // -------------- timer effect (turn-based) --------------

  useEffect(() => {
    if (!draft || !activeParticipant) {
      setTimerActive(false);
      setTimeLeft(null);
      return;
    }

    const seconds = draft.rules?.pickTimerSeconds ?? null;
    const auto = draft.rules?.autoPickEnabled;

    // if timer not enabled, stop
    if (!seconds || !auto) {
      setTimerActive(false);
      setTimeLeft(null);
      return;
    }

    // if this player already has all picks, no timer
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, activeParticipant]);

  if (loading || !draft) {
    return <main className="p-4">Loading draft...</main>;
  }

  const lineupSlots = allSlots;

  return (
    <main className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {draft.title || "NBA Draft"}
          </h2>
          <p className="text-xs text-slate-300">
            Era:{" "}
            {draft.randomEra
              ? "Random"
              : `${draft.eraFrom ?? "?"} - ${draft.eraTo ?? "?"}`}
            {draft.teamConstraint && ` | Team: ${draft.teamConstraint}`}
          </p>
          {activeParticipant && (
            <p className="text-xs text-indigo-300 mt-1">
              It&apos;s Player {activeParticipant}&apos;s turn.
            </p>
          )}
        </div>
        <div className="text-right text-xs">
          <div className="font-semibold">
            {scoreLoading
              ? "Scoring..."
              : score
              ? `Team Score: ${score.teamScore.toFixed(1)}`
              : "No score yet"}
          </div>
          {score && (
            <div className="text-slate-400">
              Avg: {score.avgScore.toFixed(1)} | Team PPG:{" "}
              {score.totalPpg.toFixed(1)}
            </div>
          )}
        </div>
        <div className="text-xs text-slate-400">
          Players: {participants} • Slots per player: {playersPerTeam}
          {draft.rules?.pickTimerSeconds &&
            draft.rules.autoPickEnabled &&
            activeParticipant && (
              <div className="mt-1 text-[11px] text-indigo-300">
                Player {activeParticipant} on the clock{" "}
                {timerActive && timeLeft !== null && <>• Timer: {timeLeft}s</>}
              </div>
            )}
        </div>
      </div>

      {/* SCOREBOARD */}
      {score?.teams && score.teams.length > 1 && (
        <section className="bg-slate-800 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Scoreboard</div>
            {score.winner && (
              <div className="text-xs text-emerald-400">
                Winner: Player {score.winner}
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {score.teams.map((t) => (
              <div
                key={t.participant}
                className={`rounded border px-3 py-2 ${
                  score.winner === t.participant
                    ? "border-emerald-500 bg-emerald-900/20"
                    : "border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Player {t.participant}</span>
                  <span className="text-xs text-slate-400">
                    Picks {t.picks.length}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-1">
                  Score {t.teamScore.toFixed(1)} • PPG {t.totalPpg.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
          {draft.picks.length >= draft.maxPlayers && score.winner && (
            <div className="text-xs text-emerald-400 mt-2">
              Draft complete. Player {score.winner} wins on system scoring.
            </div>
          )}
        </section>
      )}

      {/* RULE WARNINGS */}
      {score && score.ruleWarnings.length > 0 && (
        <section className="bg-red-950/40 border border-red-700/60 rounded-lg p-3 text-xs text-red-100 space-y-1">
          {score.ruleWarnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </section>
      )}

      {/* RANDOMIZER */}
      <section className="bg-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Spin your constraints</h3>
          <button
            onClick={clearLocks}
            className="text-xs text-slate-300 underline hover:text-white"
          >
            Clear locks
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Spin once per turn in default mode to lock both a team and era. Player
          search auto-filters to that franchise & decade.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-slate-700 bg-slate-900 p-3">
            <div className="text-xs text-slate-400 mb-2">Team</div>
            <div className="flex flex-col items-center justify-center mb-3 h-24">
              {currentSpinTeam ? (
                <>
                  <div
                    className={`h-16 w-16 rounded-full bg-slate-900 flex items-center justify-center ${
                      spinning ? "animate-pulse" : ""
                    }`}
                  >
                    <img
                      src={TEAM_LOGOS[currentSpinTeam] ?? "/logos/default.svg"}
                      alt={currentSpinTeam}
                      className="h-12 w-12 object-contain"
                    />
                  </div>
                  <span className="mt-2 text-sm font-semibold">
                    {currentSpinTeam}
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-500">
                  Spin to pick a team
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs text-slate-400">
                {lockedTeam ? `Locked: ${lockedTeam}` : "No team locked"}
              </div>
              <button
                onClick={handleSpinEraTeam}
                disabled={spinning}
                className="px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-50"
              >
                {spinning ? "Spinning..." : "Spin Team+Era"}
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-700 bg-slate-900 p-3">
            <div className="text-xs text-slate-400 mb-2">Decade</div>
            <div className="text-3xl font-bold text-center mb-3">
              {eraSpinLabel}
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs text-slate-400">
                {lockedEra
                  ? `Locked: ${lockedEra.from}-${lockedEra.to}`
                  : "No era locked"}
              </div>
              <button
                onClick={handleSpinEraTeam}
                disabled={spinning}
                className="px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-50"
              >
                {spinning ? "Spinning..." : "Spin Team+Era"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* LINEUP */}
      <section className="bg-slate-800 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Lineup</h3>
        <div className="space-y-4">
          {Array.from({ length: participants }, (_, idx) => idx + 1).map(
            (pNum) => {
              const start = (pNum - 1) * playersPerTeam;
              const slots = lineupSlots.slice(start, start + playersPerTeam);
              const isCurrent = activeParticipant === pNum;

              return (
                <div
                  key={pNum}
                  className={`rounded border p-3 bg-slate-900/40 ${
                    isCurrent
                      ? "border-indigo-500 shadow-md shadow-indigo-500/30"
                      : "border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">
                      Player {pNum} {isCurrent && "(On the clock)"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {
                        slots.filter((s) =>
                          draft.picks.some((p) => p.slot === s)
                        ).length
                      }{" "}
                      / {slots.length} picked
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {slots.map((slot) => {
                      const pick = draft.picks.find((p) => p.slot === slot);
                      const pos = getSlotPosition(slot, draft);
                      const playerScore =
                        score?.perPlayerScores.find((s) => s.slot === slot) ??
                        null;
                      const isSelected = selectedSlot === slot;

                      return (
                        <div
                          key={slot}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedSlot(slot)}
                          className={`relative flex items-center justify-between rounded border px-3 py-2 text-sm cursor-pointer
                            ${
                              isSelected
                                ? "border-indigo-500 bg-slate-900"
                                : "border-slate-700 bg-slate-900/50"
                            }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-400">
                              Slot {slot} {pos ? `(${pos})` : " (Bench)"}
                            </span>
                            <span className="font-medium">
                              {pick ? pick.player.name : "Empty"}
                            </span>
                            {playerScore && (
                              <span className="text-[10px] text-slate-400">
                                {playerScore.seasonUsed
                                  ? `Season ${playerScore.seasonUsed}`
                                  : "Era avg"}{" "}
                                • PPG {playerScore.ppg.toFixed(1)} • Score{" "}
                                {playerScore.score.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {pick && (
                              <>
                                <span className="text-xs text-slate-400">
                                  {pick.player.position}{" "}
                                  {pick.player.primaryTeam &&
                                    `• ${pick.player.primaryTeam}`}
                                </span>
                                <button
                                  onClick={(e) => handleUndo(slot, e)}
                                  className="text-[10px] px-1 py-0.5 border border-red-500/60 text-red-300 rounded hover:bg-red-500/10"
                                >
                                  Undo
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </section>

      {/* PLAYER SEARCH */}
      <section className="bg-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Select Player</h3>
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <span>
              {activeParticipant
                ? `Active player: Player ${activeParticipant}${
                    selectedSlot
                      ? ` • Slot ${selectedSlot} ${
                          getSlotPosition(selectedSlot, draft)
                            ? `(${getSlotPosition(selectedSlot, draft)})`
                            : "(Bench)"
                        }`
                      : ""
                  }`
                : "Draft complete"}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-300">
          {activeParticipant
            ? `It's Player ${activeParticipant}'s turn. They can fill any of their empty slots.`
            : "No active turn — draft is done."}
        </p>
        <p className="text-[11px] text-slate-400">
          Filters: {lockedTeam ? `Team ${lockedTeam}` : "Any team"},{" "}
          {lockedEra ? `${lockedEra.from}-${lockedEra.to}` : "Draft era"},{" "}
          {draft.requirePositions ? "Position enforced" : "Flexible positions"}
        </p>

        {pendingPlayer && (
          <div className="rounded border border-emerald-600 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-100">
            Pending pick (Player {activeParticipant ?? "?"}, slot{" "}
            {selectedSlot ?? "?"}): {pendingPlayer.name} (
            {pendingPlayer.position}){" "}
            {pendingPlayer.primaryTeam && `• ${pendingPlayer.primaryTeam}`}
          </div>
        )}

        <div className="flex gap-2">
          <input
            placeholder="Search by name (LeBron, Curry, Wilt)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
          />
          <button
            onClick={searchPlayers}
            disabled={searchLoading || !selectedSlot || !activeParticipant}
            className="px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-50"
          >
            {searchLoading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {searchResults.map((p) => (
            <button
              key={p.id}
              onClick={() => setPendingPlayer(p)}
              className="w-full flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-indigo-500"
            >
              <div className="flex flex-col text-left">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-slate-400">
                  {p.position} {p.primaryTeam && `• ${p.primaryTeam}`}
                  {p.bestSeason
                    ? ` • Best: ${
                        p.bestSeason.season
                      } (${p.bestSeason.ppg.toFixed(1)} PPG)`
                    : ""}
                </span>
              </div>
            </button>
          ))}
          {searchResults.length === 0 && !searchLoading && (
            <p className="text-xs text-slate-500">
              No players yet. Spin & search or try a different name.
            </p>
          )}
        </div>

        <div className="flex justify-between items-center gap-2">
          <div className="text-[11px] text-slate-400">
            {activeParticipant ? (
              <>
                Player {activeParticipant} can only lock into their own empty
                slots. Use Undo if you want to clear a slot.
              </>
            ) : (
              <>Draft complete.</>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingPlayer(null)}
              disabled={!pendingPlayer}
              className="px-3 py-1 rounded border border-slate-700 text-xs text-slate-200 disabled:opacity-40"
            >
              Clear pending
            </button>
            <button
              onClick={handleLockIn}
              disabled={
                !pendingPlayer ||
                !selectedSlot ||
                !activeParticipant ||
                draft.picks.some((p) => p.slot === selectedSlot)
              }
              className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold disabled:opacity-50"
            >
              Lock in pick
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
