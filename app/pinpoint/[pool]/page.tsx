"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, Crosshair, Shuffle } from "lucide-react";
import { Button, PageHeader, PageShell, Panel, controlCls } from "../../components/ui";
import { CharacterAvatar } from "../../components/CharacterAvatar";
import { useSound } from "../../components/SoundProvider";
import { catalogMeta, getCatalog } from "../../topicDraft/catalogs";
import { statName } from "../../topicDraft/traits";
import { MAX_GUESSES, compare, dailyAnswer, dayNumber, shareGrid, type Hint } from "../../topicDraft/pinpoint";
import type { Item } from "../../topicDraft/types";
import { PINPOINT_TOPICS, loadPinpoint, savePinpoint } from "../topics";
import { track } from "../../lib/analytics";

const HEAT = { hit: "bg-emerald-500/25 border-emerald-400/60", warm: "bg-amber-400/20 border-amber-300/50", cold: "bg-white/5 border-white/10" } as const;

export default function PinpointGame() {
  const { pool } = useParams<{ pool: string }>();
  const topic = PINPOINT_TOPICS.find((t) => t.id === pool);
  const items = useMemo(() => getCatalog(pool), [pool]);
  const keys = catalogMeta(pool)?.statKeys ?? [];
  const day = dayNumber();
  const { play } = useSound();
  const [practice, setPractice] = useState<Item | null>(null);
  const answer = practice ?? (items.length ? dailyAnswer(items, pool, day) : null);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!practice) setGuesses(loadPinpoint(pool, day)?.guesses ?? []);
  }, [pool, day, practice]);

  if (!topic || !answer) return notFound();
  const byId = new Map(items.map((i) => [i.id, i]));
  const hints: Hint[] = guesses.map((id) => compare(byId.get(id)!, answer, keys)).filter((h) => h.item);
  const won = hints.some((h) => h.correct);
  const over = won || hints.length >= MAX_GUESSES;
  const q = text.trim().toLowerCase();
  const matches = q.length >= 1 ? items.filter((i) => !guesses.includes(i.id) && i.name.toLowerCase().includes(q)).slice(0, 8) : [];

  const submit = (item: Item) => {
    if (over || guesses.includes(item.id)) return;
    const next = [...guesses, item.id];
    setGuesses(next);
    setText("");
    const h = compare(item, answer, keys);
    const done = h.correct || next.length >= MAX_GUESSES;
    play(h.correct ? "win" : done ? "lose" : h.closeness >= 70 ? "reveal" : "click");
    if (!practice) savePinpoint(pool, day, { guesses: next, over: done, won: h.correct });
    if (done) track("pinpoint_finished", { pool, won: h.correct, guesses: next.length, practice: !!practice });
  };

  const title = `TopPic Pinpoint #${day} · ${topic.title}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareGrid(hints, practice ? `TopPic Pinpoint practice · ${topic.title}` : title, won));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <PageShell width="md">
      <PageHeader title={`Pinpoint · ${topic.title}`} subtitle={practice ? "Practice round: a random pick, not saved." : `Daily #${day}. ${MAX_GUESSES} guesses to find today's pick.`} iconSrc={topic.iconSrc} back={{ href: "/pinpoint", label: "All topics" }} />

      {!over && (
        <div className="relative">
          <label className="sr-only" htmlFor="pp-guess">Guess</label>
          <input id="pp-guess" className={`${controlCls} min-h-12 text-lg`} placeholder={`Type a name (${hints.length + 1} of ${MAX_GUESSES})`} value={text} autoComplete="off"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && matches[0] && submit(matches[0])} />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-xl border border-white/10 bg-background/95 p-1 shadow-xl backdrop-blur" role="listbox">
              {matches.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => submit(i)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-white/10">
                    <CharacterAvatar name={i.name} query={i.q} size={32} className="rounded-lg" />
                    <span className="min-w-0 truncate">{i.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{i.universe}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {over && (
        <Panel>
          <div className="flex items-center gap-4">
            <CharacterAvatar name={answer.name} query={answer.q} size={72} className="shrink-0 rounded-2xl" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{won ? `Got it in ${hints.length}!` : "Out of guesses. It was"}</p>
              <p className="truncate text-2xl font-semibold">{answer.name}</p>
              <p className="text-sm text-muted-foreground">{answer.universe} · {answer.archetype}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Share result"}</Button>
            <Button variant="ghost" onClick={() => { setPractice(items[Math.floor(Math.random() * items.length)]!); setGuesses([]); }}><Shuffle className="h-4 w-4" aria-hidden /> Practice round</Button>
            <Link href="/pinpoint" className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/5 px-5 font-semibold hover:bg-white/10">Another topic</Link>
          </div>
        </Panel>
      )}

      <ol className="space-y-3" aria-label="Your guesses">
        {[...hints].reverse().map((h) => (
          <li key={h.item.id} className={`space-y-3 rounded-2xl border p-3 ${h.correct ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-card/70"}`}>
            <div className="flex items-center gap-3">
              <CharacterAvatar name={h.item.name} query={h.item.q} size={44} className="shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{h.item.name}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden><div className={`h-full rounded-full ${h.closeness >= 80 ? "bg-emerald-400" : h.closeness >= 50 ? "bg-amber-300" : "bg-rose-400"}`} style={{ width: `${h.closeness}%` }} /></div>
              </div>
              <span className="shrink-0 text-xl font-semibold tabular-nums" aria-label={`${h.closeness} percent close`}>{h.closeness}%</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className={`rounded-full border px-2.5 py-1 ${h.universe ? HEAT.hit : HEAT.cold}`}>{h.item.universe}{h.universe ? " ✓" : ""}</span>
              <span className={`rounded-full border px-2.5 py-1 ${h.archetype ? HEAT.hit : HEAT.cold}`}>{h.item.archetype}{h.archetype ? " ✓" : ""}</span>
              {h.shared.map((t) => <span key={t} className={`rounded-full border px-2.5 py-1 ${HEAT.hit}`}>#{t}</span>)}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {h.stats.map((s) => (
                <div key={s.key} className={`rounded-lg border px-2 py-1.5 text-center ${HEAT[s.heat]}`}>
                  <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{statName(s.key)}</p>
                  <p className="flex items-center justify-center gap-0.5 font-semibold tabular-nums">
                    {s.guess}
                    {s.dir === "up" && <ArrowUp className="h-3.5 w-3.5" aria-label="answer is higher" />}
                    {s.dir === "down" && <ArrowDown className="h-3.5 w-3.5" aria-label="answer is lower" />}
                  </p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      {hints.length === 0 && (
        <Panel title="How to play">
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li><Crosshair className="mr-1 inline h-4 w-4" aria-hidden /> Guess any {topic.title.toLowerCase()} pick. The closeness score shows how near you are.</li>
            <li>Green tags match the answer: same group, same type, shared tags.</li>
            <li>Each stat shows your guess's value. The arrow says if the answer's is higher or lower; green is within 4, yellow within 12.</li>
          </ul>
        </Panel>
      )}
    </PageShell>
  );
}
