// app/toppic/room/[code]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crown,
  Flag,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Vote,
} from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import {
  TopPicPool,
  TopPicPromptCard,
  TopPicResponseCard,
  seededShuffle,
} from "@/app/fitTopPic/cards";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ScoringMode = "cpu" | "vote" | "judge";

type Participant = {
  user: { id: string; name?: string | null; email: string };
  isHost: boolean;
};

type Room = {
  code: string;
  hostId: string;
  league?: string;
  settings?: any;
  participants: Participant[];
};

type Submission = {
  userId: string;
  cardId: string;
  cardText: string;
  submittedAt: string;
};

type ToppicState = {
  status: "lobby" | "active" | "ended";
  pools: TopPicPool[];
  allowAdult: boolean;
  scoringMode: ScoringMode;
  targetScore: number | null;
  unlimited: boolean;
  round: number;
  promptDeck: TopPicPromptCard[];
  promptIndex: number;
  responseQueue: TopPicResponseCard[];
  hands: Record<string, TopPicResponseCard[]>;
  submissions: Record<string, Submission>;
  scores: Record<string, number>;
  judgeRotation: string[];
  currentJudge?: string | null;
  moderation: {
    requireApproval: boolean;
    approvedPromptIds: string[];
    flaggedPromptIds?: string[];
  };
  communityReview?: boolean;
  history?: { promptId: string; winnerUserId?: string | null; winningCardId?: string | null }[];
};

