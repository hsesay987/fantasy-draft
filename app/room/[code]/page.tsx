"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Crown, LogOut, Play, Users } from "lucide-react";
import { Button, Card, PageHeader, PageShell, Panel, controlCls } from "../../components/ui";
import { GameBody } from "../../play/GameScreen";
import { formatMeta } from "../../play/formats";
import { category } from "../../play/categories";
import { clearToken, joinRoom, leaveRoom, loadToken, saveToken, startRoom } from "../../play/onlineApi";
import { useRemoteCtl, useRemoteRoom } from "../../play/useRemoteGame";
import { loadPrefs, savePrefs } from "../../play/storage";

export default function RoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = raw.toUpperCase();
  const router = useRouter();
  const { snap, missing, offset, refresh, dispatchRemote, setToken } = useRemoteRoom(code);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setName(loadPrefs().name ?? ""), []);

  if (missing) {
    return (
      <PageShell width="sm" className="text-center">
        <h1 className="text-3xl">Room not found</h1>
        <p className="text-muted-foreground">Check the code, or the host may have closed the room.</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold">Back home</Link>
      </PageShell>
    );
  }
  if (!snap) return <PageShell width="sm" className="text-center"><p className="text-muted-foreground">Connecting…</p></PageShell>;

  const meta = formatMeta(snap.setup.format)!;
  const cat = category(snap.setup.pool);

  // Not seated yet: pick a name to join.
  if (!snap.me) {
    const join = async () => {
      setBusy(true);
      setError(null);
      const r = await joinRoom(code, name);
      setBusy(false);
      if (!r.ok) return setError(r.data.error ?? "Couldn't join");
      saveToken(code, r.data.token);
      setToken(r.data.token);
      savePrefs({ name });
      await refresh();
    };
    return (
      <PageShell width="sm">
        <PageHeader title={`Join room ${code}`} subtitle={`${meta.title}${cat ? ` · ${cat.title}` : ""}`} icon={meta.icon} gradient={meta.gradient} back={{ href: "/", label: "Home" }} />
        {snap.status !== "lobby" ? (
          <Panel><p className="text-muted-foreground">This game has already started. Ask the host to make a new room.</p></Panel>
        ) : (
          <Panel title="Pick a name" hint={`${snap.seats.length} in the lobby: ${snap.seats.map((s) => s.name).join(", ")}`}>
            <input className={controlCls} maxLength={20} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" onKeyDown={(e) => e.key === "Enter" && name.trim() && join()} />
            {error && <p role="alert" className="text-sm text-accent">{error}</p>}
            <Button variant="accent" className="w-full" disabled={!name.trim() || busy} onClick={join}>Join game</Button>
          </Panel>
        )}
      </PageShell>
    );
  }

  const token = loadToken(code)!;
  const isHost = snap.seats[0]?.name === snap.me;

  if (snap.status === "lobby") {
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
    const leave = async () => {
      await leaveRoom(code, token);
      clearToken(code);
      router.push("/");
    };
    return (
      <PageShell width="sm">
        <PageHeader title={`Room ${code}`} subtitle={`${meta.title}${cat ? ` · ${cat.title}` : ""}`} icon={meta.icon} gradient={meta.gradient} />
        <Panel title="Invite friends" hint="Share the code or the link. Up to 6 players.">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <span className="font-display text-4xl tracking-[0.2em]">{code}</span>
            <Button variant="ghost" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy link"}</Button>
          </div>
        </Panel>
        <Panel title={`Players (${snap.seats.length}/6)`}>
          <ul className="space-y-2">
            {snap.seats.map((s) => (
              <li key={s.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="flex items-center gap-2 font-semibold">{s.host ? <Crown className="h-4 w-4 text-accent" aria-label="Host" /> : <Users className="h-4 w-4 text-muted-foreground" aria-hidden />}{s.name}{s.name === snap.me && <span className="text-xs text-secondary">you</span>}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Card className="text-sm text-muted-foreground">{snap.setup.mystery ? "Mystery mission" : snap.setup.mission.title} · {snap.setup.format === "blind" ? `${snap.setup.opts.rankSize} ranks` : `team of ${snap.setup.loadout?.slots.length ?? snap.setup.opts.teamSize}`}</Card>
        {error && <p role="alert" className="text-sm text-accent">{error}</p>}
        <div className="flex gap-3">
          {isHost ? (
            <Button variant="accent" className="flex-1 text-lg" disabled={snap.seats.length < 2} onClick={async () => { const r = await startRoom(code, token); if (!r.ok) setError(r.data.error ?? "Couldn't start"); else await refresh(); }}>
              <Play className="h-5 w-5" aria-hidden /> {snap.seats.length < 2 ? "Waiting for players…" : "Start game"}
            </Button>
          ) : (
            <p className="flex-1 self-center text-center text-muted-foreground">Waiting for the host to start…</p>
          )}
          <Button variant="ghost" onClick={leave}><LogOut className="h-4 w-4" aria-hidden /> Leave</Button>
        </div>
      </PageShell>
    );
  }

  return <PlayingRoom code={code} snap={snap} offset={offset} dispatch={dispatchRemote} onNew={() => router.push("/")} />;
}

function PlayingRoom({ code, snap, offset, dispatch, onNew }: { code: string; snap: NonNullable<ReturnType<typeof useRemoteRoom>["snap"]>; offset: number; dispatch: ReturnType<typeof useRemoteRoom>["dispatchRemote"]; onNew: () => void }) {
  const ctl = useRemoteCtl(snap, offset, dispatch);
  void code;
  return <GameBody setup={snap.setup} ctl={ctl} serverVerdict={snap.verdict} onNew={onNew} />;
}
