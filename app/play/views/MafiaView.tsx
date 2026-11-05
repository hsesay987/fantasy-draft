"use client";

import { useEffect, useRef, useState } from "react";
import * as MF from "../../topicDraft/formats/mafia";
import { NIGHT_PROMPT, ROLE_HOW, ROLE_LABEL } from "../../topicDraft/formats/mafiaCopy";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { WorldScene } from "../../components/pixel/WorldScene";
import type { Sprite as SpriteData } from "../../components/pixel/sprites";
import { useSound } from "../../components/SoundProvider";
import { DrinkCard, PartyClock, playerSprite, WaterLine } from "./partyBits";
import { SCENE_OF, WORLD_OF, endLine, endedBy, fateOf, lookOf, morningLine, nightLine, nightPick, openVoteLine, partnersOf, roleOf, spectatorLine, talkLine, tallyOf, voteLine, voteOf, voteResult, type Look } from "./mafiaBoard";
import type { GameCtl } from "../useGame";

/** If the server hasn't confirmed a tap by now it was lost, so the names come back. */
const TAP_RETRY_MS = 3000;
const PHASE_MS = { night: MF.NIGHT_MS, morning: MF.MORNING_MS, talk: MF.TALK_MS, vote: MF.VOTE_MS };
const PHASE_TITLE = { night: "Night", morning: "Morning", talk: "Talk", vote: "Vote" };

// Cards use one palette for every role, so an opened card can't be told apart by its colour from across the table.
const CARD_PAL = { X: "#14182c", C: "#e9e2cc", D: "#b9b198", R: "#8a2f35" };
const FOLDER: SpriteData = {
  rows: ["..XXXXXX........", ".XCCCCCCX.......", "XXXXXXXXXXXXXXXX", "XCCCCCCCCCCCCCCX", "XCCDDDDDDDDCCCCX", "XCCCCCCCCCCCCCCX", "XCCDDDDDCCCRRRCX", "XCCCCCCCCCCRRRCX", "XCCDDDDDDCCRRRCX", "XCCCCCCCCCCCCCCX", "XCCCCCCCCCCCCCCX", "XXXXXXXXXXXXXXXX"],
  pal: CARD_PAL,
};
const ROLE_ART: Record<MF.Role, SpriteData> = {
  mafia: { rows: ["................", "....XXXXXXXX....", "...XCCCCCCCCX...", "...XCCCCCCCCX...", "...XCCCCCCCCX...", "...XRRRRRRRRX...", "..XXRRRRRRRRXX..", "XXCCCCCCCCCCCCXX", "XDDDDDDDDDDDDDDX", ".XXXXXXXXXXXXXX.", "................", "................"], pal: CARD_PAL },
  doctor: { rows: ["....XXXXXXXX....", "....X......X....", "XXXXXXXXXXXXXXXX", "XCCCCCCCCCCCCCCX", "XCCCCCCRRCCCCCCX", "XCCCCCCRRCCCCCCX", "XCCCCRRRRRRCCCCX", "XCCCCRRRRRRCCCCX", "XCCCCCCRRCCCCCCX", "XCCCCCCRRCCCCCCX", "XDDDDDDDDDDDDDDX", "XXXXXXXXXXXXXXXX"], pal: CARD_PAL },
  detective: { rows: ["...XXXXXX.......", "..XCCCCCCX......", ".XCCDDDDCCX.....", "XCCDCCCCCCCX....", "XCCDCCCCCCCX....", "XCCCCCCCCCCX....", "XCCCCCCCCCCX....", ".XCCCCCCCCX.....", "..XCCCCCCXRR....", "...XXXXXX.RRR...", ".............RRR", "..............RR"], pal: CARD_PAL },
  villager: { rows: ["......XXXX......", ".....XCCCCX.....", "....XCCCCCCX....", "...XCCCCCCCCX...", "..XCCCCCCCCCCX..", ".XXXXXXXXXXXXXX.", "..XCCCCCCCCCCX..", "..XCCRRCCDDCCX..", "..XCCRRCCDDCCX..", "..XCCCCCCDDCCX..", "..XCCCCCCDDCCX..", "..XXXXXXXXXXXX.."], pal: CARD_PAL },
};
/** A key on a bus ticket: how a seat out of the game is marked. */
const TICKET: SpriteData = {
  rows: ["XXXXXXXXXXXX", "XCCCCCCCDCCX", "XCRRCCCCCCCX", "XCCCCCCCDCCX", "XCCDDDCCCCCX", "XCCCCCCCDCCX", "XXXXXXXXXXXX"],
  pal: CARD_PAL,
};

