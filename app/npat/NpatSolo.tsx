"use client";

// NPAT's solo daily, "Dig": today's letter and five categories, 20 seconds each. Every answer is judged on the spot
// (the lists here, then the API for anything not on them) and turned into a gem; the miner digs as the points add up.
// Scored here in the browser, so it loads the lists; room screens must never import this file (see npat/boundary.test).
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { bandOf, shareText } from "../lib/daily";
import * as DIG from "../topicDraft/formats/npatDig";
import "../topicDraft/npat/lists";
import { categoryOf } from "../topicDraft/npat/categories";
import { ANSWER_MAX, DIG_ANSWER_MS, depthOf, GEMS, TIER_NAMES, ZONES, type Tier } from "../topicDraft/npat/rules";
import { setHistorySource } from "../topicDraft/npat/source";
import { PartyClock } from "../play/views/partyBits";
import { catTitle, ListSources } from "../play/views/npatParts";
import { fetchShare, judgeAnswers, sendDispute } from "./api";
import DigScene from "./dig/DigScene";
import GemIcon from "./dig/GemIcon";
import GemTray from "./dig/GemTray";
import CategoryCards from "./dig/CategoryCards";
import SlotReel from "./dig/SlotReel";
import { overlaySource, SOLO_MAX, SOLO_PLAYER as ME, soloResult } from "./solo";

export type NpatDaily = { letter: string; categories: string[]; overlay?: unknown };
export type NpatSoloResult = ReturnType<typeof soloResult>;

type Props = {
  puzzle: NpatDaily;
  number: number;
  /** Fires once, the moment the dig is scored. */
  onFinish: (r: NpatSoloResult) => void;
  /** The player has seen the end screen and wants the day's stats. */
  onContinue: () => void;
  backHref?: string;
  backLabel?: string;
};

const noop = () => () => {};
/** Seconds left at which the nudge shows. */
const NUDGE_S = 5;

/** The clock is read at the start, so nothing is built until the browser has taken over from the server render. */
export function NpatSolo(props: Props) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <PixelShell world="notebook"><div className="party-page np-page"><p className="np-msg">Opening today&apos;s dig…</p></div></PixelShell>;
  return <Game {...props} />;
}

const zoneAtDepth = (m: number) => [...ZONES].reverse().find((z) => m >= z.m)!.name;

