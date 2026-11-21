"use client";

import { useState } from "react";
import { Button, Chip, PageHeader, PageShell, Panel } from "../components/ui";
import { NPAT_CATEGORIES, NPAT_SETS } from "../topicDraft/npat/categories";
import { DECKS } from "../topicDraft/party/decks";
import { INSYNC_DECKS } from "../topicDraft/party/insyncDecks";
import { TEAM_MIN_PLAYERS } from "../topicDraft/formats/partytrivia";
import { MIN_PLAYERS as MAFIA_MIN, NIGHT_MS, QUIET_FIRST_NIGHT_AT, TALK_MS, VOTE_MS, rolesFor } from "../topicDraft/formats/mafia";
import { newSeed } from "../topicDraft/rng";
import { formatMeta } from "./formats";
import { setRoomGame } from "./onlineApi";
import { NPAT_CAT, NPAT_CLASSIC_IDS, NPAT_MAX_CATS, NPAT_MIN_CATS, npatCustomCheck, npatDigCheck, npatStyleFor, type NpatCustomCheck, type NpatStyle } from "./npatSetup";
import { PoolPicker } from "./PoolPicker";
import { Stepper } from "./setupParts";
import { TeamPicker } from "./TeamPicker";
import { startPools, topicOptions } from "./topicOptions";
import { compactTeams, splitTeams, type TeamMap } from "./teamMoves";
import { DEFAULT_OPTS, NPAT_DIG_IDS, type GameSetup } from "./types";
import { DIG_CATEGORIES } from "../topicDraft/npat/rules";
import { DrinkingToggle, ShowVotesToggle } from "./views/partyBits";

