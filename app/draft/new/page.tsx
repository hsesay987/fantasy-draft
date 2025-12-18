// app/draft/new/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Settings,
  Users,
  Zap,
  BadgeCheck,
  Shield,
  SlidersHorizontal,
  Globe,
  Lock,
  Sparkles,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";

export default function NewDraftPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const searchParams = useSearchParams();
  const { token, user } = useAuth();

  const queryLeague = useMemo(
    () => (searchParams.get("league") || "").toUpperCase(),
    [searchParams]
  );
  const initialLeague: "NBA" | "NFL" =
    queryLeague === "NFL" ? "NFL" : "NBA";

  const [league, setLeague] = useState<"NBA" | "NFL">(initialLeague);
  const [title, setTitle] = useState("");
  const NFL_LINEUP = ["QB", "RB", "WR", "WR", "TE", "FLEX", "DEF"];

  type StatMode =
    | "peak"
    | "average"
    | "peak-era"
    | "peak-team"
    | "peak-era-team"
    | "average-era"
    | "average-era-team"
    | "career-avg"
    | "best-any";

  // Classic | Casual | Free
  const [mode, setMode] = useState<"classic" | "casual" | "free">("classic");
  const [statMode, setStatMode] = useState<StatMode>("peak");

  // Base states
  const [randomEra, setRandomEra] = useState(true);
  const [eraSpinMode, setEraSpinMode] = useState<"decade" | "single">("decade");
  const [eraRange, setEraRange] = useState<{ from: number; to: number }>({
    from: 1960,
    to: new Date().getFullYear(),
  });
  const [eraFrom, setEraFrom] = useState<number | "">("");
  const [eraTo, setEraTo] = useState<number | "">("");

  const [randomTeam, setRandomTeam] = useState(true);
  const [teamConstraint, setTeamConstraint] = useState("");
  const [randomPosition, setRandomPosition] = useState(false);

  const [participants, setParticipants] = useState(2);
  const initialPlayersPerTeam =
    initialLeague === "NFL" ? NFL_LINEUP.length : 6;
  const [playersPerTeam, setPlayersPerTeam] = useState(initialPlayersPerTeam);
  const [maxPlayers, setMaxPlayers] = useState(
    2 * initialPlayersPerTeam
  );

  const [requirePositions, setRequirePositions] = useState(
    initialLeague === "NFL" ? true : true
  );
  const [positionPool, setPositionPool] = useState<
    "all" | "guards" | "frontcourt" | "forwards" | "bigs"
  >("all");

  const [scoringMethod, setScoringMethod] = useState<
    "system" | "user" | "public"
  >("system");
  const [scoringWeights, setScoringWeights] = useState({
    offense: 1,
    defense: 1,
    playmaking: 1,
    shooting: 1,
  });

  // caps and rule tweaks
  const [maxPpgCap, setMaxPpgCap] = useState<number | "">("");
  // const [overallCap, setOverallCap] = useState<number | "">("");
  const [hallRule, setHallRule] = useState<"any" | "none">("any");
  const [multiTeamOnly, setMultiTeamOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesTab, setRulesTab] = useState<"classic" | "casual" | "free">(
    "classic"
  );

  const [pickTimerSeconds, setPickTimerSeconds] = useState<number | "">("");
  const [autoPickEnabled, setAutoPickEnabled] = useState(false);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [skipSpinsWhenOff, setSkipSpinsWhenOff] = useState(true);

  // Premium toggles
  const [premiumTeamOnly, setPremiumTeamOnly] = useState("");
  const [premiumSeasonOnly, setPremiumSeasonOnly] = useState<number | "">("");
  const [premiumHeightRange, setPremiumHeightRange] = useState<{
    min: number | "";
    max: number | "";
  }>({ min: "", max: "" });

  // Saved / community styles
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveVisibility, setSaveVisibility] = useState<"private" | "public">(
    "private"
  );
  const [saveLoading, setSaveLoading] = useState(false);
  const [wantSaveBeforeCreate, setWantSaveBeforeCreate] = useState(false);
  const [savedStyles, setSavedStyles] = useState<any[]>([]);
  const [communityStyles, setCommunityStyles] = useState<any[]>([]);
  const [stylesLoading, setStylesLoading] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const isPremium =
    !!user?.isAdmin ||
    !!user?.isFounder ||
    (!!user?.subscriptionTier &&
      (!user?.subscriptionEnds ||
        new Date(user.subscriptionEnds).getTime() > Date.now()));

  useEffect(() => {
    // When league changes (e.g., via query), reset lineup sizing
    if (league === "NFL") {
      setPlayersPerTeam(NFL_LINEUP.length);
      recalcTotalSlots(participants, NFL_LINEUP.length);
      setRequirePositions(true);
    } else {
      setPlayersPerTeam(6);
      recalcTotalSlots(participants, 6);
      setRequirePositions(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league]);

  useEffect(() => {
    if (isClassic) {
      setRandomPosition(false);
      setEraSpinMode("decade");
      setWantSaveBeforeCreate(false);
    }
    if (!isPremium) {
      setPremiumTeamOnly("");
      setPremiumSeasonOnly("");
      setPremiumHeightRange({ min: "", max: "" });
      setWantSaveBeforeCreate(false);
    }
  }, [isClassic, isPremium]);

  const loadSavedStyles = useCallback(async () => {
    if (!token) {
      setSavedStyles([]);
      return;
    }
    try {
      setStylesLoading(true);
      const res = await fetch(`${API_URL}/drafts/styles?scope=mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setSavedStyles([]);
        return;
      }
      const data = await res.json();
      setSavedStyles(data || []);
    } catch (err) {
      console.error("Failed to load saved styles", err);
      setSavedStyles([]);
    } finally {
      setStylesLoading(false);
    }
  }, [API_URL, token]);

  const loadCommunityStyles = useCallback(async () => {
    try {
      setCommunityLoading(true);
      const res = await fetch(`${API_URL}/drafts/styles`);
      if (!res.ok) return;
      const data = await res.json();
      setCommunityStyles(data || []);
    } catch (err) {
      console.error("Failed to load community styles", err);
    } finally {
      setCommunityLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadSavedStyles();
  }, [loadSavedStyles]);

  useEffect(() => {
    loadCommunityStyles();
  }, [loadCommunityStyles]);

  // ------------------------------------------
  //  LOCKING LOGIC
  // ------------------------------------------
  const isClassic = mode === "classic";
  const isCasual = mode === "casual";
  const isFree = mode === "free";

  // On mode change → set defaults
  function applyModeDefaults(nextMode: "classic" | "casual" | "free") {
    const leaguePlayers = league === "NFL" ? NFL_LINEUP.length : undefined;
    if (nextMode === "classic") {
      // LOCKED SETTINGS — cannot be changed
      setRandomEra(true);
      setEraSpinMode("decade");
      setEraRange({ from: 1960, to: new Date().getFullYear() });
      setRandomTeam(true);
      setRandomPosition(false);
      setParticipants(2);
      setPlayersPerTeam(leaguePlayers ?? 6);
      setRequirePositions(true);
      setPositionPool("all");
      setHallRule("any");
      setMultiTeamOnly(false);
      setStatMode("peak-era-team");
      setEraFrom("");
      setEraTo("");
      setTeamConstraint("");
      setMaxPpgCap("");
      // setOverallCap("");
      setMaxPlayers((leaguePlayers ?? 6) * 2);

      setPickTimerSeconds(60);
      setAutoPickEnabled(true);
      setSuggestionsEnabled(false);
      setSkipSpinsWhenOff(true);
    }

    if (nextMode === "casual") {
      setRandomEra(true);
      setEraSpinMode("decade");
      setRandomTeam(true);
      setRandomPosition(true);
      setParticipants(2);
      setPlayersPerTeam(leaguePlayers ?? 5);
      setRequirePositions(true);
      setPositionPool("all");
      setMaxPlayers((leaguePlayers ?? 5) * 2);

      setPickTimerSeconds("");
      setAutoPickEnabled(false);
      setSuggestionsEnabled(true);
      setSkipSpinsWhenOff(true);
    }

    if (nextMode === "free") {
      setRandomEra(false);
      setEraSpinMode("single");
      setRandomTeam(false);
      setRandomPosition(false);
      setParticipants(1);
      setPlayersPerTeam(leaguePlayers ?? 10);
      setRequirePositions(league === "NFL" ? true : false); // locked off
      setPositionPool("all");
      setMaxPlayers(leaguePlayers ?? 10);

      setPickTimerSeconds("");
      setAutoPickEnabled(false);
      setSuggestionsEnabled(false);
      setSkipSpinsWhenOff(true);
    }

    setMode(nextMode);
  }

  // Updating total slots
  function recalcTotalSlots(
    nextParticipants: number,
    nextPlayersPerTeam: number
  ) {
    setMaxPlayers(nextParticipants * nextPlayersPerTeam);
  }

  function applyStyle(style: any) {
    if (!style?.settings) return;
    const s = style.settings;
    if (s.mode) setMode(s.mode);
    if (typeof s.randomEra === "boolean") setRandomEra(s.randomEra);
    if (s.eraSpinMode) setEraSpinMode(s.eraSpinMode);
    if (s.eraRange) setEraRange(s.eraRange);
    if (s.randomTeam !== undefined) setRandomTeam(s.randomTeam);
    if (s.randomPosition !== undefined) setRandomPosition(s.randomPosition);
    if (s.requirePositions !== undefined) setRequirePositions(s.requirePositions);
    if (s.positionPool) setPositionPool(s.positionPool);
    if (s.scoringWeights) setScoringWeights(s.scoringWeights);
    if (s.pickTimerSeconds !== undefined) setPickTimerSeconds(s.pickTimerSeconds);
    if (s.autoPickEnabled !== undefined) setAutoPickEnabled(s.autoPickEnabled);
    if (s.suggestionsEnabled !== undefined) setSuggestionsEnabled(s.suggestionsEnabled);
    setSelectedStyleId(style.id || null);
    // track play count
    if (style.id) {
      fetch(`${API_URL}/drafts/styles/${style.id}/play`, { method: "POST" }).catch(() => {});
      setCommunityStyles((prev) =>
        prev.map((c) =>
          c.id === style.id ? { ...c, plays: (c.plays || 0) + 1 } : c
        )
      );
      setSavedStyles((prev) =>
        prev.map((c) =>
          c.id === style.id ? { ...c, plays: (c.plays || 0) + 1 } : c
        )
      );
    }
  }

  const handleThumb = async (styleId: string, value: number) => {
    try {
      await fetch(`${API_URL}/drafts/styles/${styleId}/thumb`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ value }),
      });
      const key = value === -1 ? "thumbsDown" : "thumbsUp";
      setCommunityStyles((prev) =>
        prev.map((c) =>
          c.id === styleId ? { ...c, [key]: (c[key] || 0) + 1 } : c
        )
      );
      setSavedStyles((prev) =>
        prev.map((c) =>
          c.id === styleId ? { ...c, [key]: (c[key] || 0) + 1 } : c
        )
      );
    } catch (err) {
      console.error("Failed to submit thumb", err);
    }
  };

  async function saveStyleAndMaybeCreate(proceedToCreate: boolean) {
    if (!isPremium) {
      setShowSaveModal(false);
      if (proceedToCreate) await handleCreate(false);
      return;
    }
    setSaveLoading(true);
    try {
      const res = await fetch(`${API_URL}/drafts/styles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: saveName || "Untitled Style",
          description: saveDescription,
          visibility: saveVisibility,
          settings: {
            mode,
            randomEra,
            eraSpinMode,
            eraRange,
            randomTeam,
            randomPosition,
            requirePositions,
            positionPool,
            scoringWeights,
            pickTimerSeconds,
            autoPickEnabled,
            suggestionsEnabled,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "Failed to save style");
        return;
      }
      const created = await res.json();
      setSavedStyles((prev) => [created, ...prev]);
      setShowSaveModal(false);
      if (proceedToCreate) {
        await handleCreate(false);
      }
    } finally {
      setSaveLoading(false);
    }
  }

  // ------------------------------------------
  async function handleCreate(promptForSave: boolean = true) {
    if (promptForSave && isPremium && !isClassic && (mode === "casual" || mode === "free") && wantSaveBeforeCreate) {
      setShowSaveModal(true);
      return;
    }
    setLoading(true);
    try {
      const nflBaseLineup = NFL_LINEUP;
      const nflLineup =
        league === "NFL" && playersPerTeam > nflBaseLineup.length
          ? [
              ...nflBaseLineup,
              ...Array(playersPerTeam - nflBaseLineup.length).fill("FLEX"),
            ]
          : nflBaseLineup;

      const effectivePlayersPerTeam =
        league === "NFL" ? nflLineup.length : playersPerTeam;
      const effectiveMaxPlayers = participants * effectivePlayersPerTeam;

      const rules = {
        maxPpgCap: isClassic
          ? null
          : maxPpgCap === ""
          ? null
          : Number(maxPpgCap),

        hallRule: isClassic ? "any" : hallRule,
        multiTeamOnly: isClassic ? false : multiTeamOnly,

        // For classic, backend will force statMode = "peak-era-team"
        statMode: mode === "classic" ? "peak-era-team" : statMode,

        participants,
        playersPerTeam,

        // NEW: timer / auto-pick / suggestions
        pickTimerSeconds:
          mode === "classic"
            ? 60
            : pickTimerSeconds === ""
            ? null
            : Number(pickTimerSeconds),
        autoPickEnabled: mode === "classic" ? true : autoPickEnabled,
        suggestionsEnabled: mode === "classic" ? false : suggestionsEnabled,
        // NEW: spin controls
        randomPosition: mode === "classic" ? false : randomPosition,
        eraSpinMode: mode === "classic" ? "decade" : eraSpinMode,
        eraRange:
          mode === "classic"
            ? { from: 1960, to: new Date().getFullYear() }
            : eraRange,
        positionPool:
          league === "NFL" || isClassic ? "all" : positionPool || "all",
        skipSpinsWhenOff,
        scoringWeights:
          scoringMethod === "system" && !isClassic ? scoringWeights : undefined,
        // Premium
        premiumTeamOnly:
          isPremium && !isClassic && (mode === "casual" || mode === "free")
            ? premiumTeamOnly || null
            : null,
        premiumSeasonOnly:
          isPremium && !isClassic && (mode === "casual" || mode === "free")
            ? premiumSeasonOnly || null
            : null,
        premiumHeightRange:
          isPremium && !isClassic && (mode === "casual" || mode === "free")
            ? premiumHeightRange
            : null,
        ...(league === "NFL"
          ? {
              lineup: nflLineup,
              fantasyScoring: false,
              allowDefense: true,
            }
          : {}),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          league,
          mode,
          title: title || null,
          randomEra,
          eraFrom:
            !isClassic && !randomEra && eraFrom !== ""
              ? Number(eraFrom)
              : undefined,
          eraTo:
            !isClassic && !randomEra && eraTo !== ""
              ? Number(eraTo)
              : undefined,
          randomTeam,
          teamConstraint:
            !isClassic && !randomTeam && teamConstraint
              ? teamConstraint
              : undefined,
          maxPlayers: effectiveMaxPlayers,
          playersPerTeam: effectivePlayersPerTeam,
          requirePositions:
            league === "NFL" ? true : isFree ? false : requirePositions,
          scoringMethod,
          rules,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "Failed to create draft");
        return;
      }

      const draft = await res.json();
      const leaguePath =
        ((draft.league || league || "NBA") as string).toUpperCase() === "NFL"
          ? "nfl"
          : "nba";
      router.push(`/draft/${leaguePath}/${draft.id}`);
    } catch {
      alert("Backend unreachable");
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------
  //  UI START
  // ------------------------------------------
  return (
    <main className="min-h-screen p-6 md:p-10 bg-slate-950 text-slate-50 space-y-10">
      {/* HEADER */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-300 tracking-tight mb-1">
            Create a New {league} Draft {league === "NFL" ? "(Beta)" : ""}
          </h1>
          <p className="text-slate-400 text-sm">
            Classic mode locks rules; Casual & Free let you get creative.
            {league === "NFL" ? " NFL beta requires a premium account." : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRules(true)}
            className="text-xs underline text-slate-300 hover:text-white"
          >
            View rules
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-600"
            onClick={() => applyModeDefaults(mode)}
          >
            <Zap className="h-4 w-4" /> Quick Defaults
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — MODES */}
        <section className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-indigo-400" /> Draft Mode
            </h3>

            <div className="space-y-3">
              {[
                {
                  id: "classic",
                  label: "Classic Mode",
                  desc: "Locked rules. True era/team randomizer.",
                },
                {
                  id: "casual",
                  label: "Casual Mode",
                  desc: "Rule tweaks, caps, constraints allowed.",
                },
                {
                  id: "free",
                  label: "Free Mode",
                  desc: "Unlimited creativity & team building.",
                },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() =>
                    applyModeDefaults(m.id as "classic" | "casual" | "free")
                  }
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    mode === m.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 hover:border-indigo-300/50"
                  }`}
                >
                  <div className="font-semibold text-slate-100 flex items-center gap-2">
                    {m.label}
                    {m.id === "classic" && (
                      <Lock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="text-xs text-slate-400">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <BadgeCheck className="w-5 h-5 text-indigo-400" /> Draft Title
            </h3>

            <input
              placeholder="Optional title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
            />
          </div>
        </section>

        {/* MIDDLE — PLAYERS */}
        <section className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-indigo-400" /> Players & Lineups
            </h3>

            {/* Participants */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block mb-1 text-slate-300">
                  Participants
                </label>
                <input
                  type="number"
                  disabled={isClassic}
                  min={1}
                  max={5}
                  value={participants}
                  onChange={(e) => {
                    const v = Math.min(5, Math.max(1, Number(e.target.value)));
                    setParticipants(v);
                    recalcTotalSlots(
                      v,
                      league === "NFL" ? playersPerTeam : playersPerTeam
                    );
                  }}
                  className={`w-full px-3 py-2 rounded-lg ${
                    isClassic
                      ? "bg-slate-800 border-slate-700 text-slate-500"
                      : "bg-slate-900 border-slate-700"
                  }`}
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-300">
                  Players / Team
                </label>
                <input
                  type="number"
                  disabled={isClassic || (league === "NFL" && mode !== "casual")}
                  min={league === "NFL" ? NFL_LINEUP.length : 5}
                  max={mode === "free" ? 15 : 12}
                  value={playersPerTeam}
                  onChange={(e) => {
                    const v = Math.min(
                      mode === "free" ? 15 : 12,
                      Math.max(1, Number(e.target.value))
                    );
                    const clamped =
                      league === "NFL"
                        ? Math.max(NFL_LINEUP.length, v)
                        : v;
                    setPlayersPerTeam(clamped);
                    recalcTotalSlots(participants, clamped);
                  }}
                  className={`w-full px-3 py-2 rounded-lg ${
                    isClassic || (league === "NFL" && mode !== "casual")
                      ? "bg-slate-800 border-slate-700 text-slate-500"
                      : "bg-slate-900 border-slate-700"
                  }`}
                />
              </div>
            </div>

            {/* total slots */}
            <div className="mt-3">
              <label className="block mb-1 text-slate-300">Total Slots</label>
              <input
                readOnly
                value={maxPlayers}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400"
              />
            </div>

            {/* require positions */}
            <label className="flex items-center gap-2 mt-4 text-sm">
              <input
                type="checkbox"
                checked={requirePositions}
                disabled={isClassic || league === "NFL"}
                onChange={(e) => setRequirePositions(e.target.checked)}
              />
              <span
                className={`${
                  isClassic || league === "NFL" ? "text-slate-500" : "text-slate-200"
                }`}
              >
                {league === "NFL"
                  ? "Enforce default NFL lineup"
                  : "Enforce PG / SG / SF / PF / C"}
              </span>
            </label>

            {!requirePositions && !isClassic && league !== "NFL" && (
              <div className="mt-3">
                <label className="block text-xs text-slate-400 mb-1">
                  Position pool (Casual/Free)
                </label>
                <select
                  value={positionPool}
                  onChange={(e) =>
                    setPositionPool(e.target.value as typeof positionPool)
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
                >
                  <option value="all">All positions</option>
                  <option value="guards">Guards only (PG, SG)</option>
                  <option value="frontcourt">Front court (SF, PF, C)</option>
                  <option value="forwards">Forwards (SF, PF)</option>
                  <option value="bigs">Bigs (PF, C)</option>
                </select>
              </div>
            )}

            {/* scoring */}
            <div className="mt-4">
              <label className="block mb-1 text-sm text-slate-300">
                Scoring Method
              </label>
              <select
                value={scoringMethod}
                onChange={(e) => setScoringMethod(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
              >
                <option value="system">System Scoring</option>
                <option value="user">Players Vote</option>
                <option value="public">Community Vote</option>
              </select>

              {scoringMethod === "system" && (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="text-xs text-slate-400">
                    {isClassic
                      ? "Classic uses default system weights."
                      : "Tune system weights (Casual/Free)."}
                  </div>
                  {["offense", "defense", "playmaking", "shooting"].map(
                    (key) => (
                      <label key={key} className="block">
                        <div className="flex items-center justify-between text-xs text-slate-300">
                          <span>{key[0].toUpperCase() + key.slice(1)}</span>
                          <span className="text-indigo-200">
                            {scoringWeights[key as keyof typeof scoringWeights].toFixed(1)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={1.8}
                          step={0.1}
                          disabled={isClassic}
                          value={
                            scoringWeights[key as keyof typeof scoringWeights]
                          }
                          onChange={(e) =>
                            setScoringWeights((prev) => ({
                              ...prev,
                              [key]: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-indigo-500"
                        />
                      </label>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT — ERA, TEAM, RULES */}
        <section className="space-y-4">
          {/* Era + Team */}
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Globe className="w-5 h-5 text-indigo-400" /> Era & Team Rules
            </h3>

            {/* Random Era */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={randomEra}
                disabled={isClassic}
                onChange={(e) => setRandomEra(e.target.checked)}
              />
              <span className={isClassic ? "text-slate-500" : ""}>
                Random Era Spin
              </span>
            </label>

            {/* Era inputs */}
            {!isClassic && (
              <div className="mt-3 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="From"
                    type="number"
                    disabled={randomEra && mode === "classic"}
                    value={randomEra ? eraRange.from : eraFrom}
                    onChange={(e) => {
                      const v = Number(e.target.value) || eraRange.from;
                      if (randomEra) {
                        setEraRange((prev) => ({ ...prev, from: v }));
                      } else {
                        setEraFrom(e.target.value ? Number(e.target.value) : "");
                      }
                    }}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                  />
                  <input
                    placeholder="To"
                    type="number"
                    disabled={randomEra && mode === "classic"}
                    value={randomEra ? eraRange.to : eraTo}
                    onChange={(e) => {
                      const v = Number(e.target.value) || eraRange.to;
                      if (randomEra) {
                        setEraRange((prev) => ({ ...prev, to: v }));
                      } else {
                        setEraTo(e.target.value ? Number(e.target.value) : "");
                      }
                    }}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                  />
                </div>

                {randomEra && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">
                      Era Spin Type (Casual/Free)
                    </label>
                    <select
                      disabled={isClassic}
                      value={eraSpinMode}
                      onChange={(e) =>
                        setEraSpinMode(e.target.value as "decade" | "single")
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                    >
                      <option value="decade">Decades (1960s, 1970s...)</option>
                      <option value="single">
                        Single year within range (e.g., 1986)
                      </option>
                    </select>
                    <div className="text-[11px] text-slate-500">
                      Casual/Free can fine-tune era range and single-year spins.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Random Team */}
            <label className="flex items-center gap-2 text-sm mt-4">
              <input
                type="checkbox"
                checked={randomTeam}
                disabled={isClassic}
                onChange={(e) => setRandomTeam(e.target.checked)}
              />
              <span className={isClassic ? "text-slate-500" : ""}>
                Random Team Spin
              </span>
            </label>

            {/* Team constraint */}
            {!randomTeam && !isClassic && (
              <input
                placeholder="Team constraint (LAL, BOS)"
                value={teamConstraint}
                onChange={(e) =>
                  setTeamConstraint(e.target.value.toUpperCase())
                }
                className="mt-2 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
              />
            )}

            {/* Random Position */}
            {league !== "NFL" && (
              <label className="flex items-center gap-2 text-sm mt-4">
                <input
                  type="checkbox"
                  checked={randomPosition}
                  disabled={isClassic}
                  onChange={(e) => setRandomPosition(e.target.checked)}
                />
                <span className={isClassic ? "text-slate-500" : ""}>
                  Random Position Spin (PG/SG/SF/PF/C)
                </span>
              </label>
            )}

            <label className="flex items-center gap-2 text-sm mt-3">
              <input
                type="checkbox"
                checked={skipSpinsWhenOff}
                onChange={(e) => setSkipSpinsWhenOff(e.target.checked)}
              />
              <span className="text-slate-200">
                Skip spins if era, team, and position randomizers are off
              </span>
            </label>

            {/* Premium options */}
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-indigo-300 text-xs uppercase tracking-[0.12em]">
                <Shield className="w-4 h-4" /> Premium Only (Casual/Free)
              </div>
              <input
                placeholder="Specific team (e.g., LAL)"
                disabled={!isPremium || isClassic}
                value={premiumTeamOnly}
                onChange={(e) => setPremiumTeamOnly(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
              />
              <input
                placeholder="Specific season (e.g., 1996)"
                type="number"
                disabled={!isPremium || isClassic}
                value={premiumSeasonOnly === "" ? "" : premiumSeasonOnly}
                onChange={(e) =>
                  setPremiumSeasonOnly(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Height min (in)"
                  type="number"
                  disabled={!isPremium || isClassic}
                  value={premiumHeightRange.min === "" ? "" : premiumHeightRange.min}
                  onChange={(e) =>
                    setPremiumHeightRange((prev) => ({
                      ...prev,
                      min: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                />
                <input
                  placeholder="Height max (in)"
                  type="number"
                  disabled={!isPremium || isClassic}
                  value={premiumHeightRange.max === "" ? "" : premiumHeightRange.max}
                  onChange={(e) =>
                    setPremiumHeightRange((prev) => ({
                      ...prev,
                      max: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                />
              </div>
              {!isPremium && (
                <div className="text-[11px] text-amber-300">
                  Premium required for team/season/height filters.
                </div>
              )}
            </div>
          </div>

          {/* Rule tweaks */}
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <SlidersHorizontal className="w-5 h-5 text-indigo-400" /> Rule
              Tweaks
            </h3>

            <div className="space-y-3 text-sm">
              {/* Caps */}
              <input
                type="number"
                placeholder="PPG Cap"
                disabled={isClassic}
                value={isClassic ? "" : maxPpgCap}
                onChange={(e) =>
                  setMaxPpgCap(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className={`w-full px-3 py-2 rounded-lg ${
                  isClassic
                    ? "bg-slate-800 border-slate-700 text-slate-600"
                    : "bg-slate-900 border-slate-700"
                }`}
              />

              {/* Timer (Casual/Classic) */}
              <label className="block text-sm">
                Pick Timer (seconds)
                <input
                  type="number"
                  min={20}
                  max={120}
                  step={5}
                  disabled={isClassic || isFree}
                  value={
                    isClassic
                      ? 60
                      : pickTimerSeconds === ""
                      ? ""
                      : pickTimerSeconds
                  }
                  onChange={(e) =>
                    setPickTimerSeconds(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  className={`mt-1 w-full px-3 py-2 rounded-lg ${
                    isClassic || isFree
                      ? "bg-slate-800 border-slate-700 text-slate-600"
                      : "bg-slate-900 border-slate-700"
                  }`}
                  placeholder="Off"
                />
                <span className="text-[11px] text-slate-500">
                  Leave blank to turn timer off (Casual/Free).
                </span>
              </label>

              {/* Auto-pick */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={isFree}
                  checked={isClassic ? true : autoPickEnabled}
                  onChange={(e) => setAutoPickEnabled(e.target.checked)}
                />
                <span className={isFree ? "text-slate-600" : "text-slate-200"}>
                  Auto-pick when timer expires
                </span>
              </label>

              {/* Suggestions (Casual only) */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={isClassic || isFree}
                  checked={isClassic ? false : suggestionsEnabled}
                  onChange={(e) => setSuggestionsEnabled(e.target.checked)}
                />
                <span
                  className={
                    isClassic || isFree ? "text-slate-600" : "text-slate-200"
                  }
                >
                  Show system suggestion picks
                </span>
              </label>

              {/* Hall Rule */}
              <label className="block text-sm">
                Hall of Fame Rule
                <select
                  disabled={isClassic}
                  value={hallRule}
                  onChange={(e) => setHallRule(e.target.value as any)}
                  className={`mt-1 w-full px-3 py-2 rounded-lg ${
                    isClassic
                      ? "bg-slate-800 border-slate-700 text-slate-600"
                      : "bg-slate-900 border-slate-700"
                  }`}
                >
                  <option value="any">Any players allowed</option>
                  <option value="none">No Hall of Famers</option>
                </select>
              </label>

              {/* Multi-team */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={isClassic}
                  checked={isClassic ? false : multiTeamOnly}
                  onChange={(e) => setMultiTeamOnly(e.target.checked)}
                />
                <span className={isClassic ? "text-slate-600" : ""}>
                  Only players from multiple teams
                </span>
              </label>

              {/* Stat mode */}
              <label className="block text-sm">
                Stat Mode
                <select
                  disabled={false} // always allowed
                  value={statMode}
                  onChange={(e) => setStatMode(e.target.value as any)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
                >
                  <option disabled={isClassic!} value="peak">
                    Peak Season
                  </option>
                  <option disabled={isClassic!} value="average">
                    Era Average
                  </option>
                  <option disabled={isClassic!} value="peak-era">
                    Peak in Era
                  </option>
                  <option disabled={isClassic!} value="peak-team">
                    Peak with Team
                  </option>
                  <option value="peak-era-team">Peak in Era & Team</option>
                  <option disabled={isClassic!} value="average-era">
                    Average in Era
                  </option>
                  <option value="average-era-team">
                    Average in Era & Team
                  </option>
                  <option disabled={isClassic!} value="career-avg">
                    Career Average
                  </option>
                  <option disabled={isClassic!} value="best-any">
                    Best Any Season
                  </option>
                </select>
              </label>
            </div>
          </div>
        </section>
      </div>

      {/* COMMUNITY / SAVED STYLES */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Load Community Style Draft
            </h3>
            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
              Casual / Free
            </span>
          </div>
          <div className="space-y-3">
            {communityLoading ? (
              <p className="text-sm text-slate-400">Loading community styles...</p>
            ) : communityStyles.length === 0 ? (
              <p className="text-sm text-slate-500">
                No community styles yet. Save and publish yours!
              </p>
            ) : (
              communityStyles.map((style) => (
                <div
                  key={style.id}
                  className={`rounded-xl border p-3 ${
                    selectedStyleId === style.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-100">
                        {style.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {style.description}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Plays: {style.plays} • Mode:{" "}
                        {style.settings?.mode || style.mode || "casual"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="w-4 h-4" /> {style.thumbsUp}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="w-4 h-4" /> {style.thumbsDown}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-2 font-semibold"
                      onClick={() => applyStyle(style)}
                    >
                      Load Style
                    </button>
                    <button
                      className="text-[11px] text-slate-400 underline"
                      onClick={() => handleThumb(style.id, 1)}
                    >
                      Thumbs up
                    </button>
                    <button
                      className="text-[11px] text-slate-400 underline"
                      onClick={() => handleThumb(style.id, -1)}
                    >
                      Thumbs down
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              My Saved Styles
            </h3>
            {!isPremium && (
              <span className="text-[11px] text-amber-300">
                Premium required to save
              </span>
            )}
          </div>
          <div className="space-y-2">
            {savedStyles.length === 0 ? (
              <p className="text-sm text-slate-500">
                No saved styles yet. Enable &quot;Save settings&quot; before
                creating.
              </p>
            ) : stylesLoading ? (
              <p className="text-sm text-slate-400">Loading your styles...</p>
            ) : (
              savedStyles.map((style) => (
                <div
                  key={style.id}
                  className={`rounded-xl border p-3 ${
                    selectedStyleId === style.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">
                        {style.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {style.description || "No description"}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Plays: {style.plays || 0}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="text-xs rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-2"
                      onClick={() => applyStyle(style)}
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* SAVE SETTINGS PROMPT */}
      {!isClassic && (mode === "casual" || mode === "free") && (
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wantSaveBeforeCreate}
              onChange={(e) => setWantSaveBeforeCreate(e.target.checked)}
              disabled={!isPremium}
            />
            <span className={!isPremium ? "text-slate-500" : "text-slate-200"}>
              Save these draft settings before creating
            </span>
          </label>
          {!isPremium && (
            <span className="text-[11px] text-amber-300">
              Premium required to save styles.
            </span>
          )}
        </div>
      )}

      {/* CREATE BUTTON */}
      <button
        onClick={handleCreate}
        disabled={loading}
        className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? "Creating Draft..." : "Create Draft"}{" "}
        <ChevronRight className="w-4 h-4" />
      </button>

      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Save Draft Settings</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-sm text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>
            <input
              placeholder="Name these settings"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
            />
            <textarea
              placeholder="Optional description"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
            />
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="vis"
                  checked={saveVisibility === "private"}
                  onChange={() => setSaveVisibility("private")}
                />
                Private
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="vis"
                  checked={saveVisibility === "public"}
                  onChange={() => setSaveVisibility("public")}
                />
                Public
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={saveLoading}
                onClick={() => saveStyleAndMaybeCreate(true)}
                className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {saveLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </span>
                ) : (
                  "Save & Create"
                )}
              </button>
              <button
                disabled={saveLoading}
                onClick={() => saveStyleAndMaybeCreate(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm"
              >
                Save Only
              </button>
            </div>
          </div>
        </div>
      )}

      {showRules && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Draft Rules</h3>
              <button
                onClick={() => setShowRules(false)}
                className="text-sm text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex gap-2 text-xs">
              {(["classic", "casual", "free"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRulesTab(tab)}
                  className={`px-3 py-1 rounded border ${
                    rulesTab === tab
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                      : "border-slate-700 text-slate-300"
                  }`}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {rulesTab === "classic" && (
              <ul className="text-sm text-slate-200 space-y-2">
                <li>• Random era + team; one spin per turn.</li>
                <li>• Unique players only, positions enforced.</li>
                <li>• Scoring uses best season for that team in the era.</li>
              </ul>
            )}
            {rulesTab === "casual" && (
              <ul className="text-sm text-slate-200 space-y-2">
                <li>
                  • Tweak era/team, allow duplicate versions across teams.
                </li>
                <li>
                  • Choose stat mode: peak in era, average in era, or team
                  tenure.
                </li>
                <li>• Optional custom scoring weights.</li>
              </ul>
            )}
            {rulesTab === "free" && (
              <ul className="text-sm text-slate-200 space-y-2">
                <li>• No position enforcement; sandbox picks.</li>
                <li>• Up to 5 participants, any lineup size.</li>
                <li>• You decide ordering and scoring.</li>
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
