// app/draft/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewDraftPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const [title, setTitle] = useState("");

  // mode: "default" | "casual" | "free"
  const [mode, setMode] = useState<"default" | "casual" | "free">("default");

  const [randomEra, setRandomEra] = useState(true);
  const [eraFrom, setEraFrom] = useState<number | "">("");
  const [eraTo, setEraTo] = useState<number | "">("");

  const [randomTeam, setRandomTeam] = useState(true);
  const [teamConstraint, setTeamConstraint] = useState("");

  const [participants, setParticipants] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(6);
  const [maxPlayers, setMaxPlayers] = useState(12); // total slots across all players
  const [requirePositions, setRequirePositions] = useState(true);
  const [scoringMethod, setScoringMethod] = useState<
    "system" | "user" | "public"
  >("system");

  // caps and rule tweaks
  const [maxPpgCap, setMaxPpgCap] = useState<number | "">("");
  // const [minPpgCap, setMinPpgCap] = useState<number | "">("");
  const [overallCap, setOverallCap] = useState<number | "">("");
  // const [minOverallCap, setMinOverallCap] = useState<number | "">("");
  const [hallRule, setHallRule] = useState<"any" | "none">("any"); // removed "only"
  const [multiTeamOnly, setMultiTeamOnly] = useState(false);
  const [peakMode, setPeakMode] = useState<"peak" | "average">("peak");

  const [loading, setLoading] = useState(false);

  function recalcTotalSlots(
    nextParticipants: number,
    nextPlayersPerTeam: number
  ) {
    const totalSlots =
      mode === "free"
        ? nextPlayersPerTeam * nextParticipants
        : nextPlayersPerTeam * nextParticipants;
    setMaxPlayers(totalSlots);
  }

  function applyModeDefaults(nextMode: "default" | "casual" | "free") {
    if (nextMode === "default") {
      setRandomEra(true);
      setRandomTeam(true);
      setParticipants(2);
      setPlayersPerTeam(6);
      setRequirePositions(true);
      setScoringMethod("system");
      setMaxPpgCap("");
      // setMinPpgCap("");
      setOverallCap("");
      // setMinOverallCap("");
      setHallRule("any");
      setMultiTeamOnly(false);
      setPeakMode("peak");
      recalcTotalSlots(2, 6);
    } else if (nextMode === "casual") {
      // start as a 1v1 with classic 5-man teams
      setRandomEra(true);
      setRandomTeam(true);
      setParticipants(2);
      setPlayersPerTeam(5);
      setRequirePositions(true);
      setScoringMethod("system");
      // caps are up to user here
      recalcTotalSlots(2, 5);
    } else {
      // free / creative
      setRandomEra(false);
      setRandomTeam(false);
      setParticipants(1);
      setPlayersPerTeam(10);
      setRequirePositions(false);
      setScoringMethod("system");
      recalcTotalSlots(1, 10);
    }
    setMode(nextMode);
  }

  async function handleCreate() {
    setLoading(true);
    try {
      const rules = {
        maxPpgCap: maxPpgCap === "" ? null : Number(maxPpgCap),
        // minPpgCap: minPpgCap === "" ? null : Number(minPpgCap),
        overallCap: overallCap === "" ? null : Number(overallCap),
        // minOverallCap: minOverallCap === "" ? null : Number(minOverallCap),
        hallRule,
        multiTeamOnly,
        peakMode,
        participants,
        playersPerTeam,
      };

      const totalSlots = maxPlayers;

      const res = await fetch(`${API_URL}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league: "NBA",
          mode, // "default" | "casual" | "free"
          title: title || null,
          randomEra,
          eraFrom: !randomEra && eraFrom !== "" ? Number(eraFrom) : undefined,
          eraTo: !randomEra && eraTo !== "" ? Number(eraTo) : undefined,
          randomTeam,
          teamConstraint:
            !randomTeam && teamConstraint ? teamConstraint : undefined,
          maxPlayers: totalSlots,
          requirePositions: mode === "free" ? false : requirePositions,
          scoringMethod,
          rules,
        }),
      });

      if (!res.ok) {
        let errorDetail = "";
        try {
          const body = await res.json();
          errorDetail = body?.error || JSON.stringify(body);
        } catch (err) {
          errorDetail = await res.text();
        }
        console.error("Create draft failed:", errorDetail);
        alert("Failed to create draft");
        return;
      }

      const draft = await res.json();
      router.push(`/draft/${draft.id}`);
    } catch (err) {
      console.error("Create draft request error:", err);
      alert("Failed to reach the draft service. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <h2 className="text-xl font-semibold">New NBA Draft</h2>

      <div className="grid gap-4 md:grid-cols-2">
        {/* General */}
        <div className="space-y-3 bg-slate-800 rounded-lg p-4">
          <h3 className="font-semibold">General</h3>
          <div className="space-y-2">
            <label className="block text-sm">
              Title (optional)
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              />
            </label>

            <label className="block text-sm">
              Mode
              <select
                value={mode}
                onChange={(e) =>
                  applyModeDefaults(
                    e.target.value as "default" | "casual" | "free"
                  )
                }
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              >
                <option value="default">
                  Default: 1v1, random team & decade, 6-man
                </option>
                <option value="casual">
                  Casual: tweak caps/rules, up to 5 players
                </option>
                <option value="free">
                  Creative: free build, up to 5 players, up to 15-man lineups
                </option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                Players playing (1-5)
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={participants}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(5, Number(e.target.value)));
                    setParticipants(v);
                    recalcTotalSlots(v, playersPerTeam);
                  }}
                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                />
              </label>

              <label className="block text-sm">
                Players per team
                <input
                  type="number"
                  min={5}
                  max={mode === "free" ? 15 : 12}
                  value={playersPerTeam}
                  onChange={(e) => {
                    const v = Math.max(
                      1,
                      Math.min(
                        mode === "free" ? 15 : 12,
                        Number(e.target.value)
                      )
                    );
                    setPlayersPerTeam(v);
                    recalcTotalSlots(participants, v);
                  }}
                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                />
              </label>
            </div>

            <label className="block text-sm">
              Total slots (auto)
              <input
                type="number"
                value={maxPlayers}
                readOnly
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm bg-slate-800 text-slate-400"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requirePositions}
                disabled={mode === "free"}
                onChange={(e) => setRequirePositions(e.target.checked)}
              />
              Enforce PG / SG / SF / PF / C for starting five
            </label>

            <label className="block text-sm">
              Scoring method
              <select
                value={scoringMethod}
                onChange={(e) =>
                  setScoringMethod(
                    e.target.value as "system" | "user" | "public"
                  )
                }
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              >
                <option value="system">System scoring</option>
                <option value="user">Players decide winner</option>
                <option value="public">Community vote</option>
              </select>
            </label>
          </div>
        </div>

        {/* Era & Team */}
        <div className="space-y-3 bg-slate-800 rounded-lg p-4">
          <h3 className="font-semibold">Era & Team</h3>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={randomEra}
              onChange={(e) => setRandomEra(e.target.checked)}
              disabled={mode === "free"}
            />
            Random decade / era spin
          </label>

          {!randomEra && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>
                Era from
                <input
                  type="number"
                  value={eraFrom}
                  onChange={(e) =>
                    setEraFrom(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs"
                />
              </label>
              <label>
                Era to
                <input
                  type="number"
                  value={eraTo}
                  onChange={(e) =>
                    setEraTo(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs"
                />
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={randomTeam}
              onChange={(e) => setRandomTeam(e.target.checked)}
              disabled={mode === "free"}
            />
            Random team / constraint spin
          </label>

          {!randomTeam && (
            <label className="block text-sm">
              Team constraint (e.g. LAL, BOS)
              <input
                value={teamConstraint}
                onChange={(e) =>
                  setTeamConstraint(e.target.value.toUpperCase())
                }
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              />
            </label>
          )}
        </div>

        {/* Rule Tweaks – mostly for Casual */}
        <div className="space-y-3 bg-slate-800 rounded-lg p-4">
          <h3 className="font-semibold">Rule Tweaks</h3>
          <p className="text-xs text-slate-300">
            For Casual mode this is where you add PPG caps, rating caps, and
            constraints. Default mode ignores these; Creative is mostly free.
          </p>

          <label className="block text-sm">
            Max team PPG cap (optional)
            <input
              type="number"
              value={maxPpgCap}
              onChange={(e) =>
                setMaxPpgCap(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
            />
          </label>

          <label className="block text-sm">
            Max overall rating cap (optional)
            <input
              type="number"
              value={overallCap}
              onChange={(e) =>
                setOverallCap(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
            />
          </label>

          <label className="block text-sm">
            Hall of Fame rule
            <select
              value={hallRule}
              onChange={(e) => setHallRule(e.target.value as any)}
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
            >
              <option value="any">Any players allowed</option>
              <option value="none">No Hall of Famers</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={multiTeamOnly}
              onChange={(e) => setMultiTeamOnly(e.target.checked)}
            />
            Only players who played for multiple teams
          </label>

          <label className="block text-sm">
            Stat mode
            <select
              value={peakMode}
              onChange={(e) => setPeakMode(e.target.value as any)}
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
            >
              <option value="peak">Peak season in era / team</option>
              <option value="average">Average across era</option>
            </select>
          </label>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={loading}
        className="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Draft"}
      </button>
    </main>
  );
}
// "use client";

// import { useRouter } from "next/navigation";
// import { useState } from "react";

// export default function NewDraftPage() {
//   const router = useRouter();
//   const API_URL =
//     process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

//   const [title, setTitle] = useState("");
//   const [randomEra, setRandomEra] = useState(true);
//   const [eraFrom, setEraFrom] = useState<number | "">("");
//   const [eraTo, setEraTo] = useState<number | "">("");
//   const [randomTeam, setRandomTeam] = useState(true);
//   const [teamConstraint, setTeamConstraint] = useState("");
//   const [mode, setMode] = useState<"default" | "casual" | "free">("default");
//   const [participants, setParticipants] = useState(2);
//   const [playersPerTeam, setPlayersPerTeam] = useState(6);
//   const [maxPlayers, setMaxPlayers] = useState(12); // total slots across all players
//   const [requirePositions, setRequirePositions] = useState(true);
//   const [scoringMethod, setScoringMethod] = useState<
//     "system" | "user" | "public"
//   >("system");

//   const [maxPpgCap, setMaxPpgCap] = useState<number | "">("");
//   const [overallCap, setOverallCap] = useState<number | "">("");
//   const [hallRule, setHallRule] = useState<"any" | "only" | "none">("any");
//   const [multiTeamOnly, setMultiTeamOnly] = useState(false);
//   const [peakMode, setPeakMode] = useState<"peak" | "average">("peak");

//   const [loading, setLoading] = useState(false);

//   function applyModeDefaults(nextMode: "default" | "casual" | "free") {
//     if (nextMode === "default") {
//       setRandomEra(true);
//       setRandomTeam(true);
//       setParticipants(2);
//       setPlayersPerTeam(6);
//       setMaxPlayers(12);
//       setRequirePositions(true);
//     } else if (nextMode === "casual") {
//       setParticipants(2);
//       setPlayersPerTeam(5);
//       setMaxPlayers(10);
//       setRequirePositions(true);
//     } else {
//       // free mode
//       setParticipants(1);
//       setPlayersPerTeam(12);
//       setMaxPlayers(12);
//       setRequirePositions(false);
//     }
//     setMode(nextMode);
//   }

//   async function handleCreate() {
//     setLoading(true);
//     try {
//       const rules = {
//         maxPpgCap: maxPpgCap || null,
//         overallCap: overallCap || null,
//         hallRule,
//         multiTeamOnly,
//         peakMode,
//         participants,
//         playersPerTeam,
//       };

//       const totalSlots =
//         mode === "free" ? playersPerTeam : playersPerTeam * participants;

//       const res = await fetch(`${API_URL}/drafts`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           league: "NBA",
//           mode,
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
//                   applyModeDefaults(e.target.value as "default" | "casual" | "free")
//                 }
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//               >
//                 <option value="default">Default (1v1, random team & decade, 6-man)</option>
//                 <option value="casual">Casual (tweak rules, up to 5 players)</option>
//                 <option value="free">Free mode (solo sandbox)</option>
//               </select>
//             </label>

//             <div className="grid grid-cols-2 gap-2">
//               <label className="block text-sm">
//                 Players playing (1-5)
//                 <input
//                   type="number"
//                   min={1}
//                   max={5}
//                   disabled={mode === "free"}
//                   value={participants}
//                   onChange={(e) => {
//                     const v = Math.max(1, Math.min(5, Number(e.target.value)));
//                     setParticipants(v);
//                     setMaxPlayers(v * playersPerTeam);
//                   }}
//                   className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm disabled:opacity-50"
//                 />
//               </label>

//               <label className="block text-sm">
//                 Players per team
//                 <input
//                   type="number"
//                   min={5}
//                   max={12}
//                   value={playersPerTeam}
//                   onChange={(e) => {
//                     const v = Math.max(1, Math.min(12, Number(e.target.value)));
//                     setPlayersPerTeam(v);
//                     setMaxPlayers((mode === "free" ? 1 : participants) * v);
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
//               Enforce PG / SG / SF / PF / C
//             </label>

//             <label className="block text-sm">
//               Scoring method
//               <select
//                 value={scoringMethod}
//                 onChange={(e) => setScoringMethod(e.target.value as any)}
//                 className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//               >
//                 <option value="system">System scoring</option>
//                 <option value="user">User decides winner</option>
//                 <option value="public">Public voting</option>
//               </select>
//             </label>
//           </div>
//         </div>

//         <div className="space-y-3 bg-slate-800 rounded-lg p-4">
//           <h3 className="font-semibold">Era & Team</h3>

//           <label className="flex items-center gap-2 text-sm">
//             <input
//               type="checkbox"
//               checked={randomEra}
//               onChange={(e) => setRandomEra(e.target.checked)}
//             />
//             Random decade
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
//             />
//             Random team
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

//         <div className="space-y-3 bg-slate-800 rounded-lg p-4">
//           <h3 className="font-semibold">Rule Tweaks</h3>
//           <p className="text-xs text-slate-300">
//             These are your fun caps / constraints. We’ll enforce them
//             server-side later.
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
//             Overall rating cap (0–100, optional)
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
//               <option value="only">Only Hall of Famers</option>
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
//               <option value="peak">Peak season in era</option>
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
