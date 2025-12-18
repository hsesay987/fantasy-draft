// app/draft/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import nbaImg from "../assets/nba.jpg";
import nflImg from "../assets/nfl.jpg";
import foodImg from "../assets/food.jpg";
import animeImg from "../assets/anime.jpg";
import cartoonsImg from "../assets/cartoons.jpg";
import fifaImg from "../assets/fifa.jpg";
import { useAuth } from "../hooks/useAuth";

// Unified Draft Box Type
type DraftSummary = {
  id: string;
  title: string | null;
  mode: string;
  createdAt?: string;
  league?: string;
  rules?: DraftRules;
  participants?: number;
  playersPerTeam?: number;
};

type DraftCategory = {
  id: string;
  name: string;
  image: StaticImageData;
  enabled: boolean;
  beta?: boolean;
  requirePremium?: boolean;
  onClick?: () => void;
};

type DraftRules = {
  participants?: number;
  playersPerTeam?: number;
  seatDisplayNames?: string[];
  communityVoteEnabled?: boolean;
  cartoonScoring?: string;
  scoringMethod?: string;
};

type DraftWithVotes = DraftSummary & { rules?: DraftRules };

type DraftDetail = DraftWithVotes & {
  picks?: any[];
};

export default function HomePage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const { user, token } = useAuth();

  const [communityDrafts, setCommunityDrafts] = useState<DraftWithVotes[]>([]);
  const [myDrafts, setMyDrafts] = useState<DraftSummary[]>([]);
  const [showAllMyDrafts, setShowAllMyDrafts] = useState(false);
  const [myDraftsLoading, setMyDraftsLoading] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<DraftDetail | null>(null);
  const [activeTeamIndex, setActiveTeamIndex] = useState(0);
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [votedDraftIds, setVotedDraftIds] = useState<Set<string>>(new Set());

  const isPremium =
    !!user?.isAdmin ||
    !!user?.isFounder ||
    (!!user?.subscriptionTier &&
      (!user.subscriptionEnds ||
        new Date(user.subscriptionEnds).getTime() > Date.now()));

  const loadMyDrafts = useCallback(async () => {
    if (!user || !token) {
      setMyDrafts([]);
      return;
    }
    try {
      setMyDraftsLoading(true);
      const res = await fetch(`${API_URL}/drafts/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        setMyDrafts([]);
        return;
      }
      const data = await res.json();
      setMyDrafts(data);
    } catch (err) {
      console.error("Failed to load my drafts", err);
      setMyDrafts([]);
    } finally {
      setMyDraftsLoading(false);
    }
  }, [API_URL, token, user]);

  const loadCommunityDrafts = useCallback(async () => {
    try {
      setCommunityLoading(true);
      const res = await fetch(`${API_URL}/drafts`);
      if (!res.ok) return;
      const data: DraftWithVotes[] = await res.json();
      const filtered = (data || []).filter((d) => {
        const rules: DraftRules = (d.rules as any) || {};
        return (
          rules?.communityVoteEnabled ||
          rules?.cartoonScoring === "community" ||
          rules?.scoringMethod === "community" ||
          d.mode === "community"
        );
      });
      setCommunityDrafts(filtered);
    } catch (err) {
      console.error("Failed to load community drafts", err);
    } finally {
      setCommunityLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadMyDrafts();
  }, [loadMyDrafts]);

  useEffect(() => {
    loadCommunityDrafts();
  }, [loadCommunityDrafts]);

  const goToNfl = () => {
    if (!isPremium) {
      router.push("/account/subscription");
      return;
    }
    router.push("/draft/new?league=NFL");
  };

  const goToCartoon = () => {
    if (!isPremium) {
      router.push("/account/subscription");
      return;
    }
    router.push("/draft/new?league=CARTOON");
  };

  const goToCartoonOnline = () => {
    if (!isPremium) {
      router.push("/account/subscription");
      return;
    }
    router.push("/online?league=CARTOON");
  };

  const openCommunityDraft = async (draftId: string) => {
    try {
      setLoadingDraftId(draftId);
      const res = await fetch(`${API_URL}/drafts/${draftId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedDraft(data);
      setActiveTeamIndex(0);
    } catch (err) {
      console.error("Failed to load draft details", err);
    } finally {
      setLoadingDraftId(null);
    }
  };

  const closeModal = () => {
    setSelectedDraft(null);
    setActiveTeamIndex(0);
  };

  const teamsForSelected = useMemo(() => {
    if (!selectedDraft) return [];
    const rules: DraftRules = (selectedDraft.rules as any) || {};
    const participants =
      rules?.participants || selectedDraft.participants || 1;
    const seatNames = rules?.seatDisplayNames || [];
    const teams = Array.from({ length: Math.max(1, participants) }, (_, i) => ({
      name: seatNames[i] || `Team ${i + 1}`,
      picks: [] as any[],
    }));

    (selectedDraft.picks || []).forEach((pick: any) => {
      const idx = (pick.ownerIndex || 1) - 1;
      if (teams[idx]) {
        teams[idx].picks.push(pick);
      }
    });

    return teams;
  }, [selectedDraft]);

  const nextTeam = () => {
    if (!teamsForSelected.length) return;
    setActiveTeamIndex((prev) =>
      (prev + 1) % Math.max(1, teamsForSelected.length)
    );
  };

  const prevTeam = () => {
    if (!teamsForSelected.length) return;
    setActiveTeamIndex((prev) =>
      (prev - 1 + teamsForSelected.length) % Math.max(1, teamsForSelected.length)
    );
  };

  const formatPickLabel = (pick: any, league?: string) => {
    const lg = (league || "NBA").toUpperCase();
    if (lg === "NFL") {
      return `${pick.player?.name || "Player"}${
        pick.position ? ` • ${pick.position}` : ""
      }`;
    }
    if (lg === "CARTOON") {
      const characterName = pick.character?.name;
      const showName = pick.character?.show?.name || pick.show?.name;
      return (
        characterName ||
        showName ||
        `Pick ${typeof pick.slot === "number" ? `#${pick.slot}` : ""}`
      );
    }
    return `${pick.player?.name || "Player"}${
      pick.position ? ` • ${pick.position}` : ""
    }`;
  };

  const handleVoteForTeam = async () => {
    if (!selectedDraft) return;
    if (!user || !token) {
      router.push("/account");
      return;
    }
    if (votedDraftIds.has(selectedDraft.id)) return;

    const voteValue = activeTeamIndex + 1;
    try {
      await fetch(`${API_URL}/drafts/${selectedDraft.id}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value: voteValue }),
      });
      setVotedDraftIds((prev) => {
        const next = new Set(prev);
        next.add(selectedDraft.id);
        return next;
      });
    } catch (err) {
      console.error("Failed to submit vote", err);
    }
  };

  const draftCategories: DraftCategory[] = [
    {
      id: "nba",
      name: "NBA Draft",
      image: nbaImg,
      enabled: true,
      onClick: () => router.push("/draft/new"),
    },
    {
      id: "nfl",
      name: "NFL Draft (Beta)",
      image: nflImg,
      enabled: true,
      beta: true,
      requirePremium: true,
      onClick: goToNfl,
    },
    {
      id: "cartoons",
      name: "Cartoon Draft (Beta)",
      image: cartoonsImg,
      enabled: true,
      beta: true,
      requirePremium: true,
      onClick: goToCartoon,
    },
    {
      id: "food",
      name: "Food Draft",
      image: foodImg,
      enabled: false,
    },
    {
      id: "anime",
      name: "Anime Characters Draft",
      image: animeImg,
      enabled: false,
    },
    {
      id: "epl",
      name: "EPL / FIFA Draft",
      image: fifaImg,
      enabled: false,
    },
  ];

  return (
    <>
      <main className="min-h-screen p-6 md:p-10 bg-slate-950 text-slate-50 space-y-10">
      {/* PAGE TITLE */}
      <header>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-indigo-300 mb-2">
          DraftHub
        </h1>
        <p className="text-slate-400 text-sm md:text-base">
          Create fantasy lineups across sports, games, food, and more.
        </p>
      </header>

      {/* AVAILABLE DRAFT MODES */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Available Drafts</h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {draftCategories.map((cat) => {
            const isNba = cat.id === "nba";
            const isNfl = cat.id === "nfl";
            const locked = !cat.enabled || (cat.requirePremium && !isPremium);
            return (
              <div
                key={cat.id}
                role={!locked ? "button" : undefined}
                onClick={() => !locked && cat.onClick?.()}
                className={`group relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/30 backdrop-blur-sm transition-all ${
                  !locked
                    ? "hover:border-indigo-500 hover:shadow-indigo-500/30 cursor-pointer"
                    : "opacity-60 cursor-not-allowed"
                }`}
              >
                {/* Image */}
                <div className="relative h-40 w-full overflow-hidden">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className={`object-cover transition-all duration-300 group-hover:scale-105 ${
                      !cat.enabled ? "grayscale" : ""
                    }`}
                  />
                </div>

                {/* Title */}
                <div className="p-4 text-left">
                  <div className="text-xl font-semibold mb-1 text-slate-100">
                    {cat.name}
                  </div>
                  {!locked ? (
                    <p className="text-sm text-indigo-400 font-medium">
                      ✦ {cat.beta ? "Launch Beta" : "Start Draft"}
                    </p>
                  ) : cat.requirePremium ? (
                    <p className="text-sm text-orange-300">
                      Premium members only
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">Coming Soon</p>
                  )}

                  {cat.enabled && isNba && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/draft/new");
                        }}
                        className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs py-2"
                      >
                        Offline Draft
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/online");
                        }}
                        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs py-2"
                      >
                        Online Draft
                      </button>
                    </div>
                  )}
                  {cat.enabled && cat.id === "cartoons" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          goToCartoon();
                        }}
                        className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs py-2"
                      >
                        Offline Draft
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          goToCartoonOnline();
                        }}
                        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs py-2"
                      >
                        Online Draft
                      </button>
                    </div>
                  )}
                  {cat.enabled && isNfl && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          goToNfl();
                        }}
                        className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs py-2"
                      >
                        Offline Draft
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/online?league=NFL");
                        }}
                        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs py-2"
                      >
                        Online Draft
                      </button>
                    </div>
                  )}

                  {cat.beta && (
                    <div className="mt-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-amber-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      Beta
                    </div>
                  )}
                </div>

                {/* Coming Soon overlay */}
                {locked && (
                  <div className="absolute inset-0 bg-slate-950/50 flex items-end justify-end p-3 pointer-events-none">
                    <span className="text-[10px] uppercase tracking-wide bg-slate-700/60 text-slate-300 px-2 py-[2px] rounded">
                      {cat.requirePremium ? "Premium Beta" : "Coming Soon"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* MY RECENT DRAFTS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">My Recent Drafts</h3>
          <div className="flex items-center gap-3">
            {myDrafts.length > 5 && (
              <button
                onClick={() => setShowAllMyDrafts((prev) => !prev)}
                className="text-xs text-slate-300 underline hover:text-white"
              >
                {showAllMyDrafts ? "Show Less" : "View All"}
              </button>
            )}
            <button
              onClick={loadMyDrafts}
              className="text-xs text-slate-300 underline hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/60 border border-slate-700 p-4">
          {!user ? (
            <p className="text-sm text-slate-500">
              Log in to see your drafts.
            </p>
          ) : myDraftsLoading ? (
            <p className="text-sm text-slate-400">Loading your drafts...</p>
          ) : myDrafts.length === 0 ? (
            <p className="text-sm text-slate-500">No drafts yet.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {(showAllMyDrafts ? myDrafts : myDrafts.slice(0, 5)).map(
                (d) => {
                  const league = (d.league || "NBA").toUpperCase();
                  const leaguePath =
                    league === "NFL"
                      ? "nfl"
                      : league === "CARTOON"
                      ? "cartoon"
                      : "nba";
                  return (
                    <button
                      key={d.id}
                      onClick={() => router.push(`/draft/${leaguePath}/${d.id}`)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left hover:border-indigo-500 transition-all"
                    >
                      <div className="font-semibold text-sm text-slate-100">
                        {d.title ||
                          (league === "NFL"
                            ? "NFL Draft"
                            : league === "CARTOON"
                            ? "Cartoon Draft"
                            : "NBA Draft")}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>Mode: {d.mode}</span>
                        {d.createdAt && (
                          <span>
                            {new Date(d.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </div>
      </section>

      {/* COMMUNITY DRAFTS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Community Drafts</h3>
          <button
            onClick={loadCommunityDrafts}
            className="text-xs text-slate-300 underline hover:text-white"
          >
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {communityLoading ? (
            <p className="text-sm text-slate-400">Loading community drafts...</p>
          ) : communityDrafts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No community vote drafts yet.
            </p>
          ) : (
            communityDrafts.map((d) => {
              const league = (d.league || "NBA").toUpperCase();
              return (
                <div
                  key={d.id}
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 flex flex-col gap-3"
                >
                  <div>
                    <div className="text-sm uppercase tracking-[0.08em] text-indigo-300">
                      Community Vote
                    </div>
                    <div className="text-lg font-semibold text-slate-50">
                      {d.title ||
                        (league === "NFL"
                          ? "NFL Draft"
                          : league === "CARTOON"
                          ? "Cartoon Draft"
                          : "NBA Draft")}
                    </div>
                    <div className="text-xs text-slate-400 flex gap-3 mt-1">
                      <span>League: {league}</span>
                      {d.createdAt && (
                        <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-400">
                      Vote on rosters drafted by the community.
                    </div>
                    <button
                      onClick={() => openCommunityDraft(d.id)}
                      disabled={loadingDraftId === d.id}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-semibold disabled:opacity-60"
                    >
                      {loadingDraftId === d.id ? "Opening..." : "Vote on Draft"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>

    {selectedDraft && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
        <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
          <button
            onClick={closeModal}
            className="absolute right-3 top-3 text-slate-400 hover:text-white"
          >
            ✕
          </button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-indigo-300">
                Community Vote
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {selectedDraft.title ||
                  ((selectedDraft.league || "NBA").toUpperCase() === "NFL"
                    ? "NFL Draft"
                    : (selectedDraft.league || "NBA").toUpperCase() === "CARTOON"
                    ? "Cartoon Draft"
                    : "NBA Draft")}
              </div>
            </div>
            <button
              onClick={handleVoteForTeam}
              disabled={votedDraftIds.has(selectedDraft.id)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {votedDraftIds.has(selectedDraft.id)
                ? "Vote submitted"
                : "Vote for this team"}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={prevTeam}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs hover:border-indigo-500"
            >
              ← Prev
            </button>
            <div className="text-sm text-slate-300">
              Team {activeTeamIndex + 1} of {Math.max(1, teamsForSelected.length)}
            </div>
            <button
              onClick={nextTeam}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs hover:border-indigo-500"
            >
              Next →
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold text-slate-100 mb-2">
              {teamsForSelected[activeTeamIndex]?.name ||
                `Team ${activeTeamIndex + 1}`}
            </div>
            {(teamsForSelected[activeTeamIndex]?.picks || []).length === 0 ? (
              <p className="text-sm text-slate-500">No picks recorded.</p>
            ) : (
              <div className="space-y-2">
                {(teamsForSelected[activeTeamIndex]?.picks || []).map(
                  (pick: any) => (
                    <div
                      key={pick.id || pick.slot}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="text-sm text-slate-100">
                        {formatPickLabel(pick, selectedDraft.league)}
                      </div>
                      {pick.position && (
                        <div className="text-[11px] text-slate-400">
                          Position: {pick.position}
                        </div>
                      )}
                      {typeof pick.slot === "number" && (
                        <div className="text-[11px] text-slate-500">
                          Pick #{pick.slot}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={handleVoteForTeam}
              disabled={votedDraftIds.has(selectedDraft.id)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {votedDraftIds.has(selectedDraft.id)
                ? "Vote submitted"
                : "Vote for this team"}
            </button>
            <button
              onClick={() => router.push("/draft/new")}
              className="rounded-lg border border-indigo-500/70 px-4 py-2 text-sm text-indigo-200 hover:border-indigo-400"
            >
              Vote for next draft
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