const seatOf = (s: { players: string[] }, p: string) => Math.max(0, s.players.indexOf(p));

function Scene({ look }: { look: Look }) {
  // Keyed, so each change of light comes up from the dark in steps.
  return (
    <div key={look} className="noir-scene">
      <WorldScene world={WORLD_OF[look]} actors={[]} labels={false} track={false} caption={SCENE_OF[look]} />
    </div>
  );
}

/**
 * Your sealed case file: tap to open, tap to close, and it closes itself when the phase changes. Its contents aren't in
 * the page until it is opened, and it's where everything private lives (partner, last night's pick, what a check found),
 * so that nothing on the rest of the screen can differ by role.
 */
function RoleCard({ s, me, resetKey }: { s: MF.MafiaView; me: string; resetKey: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const peek = open === resetKey;
  const role = roleOf(s, me);
  if (!role) return null;
  const partners = partnersOf(s, me);
  const checks = Object.keys(s.checks).includes(me) ? s.checks[me]! : [];
  return (
    <button type="button" onClick={() => setOpen(peek ? null : resetKey)} aria-pressed={peek} className="noir-card">
      <span className="art"><Sprite sprite={peek ? ROLE_ART[role] : FOLDER} size={56} /></span>
      {peek ? (
        <span className="txt">
          <b>{ROLE_LABEL[role]}</b>
          <span className="sub">{ROLE_HOW[role]}</span>
          {role === "mafia" && partners.length > 0 && <span className="sub note">With you: {partners.join(", ")}</span>}
          {role === "mafia" && s.phase === "night" && s.actions.kill && <span className="sub note">Tonight&apos;s target: {s.actions.kill}</span>}
          {role === "doctor" && s.lastSave && <span className="sub note">Last night: {s.lastSave}. Not them again tonight.</span>}
          {role === "doctor" && s.phase === "night" && s.actions.save && <span className="sub note">Tonight: {s.actions.save}</span>}
          {role === "detective" && checks.map((c, i) => <span key={i} className="sub note">{c.target}: {c.mafia ? "Mafia" : "Not Mafia"}</span>)}
          <span className="sub">Tap to close.</span>
        </span>
      ) : (
        <span className="txt"><b>Tap to see your card</b><span className="sub">Keep your screen hidden</span></span>
      )}
    </button>
  );
}

/** The grid of names. Every tile looks like every other until you tap one, whoever you are. */
function Tiles({ s, names, me, chosen, locked, onPick, label }: { s: MF.MafiaView; names: string[]; me: string; chosen: string; locked: boolean; onPick: (name: string) => void; label: string }) {
  return (
    <ul className="noir-tiles" aria-label={label}>
      {names.map((p) => (
        <li key={p}>
          <button type="button" className={`noir-tile ${p === me ? "me" : ""} ${chosen === p ? "on" : ""} ${locked && chosen !== p ? "dim" : ""}`} disabled={locked} aria-pressed={chosen === p} onClick={() => onPick(p)}>
            <Sprite sprite={playerSprite(seatOf(s, p))} size={24} />
            <span className="name">{p}</span>
            {p === me && <span className="sr-only">(you)</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** How the last vote went: same on every phone. Night opens on this, as the vote goes straight into it. */
function VoteSlip({ s }: { s: MF.MafiaView }) {
  const { out } = voteResult(s);
  return (
    <section className={`noir-slip ${out ? "out" : ""}`} aria-label="How the vote went" aria-live="polite">
      <h2>The vote</h2>
      <p className="line">{voteLine(s)}</p>
    </section>
  );
}

/** Who voted for whom. Below the names at night, so a long list never pushes them off the screen. */
function VoteTally({ s }: { s: MF.MafiaView }) {
  const rows = tallyOf(s.votes);
  const { out } = voteResult(s);
  return (
    <section className="noir-slip" aria-label="Who voted for whom">
      <h2>Who voted for whom</h2>
      {rows.length > 0 ? (
        <ul>
          {rows.map((r) => (
            <li key={r.target} className={r.target === out ? "hit" : ""}>
              <span className="for">{r.target === MF.SKIP_VOTE ? "Skip" : r.target}</span>
              <span className="who">{r.voters.join(", ")}</span>
              <b>{r.voters.length}</b>
            </li>
          ))}
        </ul>
      ) : <p className="none">Nobody voted.</p>}
    </section>
  );
}

/** The town roster. `all` lists everyone; otherwise only who has gone, as the tiles already show the rest. Roles shown are public ones. */
function Town({ s, all }: { s: MF.MafiaView; all: boolean }) {
  const rows = all ? s.players : s.players.filter((p) => !s.alive.includes(p));
  if (!rows.length) return null;
  return (
    <section className="noir-town" aria-label="The town">
      <h2>{all ? "The town" : "Gone from town"}</h2>
      <ul>
        {rows.map((p) => {
          const gone = s.eliminated.find((e) => e.name === p);
          return (
            <li key={p} className={gone ? "gone" : ""}>
              {gone ? <Sprite sprite={TICKET} size={24} /> : <Sprite sprite={playerSprite(seatOf(s, p))} size={20} />}
              <span className="name">{p}</span>
              {gone && <span className="role">{gone.role ? ROLE_LABEL[gone.role] : "Unknown"}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** For seats out of the game: every card, behind a tap so the phone doesn't give it away to the living beside them. */
function Spectator({ s }: { s: MF.MafiaView }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="noir-spectator" aria-label="Every card">
      <p className="line">{spectatorLine(s)}</p>
      <PixelButton variant="alt" className="noir-wide" aria-pressed={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide every card" : "See every card"}</PixelButton>
      {open && (
        <ul>
          {s.players.map((p) => {
            const r = roleOf(s, p);
            return (
              <li key={p} className={s.alive.includes(p) ? "" : "gone"}>
                <Sprite sprite={playerSprite(seatOf(s, p))} size={20} />
                <span className="name">{p}</span>
                <span className="role">{r ? ROLE_LABEL[r] : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The morning edition: who's gone, or that nobody is. It never says why. */
function Paper({ s, big }: { s: MF.MafiaView; big: boolean }) {
  const died = s.morning?.died ?? null;
  return (
    <section className={`noir-paper ${big ? "" : "small"}`} aria-label="This morning's news" aria-live="polite">
      {big && <p className="mast">The Daily Drizzle</p>}
      {big && <p className="dateline"><span>Day {s.night}</span><span>Rain all week</span></p>}
      <h2>{died ? `${died} gone` : "Nobody missing"}</h2>
      <p className="line">{morningLine(s)}</p>
    </section>
  );
}

/**
 * Mafia in a rainy town. The app is the narrator. By night every living phone shows the same screen: the same scene, the
 * same words and the same names, with one tap each, so a glance across the table gives nothing away. What a tap means is
 * on your card alone. No sound plays at night for the same reason.
 */
export function MafiaView({ ctl }: { ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as MF.MafiaView;
  const me = ctl.me ?? "";
  const seated = s.players.includes(me);
  const alive = seated && s.alive.includes(me);
  const out = seated && !alive;
  const look = lookOf(s);
  const phaseKey = `${s.night}-${s.phase}`;
  const phaseMs = PHASE_MS[s.phase];
  const deadline = s.phaseAt + phaseMs;

  // Tapped but not yet confirmed: shown straight away, because party moves wait for the server. Only this phone knows
  // which name it tapped, for every role alike, so a reload looks the same whoever reloads.
  const [tap, setTap] = useState<{ key: string; name: string } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const confirmed = s.phase === "night" ? s.actions.done.includes(me) : s.phase === "vote" ? voteOf(s, me) !== undefined : false;
  useEffect(() => {
    if (!tap || confirmed || tap.key !== phaseKey) return;
    const id = setTimeout(() => setTap(null), TAP_RETRY_MS);
    return () => clearTimeout(id);
  }, [tap, confirmed, phaseKey]);
  const tapped = tap?.key === phaseKey ? tap.name : "";
  const chosen = s.phase === "vote" ? voteOf(s, me) ?? tapped : tapped;
  const locked = confirmed || !!tapped;

  // When the clock runs out the names close, a moment before the server closes the phase. Set once per phase, so a poll's new clock offset can't reopen them.
  const offset = useRef(ctl.offset);
  offset.current = ctl.offset;
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setExpired(s.phaseAt), Math.max(0, deadline - (Date.now() + offset.current)));
    return () => clearTimeout(id);
  }, [deadline, s.phaseAt]);
  const outOfTime = expired === s.phaseAt;

  // Cues are the same on every phone by day, and there are none at night.
  const lastPhase = useRef(s.phase);
  useEffect(() => {
    if (lastPhase.current === s.phase) return;
    lastPhase.current = s.phase;
    if (s.phase === "morning") play("reveal");
    if (s.phase === "vote") play("pick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase]);
  useEffect(() => { window.scrollTo(0, 0); setRefused(null); }, [phaseKey]);

  const tapNight = (name: string) => {
    if (locked || outOfTime) return;
    const target = nightPick(s, me, name);
    if (target === null) return setRefused(`Not ${name}, not tonight. Pick another name.`);
    setRefused(null);
    setTap({ key: phaseKey, name });
    ctl.dispatch({ type: "nightAct", by: me, target });
  };
  const tapVote = (target: string) => {
    if (locked || outOfTime) return;
    play("click");
    setTap({ key: phaseKey, name: target });
    ctl.dispatch({ type: "dayVote", by: me, target });
  };
  const hostCanSkip = s.phase === "talk" && !!me && ctl.host === me;

  return (
    <PixelShell world="noir" className={`noir-${look}`}>
      <div className="party-page noir-page">
        <header className="party-sign noir-sign">
          <div>
            <p className="eyebrow">Mafia · {s.phase === "night" ? `Night ${s.night}` : `Day ${s.night}`}</p>
            <h1>{PHASE_TITLE[s.phase]}</h1>
          </div>
          <PartyClock deadline={deadline} offset={ctl.offset} total={phaseMs} />
        </header>

        <Scene look={look} />

        {s.phase === "night" && (s.night > 1 ? <VoteSlip s={s} /> : <p className="noir-line" aria-live="polite">{nightLine(s)}</p>)}

        {s.phase === "morning" && <Paper s={s} big />}
        {s.phase === "talk" && <><Paper s={s} big={false} /><p className="noir-line">{talkLine(s)}</p></>}
        {s.phase === "vote" && <p className="noir-line" aria-live="polite">{openVoteLine(s)}</p>}

        {alive && <RoleCard s={s} me={me} resetKey={phaseKey} />}
        {out && <Spectator s={s} />}

        {s.phase === "night" && alive && (
          <section className="noir-board" aria-label="Tonight">
            <p className="prompt">{NIGHT_PROMPT}</p>
            <Tiles s={s} names={s.alive} me={me} chosen={chosen} locked={locked || outOfTime} onPick={tapNight} label="Names" />
            <p className="count" role="status">{refused ?? (locked ? "Locked in. " : outOfTime ? "Time! " : "")}{refused ? "" : `${s.actedCount} of ${s.alive.length} tapped`}</p>
          </section>
        )}
        {s.phase === "night" && !alive && <p className="noir-wait">The town is tapping: {s.actedCount} of {s.alive.length}.</p>}

        {s.phase === "talk" && (
          hostCanSkip
            ? <PixelButton variant="gold" className="noir-wide" onClick={() => ctl.dispatch({ type: "skipTalk", by: me })}>Skip to the vote</PixelButton>
            : <p className="noir-wait">{ctl.host ? `${ctl.host} can skip to the vote.` : "The vote opens when the clock runs out."}</p>
        )}

        {s.phase === "vote" && alive && (
          <section className="noir-board" aria-label="Your vote">
            <p className="prompt">{locked ? "Your vote is in." : "Vote someone out, or skip."}</p>
            <Tiles s={s} names={s.alive.filter((p) => p !== me)} me={me} chosen={chosen} locked={locked || outOfTime} onPick={tapVote} label="Who to vote out" />
            <button type="button" className={`noir-tile skip ${chosen === MF.SKIP_VOTE ? "on" : ""} ${locked && chosen !== MF.SKIP_VOTE ? "dim" : ""}`} disabled={locked || outOfTime} aria-pressed={chosen === MF.SKIP_VOTE} onClick={() => tapVote(MF.SKIP_VOTE)}>
              <span className="name">Skip this vote</span>
            </button>
            <p className="count" role="status">{outOfTime && !locked ? "Time! " : ""}{s.voteCount} of {s.alive.length} voted</p>
          </section>
        )}
        {s.phase === "vote" && !alive && <p className="noir-wait">The town is voting: {s.voteCount} of {s.alive.length}.</p>}

        {s.phase === "night" && s.night > 1 && <p className="noir-line">{nightLine(s)}</p>}
        {s.phase === "night" && s.night > 1 && <VoteTally s={s} />}

        <Town s={s} all={s.phase === "talk" || s.phase === "morning"} />

        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}

/** Game over: who won, how it ended, and every card face up. */
export function MafiaResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as MF.MafiaView;
  const look = lookOf(s);
  const how = endedBy(s);
  const headline = s.winner === "village" ? "The village wins" : s.winner === "mafia" ? "The mafia win" : "Nobody wins";
  return (
    <PixelShell world="noir" className={`noir-${look}`}>
      <div className="party-page noir-page">
        <Scene look={look} />
        <header className={`noir-end ${s.winner ? "px-confetti" : ""}`}>
          <p className="eyebrow">Mafia · Case closed</p>
          <h1>{headline}</h1>
          <p className="line">{endLine(s)}</p>
        </header>
        {how === "night" && <Paper s={s} big={false} />}
        {how === "vote" && <VoteSlip s={s} />}
        {how === "vote" && <VoteTally s={s} />}
        <section className="noir-spectator final" aria-label="Every card">
          <h2>Every card</h2>
          <ul>
            {s.players.map((p) => {
              const r = roleOf(s, p);
              const won = (s.points[p] ?? 0) > 0;
              return (
                <li key={p} className={`${s.alive.includes(p) ? "" : "gone"} ${won ? "won" : ""}`}>
                  <Sprite sprite={playerSprite(seatOf(s, p))} size={20} />
                  <span className="who"><span className="name">{p}</span><span className="fate">{fateOf(s, p)}</span></span>
                  <span className="role">{r ? ROLE_LABEL[r] : ""}</span>
                </li>
              );
            })}
          </ul>
        </section>
        {onRematch && (
          <div className="party-actions">
            <PixelButton variant="gold" onClick={onRematch}>Play again</PixelButton>
            <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
          </div>
        )}
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