function Game({ puzzle, number, onFinish, onContinue, backHref = "/trivia", backLabel = "All trivia" }: Props) {
  const [s, setS] = useState<DIG.DigState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);

  // Today's history overlay feeds the tiers; with none (or a failed fetch) the list tiers stand.
  useEffect(() => {
    setHistorySource(overlaySource(puzzle.overlay));
    return () => setHistorySource(null);
  }, [puzzle.overlay]);

  const start = () => {
    setHistorySource(overlaySource(puzzle.overlay));
    const t = Date.now();
    setNow(t);
    setS(DIG.init({ players: [ME], categories: puzzle.categories, strict: true, teams: 0, teamMap: {}, seed: number, now: t, letter: puzzle.letter }));
  };

  // The clock: the engine is ticked on an interval (and on every action); it moves the phases on by itself.
  const running = !!s && s.phase !== "summary" && !s.done;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { const t = Date.now(); setNow(t); setS((p) => (p ? DIG.tick(p, t) : p)); }, 200);
    return () => clearInterval(id);
  }, [running]);

  // Judge: when the engine reaches it, ask the API once about the unknowns. A failure or a 429 does nothing, and the
  // engine's own timeout accepts them as unchecked.
  const asked = useRef<number | null>(null);
  const latest = useRef<DIG.DigState | null>(null);
  useEffect(() => { latest.current = s; });
  const phase = s?.phase, cat = s?.cat;
  useEffect(() => {
    if (phase !== "judge" || cat === undefined || asked.current === cat) return;
    asked.current = cat;
    const cur = latest.current;
    const pending = cur ? DIG.pendingUnknowns(cur) : [];
    if (!cur || !pending.length) return;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5_000);
    judgeAnswers(pending[0]!.category, cur.letter, pending.map((u) => u.text), ac.signal).then((v) => {
      clearTimeout(timer);
      if (!v) return;
      setS((p) => (p && p.phase === "judge" && p.cat === cat
        ? DIG.judged(p, pending.map((u, i) => ({ player: u.player, ok: v[i]!.ok, niche: v[i]!.niche, reason: v[i]!.reason })), Date.now())
        : p));
    });
  }, [phase, cat]);

  const ended = !!s && (s.phase === "summary" || s.done);
  const told = useRef(false);
  const finish = useRef(onFinish);
  useEffect(() => { finish.current = onFinish; }, [onFinish]);
  useEffect(() => {
    if (s && ended && !told.current) { told.current = true; finish.current(soloResult(s)); }
  }, [s, ended]);
  useEffect(() => { window.scrollTo(0, 0); }, [ended]);
  useEffect(() => { if (phase === "ask") input.current?.focus(); }, [phase, cat]);

  const type = (v: string) => setS((p) => (p ? DIG.answer(p, ME, v, Date.now()) : p));
  const lockIn = () => setS((p) => (p ? DIG.lock(p, ME, Date.now()) : p));

  const back = <Link href={backHref} className="tr-back">&lt; {backLabel}</Link>;

  if (!s) {
    return (
      <PixelShell world="notebook">
        <div className="party-page np-page">
          {back}
          <DigScene depth={0} digging={false} gems={[]} found={null} />
          <section className="px-box np-card" aria-label="Today's dig">
            <p className="np-eyebrow">Daily Name Place Animal Thing #{number}</p>
            <h1 className="np-title">One letter, five categories</h1>
            <p className="np-msg">You get 20 seconds for each category, all starting with the same letter. Every answer turns into a gem: the rarer the answer, the bigger the gem and the deeper you dig.</p>
            <p className="np-msg">Each category stays face down until its turn comes.</p>
            <CategoryCards categories={puzzle.categories} at={-1} />
            <p className="np-msg"><b>Skip your first thought.</b> Everyone else is thinking of it too.</p>
            <PixelButton variant="gold" className="np-done" onClick={start}>Start</PixelButton>
          </section>
        </div>
      </PixelShell>
    );
  }

  const view = DIG.redactFor(s, ME);
  const shown = view.results[ME] ?? [];
  const points = s.points[ME] ?? 0;
  const gems = shown.flatMap((a) => (a.tier ? [a.tier] : []));
  const cur = s.results[ME]?.[s.cat];

  if (ended) {
    return <EndScreen s={s} number={number} onContinue={onContinue} back={back} />;
  }

  const verdictShown = s.phase === "verdict" && cur;
  const found: Tier | null = verdictShown && cur.tier ? cur.tier : null;
  const category = s.categories[s.cat]!;
  const left = Math.max(0, Math.ceil((s.phaseAt + DIG_ANSWER_MS - now) / 1000));

  return (
    <PixelShell world="notebook">
      <div className="party-page np-page">
        <header className="np-head">
          <span className="stat"><em>Daily</em><b>#{number}</b></span>
          <span className="stat"><em>Letter</em><b>{s.letter}</b></span>
          <span className="stat"><em>Category</em><b>{Math.min(s.cat + 1, s.categories.length)}<small>/{s.categories.length}</small></b></span>
          {s.phase === "ask" && <PartyClock deadline={s.phaseAt + DIG_ANSWER_MS} offset={0} total={DIG_ANSWER_MS} />}
        </header>
        <DigScene depth={depthOf(points)} digging={s.phase === "verdict"} gems={gems} found={found} />

        {s.phase === "reel" && (
          <section className="px-box np-card np-winner" aria-label="Drawing today's letter">
            <SlotReel letter={s.letter} spinning />
            <p className="np-msg" role="status">Drawing today&apos;s letter…</p>
          </section>
        )}

        {s.phase === "ask" && (
          <section className="px-box np-card" aria-label="Your answer">
            <CategoryCards categories={s.categories} at={s.cat} />
            <p className="np-eyebrow">Category {s.cat + 1} of {s.categories.length}</p>
            <h2 key={s.cat} className="np-title np-reveal">{catTitle(category)}</h2>
            <p className="np-msg">{categoryOf(category)?.blurb}. Starts with <b>{s.letter}</b>.</p>
            <form className="np-fields" onSubmit={(e) => { e.preventDefault(); lockIn(); }} autoComplete="off">
              <label className="np-field">
                <span className="lbl">{catTitle(category)} starting with {s.letter}</span>
                <input
                  ref={input} key={s.cat} value={s.typed[ME] ?? ""} maxLength={ANSWER_MAX} disabled={s.locked.includes(ME)}
                  onChange={(e) => type(e.target.value)}
                  placeholder={`${s.letter}…`} autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} enterKeyHint="done" />
              </label>
              <p className="np-msg" role="status">{left <= NUDGE_S ? "Lock in a safe answer." : "Press Enter to lock in."}<span className="sr-only"> {left} seconds left.</span></p>
              <PixelButton type="submit" variant="gold" className="np-done" disabled={s.locked.includes(ME)}>Lock in</PixelButton>
            </form>
          </section>
        )}

        {s.phase === "judge" && (
          <section className="px-box np-card np-winner" aria-label="Checking your answer">
            <p className="np-eyebrow">{catTitle(category)}</p>
            <h2 className="np-title">{cur?.text}</h2>
            <p className="np-msg" role="status">Checking…</p>
          </section>
        )}

        {verdictShown && <VerdictCard a={cur} letter={s.letter} category={category} />}
      </div>
    </PixelShell>
  );
}