export default function TopPicRoomPage() {
  const { code } = useParams<{ code: string }>();
  const { user, token } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [toppicState, setToppicState] = useState<ToppicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const isHost = room?.hostId === user?.id;
  const participants = room?.participants || [];

  const baseConfig = useMemo(() => {
    const cfg = (room?.settings as any)?.toppicConfig || {};
    return {
      pools: (cfg.pools as TopPicPool[]) || ["NBA", "MULTI"],
      scoringMode: (cfg.scoringMode as ScoringMode) || "cpu",
      targetScore:
        typeof cfg.targetScore === "number" && cfg.targetScore > 0
          ? cfg.targetScore
          : null,
      allowAdult: !!cfg.allowAdult,
      requireModeration: cfg.requireModeration !== false,
      communityReview: cfg.communityReview !== false,
    };
  }, [room?.settings]);

  useEffect(() => {
    fetchRoom();
    // poll for updates while active
    const id = setInterval(fetchRoom, 4500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, code]);

  async function fetchRoom() {
    if (!token || !code) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load room");
      const data = await res.json();
      setRoom(data);
      const state = (data.settings as any)?.toppicState || null;
      if (state) setToppicState(state);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function topUpHands(
    state: ToppicState,
    available: TopPicResponseCard[],
    activeParticipants: Participant[]
  ) {
    const nextHands: Record<string, TopPicResponseCard[]> = { ...(state.hands || {}) };
    let queue = [...available];
    activeParticipants.forEach((p) => {
      const current = Array.isArray(nextHands[p.user.id]) ? [...nextHands[p.user.id]] : [];
      while (current.length < 7 && queue.length) {
        current.push(queue.shift() as TopPicResponseCard);
      }
      nextHands[p.user.id] = current;
    });
    return { nextHands, remainingQueue: queue };
  }

  async function initializeGame() {
    if (!room || !isHost || !token) return;
    setSaving(true);
    try {
      const pools = baseConfig.pools;
      const setupRes = await fetch(`${API_URL}/toppic/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pools,
          allowAdult: baseConfig.allowAdult,
          take: 500,
          seed: room.code,
        }),
      });

      if (!setupRes.ok) {
        const e = await setupRes.json().catch(() => ({}));
        throw new Error(e.error || "Failed to build TopPic deck");
      }

      const payload = await setupRes.json();
      const promptDeck: TopPicPromptCard[] = Array.isArray(payload.promptDeck)
        ? payload.promptDeck
        : [];
      const responseCards: TopPicResponseCard[] = Array.isArray(
        payload.responseCards
      )
        ? payload.responseCards
        : [];

      if (!promptDeck.length) {
        throw new Error("No prompts returned for TopPic.");
      }

      const participantsList = room.participants;
      const shuffledResponses = seededShuffle(
        responseCards,
        `${room.code}-responses`
      );

      const seededResponses =
        shuffledResponses.length > 0
          ? shuffledResponses
          : [
              {
                id: "fallback-hero",
                text: "Wildcard Hero",
                pool: "MULTI",
                source: "System",
              },
              {
                id: "fallback-villain",
                text: "Chaos Villain",
                pool: "MULTI",
                source: "System",
              },
            ];

      let responseQueue = [...seededResponses];
      const hands: Record<string, TopPicResponseCard[]> = {};
      participantsList.forEach((p) => {
        hands[p.user.id] = responseQueue.splice(0, 7);
      });

      const rotation = seededShuffle(
        participantsList.map((p) => p.user.id),
        `${room.code}-judge`
      );

      const initial: ToppicState = {
        status: "active",
        pools,
        allowAdult: baseConfig.allowAdult,
        scoringMode: baseConfig.scoringMode,
        targetScore: baseConfig.targetScore,
        unlimited: !baseConfig.targetScore,
        round: 1,
        promptDeck,
        promptIndex: 0,
        responseQueue,
        hands,
        submissions: {},
        scores: participantsList.reduce(
          (acc, p) => ({ ...acc, [p.user.id]: 0 }),
          {}
        ),
        judgeRotation: rotation,
        currentJudge: baseConfig.scoringMode === "judge" ? rotation[0] : null,
        moderation: {
          requireApproval: baseConfig.requireModeration,
          approvedPromptIds: baseConfig.requireModeration && promptDeck[0]
            ? []
            : promptDeck[0]
            ? [promptDeck[0].id]
            : [],
          flaggedPromptIds: [],
        },
        communityReview: baseConfig.communityReview,
        history: [],
      };

      const res = await fetch(`${API_URL}/rooms/${room.code}/toppic/state`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toppicState: initial }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to start game");
      }
      const updatedState = await res.json();
      setToppicState(updatedState);
    } catch (err: any) {
      setError(err.message || "Failed to start TopPic");
    } finally {
      setSaving(false);
    }
  }

  async function saveState(next: ToppicState) {
    if (!room || !isHost || !token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${room.code}/toppic/state`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toppicState: next }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to save state");
      }
      const updated = await res.json();
      setToppicState(updated);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitCard(card: TopPicResponseCard) {
    if (!token || !room || !toppicState || !user) return;
    if (toppicState.submissions?.[user.id]) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${room.code}/toppic/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cardId: card.id, cardText: card.text }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Failed to submit");
      }
      const updated = await res.json();
      setToppicState(updated);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function autoPickWinner() {
    if (!toppicState || !isHost) return;
    const entries = Object.keys(toppicState.submissions || {});
    if (!entries.length) return;
    const shuffled = seededShuffle(entries, `${code}-round-${toppicState.round}`);
    pickWinner(shuffled[0]);
  }

  function pickWinner(userId: string) {
    if (!toppicState || !room || !isHost) return;
    const scores = { ...(toppicState.scores || {}) };
    scores[userId] = (scores[userId] || 0) + 1;

    const history = [
      ...(toppicState.history || []),
      {
        promptId: toppicState.promptDeck?.[toppicState.promptIndex]?.id || "",
        winnerUserId: userId,
        winningCardId: toppicState.submissions?.[userId]?.cardId || null,
      },
    ];

    let status: ToppicState["status"] = toppicState.status;
    if (
      toppicState.targetScore &&
      scores[userId] >= toppicState.targetScore &&
      !toppicState.unlimited
    ) {
      status = "ended";
    }

    const nextPromptIndex = Math.min(
      toppicState.promptIndex + 1,
      toppicState.promptDeck.length - 1
    );

    if (nextPromptIndex >= toppicState.promptDeck.length - 1) {
      status = "ended";
    }

    const approvals = toppicState.moderation?.approvedPromptIds || [];
    const nextPrompt = toppicState.promptDeck[nextPromptIndex];
    const nextApprovals = toppicState.moderation?.requireApproval
      ? approvals.filter((id) => id === nextPrompt?.id)
      : approvals;

    const { nextHands, remainingQueue } = topUpHands(
      toppicState,
      toppicState.responseQueue || [],
      participants
    );

    const rotation = toppicState.judgeRotation || [];
    const nextJudge =
      toppicState.scoringMode === "judge" && rotation.length
        ? rotation[(rotation.indexOf(toppicState.currentJudge || "") + 1) % rotation.length]
        : toppicState.currentJudge || null;

    const nextState: ToppicState = {
      ...toppicState,
      scores,
      history,
      status,
      promptIndex: nextPromptIndex,
      round: toppicState.round + 1,
      submissions: {},
      hands: nextHands,
      responseQueue: remainingQueue,
      currentJudge: nextJudge,
      moderation: {
        requireApproval: toppicState.moderation?.requireApproval || false,
        approvedPromptIds: nextApprovals,
        flaggedPromptIds: toppicState.moderation?.flaggedPromptIds || [],
      },
    };

    saveState(nextState);
  }

  function approvePrompt() {
    if (!toppicState || !isHost) return;
    const current = toppicState.promptDeck?.[toppicState.promptIndex];
    if (!current) return;
    const approved = new Set(toppicState.moderation?.approvedPromptIds || []);
    approved.add(current.id);
    saveState({
      ...toppicState,
      moderation: {
        requireApproval: toppicState.moderation?.requireApproval || false,
        approvedPromptIds: Array.from(approved),
        flaggedPromptIds: toppicState.moderation?.flaggedPromptIds || [],
      },
    });
  }

  function skipPrompt() {
    if (!toppicState || !isHost) return;
    const nextPromptIndex = Math.min(
      toppicState.promptIndex + 1,
      toppicState.promptDeck.length - 1
    );
    saveState({ ...toppicState, promptIndex: nextPromptIndex, submissions: {} });
  }

  async function reportCard(reason: string) {
    if (!toppicState) return;
    const prompt = toppicState.promptDeck?.[toppicState.promptIndex];
    if (!prompt) return;

    setReporting(true);
    try {
      const res = await fetch(`${API_URL}/toppic/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          promptId: prompt.id,
          promptText: prompt.text,
          pool: prompt.pool,
          rating: prompt.rating,
          roomCode: code,
          reason,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to report card");
      }
      if (toppicState.communityReview) {
        const flagged = new Set(toppicState.moderation?.flaggedPromptIds || []);
        flagged.add(prompt.id);
        saveState({
          ...toppicState,
          moderation: {
            requireApproval: toppicState.moderation?.requireApproval || false,
            approvedPromptIds: toppicState.moderation?.approvedPromptIds || [],
            flaggedPromptIds: Array.from(flagged),
          },
        });
      }
    } catch (err) {
      console.error("Failed to report card", err);
      setError(
        err instanceof Error ? err.message : "Could not send card report."
      );
    } finally {
      setReporting(false);
    }
  }

  const currentPrompt =
    toppicState?.promptDeck?.[toppicState.promptIndex] || null;
  const needsApproval =
    !!toppicState?.moderation?.requireApproval &&
    !!currentPrompt &&
    !(toppicState?.moderation?.approvedPromptIds || []).includes(currentPrompt.id);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        Loading…
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <div className="rounded-xl border border-red-500/50 bg-red-900/20 p-4">
          Room not found.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10 space-y-6">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-indigo-300">
            TopPic Online
          </div>
          <h1 className="text-3xl font-bold">
            Room {room.code}
          </h1>
          <p className="text-sm text-slate-400">
            {participants.length} players (max 20) · Pools: {(baseConfig.pools || []).join(", ")}
          </p>
        </div>
        <div className="flex gap-2">
          {isHost && !toppicState && (
            <button
              onClick={initializeGame}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold"
            >
              <Play className="w-4 h-4" />
              Start TopPic
            </button>
          )}
          {isHost && toppicState && toppicState.status !== "ended" && (
            <button
              onClick={() => saveState({ ...toppicState, status: "ended" })}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-red-400"
            >
              <AlertTriangle className="w-4 h-4 text-amber-300" />
              End game
            </button>
          )}
          <button
            onClick={fetchRoom}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </header>

      {error && (
      <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-100">
        ⚠ {error}
      </div>
    )}

      {!toppicState && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
          Waiting for the host to start TopPic. Once the host launches the game, you&apos;ll see your 7-card hand and the first prompt here.
        </div>
      )}

      {toppicState && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-300" />
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-indigo-200">
                      Round {toppicState.round}
                    </div>
                    <div className="text-lg font-semibold">Prompt</div>
                  </div>
                </div>
                {isHost && needsApproval && (
                  <div className="flex gap-2">
                    <button
                      onClick={approvePrompt}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Approve prompt
                    </button>
                    <button
                      onClick={skipPrompt}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-lg leading-relaxed">
                {currentPrompt ? currentPrompt.text : "No prompt available."}
              </div>

              <div className="flex items-center gap-3 text-sm text-slate-400">
                <button
                  onClick={() => reportCard("Prompt report from room")}
                  disabled={reporting}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-indigo-400"
                >
                  <Flag className="w-4 h-4" />
                  Report this card
                </button>
                {toppicState.communityReview && (
                  <span className="inline-flex items-center gap-2 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4" />
                    Community review on; flagged prompts are hidden until approved.
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Vote className="w-4 h-4 text-indigo-300" />
                  Submissions
                </h3>
                {isHost && (
                  <div className="flex gap-2">
                    <button
                      onClick={autoPickWinner}
                      disabled={!Object.keys(toppicState.submissions || {}).length}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-indigo-400 disabled:opacity-50"
                    >
                      <Crown className="w-4 h-4" />
                      CPU pick
                    </button>
                  </div>
                )}
              </div>

              {needsApproval && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  Waiting for host approval before players can submit.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(toppicState.submissions || {}).map(
                  ([userId, submission]) => {
                    const name =
                      participants.find((p) => p.user.id === userId)?.user.name ||
                      participants.find((p) => p.user.id === userId)?.user.email ||
                      "Player";
                    return (
                      <div
                        key={userId}
                        className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-2"
                      >
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          {name}
                        </div>
                        <div className="text-base font-semibold">
                          {submission.cardText}
                        </div>
                        {isHost && toppicState.status !== "ended" && (
                          <button
                            onClick={() => pickWinner(userId)}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1 text-xs font-semibold"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Pick winner
                          </button>
                        )}
                      </div>
                    );
                  }
                )}
                {!Object.keys(toppicState.submissions || {}).length && (
                  <div className="text-sm text-slate-400">
                    Waiting for submissions…
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-indigo-300" />
                  Scoreboard
                </h3>
                <div className="text-right text-xs text-slate-400">
                  <div>
                    {toppicState.targetScore
                      ? `First to ${toppicState.targetScore}`
                      : "Unlimited"}
                  </div>
                  <div>
                    Scoring:{" "}
                    {toppicState.scoringMode === "cpu"
                      ? "CPU decides"
                      : toppicState.scoringMode === "vote"
                      ? "Players vote, host confirms"
                      : "Rotating judge"}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {participants.map((p) => (
                  <div
                    key={p.user.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {p.user.name || p.user.email}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.isHost ? "Host" : "Player"}
                      </div>
                    </div>
                    <div className="text-xl font-bold text-indigo-300">
                      {toppicState.scores?.[p.user.id] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="w-4 h-4 text-indigo-300" />
                Your hand
              </div>
              {user ? (
                <div className="space-y-2">
                  {(toppicState.hands?.[user.id] || []).length ? (
                    <div className="space-y-2">
                      {(toppicState.hands?.[user.id] || []).map((card) => {
                        const already = toppicState.submissions?.[user.id];
                        return (
                          <button
                            key={card.id}
                            disabled={
                              !!already ||
                              needsApproval ||
                              toppicState.status === "ended"
                            }
                            onClick={() => submitCard(card)}
                            className="w-full text-left rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 hover:border-indigo-400 disabled:opacity-60"
                          >
                            <div className="text-sm font-semibold">{card.text}</div>
                            <div className="text-xs text-slate-500 flex justify-between">
                              <span>{card.pool}</span>
                              <span>{card.source}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">
                      Waiting for the host to start or deal cards.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  Log in to play.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                Safeguards
              </div>
              <p>Adult toggle: {toppicState.allowAdult ? "18+ enabled" : "Family-safe only"}</p>
              <p>Moderation: {toppicState.moderation?.requireApproval ? "Host approval required" : "Auto-approved prompts"}</p>
              <p>Review tools: Report button + optional community review lane.</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
