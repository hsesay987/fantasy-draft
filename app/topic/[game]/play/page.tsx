"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button, TimerRing } from "../../../components/ui";
import { useAuth } from "../../../hooks/useAuth";
import { loadSetup, type Setup } from "../../../topicDraft/config";
import { getCatalog } from "../../../topicDraft/catalogs";
import { useDraft } from "../../../topicDraft/useDraft";
import { PoolGrid } from "../../../topicDraft/components/PoolGrid";
import { TeamPanel } from "../../../topicDraft/components/TeamPanel";
import { VerdictView } from "../../../topicDraft/components/VerdictView";
import { fetchVerdict, type Verdict } from "../../../topicDraft/judge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function PlayPage() {
  const router = useRouter();
  const { game } = useParams<{ game: string }>();
  const [setup, setSetup] = useState<Setup | null | undefined>(undefined);

  useEffect(() => {
    const s = loadSetup();
    setSetup(s && s.game === game ? s : null);
  }, [game]);

  useEffect(() => {
    if (setup === null) router.replace(`/topic/${game}`);
  }, [setup, router, game]);

  if (!setup) return null;
  return <Room setup={setup} game={game} onAgain={() => router.push(`/topic/${game}`)} />;
}

function Room({ setup, game, onAgain }: { setup: Setup; game: string; onAgain: () => void }) {
  const { token } = useAuth();
  const basePool = useMemo(() => getCatalog(game), [game]);
  const { state, pool, player, isAi, choose, auto, error, setError } = useDraft(setup, basePool);
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const roles = state.config.roles;
  const mine = player ? state.picks.filter((p) => p.player === player) : [];
  const freeRoles = roles.filter((r) => !mine.some((m) => m.role === r));
  const firstFree = freeRoles[0];

  useEffect(() => {
    setSelected(null);
    setRole(undefined);
  }, [state.turn]);

  useEffect(() => {
    if (roles.length && !role && firstFree) setRole(firstFree);
  }, [roles.length, role, firstFree]);

  useEffect(() => {
    if (!state.done) return;
    let live = true;
    fetchVerdict(API_URL, token ?? null, game, state, pool, setup.scenario).then((v) => live && setVerdict(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.done]);

  if (state.done) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <h1 className="text-3xl">{setup.scenario.title}</h1>
        <VerdictView verdict={verdict} loading={!verdict} onAgain={onAgain} />
      </main>
    );
  }

  const picked = state.picks.length;
  const total = state.config.players.length * state.config.teamSize;
  const item = selected ? pool.find((i) => i.id === selected) : null;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 pb-32 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/70 p-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {setup.scenario.title} · Pick {picked + 1}/{total}
            </p>
            <h1 className="text-2xl md:text-3xl">{isAi ? `${player} is picking…` : `${player}, you're up`}</h1>
          </div>
          {state.config.timerSeconds && !isAi && (
            <TimerRing seconds={state.config.timerSeconds} resetKey={state.turn} onExpire={auto} />
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}
        <PoolGrid
          state={state}
          selectedId={selected}
          disabled={isAi}
          onSelect={(id) => {
            setError(null);
            setSelected(id);
          }}
        />
      </section>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <TeamPanel state={state} pool={pool} activePlayer={player} />
      </aside>

      {item && !isAi && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-white/10 bg-background/90 p-3 backdrop-blur-xl md:bottom-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{item.name}</div>
              {roles.length > 0 && (
                <select
                  aria-label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 min-h-9 rounded-lg border border-white/10 bg-card px-2 text-sm"
                >
                  {freeRoles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              )}
            </div>
            <Button variant="accent" onClick={() => choose(item.id, role)}>
              <Check className="h-4 w-4" aria-hidden /> Draft {item.name.split(" ")[0]}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