function VerdictCard({ a, letter, category }: { a: DIG.DigAnswer; letter: string; category: string }) {
  const gem = a.tier ? GEMS[a.tier].name : null;
  const note =
    a.status === "wrong-letter" ? `Doesn't start with ${letter}.`
    : a.status === "blank" ? "No answer."
    : a.status === "ai-no" ? (a.reason ? `Not accepted: ${a.reason}` : "Not accepted.")
    : a.status === "unknown" ? "Not on our list."
    : null;
  return (
    <section className="px-box np-card np-winner" aria-label="Verdict" role="status">
      <p className="np-eyebrow">{catTitle(category)}</p>
      <h2 className="np-title">{gem ? `${gem}!` : "No gem"}</h2>
      {a.tier && (
        <p className="np-msg">
          <GemIcon tier={a.tier} size={20} /> <b>{TIER_NAMES[a.tier]}</b> · +{a.points} points{a.shared ? " (shared)" : ""}
        </p>
      )}
      {a.text && <p className="np-msg">You said <b>{a.text}</b>{a.entry && a.entry !== a.text ? <> · counted as <b>{a.entry}</b></> : null}</p>}
      {a.status === "ai-ok" && <p className="np-msg">{a.reason === "unchecked" ? "Not on our list. Accepted for now and saved for review." : "Not on our list. Checked and accepted."}</p>}
      {note && <p className="np-msg">{note}</p>}
    </section>
  );
}

