"use client";

import { useState } from "react";
import { Button, Chip, PageHeader, PageShell, Panel } from "../components/ui";
import { CATALOG_META, getCatalog } from "../topicDraft/catalogs";
import { DECKS } from "../topicDraft/party/decks";
import { INSYNC_DECKS } from "../topicDraft/party/insyncDecks";
import { OPTION_COUNT } from "../topicDraft/formats/imposter";
import { formatMeta } from "./formats";
import { category } from "./categories";
import { setRoomGame } from "./onlineApi";
import { DEFAULT_OPTS, type GameSetup } from "./types";
import { DrinkingToggle, ShowVotesToggle } from "./views/partyBits";

/** Topics Imposter can use: any character pool big enough for a secret plus look-alikes to guess from. */
export const IMPOSTER_TOPICS = CATALOG_META.filter((m) => m.kind === "character" && getCatalog(m.id).length >= OPTION_COUNT);

/** The host's setup for a party game: a topic or deck, how long, and (Imposter) how it ends. Saves to the room. */
export function PartySetup({ format, room }: { format: "imposter" | "vote" | "insync"; room: { code: string; token: string; pool?: string; onDone: () => void; onCancel: () => void } }) {
  const meta = formatMeta(format)!;
  const decks = format === "insync" ? INSYNC_DECKS : DECKS;
  const [pool, setPool] = useState(() => {
    if (format === "imposter") return IMPOSTER_TOPICS.some((t) => t.id === room.pool) ? room.pool! : "superheroes";
    const ids = decks.map((d) => d.id);
    return ids.includes(room.pool ?? "") ? room.pool! : format === "insync" ? "friends" : ids[0]!;
  });
  const [length, setLength] = useState(format === "imposter" ? 2 : 8);
  const [ending, setEnding] = useState<"guess" | "vote">("guess");
  const [drinking, setDrinking] = useState(false);
  const [showVotes, setShowVotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const setup: GameSetup = {
      id: "", format, pool, players: [], aiPlayers: [], mission: { id: "party", title: meta.title, blurb: "", weights: { fun: 1 } },
      mystery: false, loadout: null, roles: [], opts: { ...DEFAULT_OPTS, teamSize: length, ending, drinking, showVotes }, seed: 0,
    };
    const r = await setRoomGame(room.code, room.token, setup);
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Couldn't save the game");
    room.onDone();
  };

  return (
    <PageShell width="sm">
      <PageHeader title={meta.title} subtitle={meta.tagline} icon={meta.icon} gradient={meta.gradient} />
      <Panel title="How it works">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{meta.how.map((h) => <li key={h}>{h}</li>)}</ol>
      </Panel>

      {format === "imposter" ? (
        <Panel title="Topic" hint="The secret is picked from this topic.">
          <div className="flex flex-wrap gap-2">
            {IMPOSTER_TOPICS.map((t) => <Chip key={t.id} selected={pool === t.id} onClick={() => setPool(t.id)}>{category(t.id)?.title ?? t.title}</Chip>)}
          </div>
        </Panel>
      ) : (
        <Panel title="Deck">
          <div className="grid gap-2 sm:grid-cols-2">
            {decks.map((d) => (
              <button key={d.id} type="button" onClick={() => setPool(d.id)} aria-pressed={pool === d.id}
                className={`rounded-xl border p-3 text-left ${pool === d.id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <b className="block">{d.title}</b><span className="text-sm text-muted-foreground">{d.blurb}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {format === "insync" ? (
        <Panel title="Rounds">
          <p className="text-sm text-muted-foreground">One round per player, so everyone gets the mic. Never fewer than 4.</p>
        </Panel>
      ) : (
        <Panel title={format === "imposter" ? "Clue rounds" : "Cards"}>
          <div className="flex flex-wrap gap-2">
            {(format === "imposter" ? [1, 2, 3] : [5, 8, 12]).map((n) => <Chip key={n} selected={length === n} onClick={() => setLength(n)}>{n}</Chip>)}
          </div>
        </Panel>
      )}

      {format === "imposter" && (
        <Panel title="How it ends">
          <div className="grid gap-2 sm:grid-cols-2">
            {([["guess", "Imposter can guess", "The imposter can name the secret any time. Right wins, wrong loses. Caught imposters get one last guess."], ["vote", "Vote only", "After the clues, everyone votes. Catch the imposter to win."]] as const).map(([id, title, blurb]) => (
              <button key={id} type="button" onClick={() => setEnding(id)} aria-pressed={ending === id}
                className={`rounded-xl border p-3 text-left ${ending === id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <b className="block">{title}</b><span className="text-sm text-muted-foreground">{blurb}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {format === "vote" && (
        <Panel title="Show votes" hint="On by default.">
          <ShowVotesToggle value={showVotes} onChange={setShowVotes} />
        </Panel>
      )}

      <Panel title="Drinking mode" hint="Optional. Off by default.">
        <DrinkingToggle value={drinking} onChange={setDrinking} />
      </Panel>

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex gap-3">
        <Button variant="accent" className="flex-1" disabled={busy} onClick={save}>{busy ? "Saving…" : "Use this game"}</Button>
        <Button variant="ghost" onClick={room.onCancel}>Back</Button>
      </div>
    </PageShell>
  );
}
