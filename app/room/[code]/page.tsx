"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Crown, ExternalLink, ListOrdered, LogOut, Play, RefreshCw, Shuffle, Trophy, Tv, Users } from "lucide-react";
import { Button, Card, GameTile, PageHeader, PageShell, Panel, controlCls } from "../../components/ui";
import { GameBody } from "../../play/GameScreen";
import SetupScreen from "../../play/SetupScreen";
import { FORMATS, PARTY_GAMES, ROOM_GAMES, formatMeta } from "../../play/formats";
import { PartySetup } from "../../play/PartySetup";
import { WaterLine } from "../../play/views/partyBits";
import { deckOf } from "../../topicDraft/party/decks";
import { insyncDeckOf } from "../../topicDraft/party/insyncDecks";
import { TEAM_MIN_PLAYERS } from "../../topicDraft/formats/partytrivia";
import { MIN_PLAYERS as MAFIA_MIN } from "../../topicDraft/formats/mafia";
import { category } from "../../play/categories";
import { vowelTopicTitle } from "../../topicDraft/party/vowelTopics";
import { clearToken, endTournament, joinRoom, leaveRoom, loadToken, roomToLobby, saveToken, setScreen, setStatLink, startRoom, startTournament, type RoomSnapshot } from "../../play/onlineApi";
import { addToPlan, fitsTable, PLAN_MAX, planEntries, planReady, seatsNeeded, slotsOf, type PlanSlot } from "../../play/tournamentPlan";
import { startPools } from "../../play/topicOptions";
import { ChampionScreen, LineupPanel, TournamentBoard, TournamentCard, type LiveTournament } from "../../play/views/TournamentSetup";
import { useRemoteCtl, useRemoteRoom } from "../../play/useRemoteGame";
import { loadPrefs, savePrefs } from "../../play/storage";
import { useAuth } from "../../hooks/useAuth";
import { openStatRoom, STAT_LEAGUES, statRoomHref, type League } from "../../lib/statRooms";
import { track } from "../../lib/analytics";
import { PARTY_FORMATS, type FormatId, type GameSetup } from "../../play/types";

/** The topic part of a party game's title ("Imposter: A and B" shows as "A and B"; vote games are titled by their decks). */
const topicLine = (format: FormatId, title: string | undefined): string | null => {
  const head = formatMeta(format)?.title ?? "";
  const t = (title ?? "").startsWith(`${head}: `) ? title!.slice(head.length + 2) : title ?? "";
  return t && t !== head && t !== "Mafia" ? t : null;
};
const isVowel = (format: string) => format === "vowelplay" || format === "vowelparty";
/** The game's topic as a short line: a party game's own title, else the deck or category it plays from. */
const topicOf = (setup: GameSetup): string | null | undefined =>
  PARTY_FORMATS.has(setup.format) ? topicLine(setup.format, setup.mission.title) : isVowel(setup.format) ? vowelTopicTitle(setup.pool) : setup.format === "vote" ? deckOf(setup.pool)?.title : setup.format === "insync" ? insyncDeckOf(setup.pool)?.title : category(setup.pool)?.title;
