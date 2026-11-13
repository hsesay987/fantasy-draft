"use client";

import { useState } from "react";
import { Button, Chip, PageHeader, PageShell, Panel } from "../components/ui";
import { CATALOG_META, getCatalog } from "../topicDraft/catalogs";
import { DECKS } from "../topicDraft/party/decks";
import { INSYNC_DECKS } from "../topicDraft/party/insyncDecks";
import { OPTION_COUNT } from "../topicDraft/formats/imposter";
import { TEAM_MIN_PLAYERS } from "../topicDraft/formats/partytrivia";
import { MIN_PLAYERS as MAFIA_MIN, NIGHT_MS, QUIET_FIRST_NIGHT_AT, TALK_MS, VOTE_MS, rolesFor } from "../topicDraft/formats/mafia";
import { newSeed } from "../topicDraft/rng";
import { VOWEL_TOPICS } from "../topicDraft/party/vowelTopics";
import { hasTrivia } from "../topicDraft/trivia";
import { formatMeta } from "./formats";
import { CATEGORIES, category } from "./categories";
import { setRoomGame } from "./onlineApi";
import { PoolPicker } from "./PoolPicker";
import { TeamPicker } from "./TeamPicker";
import { compactTeams, splitTeams, type TeamMap } from "./teamMoves";
import { DEFAULT_OPTS, type GameSetup } from "./types";
import { DrinkingToggle, ShowVotesToggle } from "./views/partyBits";

/** Topics Imposter can use: any character pool big enough for a secret plus look-alikes to guess from. */
export const IMPOSTER_TOPICS = CATALOG_META.filter((m) => m.kind === "character" && getCatalog(m.id).length >= OPTION_COUNT);

/** Topics Party Trivia can use: anything with a trivia bank. */
const TRIVIA_TOPICS = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

