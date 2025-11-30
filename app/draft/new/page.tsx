"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewDraftPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [randomEra, setRandomEra] = useState(true);
  const [eraFrom, setEraFrom] = useState<number | "">("");
  const [eraTo, setEraTo] = useState<number | "">("");
  const [randomTeam, setRandomTeam] = useState(true);
  const [teamConstraint, setTeamConstraint] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [requirePositions, setRequirePositions] = useState(true);
  const [scoringMethod, setScoringMethod] = useState<
    "system" | "user" | "public"
  >("system");

  const [maxPpgCap, setMaxPpgCap] = useState<number | "">("");
  const [overallCap, setOverallCap] = useState<number | "">("");
  const [hallRule, setHallRule] = useState<"any" | "only" | "none">("any");

  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const rules = {
        maxPpgCap: maxPpgCap || null,
        overallCap: overallCap || null,
        hallRule,
        // future: multi-team, played-with, etc
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league: "NBA",
          mode: "standard",
          title: title || null,
          randomEra,
          eraFrom: !randomEra && eraFrom !== "" ? Number(eraFrom) : undefined,
          eraTo: !randomEra && eraTo !== "" ? Number(eraTo) : undefined,
          randomTeam,
          teamConstraint:
            !randomTeam && teamConstraint ? teamConstraint : undefined,
          maxPlayers,
          requirePositions,
          scoringMethod,
          rules,
        }),
      });

      if (!res.ok) {
        console.error(await res.json());
        alert("Failed to create draft");
        return;
      }

      const draft = await res.json();
      router.push(`/draft/${draft.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <h2 className="text-xl font-semibold">New NBA Draft</h2>

      <div className="grid gap-4 md:grid-cols-2">
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
              Max players in lineup
              <input
                type="number"
                min={5}
                max={12}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requirePositions}
                onChange={(e) => setRequirePositions(e.target.checked)}
              />
              Enforce PG / SG / SF / PF / C
            </label>

            <label className="block text-sm">
              Scoring method
              <select
                value={scoringMethod}
                onChange={(e) => setScoringMethod(e.target.value as any)}
                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              >
                <option value="system">System scoring</option>
                <option value="user">User decides winner</option>
                <option value="public">Public voting</option>
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-3 bg-slate-800 rounded-lg p-4">
          <h3 className="font-semibold">Era & Team</h3>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={randomEra}
              onChange={(e) => setRandomEra(e.target.checked)}
            />
            Random decade
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
            />
            Random team
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

        <div className="space-y-3 bg-slate-800 rounded-lg p-4">
          <h3 className="font-semibold">Rule Tweaks</h3>
          <p className="text-xs text-slate-300">
            These are your fun caps / constraints. We’ll enforce them
            server-side later.
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
            Overall rating cap (0–100, optional)
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
              <option value="only">Only Hall of Famers</option>
              <option value="none">No Hall of Famers</option>
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