/** The seats that play: everyone but the screen host. */
const playingSeats = (snap: RoomSnapshot) => snap.seats.filter((s) => !s.screen);
const DUEL_ONLY = "Head to head takes exactly 2 players";

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
  // Whether a tournament was running while the current game played, so its finished screen only shows standings it counted toward.
  const [counting, setCounting] = useState<boolean | null>(null);
  const live = !!snap?.tournament && !snap.tournament.done;
  if (snap?.status === "playing" && counting !== live) setCounting(live);
  else if (snap?.status === "lobby" && counting !== null) setCounting(null);
  // The champion screen a player closed; it stays closed for that tournament on this device.
  const [closedChampion, setClosedChampion] = useState<string | null>(null);
  if (live && closedChampion !== null) setClosedChampion(null); // a new tournament gets its own champion screen

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
  const host = hostName(snap);
  const isHost = host === snap.me;
  const leave = async () => {
    await leaveRoom(code, token);
    clearToken(code);
    router.push("/");
  };

  if (snap.setup && snap.status !== "lobby") {
    const setup = snap.setup;
    const toLobby = async () => {
      setError(null);
      const r = await roomToLobby(code, token);
      if (!r.ok) setError(r.data.error ?? "Couldn't go back to the lobby");
      else await refresh();
    };
    const rematch = async () => {
      setError(null);
      const r = await startRoom(code, token);
      if (!r.ok) setError(r.data.error ?? "Couldn't start");
      else await refresh();
    };
    const t = snap.tournament as LiveTournament | undefined;
    const last = t?.games[t.games.length - 1];
    // A page opened mid-results has not seen the game start: only a tournament still running counted it for sure.
    const counted = snap.status === "done" && !!t && !!last && (counting ?? !t.done);
    const night = counted ? <TournamentBoard t={t!} seats={playingSeats(snap).map((s) => s.name)} /> : undefined;
    return (
      <>
        {snap.status === "done" && (
          <div className="sticky top-0 z-30 border-b border-white/10 bg-background/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="font-semibold">Room {code}</span>
              <span className="text-muted-foreground">{isHost ? "Pick the next game when everyone is ready." : `Waiting for ${host} to pick the next game.`}</span>
              {error && <span role="alert" className="text-accent">{error}</span>}
              <span className="ml-auto flex gap-2">
                {isHost && <Button variant="accent" onClick={toLobby}>Back to the room</Button>}
                <Button variant="ghost" onClick={leave}><LogOut className="h-4 w-4" aria-hidden /> Leave</Button>
              </span>
            </div>
          </div>
        )}
        {night && !snap.screen && <div className="pixel mx-auto max-w-xl px-1 py-2">{night}</div>}
        <PlayingRoom code={code} snap={{ ...snap, setup }} offset={offset} dispatch={dispatchRemote} onNew={isHost ? toLobby : () => setError(null)} onRematch={isHost && !(t && !t.done && t.plan[t.index] !== setup.format) ? rematch : undefined} onLeave={leave} tournament={night} />
      </>
    );
  }

  return <Lobby code={code} token={token} snap={snap} isHost={isHost} onLeave={leave} refresh={refresh} closedChampion={closedChampion} onCloseChampion={setClosedChampion} />;
}

/** The server decides who hosts: the first seat that hasn't left and whose phone is awake. */
const hostName = (snap: RoomSnapshot) => snap.seats.find((s) => s.host)?.name ?? "the host";

function PlayingRoom({ code, snap, offset, dispatch, onNew, onRematch, onLeave, tournament }: { code: string; snap: RoomSnapshot & { setup: GameSetup }; offset: number; dispatch: ReturnType<typeof useRemoteRoom>["dispatchRemote"]; onNew: () => void; onRematch?: () => void; onLeave: () => void; tournament?: ReactNode }) {
  const ctl = useRemoteCtl(snap, offset, dispatch, onLeave);
  const screen = snap.screen ? { title: formatMeta(snap.setup.format)?.title ?? "Party night", topic: topicOf(snap.setup), code, tournament } : undefined;
  return <GameBody setup={snap.setup} ctl={ctl} serverVerdict={snap.verdict} onNew={onNew} onRematch={onRematch} screen={screen} />;
}

/** Names a tournament on this device, so a closed champion screen stays closed for it. */
const tournamentKey = (t: LiveTournament) => `${t.plan.join(",")}|${t.games.length}|${JSON.stringify(t.totals)}`;

