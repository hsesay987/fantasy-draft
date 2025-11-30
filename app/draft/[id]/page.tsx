"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Player = {
  id: string;
  name: string;
  position: string;
  primaryTeam?: string | null;
};

type DraftPick = {
  id: string;
  slot: number;
  position: string;
  player: Player;
};

type Draft = {
  id: string;
  title: string | null;
  league: string;
  eraFrom?: number | null;
  eraTo?: number | null;
  randomEra: boolean;
  teamConstraint?: string | null;
  maxPlayers: number;
  requirePositions: boolean;
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
  }[];
  ruleWarnings: string[];
};

const POSITION_ORDER: string[] = ["PG", "SG", "SF", "PF", "C"];

export default function DraftPage() {
  const params = useParams();
  const id = params?.id as string;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  async function loadDraft() {
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

  async function searchPlayers() {
    if (!draft) return;
    setSearchLoading(true);

    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (draft.eraFrom && draft.eraTo) {
      params.set("eraFrom", String(draft.eraFrom));
      params.set("eraTo", String(draft.eraTo));
    }
    const pos = getSlotPosition(selectedSlot, draft);
    if (pos) params.set("position", pos);

    const res = await fetch(`${API_URL}/players/search?${params.toString()}`);
    const data = await res.json();
    setSearchResults(data);
    setSearchLoading(false);
  }

  function getSlotPosition(
    slot: number | null,
    draft: Draft | null
  ): string | undefined {
    if (!slot || !draft || !draft.requirePositions) return undefined;
    if (slot <= POSITION_ORDER.length) return POSITION_ORDER[slot - 1];
    return undefined;
  }

  async function handleSelectPlayer(player: Player) {
    if (!draft || !selectedSlot) return;

    const position = getSlotPosition(selectedSlot, draft) || player.position;

    const res = await fetch(`${API_URL}/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: selectedSlot,
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
  }

  if (loading || !draft) {
    return <main className="p-4">Loading draft...</main>;
  }

  const lineupSlots = Array.from({ length: draft.maxPlayers }, (_, i) => i + 1);

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
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
      </div>

      {/* Rule Warnings */}
      {score && score.ruleWarnings.length > 0 && (
        <section className="bg-red-950/40 border border-red-700/60 rounded-lg p-3 text-xs text-red-100 space-y-1">
          {score.ruleWarnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </section>
      )}

      {/* Lineup */}
      <section className="bg-slate-800 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Lineup</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {lineupSlots.map((slot) => {
            const pick = draft.picks.find((p) => p.slot === slot);
            const pos = getSlotPosition(slot, draft);
            const playerScore =
              score?.perPlayerScores.find((s) => s.pickId === pick?.id) || null;

            return (
              <button
                key={slot}
                onClick={() => setSelectedSlot(slot)}
                className={`flex items-center justify-between rounded border px-3 py-2 text-sm
                  ${
                    selectedSlot === slot
                      ? "border-indigo-500 bg-slate-900"
                      : "border-slate-700 bg-slate-900/50"
                  }`}
              >
                <div className="flex flex-col text-left">
                  <span className="text-xs text-slate-400">
                    Slot {slot} {pos ? `(${pos})` : ""}
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
                {pick && (
                  <span className="text-xs text-slate-400">
                    {pick.player.position}{" "}
                    {pick.player.primaryTeam && `• ${pick.player.primaryTeam}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Player search */}
      <section className="bg-slate-800 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Select Player</h3>
        <p className="text-xs text-slate-300">
          {selectedSlot
            ? `Selecting for slot ${selectedSlot} ${
                getSlotPosition(selectedSlot, draft)
                  ? `(${getSlotPosition(selectedSlot, draft)})`
                  : ""
              }`
            : "Select a slot first"}
        </p>

        <div className="flex gap-2">
          <input
            placeholder="Search by name (LeBron, Curry, Wilt)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
          />
          <button
            onClick={searchPlayers}
            disabled={searchLoading || !selectedSlot}
            className="px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-50"
          >
            {searchLoading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {searchResults.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectPlayer(p)}
              className="w-full flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-indigo-500"
            >
              <div className="flex flex-col text-left">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-slate-400">
                  {p.position} {p.primaryTeam && `• ${p.primaryTeam}`}
                </span>
              </div>
            </button>
          ))}
          {searchResults.length === 0 && !searchLoading && (
            <p className="text-xs text-slate-500">
              No players yet. Try searching a common name.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
// "use client";

// import { useEffect, useState } from "react";
// import { useParams } from "next/navigation";

// type Player = {
//   id: string;
//   name: string;
//   position: string;
//   primaryTeam?: string | null;
// };

// type DraftPick = {
//   id: string;
//   slot: number;
//   position: string;
//   player: Player;
// };

// type Draft = {
//   id: string;
//   title: string | null;
//   league: string;
//   eraFrom?: number | null;
//   eraTo?: number | null;
//   randomEra: boolean;
//   teamConstraint?: string | null;
//   maxPlayers: number;
//   requirePositions: boolean;
//   picks: DraftPick[];
// };

// const POSITION_ORDER: string[] = ["PG", "SG", "SF", "PF", "C"];

// export default function DraftPage() {
//   const params = useParams();
//   const id = params?.id as string;
//   const [draft, setDraft] = useState<Draft | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [selectedSlot, setSelectedSlot] = useState<number | null>(1);

//   const [searchQuery, setSearchQuery] = useState("");
//   const [searchResults, setSearchResults] = useState<Player[]>([]);
//   const [searchLoading, setSearchLoading] = useState(false);

//   useEffect(() => {
//     async function loadDraft() {
//       setLoading(true);
//       const res = await fetch(
//         `${process.env.NEXT_PUBLIC_API_URL}/drafts/${id}`
//       );
//       if (!res.ok) {
//         setDraft(null);
//         setLoading(false);
//         return;
//       }
//       const data = await res.json();
//       setDraft(data);
//       setLoading(false);
//     }
//     if (id) loadDraft();
//   }, [id]);

//   async function searchPlayers() {
//     if (!draft) return;

//     setSearchLoading(true);
//     const params = new URLSearchParams();
//     if (searchQuery) params.set("q", searchQuery);
//     if (draft.eraFrom && draft.eraTo) {
//       params.set("eraFrom", String(draft.eraFrom));
//       params.set("eraTo", String(draft.eraTo));
//     }

//     // Optional: enforce position for the selected slot
//     const pos = getSlotPosition(selectedSlot, draft);
//     if (pos) params.set("position", pos);

//     const res = await fetch(
//       `${process.env.NEXT_PUBLIC_API_URL}/players/search?${params.toString()}`
//     );
//     const data = await res.json();
//     setSearchResults(data);
//     setSearchLoading(false);
//   }

//   function getSlotPosition(
//     slot: number | null,
//     draft: Draft | null
//   ): string | undefined {
//     if (!slot || !draft || !draft.requirePositions) return undefined;
//     if (slot <= POSITION_ORDER.length) {
//       return POSITION_ORDER[slot - 1];
//     }
//     return undefined;
//   }

//   async function handleSelectPlayer(player: Player) {
//     if (!draft || !selectedSlot) return;

//     const position = getSlotPosition(selectedSlot, draft) || player.position;

//     const res = await fetch(
//       `${process.env.NEXT_PUBLIC_API_URL}/drafts/${draft.id}`,
//       {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           slot: selectedSlot,
//           playerId: player.id,
//           position,
//         }),
//       }
//     );

//     if (!res.ok) {
//       alert("Failed to add player");
//       return;
//     }

//     // reload draft
//     const updated = await fetch(
//       `${process.env.NEXT_PUBLIC_API_URL}/drafts/${draft.id}`
//     ).then((r) => r.json());
//     setDraft(updated);
//   }

//   if (loading || !draft) {
//     return <main>Loading draft...</main>;
//   }

//   const lineupSlots = Array.from({ length: draft.maxPlayers }, (_, i) => i + 1);

//   return (
//     <main className="space-y-6">
//       <div className="flex items-center justify-between">
//         <div>
//           <h2 className="text-xl font-semibold">
//             {draft.title || "NBA Draft"}
//           </h2>
//           <p className="text-xs text-slate-300">
//             Era:{" "}
//             {draft.randomEra
//               ? "Random"
//               : `${draft.eraFrom ?? "?"} - ${draft.eraTo ?? "?"}`}
//             {draft.teamConstraint && ` | Team: ${draft.teamConstraint}`}
//           </p>
//         </div>
//       </div>

//       {/* Lineup */}
//       <section className="bg-slate-800 rounded-lg p-4">
//         <h3 className="font-semibold mb-3">Lineup</h3>
//         <div className="grid gap-2 md:grid-cols-2">
//           {lineupSlots.map((slot) => {
//             const pick = draft.picks.find((p) => p.slot === slot);
//             const pos = getSlotPosition(slot, draft);

//             return (
//               <button
//                 key={slot}
//                 onClick={() => setSelectedSlot(slot)}
//                 className={`flex items-center justify-between rounded border px-3 py-2 text-sm
//                   ${
//                     selectedSlot === slot
//                       ? "border-indigo-500 bg-slate-900"
//                       : "border-slate-700 bg-slate-900/50"
//                   }`}
//               >
//                 <div className="flex flex-col text-left">
//                   <span className="text-xs text-slate-400">
//                     Slot {slot} {pos ? `(${pos})` : ""}
//                   </span>
//                   <span className="font-medium">
//                     {pick ? pick.player.name : "Empty"}
//                   </span>
//                 </div>
//                 {pick && (
//                   <span className="text-xs text-slate-400">
//                     {pick.player.position}{" "}
//                     {pick.player.primaryTeam && `• ${pick.player.primaryTeam}`}
//                   </span>
//                 )}
//               </button>
//             );
//           })}
//         </div>
//       </section>

//       {/* Player search */}
//       <section className="bg-slate-800 rounded-lg p-4 space-y-3">
//         <h3 className="font-semibold">Select Player</h3>
//         <p className="text-xs text-slate-300">
//           {selectedSlot
//             ? `Selecting for slot ${selectedSlot} ${
//                 getSlotPosition(selectedSlot, draft)
//                   ? `(${getSlotPosition(selectedSlot, draft)})`
//                   : ""
//               }`
//             : "Select a slot first"}
//         </p>

//         <div className="flex gap-2">
//           <input
//             placeholder="Search by name (LeBron, MJ, Curry)..."
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//             className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
//           />
//           <button
//             onClick={searchPlayers}
//             disabled={searchLoading || !selectedSlot}
//             className="px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold disabled:opacity-50"
//           >
//             {searchLoading ? "Searching..." : "Search"}
//           </button>
//         </div>

//         <div className="space-y-2 max-h-64 overflow-y-auto">
//           {searchResults.map((p) => (
//             <button
//               key={p.id}
//               onClick={() => handleSelectPlayer(p)}
//               className="w-full flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-indigo-500"
//             >
//               <div className="flex flex-col text-left">
//                 <span className="font-medium">{p.name}</span>
//                 <span className="text-xs text-slate-400">
//                   {p.position} {p.primaryTeam && `• ${p.primaryTeam}`}
//                 </span>
//               </div>
//             </button>
//           ))}
//           {searchResults.length === 0 && !searchLoading && (
//             <p className="text-xs text-slate-500">
//               No players yet. Try searching, or hook this up to your DB.
//             </p>
//           )}
//         </div>
//       </section>
//     </main>
//   );
// }