function EndScreen({ s, number, onContinue, back }: { s: DIG.DigState; number: number; onContinue: () => void; back: React.ReactNode }) {
  const r = soloResult(s);
  const mine = s.results[ME] ?? [];
  const depth = depthOf(r.total);
  const zone = zoneAtDepth(depth);
  const [shares, setShares] = useState<Record<number, number | null>>({});
  const [copied, setCopied] = useState(false);
  const letter = s.letter;

  useEffect(() => {
    let live = true;
    s.categories.forEach((c, i) => {
      const a = mine[i];
      if (!a || !(a.status === "ok" || a.status === "ai-ok")) return;
      fetchShare(c, letter, a.entry ?? a.text).then((v) => { if (live) setShares((p) => ({ ...p, [i]: v })); });
    });
    return () => { live = false; };
    // The results are final here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = shareText("npat", { day: "", number, score: r.score, history: r.history, grid: r.grid, checkpoint: bandOf("npat", r.score) });
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ } };

  return (
    <PixelShell world="notebook">
      <div className="party-page np-page">
        {back}
        <DigScene depth={depth} digging={false} gems={mine.flatMap((a) => (a.tier ? [a.tier] : []))} found={null} />
        <section className={`px-box np-card np-winner ${r.total >= SOLO_MAX * 0.5 ? "px-confetti" : ""}`} aria-label="Your dig">
          <p className="np-eyebrow">Daily #{number} · letter {letter}</p>
          <h2>{depth.toLocaleString("en-US")} m deep</h2>
          <p className="np-msg">{r.total} / {SOLO_MAX} points · reached <b>{zone}</b></p>
          <GemTray results={mine} total={s.categories.length} />
          <p className="np-grid" aria-label={`Share grid: ${r.grid}`}>{r.grid}</p>
        </section>
        <section className="px-box np-card" aria-label="Your answers">
          <ul className="np-groups">
            {s.categories.map((c, i) => <AnswerRow key={c} category={c} letter={letter} a={mine[i]} share={shares[i]} />)}
          </ul>
          <ListSources categories={s.categories} />
        </section>
        <section className="px-box np-card" aria-label="Share">
          <pre className="np-msg" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>
          <PixelButton onClick={copy}>{copied ? "Copied" : "Copy"}</PixelButton>
        </section>
        <div className="party-actions">
          <p className="np-msg">Play again tomorrow</p>
          <PixelButton variant="gold" onClick={onContinue}>See today&apos;s results</PixelButton>
        </div>
      </div>
    </PixelShell>
  );
}

function AnswerRow({ category, letter, a, share }: { category: string; letter: string; a: DIG.DigAnswer | undefined; share: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState<"idle" | "sending" | "done" | "failed">("idle");
  if (!a) return null;
  const scored = a.status === "ok" || a.status === "ai-ok";
  const name = a.entry ?? a.text;
  const status = a.status === "wrong-letter" ? "wrong letter" : a.status === "ai-no" || a.status === "unknown" ? "not accepted" : null;
  const submit = async () => {
    setSent("sending");
    const ok = await sendDispute({ category, letter, answer: name, typed: a.text, reason: reason.trim(), tier: a.tier });
    setSent(ok ? "done" : "failed");
  };
  return (
    <li className={`k-${a.status === "ok" || a.status === "ai-ok" ? "ok" : a.status === "blank" ? "blank" : "voted-out"}`}>
      <p className="as">{catTitle(category)}</p>
      <div className="top">
        <span className="txt">{name || "—"}</span>
        {a.tier ? <span className={`np-badge t-${a.tier}`}>{GEMS[a.tier].name} <b>+{a.points}</b></span> : status ? <span className="np-badge miss">{status}</span> : null}
      </div>
      {a.entry && a.text && a.text !== a.entry && <p className="as">typed as {a.text}</p>}
      {scored && share != null && <p className="as">{share > 0 ? `${share}% of players said ${name}` : `Almost no one else said ${name}`}</p>}
      {a.text && sent !== "done" && !open && (
        <p className="who"><button type="button" className="underline" onClick={() => setOpen(true)} aria-label={`Dispute ${name}`}>Dispute</button></p>
      )}
      {open && sent !== "done" && (
        <form className="np-fields" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="np-field">
            <span className="lbl">Why is this wrong?</span>
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          </label>
          <PixelButton type="submit" disabled={sent === "sending"}>{sent === "sending" ? "Sending…" : "Send"}</PixelButton>
          {sent === "failed" && <p className="np-msg no" role="status">Could not send. Try again.</p>}
        </form>
      )}
      {sent === "done" && <p className="who" role="status"><em>Sent for review</em></p>}
    </li>
  );
}
