// app/draft/new/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

export default function NewDraftPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const searchParams = useSearchParams();

  const queryLeague = useMemo(
    () => (searchParams.get("league") || "").toUpperCase(),
    [searchParams]
  );
  const initialLeague: "NBA" | "NFL" =
    queryLeague === "NFL" ? "NFL" : "NBA";

  const [league, setLeague] = useState<"NBA" | "NFL">(initialLeague);
  const [title, setTitle] = useState("");
  const NFL_LINEUP = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF"];

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
  const [eraFrom, setEraFrom] = useState<number | "">("");
  const [eraTo, setEraTo] = useState<number | "">("");

  const [randomTeam, setRandomTeam] = useState(true);
  const [teamConstraint, setTeamConstraint] = useState("");

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

  const [scoringMethod, setScoringMethod] = useState<
    "system" | "user" | "public"
  >("system");

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
      setRandomTeam(true);
      setParticipants(2);
      setPlayersPerTeam(leaguePlayers ?? 6);
      setRequirePositions(true);
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
    }

    if (nextMode === "casual") {
      setRandomEra(true);
      setRandomTeam(true);
      setParticipants(2);
      setPlayersPerTeam(leaguePlayers ?? 5);
      setRequirePositions(true);
      setMaxPlayers((leaguePlayers ?? 5) * 2);

      setPickTimerSeconds("");
      setAutoPickEnabled(false);
      setSuggestionsEnabled(true);
    }

    if (nextMode === "free") {
      setRandomEra(false);
      setRandomTeam(false);
      setParticipants(1);
      setPlayersPerTeam(leaguePlayers ?? 10);
      setRequirePositions(league === "NFL" ? true : false); // locked off
      setMaxPlayers(leaguePlayers ?? 10);

      setPickTimerSeconds("");
      setAutoPickEnabled(false);
      setSuggestionsEnabled(false);
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

  // ------------------------------------------
  async function handleCreate() {
    setLoading(true);
    try {
      const effectivePlayersPerTeam =
        league === "NFL" ? NFL_LINEUP.length : playersPerTeam;
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
        ...(league === "NFL"
          ? {
              lineup: NFL_LINEUP,
              fantasyScoring: false,
              allowDefense: true,
            }
          : {}),
      };

      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          requirePositions: league === "NFL" ? true : isFree ? false : requirePositions,
          scoringMethod,
          rules,
        }),
      });

      if (!res.ok) {
        alert("Failed to create draft");
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
                    recalcTotalSlots(v, league === "NFL" ? NFL_LINEUP.length : playersPerTeam);
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
                  disabled={isClassic || league === "NFL"}
                  min={league === "NFL" ? NFL_LINEUP.length : 5}
                  max={mode === "free" ? 15 : 12}
                  value={league === "NFL" ? NFL_LINEUP.length : playersPerTeam}
                  onChange={(e) => {
                    const v = Math.min(
                      mode === "free" ? 15 : 12,
                      Math.max(1, Number(e.target.value))
                    );
                    setPlayersPerTeam(v);
                    recalcTotalSlots(participants, v);
                  }}
                  className={`w-full px-3 py-2 rounded-lg ${
                    isClassic || league === "NFL"
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
                disabled={isFree || isClassic || league === "NFL"}
              />
              <span
                className={`${
                  isClassic || isFree || league === "NFL"
                    ? "text-slate-500"
                    : "text-slate-200"
                }`}
              >
                {league === "NFL"
                  ? "Enforce default NFL lineup"
                  : "Enforce PG / SG / SF / PF / C"}
              </span>
            </label>

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
            {!randomEra && !isClassic && (
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <input
                  placeholder="From"
                  type="number"
                  value={eraFrom}
                  onChange={(e) =>
                    setEraFrom(e.target.value ? Number(e.target.value) : "")
                  }
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                />
                <input
                  placeholder="To"
                  type="number"
                  value={eraTo}
                  onChange={(e) =>
                    setEraTo(e.target.value ? Number(e.target.value) : "")
                  }
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                />
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

      {/* CREATE BUTTON */}
      <button
        onClick={handleCreate}
        disabled={loading}
        className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? "Creating Draft..." : "Create Draft"}{" "}
        <ChevronRight className="w-4 h-4" />
      </button>

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
