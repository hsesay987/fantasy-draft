// app/draft/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { IconBadge } from "../components/ui";

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


  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-12 text-foreground space-y-10">
      {/* PAGE TITLE */}
      <header className="space-y-1">
        <h1 className="text-4xl md:text-5xl">Stat Drafts</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Spin a team and era, then draft real players with career stats. Looking for characters, auctions or blind rankings?{" "}
          <a href="/" className="text-secondary underline underline-offset-2">Browse all topics</a>.
        </p>
      </header>

      {/* AVAILABLE DRAFT MODES */}
      <section className="space-y-4">
        <h2 className="text-2xl">Pick a league</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {([
            { id: "nba", title: "NBA Draft", icon: "/icons/basketball.png", premium: false, offline: () => router.push("/draft/new"), online: () => router.push("/online") },
            { id: "nfl", title: "NFL Draft", icon: "/icons/football.png", premium: true, offline: goToNfl, online: () => router.push("/online?league=NFL") },
            { id: "cartoons", title: "Cartoon Draft", icon: "/icons/turtle.png", premium: true, offline: goToCartoon, online: goToCartoonOnline },
          ] as const).map((cat) => {
            const locked = cat.premium && !isPremium;
            return (
              <div key={cat.id} className={`relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-card/70 p-5 ${locked ? "opacity-80" : ""}`}>
                <div className="flex items-center gap-4">
                  <IconBadge src={cat.icon} />
                  <div className="min-w-0">
                    <h3 className="text-xl">{cat.title}</h3>
                    <p className="text-sm text-muted-foreground">{locked ? "Premium beta" : cat.premium ? "Beta" : "Classic, Casual & Free modes"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={cat.offline} className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold hover:bg-white/10">Offline</button>
                  <button onClick={cat.online} className="min-h-11 rounded-xl bg-primary text-sm font-semibold hover:bg-[#8b5cf6]">Online</button>
                </div>
                {locked && <span className="absolute right-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-secondary">Premium</span>}
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
                className="text-xs text-muted-foreground underline hover:text-white"
              >
                {showAllMyDrafts ? "Show Less" : "View All"}
              </button>
            )}
            <button
              onClick={loadMyDrafts}
              className="text-xs text-muted-foreground underline hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-card/70 border border-white/10 p-4">
          {!user ? (
            <p className="text-sm text-muted-foreground">
              Log in to see your drafts.
            </p>
          ) : myDraftsLoading ? (
            <p className="text-sm text-muted-foreground">Loading your drafts...</p>
          ) : myDrafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafts yet.</p>
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
                      className="rounded-xl border border-white/10 bg-card px-4 py-3 text-left hover:border-secondary transition-all"
                    >
                      <div className="font-semibold text-sm text-foreground">
                        {d.title ||
                          (league === "NFL"
                            ? "NFL Draft"
                            : league === "CARTOON"
                            ? "Cartoon Draft"
                            : "NBA Draft")}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-between">
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
            className="text-xs text-muted-foreground underline hover:text-white"
          >
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {communityLoading ? (
            <p className="text-sm text-muted-foreground">Loading community drafts...</p>
          ) : communityDrafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No community vote drafts yet.
            </p>
          ) : (
            communityDrafts.map((d) => {
              const league = (d.league || "NBA").toUpperCase();
              return (
                <div
                  key={d.id}
                  className="rounded-2xl border border-white/10 bg-card/70 p-4 flex flex-col gap-3"
                >
                  <div>
                    <div className="text-sm uppercase tracking-[0.08em] text-secondary">
                      Community Vote
                    </div>
                    <div className="text-lg font-semibold text-foreground">
                      {d.title ||
                        (league === "NFL"
                          ? "NFL Draft"
                          : league === "CARTOON"
                          ? "Cartoon Draft"
                          : "NBA Draft")}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                      <span>League: {league}</span>
                      {d.createdAt && (
                        <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Vote on rosters drafted by the community.
                    </div>
                    <button
                      onClick={() => openCommunityDraft(d.id)}
                      disabled={loadingDraftId === d.id}
                      className="rounded-lg bg-primary hover:bg-[#8b5cf6] px-3 py-2 text-xs font-semibold disabled:opacity-60"
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
        <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-card p-5 shadow-2xl">
          <button
            onClick={closeModal}
            className="absolute right-3 top-3 text-muted-foreground hover:text-white"
          >
            ✕
          </button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.12em] text-secondary">
                Community Vote
              </div>
              <div className="text-xl font-semibold text-foreground">
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
              className="rounded-lg bg-primary hover:bg-[#8b5cf6] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {votedDraftIds.has(selectedDraft.id)
                ? "Vote submitted"
                : "Vote for this team"}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={prevTeam}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs hover:border-secondary"
            >
              ← Prev
            </button>
            <div className="text-sm text-muted-foreground">
              Team {activeTeamIndex + 1} of {Math.max(1, teamsForSelected.length)}
            </div>
            <button
              onClick={nextTeam}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs hover:border-secondary"
            >
              Next →
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-card/70 p-4">
            <div className="text-sm font-semibold text-foreground mb-2">
              {teamsForSelected[activeTeamIndex]?.name ||
                `Team ${activeTeamIndex + 1}`}
            </div>
            {(teamsForSelected[activeTeamIndex]?.picks || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No picks recorded.</p>
            ) : (
              <div className="space-y-2">
                {(teamsForSelected[activeTeamIndex]?.picks || []).map(
                  (pick: any) => (
                    <div
                      key={pick.id || pick.slot}
                      className="rounded-lg border border-white/10 bg-background/60 px-3 py-2"
                    >
                      <div className="text-sm text-foreground">
                        {formatPickLabel(pick, selectedDraft.league)}
                      </div>
                      {pick.position && (
                        <div className="text-[11px] text-muted-foreground">
                          Position: {pick.position}
                        </div>
                      )}
                      {typeof pick.slot === "number" && (
                        <div className="text-[11px] text-muted-foreground">
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
              className="rounded-lg bg-primary hover:bg-[#8b5cf6] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {votedDraftIds.has(selectedDraft.id)
                ? "Vote submitted"
                : "Vote for this team"}
            </button>
            <button
              onClick={() => router.push("/draft/new")}
              className="rounded-lg border border-secondary/70 px-4 py-2 text-sm text-secondary hover:border-secondary"
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
