"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Crown, ExternalLink, LogOut, Play, RefreshCw, Shuffle, Trophy, Users } from "lucide-react";
import { Button, Card, GameTile, PageHeader, PageShell, Panel, controlCls } from "../../components/ui";
import { GameBody } from "../../play/GameScreen";
import SetupScreen from "../../play/SetupScreen";
import { FORMATS, formatMeta } from "../../play/formats";
import { category } from "../../play/categories";
import { clearToken, joinRoom, leaveRoom, loadToken, roomToLobby, saveToken, setStatLink, startRoom, type RoomSnapshot } from "../../play/onlineApi";
import { useRemoteCtl, useRemoteRoom } from "../../play/useRemoteGame";
import { loadPrefs, savePrefs } from "../../play/storage";
import { useAuth } from "../../hooks/useAuth";
import { openStatRoom, STAT_LEAGUES, statRoomHref, type League } from "../../lib/statRooms";
import { track } from "../../lib/analytics";
import type { FormatId, GameSetup } from "../../play/types";

/**
 * One room for a whole evening: friends join once, the host picks a game, everyone plays, and when it ends the
 * room goes back to the lobby so the host can pick the next game. Nobody has to rejoin between games.
 */
export default function RoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = raw.toUpperCase();
  const router = useRouter();
  const { snap, missing, offset, refresh, dispatchRemote, setToken } = useRemoteRoom(code);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(loadPrefs().name ?? ""), []);

  if (missing) {
    return (
      <PageShell width="sm" className="text-center">
        <h1 className="text-3xl">Room not found</h1>
        <p className="text-muted-foreground">Check the code. Rooms close when everyone has left.</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold">Back home</Link>
      </PageShell>
    );
  }
  if (!snap) return <PageShell width="sm" className="text-center"><p className="text-muted-foreground">Connecting…</p></PageShell>;

  // Not seated yet: pick a name to join.
  if (!snap.me) {
    const join = async () => {
      setBusy(true);
      setError(null);
      const r = await joinRoom(code, name);
      setBusy(false);
      if (!r.ok) return setError(r.data.error ?? "Couldn't join");
      saveToken(code, r.data.token);
      track("room_joined", { format: snap.setup?.format ?? "none", pool: snap.setup?.pool ?? "none" });
      setToken(r.data.token);
      savePrefs({ name });
      await refresh();
    };
    return (
      <PageShell width="sm">
        <PageHeader title={`Join room ${code}`} subtitle={`${snap.seats.length} here: ${snap.seats.map((s) => s.name).join(", ")}`} icon={Users} back={{ href: "/", label: "Home" }} />
        <Panel title="Pick a name" hint={snap.status === "playing" ? "A game is running. You can join as soon as it ends." : undefined}>
          <input className={controlCls} maxLength={20} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" onKeyDown={(e) => e.key === "Enter" && name.trim() && join()} />
          {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          <Button variant="accent" className="w-full" disabled={!name.trim() || busy || snap.status === "playing"} onClick={join}>{snap.status === "playing" ? "Waiting for the game to end…" : "Join room"}</Button>
        </Panel>
      </PageShell>
    );
  }

  const token = loadToken(code)!;
  const isHost = snap.seats[0]?.name === snap.me;
  const leave = async () => {
    await leaveRoom(code, token);
    clearToken(code);
    router.push("/");
  };

  if (snap.setup && snap.status !== "lobby") {
    const setup = snap.setup;
    const toLobby = async () => {
      const r = await roomToLobby(code, token);
      if (!r.ok) setError(r.data.error ?? "Couldn't go back to the lobby");
      else await refresh();
    };
    const rematch = async () => {
      const r = await startRoom(code, token);
      if (!r.ok) setError(r.data.error ?? "Couldn't start");
      else await refresh();
    };
    return (
      <>
        {snap.status === "done" && (
          <div className="sticky top-0 z-30 border-b border-white/10 bg-background/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="font-semibold">Room {code}</span>
              <span className="text-muted-foreground">{isHost ? "Pick the next game when everyone is ready." : `Waiting for ${snap.seats[0]?.name} to pick the next game.`}</span>
              {error && <span role="alert" className="text-accent">{error}</span>}
              <span className="ml-auto flex gap-2">
                {isHost && <Button variant="accent" onClick={toLobby}>Back to the room</Button>}
                <Button variant="ghost" onClick={leave}><LogOut className="h-4 w-4" aria-hidden /> Leave</Button>
              </span>
            </div>
          </div>
        )}
        <PlayingRoom snap={{ ...snap, setup }} offset={offset} dispatch={dispatchRemote} onNew={isHost ? toLobby : () => setError(null)} onRematch={isHost ? rematch : undefined} />
      </>
    );
  }

  return <Lobby code={code} token={token} snap={snap} isHost={isHost} onLeave={leave} refresh={refresh} />;
}

