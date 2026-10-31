"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSound } from "../components/SoundProvider";
import { PixelBox, PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { Sprite } from "../components/pixel/Sprite";
import { WorldScene } from "../components/pixel/WorldScene";
import { checkpointAt, LAUNCH } from "../components/pixel/worlds";
import { loadBank, poolFor, type Bank } from "./data";
import { ANY, BOTS, botGuess, BULLSEYE, closeness, CURRENCIES, currencyFor, digitsHint, money, priceIn, rangeHint, roundGain, shuffle, wheelFor, type CurrencyChoice, type Product } from "./game";
import { PixelWheel, WHEEL_COLORS, type WheelHandle } from "./PixelWheel";
import { ProductPhoto } from "./ProductPhoto";

// Ranks by how close the guess was, named like a space programme.
const RANKS: [number, string][] = [[BULLSEYE, "ONE IN A GALAXY"], [0.8, "DEEP SPACE"], [0.6, "ASTRONAUT"], [0.4, "CADET"], [0, "TOURIST"]];
const rankOf = (close: number) => RANKS.find(([min]) => close >= min)![1];
// Bolt, the launch-pad robot who reads out the hints.
const BOLT = { rows: ["......a.......", "......a.......", "....mmmmmm....", "...mMMMMMMm...", "...mMeMMeMm...", "...mMMMMMMm...", "...mMMggMMm...", "....mmmmmm....", "..bbbbbbbbbb..", ".bbBBBBBBBBbb.", ".bbBBccccBBbb.", "..bbBBBBBBbb..", "...bb....bb...", "...kk....kk..."], pal: { a: "#ffd23f", m: "#2b2d42", M: "#9aa3c8", e: "#4cc9f0", g: "#ff4d6d", b: "#2b2d42", B: "#7c88b8", c: "#ffd23f", k: "#1a1033" } };

function Host({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="px-host" aria-live="polite">
      <Sprite sprite={BOLT} size={56} label="Bolt the robot" />
      <div className="grid gap-2">{lines.map((l) => <p key={l} className="bubble m-0">{l}</p>)}</div>
    </div>
  );
}

type Toggles = { desc: boolean; cat: boolean; fog: boolean; timer: boolean; twice: boolean; bots: boolean };
const TOGGLE_INFO: { key: keyof Toggles; title: string; sub: string }[] = [
  { key: "desc", title: "Description", sub: "Brand, size and tags" },
  { key: "cat", title: "Category and store", sub: "Where it sits on the shelf" },
  { key: "fog", title: "Blurred photo", sub: "Clears up with each hint" },
  { key: "timer", title: "15 second timer", sub: "Beat the clock" },
  { key: "twice", title: "Two guesses", sub: "A higher or lower nudge" },
  { key: "bots", title: "Race two bots", sub: "Ava and Max join" },
];
const DEFAULT_TOGGLES: Toggles = { desc: true, cat: true, fog: false, timer: false, twice: false, bots: true };
const FOG = [14, 6, 0];

type Round = { product: Product; currency: string; truth: number; hints: number; tries: number; nudge: string | null; hintText: string[]; result: { guess: number; close: number } | null };

export function CostimationGame() {
  const { play } = useSound();
  const [bank, setBank] = useState<Bank | null>(null);
  const [country, setCountry] = useState(ANY);
  const [store, setStore] = useState(ANY);
  const [currency, setCurrency] = useState<CurrencyChoice>("local");
  const [rounds, setRounds] = useState(5);
  const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    loadBank(ac.signal).then(setBank);
    return () => ac.abort();
  }, []);

  if (!started) {
    const places = bank?.places ?? [];
    const stores = country === ANY ? [...new Set(places.flatMap((p) => p.stores))].sort() : places.find((p) => p.code === country)?.stores ?? [];
    const { pool, widened } = bank ? poolFor(bank, { country, store }) : { pool: [], widened: false };
    return (
      <PixelShell world="launch">
        <PixelBox>
          <p className="px-eyebrow">COSTIMATION</p>
          <h1 className="mt-2">Guess the price. Cross the solar system.</h1>
          <p className="px-note mt-2">Spin the wheel for a real shelf product. The closer your guess, the further your ship flies: from Earth past the Moon, Mars, Jupiter and Saturn, all the way to Pluto.</p>
          {bank && !bank.live && <p className="px-hint mt-4">Live prices are not reachable right now, so this round uses a small set of sample products with approximate prices.</p>}
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="px-field"><label htmlFor="c-country">PRODUCT FROM</label>
              <select id="c-country" className="px-select" value={country} onChange={(e) => { setCountry(e.target.value); setStore(ANY); }}>
                <option value={ANY}>Any country</option>{places.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select></div>
            <div className="px-field"><label htmlFor="c-store">STORE</label>
              <select id="c-store" className="px-select" value={store} onChange={(e) => setStore(e.target.value)}>
                <option value={ANY}>Any store</option>{stores.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div className="px-field"><label htmlFor="c-cur">CURRENCY</label>
              <select id="c-cur" className="px-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="local">Store&apos;s own currency</option><option value="random">Random each round</option>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div className="px-field"><label htmlFor="c-rounds">ROUNDS</label>
              <select id="c-rounds" className="px-select" value={rounds} onChange={(e) => setRounds(+e.target.value)}>{[3, 5, 8].map((n) => <option key={n}>{n}</option>)}</select></div>
          </div>
          <p className="px-lab mt-6">POWER-UPS</p>
          <div className="px-toggles">
            {TOGGLE_INFO.map((t) => (
              <label key={t.key} className="px-tog"><input type="checkbox" checked={toggles[t.key]} onChange={(e) => setToggles({ ...toggles, [t.key]: e.target.checked })} /><span>{t.title}<small>{t.sub}</small></span></label>
            ))}
          </div>
          {bank && widened && <p className="px-note mt-4">Not many products match those filters, so the wheel will use every country and store.</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PixelButton variant="gold" disabled={!bank} onClick={() => { play("pick"); setStarted(true); }}>{bank ? "PRESS START" : "LOADING…"}</PixelButton>
            {bank && <span className="px-note">{pool.length} products in the pool</span>}
            <Link href="/trivia" className="px-note underline">Back to Trivia</Link>
          </div>
          <p className="px-note mt-6">Product data and photos: <a href="https://prices.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="underline">Open Prices</a> and <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="underline">Open Food Facts</a> contributors, ODbL. Photos CC BY-SA.</p>
        </PixelBox>
      </PixelShell>
    );
  }
  return <Play bank={bank!} filters={{ country, store }} currency={currency} total={rounds} toggles={toggles} onExit={() => setStarted(false)} />;
}

export type DailyRun = { products: Product[]; onFinish: (r: { score: number; closes: number[]; history: number[] }) => void };

/** One Costimation game. In daily mode the products are fixed (no wheel, no bots) and the result goes to `daily.onFinish`. */
export function Play({ bank, filters, currency, total: totalIn, toggles, onExit, daily }: { bank: Bank; filters: { country: string; store: string }; currency: CurrencyChoice; total: number; toggles: Toggles; onExit: () => void; daily?: DailyRun }) {
  const total = daily ? daily.products.length : totalIn;
  const { play } = useSound();
  const pool = useMemo(() => poolFor(bank, filters).pool, [bank, filters]);
  const players = useMemo(() => ["YOU", ...(toggles.bots && !daily ? BOTS.map((b) => b.name) : [])], [toggles.bots, daily]);
  const closes = useRef<number[]>([]);
  const history = useRef<number[]>([]);
  const [roundNo, setRoundNo] = useState(1);
  const [progress, setProgress] = useState<Record<string, number>>(() => Object.fromEntries(players.map((p) => [p, 0])));
  const played = useRef(new Set<string>());
  const [items, setItems] = useState<Product[]>(() => wheelFor(pool, played.current));
  const [spinning, setSpinning] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [guess, setGuess] = useState("");
  const [left, setLeft] = useState(15);
  const wheel = useRef<WheelHandle>(null);
  const roundRef = useRef<Round | null>(null);
  roundRef.current = round;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const done = round?.result != null && roundNo >= total;

  useEffect(() => {
    if (!daily || round) return;
    const product = daily.products[roundNo - 1];
    if (!product) return;
    setRound({ product, currency: product.currency, truth: product.price, hints: 0, tries: 0, nudge: null, hintText: [], result: null });
    setGuess(""); setLeft(15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, roundNo, round]);

  const spin = async () => {
    if (spinning || !items.length) return;
    setSpinning(true); play("pick");
    const idx = Math.floor(Math.random() * items.length);
    await wheel.current?.spin(idx, () => play("tick"));
    const product = items[idx]!;
    const cur = currencyFor(currency, product);
    played.current.add(product.id);
    setRound({ product, currency: cur, truth: priceIn(product, cur), hints: 0, tries: 0, nudge: null, hintText: [], result: null });
    setGuess(""); setLeft(15); setSpinning(false); play("reveal");
  };

  // Side effects (progress, sound) run here, outside any state updater, so React's double-invoked updaters cannot apply them twice.
  const lock = useCallback((timedOut = false) => {
    const r = roundRef.current;
    if (!r || r.result) return;
    const g = Math.max(0, parseFloat(guess) || 0);
    if (toggles.twice && r.tries === 0 && !timedOut) {
      setGuess("");
      setRound({ ...r, tries: 1, nudge: g < r.truth ? "HIGHER! One more try." : "LOWER! One more try." });
      return;
    }
    const close = closeness(g, r.truth);
    closes.current.push(close);
    history.current.push(Math.min(1, (progressRef.current.YOU ?? 0) + roundGain(close, r.hints, total)));
    setProgress((prev) => {
      const next = { ...prev };
      next.YOU = Math.min(1, (prev.YOU ?? 0) + roundGain(close, r.hints, total));
      for (const b of BOTS) if (b.name in prev) next[b.name] = Math.min(1, prev[b.name]! + roundGain(closeness(botGuess(r.truth, b.skill), r.truth), 0, total));
      return next;
    });
    setRound({ ...r, result: { guess: g, close } });
    play(close >= BULLSEYE ? "win" : close >= 0.6 ? "pick" : "lose");
  }, [guess, toggles.twice, total, play]);

  // Countdown for the timer power-up.
  useEffect(() => {
    if (!toggles.timer || !round || round.result) return;
    if (left <= 0) { lock(true); return; }
    const t = setTimeout(() => { setLeft((v) => v - 1); if (left <= 6) play("tick"); }, 1000);
    return () => clearTimeout(t);
  }, [toggles.timer, round, left, lock, play]);

  const hint = () => {
    setRound((r) => {
      if (!r || r.hints >= 2 || r.result) return r;
      const text = r.hints === 0 ? (() => { const [lo, hi] = rangeHint(r.truth); return `It costs between ${money(lo, r.currency)} and ${money(hi, r.currency)}.`; })() : `The price has ${digitsHint(r.truth)} digit${digitsHint(r.truth) === 1 ? "" : "s"} before the decimal point.`;
      return { ...r, hints: r.hints + 1, hintText: [...r.hintText, text] };
    });
  };

  const next = () => {
    if (roundNo >= total) return;
    setRoundNo(roundNo + 1); setRound(null); if (!daily) setItems(wheelFor(pool, played.current)); play("click");
  };

  const result = round?.result ?? null;
  const ranking = Object.entries(progress).sort((a, b) => b[1] - a[1]);
  const blur = toggles.fog ? FOG[round?.hints ?? 0]! : 0;

  return (
    <PixelShell world="launch">
      <div className="space-y-6">
        <WorldScene world="launch" caption="Altitude" actors={players.map((p) => ({ name: p, value: progress[p] ?? 0 }))} winner={done && !daily && ranking[0]![1] > (ranking[1]?.[1] ?? -1) ? ranking[0]![0] : null}
          flash={result ? { key: roundNo, good: result.close >= 0.6 } : undefined} />
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {daily ? (
            <PixelBox className="grid gap-3">
              <p className="px-eyebrow">TODAY&apos;S CARGO · {roundNo} / {total}</p>
              <ol className="m-0 grid list-none gap-2 p-0">
                {daily.products.map((p, i) => {
                  const c = closes.current[i];
                  return <li key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-[20px] ${i === roundNo - 1 ? "bg-[var(--px-violet)]" : "bg-[var(--px-ink)]"}`}><span className="truncate">{i < roundNo - 1 || (i === roundNo - 1 && result) ? p.name : `Product ${i + 1}`}</span>{c != null && <b className="font-normal" style={{ color: c >= 0.8 ? "var(--px-mint)" : c >= 0.4 ? "var(--px-gold)" : "var(--px-rose)" }}>{Math.round(c * 100)}%</b>}</li>;
                })}
              </ol>
            </PixelBox>
          ) : (
          <PixelBox className="grid justify-items-center gap-3">
            <p className="px-eyebrow justify-self-start">ROUND {roundNo} / {total}</p>
            <PixelWheel ref={wheel} segments={Math.max(2, items.length)} />
            <PixelButton disabled={spinning || !!round} onClick={spin}>{spinning ? "SPINNING…" : "SPIN!"}</PixelButton>
            <ul className="m-0 grid w-full list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-[18px]">
              {items.map((p, i) => <li key={p.id} className="flex min-w-0 items-center gap-2"><i className="h-3.5 w-3.5 shrink-0" style={{ background: WHEEL_COLORS[i % 8] }} /><span className="truncate">{p.name}</span></li>)}
            </ul>
          </PixelBox>
          )}

          <PixelBox>
            {!round ? <p className="px-note">Spin the wheel. The product appears here.</p> : (
              <div className="grid gap-4">
                <ProductPhoto product={round.product} blur={blur} />
                <div>
                  <h2>{round.product.name.toUpperCase()}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {toggles.cat && round.product.category && <span className="px-chip">{round.product.category}</span>}
                    {toggles.cat && <span className="px-chip">{round.product.store}</span>}
                    <span className="px-chip">{round.product.countryName}</span>
                    <span className="px-chip">PRICE IN {round.currency}{currency === "random" ? " (RANDOM)" : ""}</span>
                  </div>
                </div>
                {toggles.desc && (round.product.brand || round.product.quantity) && <p className="px-hint">{[round.product.brand, round.product.quantity].filter(Boolean).join(" · ")}</p>}
                {toggles.timer && !result && <div className="px-seg" aria-label={`${left} seconds left`}>{Array.from({ length: 15 }, (_, i) => <i key={i} className={i < left ? "" : "off"} />)}</div>}
                <Host lines={[...round.hintText, ...(round.nudge && !result ? [round.nudge] : [])]} />
                {!result ? (
                  <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); lock(); }}>
                    <label className="px-lab" htmlFor="c-guess">YOUR GUESS</label>
                    <div className="flex items-center gap-3">
                      <span className="font-[family-name:var(--px-head)] text-xl text-[var(--px-gold)]">{round.currency}</span>
                      <input id="c-guess" type="number" min={0} step="any" inputMode="decimal" autoFocus value={guess} onChange={(e) => setGuess(e.target.value)} className="px-num w-full max-w-[240px] !text-[38px]" />
                    </div>
                    <div className="flex flex-wrap">
                      <PixelButton type="submit" disabled={!guess}>LOCK IN</PixelButton>
                      <PixelButton variant="alt" disabled={round.hints >= 2} onClick={hint}>HINT (-20%)</PixelButton>
                    </div>
                  </form>
                ) : (
                  <div className="grid gap-2">
                    <p className="font-[family-name:var(--px-head)] text-xs leading-[1.9] text-[var(--px-gold)]">
                      {rankOf(result.close)}{result.close >= BULLSEYE ? " · BULLSEYE!" : ` · ${Math.round(result.close * 100)}% CLOSE`}<br />IT COSTS {money(round.truth, round.currency)}
                    </p>
                    <Scale truth={round.truth} guess={result.guess} />
                    {!done && <div><PixelButton variant="gold" onClick={next}>NEXT {daily ? "PRODUCT" : "ROUND"}</PixelButton></div>}
                    {done && daily && <div><PixelButton variant="gold" onClick={() => daily.onFinish({ score: progress.YOU ?? 0, closes: closes.current, history: history.current })}>SEE YOUR STATS</PixelButton></div>}
                  </div>
                )}
              </div>
            )}
          </PixelBox>
        </div>

        {done && !daily && (
          <PixelBox>
            <p className="px-eyebrow">MISSION COMPLETE</p>
            <h2 className="mt-2">{ranking[0]![0]} reaches {checkpointAt(LAUNCH, ranking[0]![1]).name}</h2>
            <ol className="m-0 mt-3 grid list-none gap-2 p-0">
              {ranking.map(([p, v], i) => <li key={p} className="flex justify-between bg-[var(--px-ink)] px-3 py-2 text-[22px]"><span>{i + 1}. {p}</span><b className="font-normal text-[var(--px-gold)]">{Math.round(v * 100)}% altitude</b></li>)}
            </ol>
            <div className="mt-3"><PixelButton variant="gold" onClick={onExit}>PLAY AGAIN</PixelButton></div>
          </PixelBox>
        )}
      </div>
    </PixelShell>
  );
}

function Scale({ truth, guess }: { truth: number; guess: number }) {
  const max = Math.max(truth * 2, guess * 1.05);
  const pos = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  return (
    <div className="px-scale" role="img" aria-label={`Actual price ${truth.toFixed(2)}, your guess ${guess}`}>
      <b style={{ left: pos(truth) }}><em className="t">ACTUAL</em></b>
      <b className="me" style={{ left: pos(guess) }}><em className="b">YOU</em></b>
    </div>
  );
}
