"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  const [title, setTitle] = useState("");

  // Classic | Casual | Free
  const [mode, setMode] = useState<"classic" | "casual" | "free">("classic");

  // Base states
  const [randomEra, setRandomEra] = useState(true);
  const [eraFrom, setEraFrom] = useState<number | "">("");
  const [eraTo, setEraTo] = useState<number | "">("");

  const [randomTeam, setRandomTeam] = useState(true);
  const [teamConstraint, setTeamConstraint] = useState("");

  const [participants, setParticipants] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(6);
  const [maxPlayers, setMaxPlayers] = useState(12);

  const [requirePositions, setRequirePositions] = useState(true);

  const [scoringMethod, setScoringMethod] = useState<
    "system" | "user" | "public"
  >("system");

  // caps and rule tweaks
  const [maxPpgCap, setMaxPpgCap] = useState<number | "">("");
  const [overallCap, setOverallCap] = useState<number | "">("");
  const [hallRule, setHallRule] = useState<"any" | "none">("any");
  const [multiTeamOnly, setMultiTeamOnly] = useState(false);
  const [peakMode, setPeakMode] = useState<"peak" | "average">("peak");

  const [loading, setLoading] = useState(false);

  // ------------------------------------------
  //  LOCKING LOGIC
  // ------------------------------------------
  const isClassic = mode === "classic";
  const isCasual = mode === "casual";
  const isFree = mode === "free";

  // On mode change → set defaults
  function applyModeDefaults(nextMode: "classic" | "casual" | "free") {
    if (nextMode === "classic") {
      // LOCKED SETTINGS — cannot be changed
      setRandomEra(true);
      setRandomTeam(true);
      setParticipants(2);
      setPlayersPerTeam(6);
      setRequirePositions(true);
      setHallRule("any");
      setMultiTeamOnly(false);
      setPeakMode("peak");
      setEraFrom("");
      setEraTo("");
      setTeamConstraint("");
      setMaxPpgCap("");
      setOverallCap("");
      setMaxPlayers(12);
    }

    if (nextMode === "casual") {
      setRandomEra(true);
      setRandomTeam(true);
      setParticipants(2);
      setPlayersPerTeam(5);
      setRequirePositions(true);
      setMaxPlayers(10);
    }

    if (nextMode === "free") {
      setRandomEra(false);
      setRandomTeam(false);
      setParticipants(1);
      setPlayersPerTeam(10);
      setRequirePositions(false); // locked off
      setMaxPlayers(10);
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
      const rules = {
        maxPpgCap: isClassic
          ? null
          : maxPpgCap === ""
          ? null
          : Number(maxPpgCap),
        overallCap: isClassic
          ? null
          : overallCap === ""
          ? null
          : Number(overallCap),
        hallRule: isClassic ? "any" : hallRule,
        multiTeamOnly: isClassic ? false : multiTeamOnly,
        peakMode,
        participants,
        playersPerTeam,
      };

      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league: "NBA",
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
          maxPlayers,
          requirePositions: isFree ? false : requirePositions,
          scoringMethod,
          rules,
        }),
      });

      if (!res.ok) {
        alert("Failed to create draft");
        return;
      }

      const draft = await res.json();
      router.push(`/draft/${draft.id}`);
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
      <header>
        <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-300 tracking-tight mb-1">
          Create a New NBA Draft
        </h1>
        <p className="text-slate-400 text-sm">
          Classic mode locks rules; Casual & Free let you get creative.
        </p>
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
                    recalcTotalSlots(v, playersPerTeam);
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
                  disabled={isClassic}
                  min={5}
                  max={mode === "free" ? 15 : 12}
                  value={playersPerTeam}
                  onChange={(e) => {
                    const v = Math.min(
                      mode === "free" ? 15 : 12,
                      Math.max(1, Number(e.target.value))
                    );
                    setPlayersPerTeam(v);
                    recalcTotalSlots(participants, v);
                  }}
                  className={`w-full px-3 py-2 rounded-lg ${
                    isClassic
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
                disabled={isFree || isClassic}
              />
              <span
                className={`${
                  isClassic || isFree ? "text-slate-500" : "text-slate-200"
                }`}
              >
                Enforce PG / SG / SF / PF / C
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

              <input
                type="number"
                placeholder="Overall Rating Cap"
                disabled={isClassic}
                value={isClassic ? "" : overallCap}
                onChange={(e) =>
                  setOverallCap(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className={`w-full px-3 py-2 rounded-lg ${
                  isClassic
                    ? "bg-slate-800 border-slate-700 text-slate-600"
                    : "bg-slate-900 border-slate-700"
                }`}
              />

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
                  value={peakMode}
                  onChange={(e) => setPeakMode(e.target.value as any)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
                >
                  <option value="peak">Peak Season</option>
                  <option value="average">Era Average</option>
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
    </main>
  );
}
// // app/draft/new/page.tsx
// "use client";

// import { useRouter } from "next/navigation";
// import { useState } from "react";

// export default function NewDraftPage() {
//   const router = useRouter();
//   const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

//   const [title, setTitle] = useState("");

//   // mode: "default" | "casual" | "free"
//   const [mode, setMode] = useState<"default" | "casual" | "free">("default");

//   const [randomEra, setRandomEra] = useState(true);
//   const [eraFrom, setEraFrom] = useState<number | "">("");
//   const [eraTo, setEraTo] = useState<number | "">("");

//   const [randomTeam, setRandomTeam] = useState(true);
//   const [teamConstraint, setTeamConstraint] = useState("");

//   const [participants, setParticipants] = useState(2);
//   const [playersPerTeam, setPlayersPerTeam] = useState(6);
//   const [maxPlayers, setMaxPlayers] = useState(12); // total slots across all players
//   const [requirePositions, setRequirePositions] = useState(true);
//   const [scoringMethod, setScoringMethod] = useState<
//     "system" | "user" | "public"
//   >("system");

//   // caps and rule tweaks
//   const [maxPpgCap, setMaxPpgCap] = useState<number | "">("");
//   // const [minPpgCap, setMinPpgCap] = useState<number | "">("");
//   const [overallCap, setOverallCap] = useState<number | "">("");
//   // const [minOverallCap, setMinOverallCap] = useState<number | "">("");
//   const [hallRule, setHallRule] = useState<"any" | "none">("any"); // removed "only"
//   const [multiTeamOnly, setMultiTeamOnly] = useState(false);
//   const [peakMode, setPeakMode] = useState<"peak" | "average">("peak");

//   const [loading, setLoading] = useState(false);

//   function recalcTotalSlots(
//     nextParticipants: number,
//     nextPlayersPerTeam: number
//   ) {
//     const totalSlots =
//       mode === "free"
//         ? nextPlayersPerTeam * nextParticipants
//         : nextPlayersPerTeam * nextParticipants;
//     setMaxPlayers(totalSlots);
//   }

//   function applyModeDefaults(nextMode: "default" | "casual" | "free") {
//     if (nextMode === "default") {
//       setRandomEra(true);
//       setRandomTeam(true);
//       setParticipants(2);
//       setPlayersPerTeam(6);
//       setRequirePositions(true);
//       setScoringMethod("system");
//       setMaxPpgCap("");
//       // setMinPpgCap("");
//       setOverallCap("");
//       // setMinOverallCap("");
//       setHallRule("any");
//       setMultiTeamOnly(false);
//       setPeakMode("peak");
//       recalcTotalSlots(2, 6);
//     } else if (nextMode === "casual") {
//       // start as a 1v1 with classic 5-man teams
//       setRandomEra(true);
//       setRandomTeam(true);
//       setParticipants(2);
//       setPlayersPerTeam(5);
//       setRequirePositions(true);
//       setScoringMethod("system");
//       // caps are up to user here
//       recalcTotalSlots(2, 5);
//     } else {
//       // free / creative
//       setRandomEra(false);
//       setRandomTeam(false);
//       setParticipants(1);
//       setPlayersPerTeam(10);
//       setRequirePositions(false);
//       setScoringMethod("system");
//       recalcTotalSlots(1, 10);
//     }
//     setMode(nextMode);
//   }

//   async function handleCreate() {
//     setLoading(true);
//     try {
//       const rules = {
//         maxPpgCap: maxPpgCap === "" ? null : Number(maxPpgCap),
//         // minPpgCap: minPpgCap === "" ? null : Number(minPpgCap),
//         overallCap: overallCap === "" ? null : Number(overallCap),
//         // minOverallCap: minOverallCap === "" ? null : Number(minOverallCap),
//         hallRule,
//         multiTeamOnly,
//         peakMode,
//         participants,
//         playersPerTeam,
//       };

//       const totalSlots = maxPlayers;

//       const res = await fetch(`${API_URL}/drafts`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           league: "NBA",
//           mode, // "default" | "casual" | "free"
//           title: title || null,
//           randomEra,
//           eraFrom: !randomEra && eraFrom !== "" ? Number(eraFrom) : undefined,
//           eraTo: !randomEra && eraTo !== "" ? Number(eraTo) : undefined,
//           randomTeam,
//           teamConstraint:
//             !randomTeam && teamConstraint ? teamConstraint : undefined,
//           maxPlayers: totalSlots,
//           requirePositions: mode === "free" ? false : requirePositions,
//           scoringMethod,
//           rules,
//         }),
//       });

//       if (!res.ok) {
//         let errorDetail = "";
//         try {
//           const body = await res.json();
//           errorDetail = body?.error || JSON.stringify(body);
//         } catch (err) {
//           errorDetail = await res.text();
//         }
//         console.error("Create draft failed:", errorDetail);
//         alert("Failed to create draft");
//         return;
//       }

//       const draft = await res.json();
//       router.push(`/draft/${draft.id}`);
//     } catch (err) {
//       console.error("Create draft request error:", err);
//       alert("Failed to reach the draft service. Is the backend running?");
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <main className="space-y-6">
//       <h2 className="text-xl font-semibold">New NBA Draft</h2>

//       <div className="grid gap-4 md:grid-cols-2">
//         {/* General */}
//         <div className="space-y-3 bg-slate-800 rounded-lg p-4">
//           <h3 className="font-semibold">General</h3>
//           <div className="space-y-2">
//             <label className="block text-sm">
//               Title (optional)
//               <input
//                 value={title}
//                 onChange={(e) => setTitle(e.target.value)}
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//               />
//             </label>

//             <label className="block text-sm">
//               Mode
//               <select
//                 value={mode}
//                 onChange={(e) =>
//                   applyModeDefaults(
//                     e.target.value as "default" | "casual" | "free"
//                   )
//                 }
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//               >
//                 <option value="default">
//                   Default: 1v1, random team & decade, 6-man
//                 </option>
//                 <option value="casual">
//                   Casual: tweak caps/rules, up to 5 players
//                 </option>
//                 <option value="free">
//                   Creative: free build, up to 5 players, up to 15-man lineups
//                 </option>
//               </select>
//             </label>

//             <div className="grid grid-cols-2 gap-2">
//               <label className="block text-sm">
//                 Players playing (1-5)
//                 <input
//                   type="number"
//                   min={1}
//                   max={5}
//                   value={participants}
//                   onChange={(e) => {
//                     const v = Math.max(1, Math.min(5, Number(e.target.value)));
//                     setParticipants(v);
//                     recalcTotalSlots(v, playersPerTeam);
//                   }}
//                   className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//                 />
//               </label>

//               <label className="block text-sm">
//                 Players per team
//                 <input
//                   type="number"
//                   min={5}
//                   max={mode === "free" ? 15 : 12}
//                   value={playersPerTeam}
//                   onChange={(e) => {
//                     const v = Math.max(
//                       1,
//                       Math.min(
//                         mode === "free" ? 15 : 12,
//                         Number(e.target.value)
//                       )
//                     );
//                     setPlayersPerTeam(v);
//                     recalcTotalSlots(participants, v);
//                   }}
//                   className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//                 />
//               </label>
//             </div>

//             <label className="block text-sm">
//               Total slots (auto)
//               <input
//                 type="number"
//                 value={maxPlayers}
//                 readOnly
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm bg-slate-800 text-slate-400"
//               />
//             </label>

//             <label className="flex items-center gap-2 text-sm">
//               <input
//                 type="checkbox"
//                 checked={requirePositions}
//                 disabled={mode === "free"}
//                 onChange={(e) => setRequirePositions(e.target.checked)}
//               />
//               Enforce PG / SG / SF / PF / C for starting five
//             </label>

//             <label className="block text-sm">
//               Scoring method
//               <select
//                 value={scoringMethod}
//                 onChange={(e) =>
//                   setScoringMethod(
//                     e.target.value as "system" | "user" | "public"
//                   )
//                 }
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//               >
//                 <option value="system">System scoring</option>
//                 <option value="user">Players decide winner</option>
//                 <option value="public">Community vote</option>
//               </select>
//             </label>
//           </div>
//         </div>

//         {/* Era & Team */}
//         <div className="space-y-3 bg-slate-800 rounded-lg p-4">
//           <h3 className="font-semibold">Era & Team</h3>

//           <label className="flex items-center gap-2 text-sm">
//             <input
//               type="checkbox"
//               checked={randomEra}
//               onChange={(e) => setRandomEra(e.target.checked)}
//               disabled={mode === "free"}
//             />
//             Random decade / era spin
//           </label>

//           {!randomEra && (
//             <div className="grid grid-cols-2 gap-2 text-sm">
//               <label>
//                 Era from
//                 <input
//                   type="number"
//                   value={eraFrom}
//                   onChange={(e) =>
//                     setEraFrom(
//                       e.target.value === "" ? "" : Number(e.target.value)
//                     )
//                   }
//                   className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs"
//                 />
//               </label>
//               <label>
//                 Era to
//                 <input
//                   type="number"
//                   value={eraTo}
//                   onChange={(e) =>
//                     setEraTo(
//                       e.target.value === "" ? "" : Number(e.target.value)
//                     )
//                   }
//                   className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs"
//                 />
//               </label>
//             </div>
//           )}

//           <label className="flex items-center gap-2 text-sm">
//             <input
//               type="checkbox"
//               checked={randomTeam}
//               onChange={(e) => setRandomTeam(e.target.checked)}
//               disabled={mode === "free"}
//             />
//             Random team / constraint spin
//           </label>

//           {!randomTeam && (
//             <label className="block text-sm">
//               Team constraint (e.g. LAL, BOS)
//               <input
//                 value={teamConstraint}
//                 onChange={(e) =>
//                   setTeamConstraint(e.target.value.toUpperCase())
//                 }
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//               />
//             </label>
//           )}
//         </div>

//         {/* Rule Tweaks – mostly for Casual */}
//         <div className="space-y-3 bg-slate-800 rounded-lg p-4">
//           <h3 className="font-semibold">Rule Tweaks</h3>
//           <p className="text-xs text-slate-300">
//             For Casual mode this is where you add PPG caps, rating caps, and
//             constraints. Default mode ignores these; Creative is mostly free.
//           </p>

//           <label className="block text-sm">
//             Max team PPG cap (optional)
//             <input
//               type="number"
//               value={maxPpgCap}
//               onChange={(e) =>
//                 setMaxPpgCap(
//                   e.target.value === "" ? "" : Number(e.target.value)
//                 )
//               }
//               className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//             />
//           </label>

//           <label className="block text-sm">
//             Max overall rating cap (optional)
//             <input
//               type="number"
//               value={overallCap}
//               onChange={(e) =>
//                 setOverallCap(
//                   e.target.value === "" ? "" : Number(e.target.value)
//                 )
//               }
//               className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//             />
//           </label>

//           <label className="block text-sm">
//             Hall of Fame rule
//             <select
//               value={hallRule}
//               onChange={(e) => setHallRule(e.target.value as any)}
//               className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//             >
//               <option value="any">Any players allowed</option>
//               <option value="none">No Hall of Famers</option>
//             </select>
//           </label>

//           <label className="flex items-center gap-2 text-sm">
//             <input
//               type="checkbox"
//               checked={multiTeamOnly}
//               onChange={(e) => setMultiTeamOnly(e.target.checked)}
//             />
//             Only players who played for multiple teams
//           </label>

//           <label className="block text-sm">
//             Stat mode
//             <select
//               value={peakMode}
//               onChange={(e) => setPeakMode(e.target.value as any)}
//               className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//             >
//               <option value="peak">Peak season in era / team</option>
//               <option value="average">Average across era</option>
//             </select>
//           </label>
//         </div>
//       </div>

//       <button
//         onClick={handleCreate}
//         disabled={loading}
//         className="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-sm font-semibold disabled:opacity-50"
//       >
//         {loading ? "Creating..." : "Create Draft"}
//       </button>
//     </main>
//   );
// }