function PlayingRoom({ snap, offset, dispatch, onNew, onRematch }: { snap: RoomSnapshot & { setup: GameSetup }; offset: number; dispatch: ReturnType<typeof useRemoteRoom>["dispatchRemote"]; onNew: () => void; onRematch?: () => void }) {
  const ctl = useRemoteCtl(snap, offset, dispatch);
  return <GameBody setup={snap.setup} ctl={ctl} serverVerdict={snap.verdict} onNew={onNew} onRematch={onRematch} />;
}

function Lobby({ code, token, snap, isHost, onLeave, refresh }: { code: string; token: string; snap: RoomSnapshot; isHost: boolean; onLeave: () => void; refresh: () => Promise<void> }) {
  const { user, token: authToken } = useAuth();
  const [choice, setPicking] = useState<FormatId | "menu" | null>(null);
  // With no game picked yet, the host starts on the menu (this also covers a player who just became host).
  const picking = choice ?? (snap.setup ? null : "menu");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<League | null>(null);
  const setup = snap.setup;
  const meta = setup ? formatMeta(setup.format) : null;
  const cat = setup ? category(setup.pool) : null;

  // Picking a game: the full setup screen for that format, saving to the room.
  if (isHost && picking && picking !== "menu") {
    return <SetupScreen format={picking} room={{ code, token, pool: setup?.pool, onDone: () => { setPicking(null); void refresh(); }, onCancel: () => setPicking("menu") }} />;
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : `/room/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  const start = async () => {
    setError(null);
    const r = await startRoom(code, token);
    if (!r.ok) setError(r.data.error ?? "Couldn't start");
    else await refresh();
  };
  /** Stat drafts run in their own account-based rooms: open one and point everyone here at it. */
  const openStat = async (league: League) => {
    if (!authToken) return setError("Log in to host an NBA, NFL or Cartoon stat draft.");
    setOpening(league);
    const r = await openStatRoom(league, authToken);
    setOpening(null);
    if ("error" in r) return setError(r.error);
    await setStatLink(code, token, { code: r.code, league });
    window.location.assign(statRoomHref(r.code, league));
  };
  const surprise = () => {
    const f = FORMATS.filter((x) => x.id !== "loadout");
    setPicking(f[Math.floor(Math.random() * f.length)]!.id as FormatId);
  };

  return (
    <PageShell width="md">
      <PageHeader title={`Room ${code}`} subtitle={setup && meta ? `Next up: ${meta.title}${cat ? ` · ${cat.title}` : ""}` : isHost ? "Pick a game to play" : "The host is picking a game"} icon={meta?.icon ?? Users} gradient={meta?.gradient} />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Invite friends" hint="Share the code or the link. Up to 6 players. Friends can join between games too.">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <span className="font-display text-4xl tracking-[0.2em]">{code}</span>
            <Button variant="ghost" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy link"}</Button>
          </div>
        </Panel>
        <Panel title={`Players (${snap.seats.length}/6)`}>
          <ul className="space-y-2">
            {snap.seats.map((s) => {
              const wins = snap.played.filter((g) => g.winner === s.name).length;
              return (
                <li key={s.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
                  <span className="flex items-center gap-2 font-semibold">{s.host ? <Crown className="h-4 w-4 text-accent" aria-label="Host" /> : <Users className="h-4 w-4 text-muted-foreground" aria-hidden />}{s.name}{s.name === snap.me && <span className="text-xs text-secondary">you</span>}</span>
                  {wins > 0 && <span className="flex items-center gap-1 text-sm text-secondary"><Trophy className="h-4 w-4" aria-hidden /> {wins}</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {snap.statLink && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm"><b>{snap.seats[0]?.name}</b> opened a live {snap.statLink.league} stat draft room. It needs a login{snap.statLink.league === "NBA" ? "" : " and a premium plan"}.</p>
          <Link href={statRoomHref(snap.statLink.code, snap.statLink.league)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold"><ExternalLink className="h-4 w-4" aria-hidden /> Join the {snap.statLink.league} room</Link>
        </Card>
      )}

      {setup && meta && picking !== "menu" && (
        <Panel title="Next game">
          <div className="flex flex-wrap items-center gap-4">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${meta.gradient}`}><meta.icon className="h-7 w-7 text-white" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{meta.title}{cat ? ` · ${cat.title}` : ""}</div>
              <div className="text-sm text-muted-foreground">{setup.mystery ? "Mystery mission" : setup.mission.title} · {setup.format === "blind" ? `${setup.opts.rankSize} ranks` : setup.format === "jeopardy" || setup.format === "feud" ? "trivia" : `team of ${setup.loadout?.slots.length ?? setup.opts.teamSize}`}</div>
            </div>
            {isHost && <Button variant="ghost" onClick={() => setPicking("menu")}><RefreshCw className="h-4 w-4" aria-hidden /> Change game</Button>}
          </div>
        </Panel>
      )}

      {isHost && picking === "menu" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-2xl">Pick a game</h2><p className="text-sm text-muted-foreground">You choose the topic and rules next. Everyone stays in the room between games.</p></div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={surprise}><Shuffle className="h-4 w-4" aria-hidden /> Surprise us</Button>
              {setup && <Button variant="ghost" onClick={() => setPicking(null)}>Keep {meta?.title}</Button>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FORMATS.filter((f) => f.id !== "loadout").map((f) => (
              <GameTile key={f.id} title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} onClick={() => setPicking(f.id as FormatId)} />
            ))}
            {STAT_LEAGUES.map((l) => (
              <GameTile key={l.league} title={l.title} blurb={l.blurb} iconSrc={l.iconSrc} badge={opening === l.league ? "Opening…" : user ? undefined : "Login"} gradient="from-emerald-700/40 to-primary/20" onClick={() => void openStat(l.league)} />
            ))}
          </div>
        </section>
      )}

      {snap.played.length > 0 && (
        <Panel title="Played tonight">
          <ol className="space-y-1 text-sm">
            {snap.played.slice().reverse().map((g, i) => (
              <li key={i} className="flex justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"><span>{formatMeta(g.format)?.title}{category(g.pool) ? ` · ${category(g.pool)!.title}` : ""}</span><span className="text-muted-foreground">{g.winner ? `${g.winner} won` : "no winner"}</span></li>
            ))}
          </ol>
        </Panel>
      )}

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex gap-3">
        {isHost ? (
          <Button variant="accent" className="flex-1 text-lg" disabled={!setup || snap.seats.length < 2 || picking === "menu"} onClick={start}>
            <Play className="h-5 w-5" aria-hidden /> {!setup ? "Pick a game first" : snap.seats.length < 2 ? "Waiting for players…" : "Start game"}
          </Button>
        ) : (
          <p className="flex-1 self-center text-center text-muted-foreground">{setup ? `Waiting for ${snap.seats[0]?.name} to start…` : `Waiting for ${snap.seats[0]?.name} to pick a game…`}</p>
        )}
        <Button variant="ghost" onClick={onLeave}><LogOut className="h-4 w-4" aria-hidden /> Leave</Button>
      </div>
    </PageShell>
  );
}