/** The host's setup for a party game: a topic or deck, how long, and how it ends or who plays with whom. Saves to the room. `seats` is the room's current players. */
export function PartySetup({ format, room, seats = [] }: { format: "imposter" | "vote" | "insync" | "partytrivia" | "mafia" | "vowelplay" | "vowelparty"; room: { code: string; token: string; pool?: string; pools?: string[]; onDone: () => void; onCancel: () => void }; seats?: string[] }) {
  const meta = formatMeta(format)!;
  const decks = format === "insync" ? INSYNC_DECKS : DECKS;
  const options: { id: string; title: string; blurb?: string }[] =
    format === "imposter" ? IMPOSTER_TOPICS.map((t) => ({ id: t.id, title: category(t.id)?.title ?? t.title }))
    : format === "partytrivia" ? TRIVIA_TOPICS.map((t) => ({ id: t.id, title: t.title }))
    : format === "vowelplay" || format === "vowelparty" ? VOWEL_TOPICS.map((t) => ({ id: t.id, title: t.title }))
    : format === "mafia" ? []
    : decks.map((d) => ({ id: d.id, title: d.title, blurb: d.blurb }));
  // Start from the room's last mix when it still fits this format, otherwise one default topic.
  const [pools, setPools] = useState<string[]>(() => {
    if (format === "mafia") return ["mafia"];
    const ids = options.map((o) => o.id);
    const last = [...new Set(room.pools?.length ? room.pools : room.pool ? [room.pool] : [])].filter((p) => ids.includes(p));
    if (last.length) return last;
    return [format === "imposter" && ids.includes("superheroes") ? "superheroes" : format === "insync" && ids.includes("friends") ? "friends" : ids[0]!];
  });
  const [length, setLength] = useState(format === "imposter" ? 2 : format === "partytrivia" ? 10 : format === "vowelplay" ? 15 : format === "vowelparty" ? 10 : 8);
  const [vowelMode, setVowelMode] = useState<"first" | "duel">("first");
  const [vowelAnswer, setVowelAnswer] = useState<"voice" | "type">("voice");
  const vowel = format === "vowelplay" || format === "vowelparty";
  /** Party Trivia and Vowel Party: everyone answers on their phone, or buzz in at the table. */
  const [answer, setAnswer] = useState<"phones" | "buzz">("phones");
  const buzzable = format === "partytrivia" || format === "vowelparty";
  const [teams, setTeams] = useState(0);
  const [teamMap, setTeamMap] = useState<TeamMap>({});
  const [ending, setEnding] = useState<"guess" | "vote">("guess");
  const [drinking, setDrinking] = useState(false);
  const [showVotes, setShowVotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamFormat = format === "partytrivia" || format === "vote" || format === "imposter" || format === "vowelparty";
  const teamsOpen = teamFormat && seats.length >= TEAM_MIN_PLAYERS;
  const pickTeams = (n: number) => {
    setTeams(n);
    setTeamMap(n ? splitTeams(seats, n, newSeed()) : {});
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const teamOpts = teamsOpen && teams ? compactTeams(seats, teams, teamMap) : { teams: 0, teamMap: {} };
    const setup: GameSetup = {
      id: "", format, pool: pools[0]!, pools, players: [], aiPlayers: [], mission: { id: "party", title: meta.title, blurb: "", weights: { fun: 1 } },
      mystery: false, loadout: null, roles: [], opts: { ...DEFAULT_OPTS, teamSize: length, ending, drinking, showVotes, vowelMode, vowelAnswer, answer: buzzable ? answer : "phones", ...teamOpts }, seed: 0,
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
        <Panel title="Topic" hint="The secret is picked from the topics you select. Pick several to mix them.">
          <PoolPicker options={options} value={pools} onChange={setPools} />
        </Panel>
      ) : format === "partytrivia" ? (
        <Panel title="Topic" hint="Questions come from the topics you select. Pick several to mix them.">
          <PoolPicker options={options} value={pools} onChange={setPools} />
        </Panel>
      ) : vowel ? (
        <Panel title="Topic" hint="Names come from the topics you select. Each word shows its own topic as the only hint.">
          <PoolPicker options={options} value={pools} onChange={setPools} />
        </Panel>
      ) : format === "mafia" ? (
        <MafiaTown seats={seats.length} />
      ) : (
        <Panel title={decks.length > 1 ? "Decks" : "Deck"} hint="Pick one deck, or several to mix them.">
          <PoolPicker options={options} value={pools} onChange={setPools} />
        </Panel>
      )}

      {format === "vowelplay" && (
        <>
          <Panel title="Mode" hint={vowelMode === "duel" ? "Exactly 2 players. Each word pulls the marker one step. 5 steps ahead wins." : "The first right answer takes each word's point. Most points wins."}>
            <div className="flex flex-wrap gap-2">
              <Chip selected={vowelMode === "first"} onClick={() => setVowelMode("first")}>First correct</Chip>
              <Chip selected={vowelMode === "duel"} onClick={() => setVowelMode("duel")}>Head to head</Chip>
            </div>
          </Panel>
          <Panel title="Answer" hint={vowelAnswer === "voice" ? "Best in the same room or on a call." : "Everyone types on their own phone."}>
            <div className="flex flex-wrap gap-2">
              <Chip selected={vowelAnswer === "voice"} onClick={() => setVowelAnswer("voice")}>Voice</Chip>
              <Chip selected={vowelAnswer === "type"} onClick={() => setVowelAnswer("type")}>Type</Chip>
            </div>
          </Panel>
          {vowelMode === "first" && (
            <Panel title="Words">
              <div className="flex flex-wrap gap-2">
                {[10, 15, 20].map((n) => <Chip key={n} selected={length === n} onClick={() => setLength(n)}>{n}</Chip>)}
              </div>
            </Panel>
          )}
        </>
      )}

      {buzzable && (
        <Panel title="Answer" hint={answer === "buzz" ? "Buzz is for playing in one room: first to buzz answers." : "Everyone answers on their own phone."}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={answer === "phones"} onClick={() => setAnswer("phones")}>On phones</Chip>
            <Chip selected={answer === "buzz"} onClick={() => setAnswer("buzz")}>Buzz</Chip>
          </div>
        </Panel>
      )}

      {format === "vowelplay" || format === "mafia" ? null : format === "vowelparty" ? (
        <Panel title="Words">
          <p className="text-sm text-muted-foreground">{answer === "buzz" ? "10 words, 20 seconds each. First to buzz says it out loud, and the rest judge." : "10 words, 20 seconds each. Everyone types on their own phone."}</p>
        </Panel>
      ) : format === "insync" ? (
        <Panel title="Rounds">
          <p className="text-sm text-muted-foreground">One round per player, so everyone gets the mic. Never fewer than 4.</p>
        </Panel>
      ) : (
        <Panel title={format === "imposter" ? "Clue rounds" : format === "partytrivia" ? "Questions" : "Cards"}>
          <div className="flex flex-wrap gap-2">
            {(format === "imposter" ? [1, 2, 3] : format === "partytrivia" ? [10, 15, 20] : [5, 8, 12]).map((n) => <Chip key={n} selected={length === n} onClick={() => setLength(n)}>{n}</Chip>)}
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

      {teamFormat && (
        teamsOpen ? (
          <Panel title="Teams" hint={format === "partytrivia" ? "Each member votes. The team's answer is its most-voted option." : "Everyone still plays for themselves. A team's score is its players' points added up."}>
            <div className="flex flex-wrap gap-2">
              {[0, 2, 3, 4].map((n) => <Chip key={n} selected={teams === n} onClick={() => pickTeams(n)}>{n === 0 ? "No teams" : `${n} teams`}</Chip>)}
            </div>
            {teams > 0 && <TeamPicker players={seats} teams={teams} map={teamMap} onChange={setTeamMap} />}
          </Panel>
        ) : <p className="text-sm text-muted-foreground">Teams open up with {TEAM_MIN_PLAYERS} or more players.</p>
      )}

      {format === "vote" && (
        <Panel title="Show votes" hint="On by default.">
          <ShowVotesToggle value={showVotes} onChange={setShowVotes} />
        </Panel>
      )}

      {format !== "vowelplay" && (
        <Panel title="Drinking mode" hint="Optional. Off by default.">
          <DrinkingToggle value={drinking} onChange={setDrinking} />
        </Panel>
      )}

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex gap-3">
        <Button variant="accent" className="flex-1" disabled={busy} onClick={save}>{busy ? "Saving…" : "Use this game"}</Button>
        <Button variant="ghost" onClick={room.onCancel}>Back</Button>
      </div>
    </PageShell>
  );
}

const castLine = (n: number) => {
  const c = rolesFor(n);
  return `${c.mafia} mafia, a doctor${c.detective ? ", a detective" : ""}, and the rest villagers`;
};

/** What the host needs before starting Mafia: there's nothing to pick, so this says who's in the town and how long it runs. */
function MafiaTown({ seats }: { seats: number }) {
  return (
    <Panel title="The town" hint={seats < MAFIA_MIN ? `Mafia needs at least ${MAFIA_MIN} players. ${seats} here so far, and friends can still join.` : `${seats} players: ${castLine(seats)}.`}>
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>5 to 6 players: {castLine(5)}.</li>
        <li>7 to 8 players: {castLine(7)}.</li>
        <li>9 to 12 players: {castLine(9)}.</li>
        <li>With exactly {QUIET_FIRST_NIGHT_AT} players, nobody leaves on the first night.</li>
        <li>Night {NIGHT_MS / 1000} seconds, talk {TALK_MS / 60000} minutes, vote {VOTE_MS / 1000} seconds. About 10 minutes at 5 players, up to about 18 at 12.</li>
      </ul>
    </Panel>
  );
}