function Lobby({ code, token, snap, isHost, onLeave, refresh, closedChampion, onCloseChampion }: { code: string; token: string; snap: RoomSnapshot; isHost: boolean; onLeave: () => void; refresh: () => Promise<void>; closedChampion: string | null; onCloseChampion: (key: string) => void }) {
  const { user, token: authToken } = useAuth();
  const [choice, setPicking] = useState<FormatId | "menu" | null>(null);
  const tour = snap.tournament as LiveTournament | undefined;
  const running = !!tour && !tour.done;
  const planned = running ? tour.plan[tour.index] : undefined;
  // The game index the host already set up (or skipped setting up) in this visit to the lobby.
  const [pickedFor, setPickedFor] = useState<number | null>(null);
  // During a tournament the host's next pick opens the planned game's setup; otherwise, with no game picked yet, the menu
  // (this also covers a player who just became host).
  const auto = isHost && planned && pickedFor !== tour!.index ? planned : null;
  const picking = choice ?? auto ?? (snap.setup ? null : "menu");
  // The host either picks one game, or lines up a tournament from the same game tiles.
  const [mode, setMode] = useState<"one" | "tour">("one");
  const tourMode = isHost && !running && mode === "tour";
  const [plan, setPlan] = useState<PlanSlot[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const [tourBusy, setTourBusy] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<League | null>(null);
  const setup = snap.setup;
  const meta = setup ? formatMeta(setup.format) : null;
  const party = !!setup && PARTY_FORMATS.has(setup.format);
  const cap = !setup || party ? 12 : 6; // an empty room takes a party-sized group; drafts cap it at six
  const need = setup ? seatsNeeded(setup.format) : 2;
  // The screen host never plays, so it counts for no minimum, no cap and no team.
  const players = playingSeats(snap);
  const count = players.length;
  const shortForMafia = setup?.format === "mafia" && count < MAFIA_MIN;
  const shortForGame = !!setup && count >= 2 && count < need && !shortForMafia;
  const here = players.filter((s) => !s.left).length;
  const [switching, setSwitching] = useState(false);
  const duelWrong = setup?.format === "vowelplay" && setup.opts.vowelMode === "duel" && here !== 2;
  const poolTitle = setup ? topicOf(setup) : null;

  const seatNames = players.map((s) => s.name); // sprites follow the playing seats, as in the games
  const runTournament = async (games: PlanSlot[]) => {
    setTourError(null);
    setTourBusy(true);
    const r = await startTournament(code, token, planEntries(games));
    setTourBusy(false);
    if (!r.ok) return setTourError(r.data.error ?? "Couldn't start the tournament");
    setPlan([]);
    setMode("one");
    setAdded(null);
    setPickedFor(null);
    setPicking(null);
    await refresh();
  };
  const stopTournament = async () => {
    setTourError(null);
    const r = await endTournament(code, token);
    if (!r.ok) setTourError(r.data.error ?? "Couldn't end the tournament");
    else await refresh();
  };

  // The night is over: the champion first, until this player closes it.
  if (tour?.done && closedChampion !== tournamentKey(tour)) {
    return <ChampionScreen t={tour} seats={seatNames} isHost={isHost} busy={tourBusy} error={tourError} onPlayAgain={() => void runTournament(slotsOf(tour).filter((s) => fitsTable(s.format, count)))} onBack={() => onCloseChampion(tournamentKey(tour))} onLeave={onLeave} />;
  }

  // Leaving a setup screen: in a tournament it counts as this game's pick, so the lobby shows instead of reopening it.
  const donePicking = () => { if (running) setPickedFor(tour!.index); setPicking(null); void refresh(); };
  const cancelPicking = () => { if (running && picking === planned) { setPickedFor(tour!.index); setPicking(null); } else setPicking("menu"); };

  // The planned game's topics: what the host already saved for it in this visit, else the topics picked in the lineup.
  const ownSetup = running && pickedFor === tour!.index && setup?.format === planned;
  const slotPools = !running || picking !== planned ? null : ownSetup ? (setup!.pools?.length ? setup!.pools : [setup!.pool]) : tour!.topics?.[tour!.index] ?? null;

  // Picking a game: the full setup screen for that format, saving to the room.
  if (isHost && (picking === "imposter" || picking === "vote" || picking === "insync" || picking === "partytrivia" || picking === "mafia" || picking === "vowelplay" || picking === "vowelparty")) {
    return <PartySetup format={picking} seats={players.map((s) => s.name)} room={{ code, token, pool: setup?.pool, pools: setup?.pools, slotPools, inTournament: running, onDone: donePicking, onCancel: cancelPicking }} />;
  }
  if (isHost && picking && picking !== "menu") {
    // Drafts play from one topic: the slot's first, or in a tournament the format's own default rather than the last game's.
    const pool = running ? startPools(picking, slotPools, [], true)[0] : setup?.pool;
    return <SetupScreen format={picking} room={{ code, token, pool, onDone: donePicking, onCancel: cancelPicking }} />;
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
  const toggleScreen = async (on: boolean) => {
    if (on === snap.screen) return;
    setError(null);
    setSwitching(true);
    const r = await setScreen(code, token, on);
    setSwitching(false);
    if (!r.ok) setError(r.data.error ?? "Couldn't switch");
    else await refresh();
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
  const tourOptions = [...PARTY_GAMES, ...ROOM_GAMES, ...FORMATS.filter((x) => x.id !== "loadout")].map((x) => x.id as FormatId).filter((f) => fitsTable(f, count));
  const surprise = () => {
    // Only games this table can actually start: party games by their seat minimum, drafts and trivia up to six seats.
    const n = count;
    const f = [...PARTY_GAMES.filter((x) => n >= seatsNeeded(x.id)), ...ROOM_GAMES.filter((x) => n >= seatsNeeded(x.id)), ...(n <= 6 ? FORMATS.filter((x) => x.id !== "loadout") : [])];
    setPicking(f[Math.floor(Math.random() * f.length)]!.id as FormatId);
  };

  return (
    <PageShell width="md">
      <PageHeader title={`Room ${code}`} subtitle={setup && meta ? `Next up: ${meta.title}${poolTitle ? ` · ${poolTitle}` : ""}` : isHost ? "Pick a game to play" : "The host is picking a game"} icon={meta?.icon ?? Users} gradient={meta?.gradient} />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Invite friends" hint={`Share the code or the link. Up to ${cap} players${cap === 12 ? " (drafts and trivia take 6)" : " (party games take 12)"}. Friends can join between games too.`}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <span className="font-display text-4xl tracking-[0.2em]">{code}</span>
            <Button variant="ghost" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy link"}</Button>
          </div>
        </Panel>
        <Panel title={`Players (${count}/${cap})`}>
          <ul className="space-y-2">
            {snap.seats.map((s) => {
              const wins = snap.played.filter((g) => g.winner === s.name).length;
              return (
                <li key={s.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
                  <span className="flex items-center gap-2 font-semibold">{s.host ? <Crown className="h-4 w-4 text-accent" aria-label="Host" /> : <Users className="h-4 w-4 text-muted-foreground" aria-hidden />}{s.name}{s.name === snap.me && <span className="text-xs text-secondary">you</span>}{s.screen && <span className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs text-muted-foreground"><Tv className="h-3.5 w-3.5" aria-hidden /> screen, not playing</span>}</span>
                  {wins > 0 && <span className="flex items-center gap-1 text-sm text-secondary"><Trophy className="h-4 w-4" aria-hidden /> {wins}</span>}
                </li>
              );
            })}
          </ul>
          {isHost && (
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you host">
              {([[false, "Play", "You play on this device"], [true, "Host on a screen", "This device is the TV. You don't play"]] as const).map(([on, label, hint]) => (
                <button key={label} type="button" role="radio" aria-checked={snap.screen === on} disabled={switching} onClick={() => void toggleScreen(on)}
                  className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition ${snap.screen === on ? "border-accent bg-accent/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  <span className="flex items-center gap-1.5 font-semibold">{on ? <Tv className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {running && <TournamentCard t={tour} seats={seatNames} isHost={isHost} ready={setup?.format === planned} error={tourError} onSetUp={() => setPicking(planned!)} onEnd={stopTournament} />}
      {isHost && !running && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to play">
          {([["one", "One game", "Pick a game and play it", Play], ["tour", "Tournament", "Line up 2 to 8 games, one leaderboard", ListOrdered]] as const).map(([id, label, hint, Icon]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => { setMode(id); if (id === "one" && !setup) setPicking("menu"); }}
              className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition ${mode === id ? "border-accent bg-accent/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
              <span className="flex items-center gap-1.5 text-base font-semibold"><Icon className="h-4 w-4" aria-hidden />{label}{id === "tour" && plan.length > 0 && <span className="rounded-md bg-white/10 px-1.5 text-xs">{plan.length}</span>}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      )}

      {tourMode && (
        <section className="space-y-4" aria-label="Line up a tournament">
          <LineupPanel options={tourOptions} plan={plan} onPlan={(p) => { setPlan(p); setAdded(null); }} onStart={() => void runTournament(plan)} busy={tourBusy} error={tourError} />
          <div><h2 className="text-2xl">Add games</h2><p className="text-sm text-muted-foreground">Tap a game to add it to the lineup. Add the same game twice to play it twice. Only games this table can start are shown.</p></div>
          <p className="sr-only" role="status">{added ?? ""}</p>
          {tourOptions.length === 0 && <p className="text-sm text-muted-foreground">Games show up here once 2 players are in the room.</p>}
          {([["Party games", "up to 12 players", PARTY_GAMES], ["Word games", "2 to 12 players", ROOM_GAMES], ["Drafts and trivia", "up to 6 players", FORMATS.filter((f) => f.id !== "loadout")]] as const).map(([group, note, games]) => {
            const fit = games.filter((f) => fitsTable(f.id, count));
            if (!fit.length) return null;
            return (
              <div key={group} className="space-y-3">
                <h3 className="text-lg">{group} <span className="text-sm font-normal text-muted-foreground">· {note}</span></h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fit.map((f) => {
                    const n = plan.filter((s) => s.format === f.id).length;
                    return (
                      <GameTile key={f.id} title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} badge={plan.length >= PLAN_MAX ? "Lineup full" : n ? `+ Add · ${n} in` : "+ Add"}
                        onClick={() => {
                          if (plan.length >= PLAN_MAX) return setAdded(`The lineup is full at ${PLAN_MAX} games`);
                          setPlan(addToPlan(plan, { format: f.id, pools: null }));
                          setAdded(`${f.title} added as game ${plan.length + 1}`);
                        }} />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-xl border border-white/10 bg-background/90 py-2 pl-4 pr-16 md:bottom-3 md:pr-4 backdrop-blur-xl">
            <span className="flex-1 text-sm" aria-hidden>{added ?? `${plan.length} of ${PLAN_MAX} games in the lineup`}</span>
            <Button variant="accent" disabled={!planReady(plan) || tourBusy} onClick={() => void runTournament(plan)}>{tourBusy ? "Starting…" : plan.length < 2 ? "Add 2+" : "Start"}</Button>
          </div>
        </section>
      )}

      {snap.statLink && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm"><b>{hostName(snap)}</b> opened a live {snap.statLink.league} stat draft room. It needs a login{snap.statLink.league === "NBA" ? "" : " and a premium plan"}.</p>
          <Link href={statRoomHref(snap.statLink.code, snap.statLink.league)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold"><ExternalLink className="h-4 w-4" aria-hidden /> Join the {snap.statLink.league} room</Link>
        </Card>
      )}

      {/* Guests only see the next game once it is the planned one, not the last game while the host sets up. */}
      {setup && meta && picking !== "menu" && !tourMode && (isHost || !planned || setup.format === planned) && (
        <Panel title="Next game">
          <div className="flex flex-wrap items-center gap-4">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${meta.gradient}`}><meta.icon className="h-7 w-7 text-white" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{meta.title}{poolTitle ? ` · ${poolTitle}` : ""}</div>
              <div className="text-sm text-muted-foreground">{party ? (setup.format === "vowelplay" ? `${setup.opts.vowelMode === "duel" ? "Head to head · 2 players" : `First correct · ${setup.opts.teamSize} words · 2+ players`} · ${setup.opts.vowelAnswer === "type" ? "type it" : "say it"}` : setup.format === "vowelparty" ? (setup.opts.answer === "buzz" ? "10 words · Buzz · say it out loud · 2+ players" : "10 words · everyone races · typed · 2+ players") : setup.format === "mafia" ? `Secret roles · ${MAFIA_MIN}+ players` : setup.format === "partytrivia" ? `up to ${setup.opts.teamSize} questions · ${setup.opts.teams >= 2 ? (count >= TEAM_MIN_PLAYERS ? `${setup.opts.teams} teams` : `solo until ${TEAM_MIN_PLAYERS} players`) : "every player for themselves"}${setup.opts.answer === "buzz" ? " · Buzz" : ""} · 2+ players` : setup.format === "insync" ? `${Math.max(4, count)} rounds · one group score · 2+ players` : setup.format === "imposter" ? `${setup.opts.teamSize} clue round${setup.opts.teamSize > 1 ? "s" : ""} · ${setup.opts.ending === "guess" ? "imposter can guess" : "vote only"} · 3+ players` : `${setup.opts.teamSize} cards · ${setup.opts.showVotes ? "votes shown" : "votes stay secret"} · 3+ players`) : <>{setup.mystery ? "Mystery mission" : setup.mission.title} · {setup.format === "blind" ? `${setup.opts.rankSize} ranks` : setup.format === "jeopardy" || setup.format === "feud" ? "trivia" : `team of ${setup.loadout?.slots.length ?? setup.opts.teamSize}`}</>}{party && setup.opts.drinking ? " · drinking mode" : ""}</div>
              {party && setup.opts.drinking && <WaterLine />}
              {isHost && running && planned && setup.format !== planned && <p className="mt-1 text-sm text-accent">Not the planned game ({formatMeta(planned)?.title}). It still counts as game {tour!.index + 1} of the tournament.</p>}
            </div>
            {isHost && <Button variant="ghost" onClick={() => setPicking("menu")}><RefreshCw className="h-4 w-4" aria-hidden /> Change game</Button>}
          </div>
        </Panel>
      )}

      {isHost && picking === "menu" && !tourMode && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-2xl">Pick a game</h2><p className="text-sm text-muted-foreground">You choose the topic and rules next. Everyone stays in the room between games.</p></div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={surprise}><Shuffle className="h-4 w-4" aria-hidden /> Surprise us</Button>
              {setup && <Button variant="ghost" onClick={() => setPicking(null)}>Keep {meta?.title}</Button>}
            </div>
          </div>
          <h3 className="text-lg">Party games <span className="text-sm font-normal text-muted-foreground">· up to 12 players, best with a group</span></h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PARTY_GAMES.map((f) => (
              <GameTile key={f.id} title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} badge="New" onClick={() => setPicking(f.id)} />
            ))}
          </div>
          <h3 className="text-lg">Word games <span className="text-sm font-normal text-muted-foreground">· 2 to 12 players</span></h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROOM_GAMES.map((f) => (
              <GameTile key={f.id} title={f.title} blurb={f.tagline} icon={f.icon} gradient={f.gradient} badge="New" onClick={() => setPicking(f.id as FormatId)} />
            ))}
          </div>
          <h3 className="text-lg">Drafts and trivia <span className="text-sm font-normal text-muted-foreground">· up to 6 players</span></h3>
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
              <li key={i} className="flex justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"><span>{formatMeta(g.format)?.title}{g.title && PARTY_FORMATS.has(g.format as FormatId) ? (topicLine(g.format as FormatId, g.title) ? ` · ${topicLine(g.format as FormatId, g.title)}` : "") : isVowel(g.format) ? ` · ${vowelTopicTitle(g.pool)}` : g.format === "vote" ? ` · ${deckOf(g.pool)?.title ?? ""}` : g.format === "insync" ? ` · ${insyncDeckOf(g.pool)?.title ?? ""}` : category(g.pool) ? ` · ${category(g.pool)!.title}` : ""}</span><span className="text-muted-foreground">{g.winner ? `${g.winner} won` : isVowel(g.format) ? "tie" : g.format === "insync" ? "played together" : g.format === "partytrivia" ? "no single winner" : "no winner"}</span></li>
            ))}
          </ol>
        </Panel>
      )}

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex gap-3">
        {tourMode ? <span className="flex-1" /> : isHost ? (
          <Button variant="accent" className="flex-1 text-lg" disabled={!setup || count < 2 || duelWrong || shortForMafia || shortForGame || picking === "menu"} onClick={start}>
            <Play className="h-5 w-5" aria-hidden /> {!setup ? "Pick a game first" : duelWrong ? DUEL_ONLY : shortForMafia ? `Need ${MAFIA_MIN} players` : shortForGame ? `Need ${need} players` : count < 2 ? "Waiting for players…" : "Start game"}
          </Button>
        ) : (
          <p className="flex-1 self-center text-center text-muted-foreground">{duelWrong ? DUEL_ONLY : shortForMafia ? `Mafia needs ${MAFIA_MIN} players. ${count} here so far.` : shortForGame ? `${meta?.title} needs ${need} players. ${count} here so far.` : setup ? `Waiting for ${hostName(snap)} to start…` : `Waiting for ${hostName(snap)} to pick a game…`}</p>
        )}
        <Button variant="ghost" onClick={onLeave}><LogOut className="h-4 w-4" aria-hidden /> Leave</Button>
      </div>
    </PageShell>
  );
}