/** The host's setup for a party game: a topic or deck, how long, and how it ends or who plays with whom. Saves to the room. `seats` is the room's current players. */
export function PartySetup({ format, room, seats = [] }: { format: "imposter" | "vote" | "insync" | "partytrivia" | "mafia" | "vowelplay" | "vowelparty" | "pecking" | "sayless" | "npat"; room: { code: string; token: string; pool?: string; pools?: string[]; slotPools?: string[] | null; inTournament?: boolean; /** The room's last NPAT setup, if the last game picked was NPAT. */ npat?: Pick<GameSetup, "opts" | "pool" | "pools"> | null; onDone: () => void; onCancel: () => void }; seats?: string[] }) {
  const meta = formatMeta(format)!;
  const decks = format === "insync" ? INSYNC_DECKS : DECKS;
  const options = topicOptions(format);
  // A planned tournament game opens on its slot's topics, else its own default; otherwise the room's last mix when it fits.
  const [pools, setPools] = useState<string[]>(() => startPools(format, room.slotPools, room.pools?.length ? room.pools : room.pool ? [room.pool] : [], !!room.inTournament));
  const [length, setLength] = useState(format === "imposter" ? 2 : format === "partytrivia" ? 10 : format === "vowelplay" ? 15 : format === "vowelparty" ? 10 : format === "pecking" ? 6 : 8);
  const [saylessRounds, setSaylessRounds] = useState(2);
  const [saylessWords, setSaylessWords] = useState(3);
  const [saylessSlack, setSaylessSlack] = useState(5);
  const [saylessGuard, setSaylessGuard] = useState(false);
  const [npatRounds, setNpatRounds] = useState(3);
  const [npatSeconds, setNpatSeconds] = useState(60);
  const [npatHard, setNpatHard] = useState(false);
  const [npatStop, setNpatStop] = useState(false);
  /** NPAT's Custom option: the host's own 4 to 6 categories instead of a set. */
  const [npatCustom, setNpatCustom] = useState(false);
  const [npatCats, setNpatCats] = useState<string[]>(NPAT_CLASSIC_IDS);
  /** NPAT: dig (one category at a time, exactly five) or the sheet. A planned slot's topics, else the room's last NPAT game, say which to open on. */
  const [npatStyle, setNpatStyle] = useState<NpatStyle>(() => npatStyleFor(room.slotPools?.length ? { pools: room.slotPools } : room.npat ?? null));
  const [digCats, setDigCats] = useState<string[]>(() => {
    const from = room.slotPools?.length ? room.slotPools : room.npat?.pools ?? [];
    const ids = [...new Set(from.flatMap((p) => (p.startsWith(NPAT_CAT) ? [p.slice(NPAT_CAT.length)] : NPAT_SETS.find((x) => x.id === p)?.categories ?? [])))];
    return ids.length === DIG_CATEGORIES && ids.every((id) => NPAT_CATEGORIES.some((c) => c.id === id)) ? ids : NPAT_DIG_IDS;
  });
  const digging = format === "npat" && npatStyle === "dig";
  const digCheck = digging ? npatDigCheck(digCats) : null;
  const custom = format === "npat" && !digging && npatCustom ? npatCustomCheck(npatCats, npatHard, npatRounds) : null;
  const [vowelMode, setVowelMode] = useState<"first" | "duel">("first");
  const [vowelAnswer, setVowelAnswer] = useState<"voice" | "type">("voice");
  const vowel = format === "vowelplay" || format === "vowelparty";
  /** Party Trivia and Vowel Party: everyone answers on their phone, or buzz in at the table. */
  const [answer, setAnswer] = useState<"phones" | "buzz">("phones");
  const buzzable = format === "partytrivia" || format === "vowelparty" || format === "sayless";
  const [peckMode, setPeckMode] = useState<"rank" | "name" | "mixed">("mixed");
  const [teams, setTeams] = useState(0);
  const [teamMap, setTeamMap] = useState<TeamMap>({});
  const [ending, setEnding] = useState<"guess" | "vote">("guess");
  const [drinking, setDrinking] = useState(false);
  const [showVotes, setShowVotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamFormat = format === "partytrivia" || format === "vote" || format === "imposter" || format === "vowelparty" || format === "pecking" || format === "sayless" || format === "npat";
  const teamsOpen = teamFormat && seats.length >= TEAM_MIN_PLAYERS;
  const pickTeams = (n: number) => {
    setTeams(n);
    setTeamMap(n ? splitTeams(seats, n, newSeed()) : {});
  };

  const save = async () => {
    if (custom && !custom.ok) return setError(custom.reason ?? "Pick the categories first");
    if (digCheck && !digCheck.ok) return setError(digCheck.reason ?? "Pick the categories first");
    setBusy(true);
    setError(null);
    const chosen = digging ? digCats.map((id) => `${NPAT_CAT}${id}`) : custom ? npatCats.map((id) => `${NPAT_CAT}${id}`) : pools;
    const teamOpts = teamsOpen && teams ? compactTeams(seats, teams, teamMap) : { teams: 0, teamMap: {} };
    const setup: GameSetup = {
      id: "", format, pool: chosen[0]!, pools: chosen, players: [], aiPlayers: [], mission: { id: "party", title: meta.title, blurb: "", weights: { fun: 1 } },
      mystery: false, loadout: null, roles: [], opts: { ...DEFAULT_OPTS, ...(format === "sayless" ? {} : { teamSize: length }), ending, drinking, showVotes, vowelMode, vowelAnswer, answer: buzzable ? answer : "phones", ...(format === "pecking" ? { peckMode } : {}), ...(format === "sayless" ? { saylessRounds, saylessWords, saylessSlack, saylessGuard } : {}), ...(format === "npat" ? { npatRounds, npatSeconds, npatHard, npatStop, npatStyle } : {}), ...teamOpts }, seed: 0,
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
      ) : format === "pecking" ? (
        <Panel title="Lists" hint="Questions come from the lists you select. Pick several to mix them.">
          <PoolPicker options={options} value={pools} onChange={setPools} />
        </Panel>
      ) : format === "sayless" ? (
        <Panel title="Lists and topics" hint="Words come from what you select. Pick several to mix them. Each deck has a par, the clue count a good describer hits.">
          <PoolPicker options={options} value={pools} onChange={setPools} />
        </Panel>
      ) : format === "npat" ? (
        <>
        <Panel title="Style" hint={digging ? `One letter, ${DIG_CATEGORIES} categories asked one at a time, 20 seconds each. Every answer is judged on the spot.` : "Each round, fill in every category at once before the clock runs out."}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={digging} onClick={() => setNpatStyle("dig")}>Dig (one at a time)</Chip>
            <Chip selected={!digging} onClick={() => setNpatStyle("sheet")}>Sheet (all at once)</Chip>
          </div>
        </Panel>
        {digging && digCheck ? (
          <Panel title="Your categories" hint={`Tick ${DIG_CATEGORIES}. ${digCats.length} picked.`}>
            <CategoryTicks picked={digCats} max={DIG_CATEGORIES} onChange={setDigCats} check={digCheck} />
          </Panel>
        ) : (
        <Panel title="Categories" hint="Every round fills in this set. Pick one, or choose Custom to build your own.">
          <div className="grid gap-2 sm:grid-cols-2">
            {[...topicOptions("npat").map((o) => ({ ...o, on: !npatCustom && pools[0] === o.id, pick: () => { setNpatCustom(false); setPools([o.id]); } })), { id: "custom", title: "Custom", blurb: "Pick 4 to 6 categories yourself", on: npatCustom, pick: () => setNpatCustom(true) }].map((o) => (
              <button key={o.id} type="button" onClick={o.pick} aria-pressed={o.on}
                className={`min-h-11 rounded-xl border p-3 text-left ${o.on ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <b className="block">{o.title}</b><span className="break-words text-sm text-muted-foreground">{o.blurb}</span>
              </button>
            ))}
          </div>
        </Panel>
        )}
        </>
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

      {buzzable && format !== "sayless" && (
        <Panel title="Answer" hint={answer === "buzz" ? "Buzz is for playing in one room: first to buzz answers." : "Everyone answers on their own phone."}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={answer === "phones"} onClick={() => setAnswer("phones")}>On phones</Chip>
            <Chip selected={answer === "buzz"} onClick={() => setAnswer("buzz")}>Buzz</Chip>
          </div>
        </Panel>
      )}

      {format === "sayless" && (
        <>
          <Panel title="Rounds" hint="How many times the turn goes round the table.">
            <Stepper value={saylessRounds} min={1} max={10} onChange={setSaylessRounds} label="Rounds" />
          </Panel>
          <Panel title="Words per turn" hint="How many words you get to describe with.">
            <Stepper value={saylessWords} min={2} max={8} onChange={setSaylessWords} label="Words per turn" />
          </Panel>
          <Panel title="Extra budget" hint="Clue words allowed on top of each word's par. Lower is harder.">
            <Stepper value={saylessSlack} min={0} max={15} onChange={setSaylessSlack} label="Extra budget" />
          </Panel>
          <Panel title="Answer" hint={answer === "buzz" ? "Guessers buzz and say it out loud. The describer judges what they hear." : "Guessers type their answer on their own phone."}>
            <div className="flex flex-wrap gap-2">
              <Chip selected={answer === "phones"} onClick={() => setAnswer("phones")}>Type</Chip>
              <Chip selected={answer === "buzz"} onClick={() => setAnswer("buzz")}>Buzz (say it out loud)</Chip>
            </div>
          </Panel>
          <Panel title="Par guard" hint="Guessers lose a point for each clue over par when someone else guesses it.">
            <div className="flex flex-wrap gap-2">
              <Chip selected={!saylessGuard} onClick={() => setSaylessGuard(false)}>Off</Chip>
              <Chip selected={saylessGuard} onClick={() => setSaylessGuard(true)}>On</Chip>
            </div>
          </Panel>
        </>
      )}

      {format === "npat" && custom && (
        <Panel title="Your categories" hint={`Tick ${NPAT_MIN_CATS} to ${NPAT_MAX_CATS}. ${npatCats.length} picked.`}>
          <CategoryTicks picked={npatCats} max={NPAT_MAX_CATS} onChange={setNpatCats} check={custom} />
        </Panel>
      )}

      {format === "npat" && !digging && (
        <>
          <Panel title="Rounds" hint="One letter each round.">
            <Stepper value={npatRounds} min={1} max={8} onChange={setNpatRounds} label="Rounds" />
          </Panel>
          <Panel title="Timer" hint="Seconds to fill in every category.">
            <div className="flex flex-wrap gap-2">
              {[45, 60, 90].map((n) => <Chip key={n} selected={npatSeconds === n} onClick={() => setNpatSeconds(n)}>{n} s</Chip>)}
            </div>
          </Panel>
          <Panel title="Hard letters" hint="Adds Q, X, Y and Z to the letters that can come up. Off by default.">
            <div className="flex flex-wrap gap-2">
              <Chip selected={!npatHard} onClick={() => setNpatHard(false)}>Off</Chip>
              <Chip selected={npatHard} onClick={() => setNpatHard(true)}>On</Chip>
            </div>
          </Panel>
          <Panel title="First to finish stops the clock" hint="When one player has filled every category, the round ends for everyone. Off by default.">
            <div className="flex flex-wrap gap-2">
              <Chip selected={!npatStop} onClick={() => setNpatStop(false)}>Off</Chip>
              <Chip selected={npatStop} onClick={() => setNpatStop(true)}>On</Chip>
            </div>
          </Panel>
        </>
      )}

      {format === "pecking" && (
        <Panel title="Question type" hint={peckMode === "rank" ? "Each question names an item. Guess its rank." : peckMode === "name" ? "Each question gives a rank. Name who is there." : "A mix of both kinds."}>
          <div className="flex flex-wrap gap-2">
            {([["rank", "Where does it rank?"], ["name", "Who's at #N?"], ["mixed", "Mixed"]] as const).map(([id, label]) => <Chip key={id} selected={peckMode === id} onClick={() => setPeckMode(id)}>{label}</Chip>)}
          </div>
        </Panel>
      )}

      {format === "vowelplay" || format === "mafia" ? null : format === "vowelparty" ? (
        <Panel title="Words">
          <p className="text-sm text-muted-foreground">{answer === "buzz" ? "10 words, 20 seconds each. First to buzz says it out loud, and the rest judge." : "10 words, 20 seconds each. Everyone types on their own phone."}</p>
        </Panel>
      ) : format === "sayless" || format === "npat" ? null : format === "insync" ? (
        <Panel title="Rounds">
          <p className="text-sm text-muted-foreground">One round per player, so everyone gets the mic. Never fewer than 4.</p>
        </Panel>
      ) : (
        <Panel title={format === "imposter" ? "Clue rounds" : format === "partytrivia" || format === "pecking" ? "Questions" : "Cards"}>
          <div className="flex flex-wrap gap-2">
            {(format === "imposter" ? [1, 2, 3] : format === "partytrivia" ? [10, 15, 20] : format === "pecking" ? [4, 6, 8, 10] : [5, 8, 12]).map((n) => <Chip key={n} selected={length === n} onClick={() => setLength(n)}>{n}</Chip>)}
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
          <Panel title="Teams" hint={format === "partytrivia" ? "Each member votes. The team's answer is its most-voted option." : format === "sayless" ? "Needs 2+ players on each team. Otherwise everyone plays for themselves." : "Everyone still plays for themselves. A team's score is its players' points added up."}>
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
        <Panel title="Drinking mode" hint={format === "sayless" ? "A sip for giving the word away, or a wrong buzz. Off by default." : "Optional. Off by default."}>
          <DrinkingToggle value={drinking} onChange={setDrinking} />
        </Panel>
      )}

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex gap-3">
        <Button variant="accent" className="flex-1" disabled={busy || (!!custom && !custom.ok)} onClick={save}>{busy ? "Saving…" : "Use this game"}</Button>
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

/** NPAT's category checkboxes, up to `max`, with what the check says about the pick. */
function CategoryTicks({ picked, max, onChange, check }: { picked: string[]; max: number; onChange: (f: (cur: string[]) => string[]) => void; check: NpatCustomCheck }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {NPAT_CATEGORIES.map((c) => {
          const on = picked.includes(c.id);
          const full = !on && picked.length >= max;
          return (
            <label key={c.id} className={`flex min-h-11 items-center gap-3 rounded-xl border p-3 ${on ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5"} ${full ? "opacity-50" : "cursor-pointer hover:bg-white/10"}`}>
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={on} disabled={full}
                onChange={() => onChange((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))} />
              <span className="min-w-0"><b className="block">{c.title}</b><span className="break-words text-sm text-muted-foreground">{c.blurb}</span></span>
            </label>
          );
        })}
      </div>
      <p className={`mt-3 text-sm ${check.ok && !check.warn ? "text-muted-foreground" : "text-accent"}`} role={check.ok ? undefined : "alert"}>
        {check.reason ?? check.warn ?? `${check.letters.length} letter${check.letters.length === 1 ? "" : "s"} fit${check.letters.length === 1 ? "s" : ""} these categories.`}
      </p>
    </>
  );
}
