# Friend-Group Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drinking mode, the vote game rework, In-Sync, Common Thread, party trivia with teams, Top Rung and Mafia to TopPic.

**Architecture:** Party games are pure engines in `app/topicDraft/formats/`, copied to the backend by `npm run sync:shared`, run on the server in `playRooms.ts`, and hidden per seat by `redact()`. Common Thread and Top Rung are solo games with pure engines beside their pages. Common Thread's facts are built offline into JSON.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Express 5, Socket.IO, Vitest, Wikidata SPARQL (`backend/src/trivia/wikidata.ts`).

**Spec:** `docs/superpowers/specs/2026-11-04-friend-group-games-design.md`. Read it first. Rules and copy guidance live there and are not repeated here.

## Global Constraints

- Build order and commits follow the task order. Each of the six spec steps must leave the app shippable.
- Work on branch `more-party-games`. Do not merge or deploy. Deploy only on the owner's explicit "merge and deploy".
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never use the names, art, music or phrases of Wavelength or Who Wants to Be a Millionaire in code, copy or comments the player can see. Never write "final answer".
- Party room cap 12. Drafts and regular trivia stay at 6.
- Drinking: off by default, party games only, at most 3 sips per call and per round, at most 10 sips per player per game, "water counts and nobody has to drink" on every drinking screen.
- Every screen must work at 375px wide, including 12-player lists, with no horizontal page scroll.
- After changing anything in `app/topicDraft` or `app/play/types.ts`, run `npm run sync:shared` and include `backend/src/shared` in the commit.
- Web typecheck: `npx tsc --noEmit -p .`. Backend typecheck: `cd backend && npx tsc --noEmit`. Tests: `npx vitest run`. All must pass before each commit.
- Fetches to Wikidata use a generic User-Agent, never the owner's personal email.

## Review Focus

1. **Finished rooms leak hidden votes.** `redact()` returns raw state once `room.status === "done"`. With Show votes off, votes and guesses must stay hidden on the final screen too. Test in Task 2.
2. **Someone leaves mid-game.** No phase may wait forever for a player who left. Every phase ends on its timer, and a missing clue giver or role holder is skipped. Tests in Tasks 2, 4, 8 and 12.
3. **Garbage or out-of-turn actions from a client.** NaN positions, dead targets, players acting for a role they lack, and repeat actions return state unchanged. Tests in Tasks 2, 4, 8 and 12.
4. **Refresh during a solo game.** A refresh during a Common Thread or Top Rung daily resumes the same run, and corrupt saved data starts a fresh one rather than crashing. Tests in Tasks 7 and 11.
5. **Rematches running out of content.** When a deck's unseen cards run out, the game reuses seen cards rather than starting with too few. Tests in Tasks 2 and 4.

---

## Spec step 1: drinking mode and vote rework

### Task 1: Party settings and the drinking engine

**Files:**
- Create: `app/topicDraft/party/drinks.ts`, `app/topicDraft/party/drinks.test.ts`
- Modify: `app/play/types.ts`, `backend/src/services/playRooms.ts:23-29,141-158,288-289`, `app/room/[code]/page.tsx:134,181,231`, `app/play/PartySetup.tsx`, `app/play/views/partyBits.tsx`, `app/play/pixel.css` (or the file holding `.party-booths`)

**Interfaces:**
- Produces:
  ```ts
  // types.ts: added to Opts, with these DEFAULT_OPTS values
  drinking: boolean;              // false
  showVotes: boolean;             // true
  teams: number;                  // 0 = no teams
  teamMap: Record<string, number>; // {} : player name to team index

  // drinks.ts
  export const ROUND_CAP = 3, GAME_CAP = 10;
  export type DrinkCall = { to: string | "all"; sips: number; reason: string; handsOut?: boolean; water?: boolean };
  export type DrinkState = { totals: Record<string, number>; calls: DrinkCall[]; seq: number; watered: string[] };
  export const initDrinks: (players: string[]) => DrinkState;
  export const addCalls: (d: DrinkState, calls: DrinkCall[], players: string[]) => DrinkState;
  ```
  `addCalls` replaces `calls`, bumps `seq`, applies caps and emits one `water: true` card per capped player.
- Produces (backend): `MIN_PLAYERS: Partial<Record<FormatId, number>>` in `playRooms.ts`, used by `startRoom`; default 2, `imposter` 3, `vote` 3.
- Produces (UI): `<DrinkCard calls seq />` in `partyBits.tsx`; `<DrinkingToggle value onChange />` used by `PartySetup`.

- [ ] **Step 1: Write failing tests in `drinks.test.ts`**

```ts
const players = ["A", "B", "C"];
it("caps a player at 3 sips in one round", () => {
  const d = addCalls(initDrinks(players), [{ to: "A", sips: 2, reason: "x" }, { to: "A", sips: 2, reason: "y" }], players);
  expect(d.totals.A).toBe(3);
  expect(d.calls.reduce((n, c) => n + (c.to === "A" ? c.sips : 0), 0)).toBe(3);
});
it("stops at 10 for the game and shows one water card", () => {
  let d = initDrinks(players);
  for (let i = 0; i < 6; i++) d = addCalls(d, [{ to: "A", sips: 3, reason: "x" }], players);
  expect(d.totals.A).toBe(10);
  expect(d.watered).toEqual(["A"]);
  expect(d.calls.some((c) => c.water)).toBe(false); // the water card appears only once, earlier
});
it("handing out does not add to the giver's total", () => {
  const d = addCalls(initDrinks(players), [{ to: "A", sips: 3, reason: "x", handsOut: true }], players);
  expect(d.totals.A).toBe(0);
});
it("a group toast skips capped players and is dropped when everyone is capped", () => {
  let d = initDrinks(["A"]);
  for (let i = 0; i < 4; i++) d = addCalls(d, [{ to: "all", sips: 3, reason: "x" }], ["A"]);
  d = addCalls(d, [{ to: "all", sips: 1, reason: "x" }], ["A"]);
  expect(d.totals.A).toBe(10);
  expect(d.calls).toEqual([]);
});
```

- [ ] **Step 2:** Run `npx vitest run app/topicDraft/party/drinks.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `drinks.ts`. Clamp every `sips` to at most `ROUND_CAP`.
- [ ] **Step 4:** Add the `Opts` fields. In `sanitizeParty`, read `drinking` as boolean, `showVotes` defaulting to true, `teams` with `num(o.teams, 0, 4, 0)`, and `teamMap` as cleaned names to integers below `teams`. Change `MAX_SEATS` to 12. Add `MIN_PLAYERS`. Update the room page's cap value and its "10" copy to 12.
- [ ] **Step 5:** Add a test to `backend/src/services/playRooms.test.ts`: a 12th player can join an empty room, a 13th gets `Room is full`, and a vote game with 2 seats returns `Need at least 3 players`.
- [ ] **Step 6:** Build `DrinkingToggle`. Turning it on opens a confirmation the host must accept: "Everyone playing is of legal drinking age." It shows the water line. Add it to every party setup.
- [ ] **Step 7:** Build `DrinkCard`: a pixel sprite, name, reason and sip count. It auto-hides after 4 seconds, can be tapped past, replays when `seq` changes, and always shows the water line. Honour reduced motion.
- [ ] **Step 8:** Run `npm run sync:shared`, typecheck and all tests. Expected: PASS.
- [ ] **Step 9:** Commit: `feat: drinking engine, party settings and 12-player rooms`.

### Task 2: Vote game engine rework

**Files:**
- Modify: `app/topicDraft/formats/vote.ts`, `app/topicDraft/core.ts:50,224-229`, `app/topicDraft/formats/party.test.ts`, `backend/src/services/playRooms.ts:320,462-475`, `backend/src/services/playRooms.test.ts`

**Interfaces:**
- Consumes: `addCalls`, `initDrinks`, `Opts.showVotes`, `Opts.drinking`.
- Produces:
  ```ts
  export const GUESS_MS = 45_000;
  export type VoteHistory = { votes: Record<string, Side>; guesses: Record<string, Record<string, Side>>; gained: Record<string, number>; nobodyGot: string[] };
  export type VoteState = { /* existing fields, minus scoringSide */ phase: "vote" | "guess" | "reveal"; guesses: Record<string, Record<string, Side>>; targets: Record<string, string[]>; showVotes: boolean; drinks?: DrinkState; history: VoteHistory[] };
  export function guessTargets(players: string[], seed: number): Record<string, string[]>;
  export function guessVote(s: VoteState, by: string, target: string, side: string, now: number): VoteState;
  export function redactFor(s: VoteState, me: string | null, finished?: boolean): VoteState;
  ```
  New core action: `{ type: "guessVote"; by: string; target: string; side: string }`. Add `"guessVote"` to `ACTION_TYPES`. Remove `scoringSide`.

- [ ] **Step 1: Write failing tests in `party.test.ts`** (replace the old majority tests)

```ts
it("scores right guesses, and gives the point to someone nobody read", () => {
  const s0 = V.init({ players: ["A","B","C"], deck: "icks", cards: opinionCards, rounds: 3, showVotes: true, seed: 1, now: 0 });
  let s = ["A","B","C"].reduce((x, p) => V.vote(x, p, p === "A" ? "a" : "b", 0), s0);
  expect(s.phase).toBe("guess");
  s = V.guessVote(s, "B", "A", "b", 0); // wrong
  s = V.guessVote(s, "C", "A", "b", 0); // wrong
  s = V.guessVote(s, "A", "B", "b", 0); // right
  s = V.guessVote(s, "C", "B", "a", 0); // wrong
  s = V.guessVote(s, "A", "C", "b", 0); // right
  s = V.guessVote(s, "B", "C", "b", 0); // right
  expect(s.phase).toBe("reveal");
  expect(s.points).toEqual({ A: 3, B: 1, C: 0 }); // A: 2 right guesses + nobody got A; B: 1 right guess
});
it("adds +1 for a true vote on Did That Happen", () => { /* happen card with answer "a": A votes a; A has one extra point */ });
it("guessTargets gives everyone all others up to 6 players, and 3 evenly from 7", () => {
  expect(V.guessTargets(["A","B","C"], 1).A.sort()).toEqual(["B","C"]);
  const seven = V.guessTargets(["A","B","C","D","E","F","G"], 1);
  const count = Object.values(seven).flat().reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
  expect(Object.values(seven).every((t) => t.length === 3)).toBe(true);
  expect(Object.values(count).every((n) => n === 3)).toBe(true);
  for (const [p, t] of Object.entries(seven)) expect(t).not.toContain(p);
});
it("a player who voted, but whom nobody guessed at all, gets no free point", () => { /* everyone times out in guess: points stay 0 */ });
it("a player who did not vote cannot be guessed or score the nobody point", () => { /* C never votes; C absent from targets */ });
it("ignores guessing yourself, a non-target, a bad side, or a repeat", () => { /* each returns the same state object */ });
it("timers end the vote and guess phases when someone has left", () => { /* tick past VOTE_MS then GUESS_MS moves to reveal */ });
it("reuses seen cards when unseen cards run short", () => { /* avoid every card id; cards.length is still >= 3 */ });
it("with drinking on and Show votes off, only group toasts appear", () => { /* reveal calls all have to === "all" */ });
```

Add to `playRooms.test.ts`:

```ts
it("Show votes off never sends other players' votes or guesses, even after the game ends", () => {
  // Play a full 3-player game with showVotes false, then for seat A's snapshot:
  // in vote, guess, reveal and status "done":
  //   history[*].votes and guesses contain only A's own entries
  //   points contains only A until done; at done it contains everyone
});
```

- [ ] **Step 2:** Run `npx vitest run app/topicDraft/formats/party.test.ts backend/src/services/playRooms.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the engine. With fewer than 2 voters, skip straight to reveal. For `guessTargets` at 7+ players, shuffle the order and give each player the next 3 people round the circle. Keep the existing `avoid` fallback. With drinking on, use the spec's table for named calls when `showVotes` is true, and one `{ to: "all", sips: 1 }` per card when false.
- [ ] **Step 4:** Change `redact()` so the vote format always goes through `V.redactFor(s, me, room.status === "done")` before the early `done` return. When `finished` and `showVotes` is true, return raw state. When `finished` and false, keep votes and guesses hidden but keep full `points`.
- [ ] **Step 5:** Pass `showVotes` and `drinking` from `opts` in `initGame`.
- [ ] **Step 6:** Run sync, typecheck and tests. Expected: PASS.
- [ ] **Step 7:** Commit: `feat: vote games score on guessing how friends voted`.

### Task 3: Vote screens and drinking in Imposter

**Files:**
- Modify: `app/play/views/VoteView.tsx`, `app/play/views/partyBits.tsx`, `app/play/PartySetup.tsx`, `app/play/formats.ts:30`, `app/topicDraft/formats/imposter.ts`, `app/play/views/ImposterView.tsx`, `app/topicDraft/formats/party.test.ts`

**Interfaces:**
- Consumes: Task 1 `DrinkCard`, Task 2 `VoteState`, `guessVote`.

- [ ] **Step 1:** Write failing Imposter drinking tests: a crew win calls 2 sips for the imposter and 1 for each player who voted wrong; an imposter win calls `{ to: imposter, sips: 3, handsOut: true }`; with drinking off, `drinks` is undefined.
- [ ] **Step 2:** Run tests and see them fail. Implement in `imposter.ts`, with `drinking` passed to `init`.
- [ ] **Step 3:** Build the guess screen in `VoteView`: one row per target with A and B buttons, a clear count, and booths kept. At 12 players the list scrolls inside the page.
- [ ] **Step 4:** Build the reveal. Show votes on: booths open, showing who guessed whom. Off: closed booths, your own gain, and "nobody read you" if you scored that way. Hide the live `Scores` row while off. `VoteResults` shows only totals while off.
- [ ] **Step 5:** Add the **Show votes** toggle to the vote setup. Update the `how` copy in `formats.ts` and the `3+ players` copy in the room summary.
- [ ] **Step 6:** Show `DrinkCard` in `VoteView`, `ImposterView` and both results screens.
- [ ] **Step 7:** Start `api-local` and `web-local` with `preview_start`. Play a 3-player game with Show votes on and another off, drinking on, at mobile width. Expected: all phases work, and in the off game the network response for a seat holds no other votes.
- [ ] **Step 8:** Run sync, typecheck and tests. Commit: `feat: vote guessing screens and drinking callouts`.

## Spec step 2: In-Sync

### Task 4: In-Sync engine and decks

**Files:**
- Create: `app/topicDraft/formats/insync.ts`, `app/topicDraft/formats/insync.test.ts`, `app/topicDraft/party/insyncDecks.ts`
- Modify: `app/play/types.ts:6,9`, `app/topicDraft/core.ts`, `backend/src/services/playRooms.ts`, `backend/src/services/playRooms.test.ts`, `app/play/formats.ts`, `app/play/categories.ts` (`FORMAT_WHY`), `app/play/SetupScreen.tsx` (`ROLL_COPY`)

**Interfaces:**
- Produces:
  ```ts
  // insyncDecks.ts
  export type Pair = { id: string; left: string; right: string };
  export type InSyncDeck = { id: string; title: string; blurb: string; pairs: Pair[] };
  export const INSYNC_DECKS: InSyncDeck[]; // ids: friends, food, films, shows, music, books, geography, history, heroes, anime, videogames, nba, football
  export const insyncDeckOf: (id: string) => InSyncDeck | undefined;

  // insync.ts
  export const CLUE_MS = 45_000, TUNE_MS = 60_000, REVEAL_MS = 10_000;
  export type InSyncState = { players: string[]; deck: string; pairs: Pair[]; round: number; giverAt: number; phase: "clue" | "tune" | "reveal"; target: number; clue: string; marker: number; markerBy: string | null; locks: string[]; score: number; maxScore: number; history: { pair: Pair; clue: string; target: number; marker: number; points: number; giver: string; skipped?: boolean }[]; phaseAt: number; done: boolean; seed: number; drinks?: DrinkState };
  export const giver: (s: InSyncState) => string;
  export const bandPoints: (target: number, marker: number) => 4 | 3 | 2 | 0; // gap <= 3: 4, <= 7: 3, <= 12: 2, else 0
  export const rankFor: (score: number, maxScore: number) => string;
  export function init(o: { players: string[]; deck: string; pairs: Pair[]; rounds: number; avoid?: string[]; drinking?: boolean; seed: number; now: number }): InSyncState;
  export function clue(s, by, text, now), move(s, by, pos, now), lock(s, by, now), next(s, now), tick(s, now), redactFor(s, me);
  ```
  New format id `"insync"`, added to `FormatId`, `PARTY_FORMATS`, `FORMAT_IDS`, and `PARTY_GAMES` (icon `AudioWaveform`). New core action `{ type: "move"; by: string; pos: number }`, added to `ACTION_TYPES`. `MIN_PLAYERS.insync` stays at the default 2. Default rounds: `Math.max(4, players.length)`.

- [ ] **Step 1: Write failing tests in `insync.test.ts`**

```ts
it("scores the bands exactly", () => {
  expect([bandPoints(50, 50), bandPoints(50, 53), bandPoints(50, 57), bandPoints(50, 62), bandPoints(50, 63)]).toEqual([4, 4, 3, 2, 0]);
});
it("plays with 2 players: one clue, one guesser, one lock decides", () => { /* clue -> tune -> lock -> reveal; score updates */ });
it("gives at least 4 rounds and rotates the clue giver", () => { /* 2 players: pairs 4, givers A,B,A,B */ });
it("needs more than half the guessers to lock", () => { /* 5 players: 4 guessers; 2 locks stay tune, 3 reveal */ });
it("rejects moves from the giver, NaN, out-of-range clamps to 0-100, ignores outside tune", () => {
  expect(move(tuning, giver(tuning), 10, 0)).toBe(tuning);
  expect(move(tuning, "B", NaN, 0)).toBe(tuning);
  expect(move(tuning, "B", 500, 0).marker).toBe(100);
});
it("skips the round with no score when the giver gives no clue before the timer", () => { /* tick past CLUE_MS: history.skipped, round+1 */ });
it("locks on the timer during tune when guessers have left", () => { /* tick past TUNE_MS -> reveal */ });
it("hides target and clue setup from guessers until reveal; the giver sees it", () => { /* redactFor */ });
it("every deck has enough original pairs: friends 60+, topics 20+, no duplicate ids", () => { /* loop INSYNC_DECKS */ });
it("reuses seen pairs when unseen pairs run short", () => { /* avoid all ids; pairs.length still >= rounds */ });
it("drinking: 2 sips for the giver on a miss, a group toast on a bullseye", () => { /* drinks.calls */ });
```

Add a room test: a redacted snapshot for a guesser has `target: -1` in the clue and tune phases.

- [ ] **Step 2:** Run tests and see them fail.
- [ ] **Step 3:** Write the decks. All pairs are original. `sanitizeParty` accepts these deck ids for this format and ignores `teamSize`.
- [ ] **Step 4:** Implement the engine, and wire it through `initGame`, `applyAction`, `currentTurn` (returns `giver` in clue phase, else null), `isDone`, `finishedTeams` (co-op: `baseline` is the group score for everyone), `redact`, and the `seen` list at `playRooms.ts:364`. Add `insync` to the no-winner path, so room history records no winner.
- [ ] **Step 5:** Run sync, typecheck and tests. Commit: `feat: In-Sync engine and decks`.

### Task 5: In-Sync screen and animation

**Files:**
- Create: `app/play/views/InSyncView.tsx`, `app/play/views/SignalCanvas.tsx`
- Modify: `app/play/GameScreen.tsx:71-72,107-110`, `app/play/PartySetup.tsx`, `app/room/[code]/page.tsx:135,138,215,253`

**Interfaces:**
- Consumes: Task 4 engine.
- Produces: `<SignalCanvas marker target phase points left right onMove? />`.

- [ ] **Step 1:** Build `SignalCanvas` with canvas and `requestAnimationFrame`, following the spec's "Look and animation". It must not be a dial. Scale for device pixel ratio. Pause when hidden. With reduced motion, draw static lines and a fade. Target 60fps on phones, drop to 30 if frames run long.
- [ ] **Step 2:** Build `InSyncView`: the giver's private target and clue input (one clue, 40 characters max); the guesser's drag area; live marker with a throttled `move` at 200ms and optimistic local position; Lock button with a count; reveal with sound through `useSound` and `DrinkCard`; `InSyncResults` with group score, rank and round list.
- [ ] **Step 3:** Add the deck picker to `PartySetup` and the room page labels. Default deck is `friends`.
- [ ] **Step 4:** Browser check with 2 and 5 seats at mobile width, using `api-local` and `web-local`. Expected: marker moves on other seats within about half a second; a bullseye bursts; a miss fizzles; no page scroll while dragging (`touch-action: none`). Save a screenshot as proof.
- [ ] **Step 5:** Typecheck and tests. Commit: `feat: In-Sync screen with signal animation`.

## Spec step 3: Common Thread

### Task 6: Build the clue pool and categories

**Files:**
- Create: `scripts/buildCommonThread.ts`, `scripts/commonThreadRules.ts`, `app/commonthread/commonThreadRules.test.ts`, `app/commonthread/data/<topic>.json`, `app/commonthread/types.ts`

**Interfaces:**
- Consumes: `sparql`, `hasName`, `getJson` from `backend/src/trivia/`; `PINPOINT_TOPICS` for the topic list.
- Produces:
  ```ts
  // app/commonthread/types.ts
  export type ThreadClue = { name: string; q?: string };
  export type ThreadCategory = { id: string; label: string; clues: ThreadClue[]; wrong: string[]; members: string[] };
  export type ThreadTopic = { pool: string; daily: ThreadCategory[]; practice: ThreadCategory[] };

  // scripts/commonThreadRules.ts
  export type RawMember = { name: string; q?: string; fame: number };
  export type RawCategory = { label: string; kind: string; members: RawMember[] };
  export function usable(c: RawCategory, poolSize: number): boolean;
  export function orderClues(c: RawCategory): ThreadClue[]; // 6 clues, least to most famous, spread across the category
  export function pickWrong(c: RawCategory, others: RawCategory[], seed: number): string[]; // 7 labels, no clue is a member, mixed kinds
  export function assemble(pool: string, cats: RawCategory[], seed: number): ThreadTopic;
  ```
  Target 60 daily and 20 practice per topic. The test fails below 50 daily or 15 practice. A category must have 6+ members and hold no more than 25% of the pool.

- [ ] **Step 1: Write failing tests for the pure rules**

```ts
it("rejects small and catch-all categories", () => {
  expect(usable(cat("x", 5), 200)).toBe(false);
  expect(usable(cat("x", 60), 200)).toBe(false);
  expect(usable(cat("x", 10), 200)).toBe(true);
});
it("orders clues from least to most famous, ending on the most famous", () => { /* clues[5] is highest fame; clues[0] is lower than clues[5] */ });
it("picks 7 wrong labels, none containing a clue, across more than one kind", () => { /* assert */ });
it("keeps daily and practice separate, and a label never appears in both", () => { /* assemble */ });
```

Add a data test that runs over every file in `app/commonthread/data/`:

```ts
it.each(PINPOINT_TOPICS.map((t) => t.id))("%s has enough good categories", (pool) => {
  const t = load(pool);
  expect(t.daily.length).toBeGreaterThanOrEqual(50);
  expect(t.practice.length).toBeGreaterThanOrEqual(15);
  const all = [...t.daily, ...t.practice];
  for (const c of all) {
    expect(c.clues).toHaveLength(6);
    expect(c.wrong).toHaveLength(7);
    for (const w of c.wrong) {
      const other = all.find((x) => x.label === w)!;
      expect(other).toBeTruthy();
      for (const clue of c.clues) expect(other.members).not.toContain(clue.name);
    }
  }
});
```

- [ ] **Step 2:** Run the rule tests and see them fail. Implement `commonThreadRules.ts` and see them pass.
- [ ] **Step 3:** Write `buildCommonThread.ts`. Per topic, one SPARQL source returns a wide pool ordered by sitelinks. Fame is the sitelink count. Numeric facts become buckets ("Debuted in the 1960s"). Suggested fact sources: films and shows (director, cast member, genre, decade, network); books (author, genre, decade, country); music (genre, decade, country, label); history (occupation, country, century); football and NBA (club or team, nation, position, decade); food (country, main ingredient); geography and flags (continent, language, flag colour, currency); Pokémon from PokéAPI (type, generation, egg group, ability); anime (series, studio, decade via AniList or Wikidata); characters (present in work P1441, creator, voice actor P725, performer P175, species, decade). Label wording is plain ("Directed by Christopher Nolan"). Log per-topic counts at the end.
- [ ] **Step 4:** Run `npx tsx scripts/buildCommonThread.ts`. Spot-read at least 10 categories per topic. Expected: true facts, sensible labels, the last clue clearly the most famous.
- [ ] **Step 5:** If a topic stays below the test's floor after widening its sources, stop and report it to the owner with the counts. Do not lower the floor or invent categories.
- [ ] **Step 6:** Run tests. Commit: `feat: Common Thread clue pool and categories`.

### Task 7: Common Thread game

**Files:**
- Create: `app/commonthread/engine.ts`, `app/commonthread/engine.test.ts`, `app/commonthread/topics.ts`, `app/commonthread/page.tsx`, `app/commonthread/[pool]/page.tsx`
- Modify: `app/trivia/page.tsx`

**Interfaces:**
- Consumes: Task 6 types; `dayNumber` from `app/pinpoint/engine.ts`.
- Produces:
  ```ts
  export const CLUES = 6;
  export type ThreadRun = { catId: string; shown: number; removed: string[]; won: boolean; over: boolean };
  export const dailyCategory: (t: ThreadTopic, day: number) => ThreadCategory; // t.daily[(day - 1) % t.daily.length]
  export const practiceCategory: (t: ThreadTopic, rand: number) => ThreadCategory;
  export const options: (c: ThreadCategory, seed: number) => string[]; // 8 labels in stable shuffled order
  export function startRun(c: ThreadCategory): ThreadRun; // shown is 1
  export function nextClue(r: ThreadRun): ThreadRun;
  export function guess(r: ThreadRun, c: ThreadCategory, label: string): ThreadRun;
  export const score: (r: ThreadRun) => number; // won: 7 - shown; lost: 0
  export const shareGrid: (r: ThreadRun, title: string) => string;
  export function loadRun(pool: string, day: number, catId: string): ThreadRun | null;
  export function saveRun(pool: string, day: number, r: ThreadRun): void;
  ```
  Topics load with dynamic `import()` per topic, so one topic's JSON stays out of the others' pages.

- [ ] **Step 1: Write failing tests**

```ts
it("opens on the first clue", () => expect(startRun(cat).shown).toBe(1));
it("scores 6 on clue 1 down to 1 on clue 6", () => { /* guess right at each shown */ });
it("a wrong guess removes the option and shows the next clue", () => { /* removed has label; shown + 1 */ });
it("runs out after a wrong guess on clue 6", () => { /* over, !won, score 0 */ });
it("ignores guesses after the end and removed options", () => { /* same object */ });
it("no daily repeats across 50 days", () => { /* Set of ids over days 1..t.daily.length */ });
it("practice never returns a daily category", () => { /* loop rand values */ });
it("resumes a saved run and starts fresh on corrupt data or a different category", () => {
  // stub localStorage: garbage JSON returns null; another catId returns null
});
```

- [ ] **Step 2:** Run tests and see them fail. Implement the engine. Run tests and see them pass.
- [ ] **Step 3:** Build the hub (one tile per `PINPOINT_TOPICS`, with today's result as a badge) and the game page: clue list with `CharacterAvatar`, newest clue animated in, 8 option buttons, a Next clue button, end panel with Share and Practice round. Practice is not saved.
- [ ] **Step 4:** Add a Common Thread box to `app/trivia/page.tsx`. Fix the stale Pinpoint copy there ("higher or lower on every stat") to mention real facts.
- [ ] **Step 5:** Browser check at mobile width in two topics, including a mid-game refresh. Screenshot as proof.
- [ ] **Step 6:** Typecheck and tests. Commit: `feat: Common Thread game for every topic`.

## Spec step 4: party trivia with teams

### Task 8: Party trivia engine

**Files:**
- Create: `app/topicDraft/formats/partytrivia.ts`, `app/topicDraft/formats/partytrivia.test.ts`
- Modify: `app/play/types.ts`, `app/topicDraft/core.ts`, `backend/src/services/playRooms.ts:23,141-158,255,462-475`, `backend/src/routes/playRooms.route.ts:20-27`, `backend/src/services/playRooms.test.ts`, `app/play/formats.ts`

**Interfaces:**
- Consumes: `TriviaCategory`; `getJeopardy(pool, avoid, store, gen, rand, count)`.
- Produces:
  ```ts
  export const QUESTION_MS = 25_000, REVEAL_MS = 7_000, BASE = 100, SPEED_MAX = 50;
  export type PTQuestion = { q: string; options: string[]; answer: string };
  export type PTState = { players: string[]; teams: string[][] | null; questions: PTQuestion[]; round: number; phase: "question" | "reveal"; answers: Record<string, { choice: string; at: number }>; points: Record<string, number>; teamPoints: number[]; correct: Record<string, number>; history: { answers: Record<string, string>; teamChoice: (string | null)[] }[]; phaseAt: number; done: boolean; drinks?: DrinkState };
  export const buildTeams: (players: string[], teams: number, map: Record<string, number>) => string[][];
  export const teamChoice: (votes: { choice: string; at: number }[]) => string | null;
  export function init(o: { players: string[]; categories: TriviaCategory[]; count: number; teams: number; teamMap: Record<string, number>; drinking?: boolean; seed: number; now: number }): PTState;
  export function answer(s, by, choice, now), next(s, now), tick(s, now), redactFor(s, me);
  ```
  New format id `"partytrivia"`. `pool` is any `hasTrivia` topic. `opts.teamSize` is the question count, one of 10, 15, 20. `needsQuiz` and `quizFor` include this format with `count = Math.ceil(questions / 4) + 1`. Teams are only honoured with 4+ players; otherwise `teams` is null.

- [ ] **Step 1: Write failing tests**

```ts
it("scores right answers with a speed bonus, up to 150", () => { /* instant = 150; at deadline = 100; wrong = 0 */ });
it("uses the team's most-voted option, and the earliest chosen on a tie", () => {
  expect(teamChoice([{ choice: "x", at: 5 }, { choice: "y", at: 1 }])).toBe("y");
  expect(teamChoice([{ choice: "x", at: 5 }, { choice: "x", at: 6 }, { choice: "y", at: 1 }])).toBe("x");
});
it("hides answers from other teams until reveal, and shows teammates", () => { /* redactFor */ });
it("hides all answers in solo play until reveal", () => { /* redactFor */ });
it("buildTeams respects the host's map and puts late joiners on the smallest team", () => { /* assert */ });
it("ignores teams with fewer than 4 players", () => { /* init teams null */ });
it("ends the question on the timer when players have left, and when all answered", () => { /* tick; answer */ });
it("rejects unknown options and repeat answers", () => { /* same state */ });
it("caps the count to the questions available", () => { /* 1 category of 4 clues, count 10: 4 questions */ });
it("drinking: 1 sip per wrong answer, 1 for the slowest", () => { /* drinks.calls via caps */ });
```

- [ ] **Step 2:** Run tests and see them fail. Implement. Flatten categories in tier order, shuffling within each tier, so questions get harder over the game. Wire through core and rooms, reusing the existing `answer` action. Add a route-level test that `quizFor` returns enough questions for 20.
- [ ] **Step 3:** Run sync, typecheck and tests. Commit: `feat: party trivia engine with optional teams`.

### Task 9: Party trivia screens

**Files:**
- Create: `app/play/views/PartyTriviaView.tsx`, `app/play/TeamPicker.tsx`
- Modify: `app/play/PartySetup.tsx`, `app/play/GameScreen.tsx`, `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: Task 8 engine. `TeamPicker` receives `players`, `teams`, `map`, `onChange`.

- [ ] **Step 1:** Add topic, question count and Teams controls to the setup. Teams appear only with 4+ seats: 2, 3 or 4 teams, Shuffle button, tap-to-move. Room setup needs current seats passed in from the room page.
- [ ] **Step 2:** Build the question screen (four big buttons, clock, live team votes for teammates), the reveal (answer, standings, `DrinkCard`) and results (winner, "carried the team" from `correct`).
- [ ] **Step 3:** Browser check with 4 seats and 2 teams, then 2 seats solo, at mobile width. Screenshot as proof.
- [ ] **Step 4:** Typecheck and tests. Commit: `feat: party trivia screens and team picker`.

## Spec step 5: Top Rung

### Task 10: Top Rung engine and world

**Files:**
- Create: `app/toprung/engine.ts`, `app/toprung/engine.test.ts`
- Modify: `app/components/pixel/worlds.ts:11,382`, `app/components/pixel/pixel.css` if it holds world themes

**Interfaces:**
- Consumes: `TriviaCategory`, `bundledCategories`.
- Produces:
  ```ts
  export const RUNGS = 12;
  export const LADDER = [100, 200, 300, 500, 800, 1200, 1800, 2500, 3500, 5000, 7500, 10000];
  export const LEDGES = [4, 8];
  export const tierOf: (rung: number) => number; // 0-based index into clues: rungs 1-3 -> 0, 4-6 -> 1, 7-9 -> 2, 10-12 -> 3
  export type RungQuestion = { q: string; options: string[]; answer: string };
  export type Lifeline = "cut" | "poll" | "swap";
  export type RungState = { rung: number; questions: RungQuestion[]; spares: (RungQuestion | null)[]; used: Lifeline[]; hidden: string[]; poll: Record<string, number> | null; picks: string[]; status: "climbing" | "fell" | "walked" | "top"; points: number; seed: number };
  export function init(categories: TriviaCategory[], seed: number): RungState;
  export function answer(s: RungState, choice: string): RungState;
  export function walk(s: RungState): RungState;
  export function cutTwo(s: RungState): RungState;
  export function crowdPoll(s: RungState): RungState;
  export function swap(s: RungState): RungState;
  export const scoreFraction: (s: RungState) => number; // points / 10000
  export function saveClimb(key: string, s: RungState): void;
  export function loadClimb(key: string): RungState | null;
  ```
  The new world id is `"ladder"`, added to the `World` union and `WORLDS`, with 12 checkpoints and the climb drawn in the existing scene style.

- [ ] **Step 1: Write failing tests**

```ts
it("uses clue tiers 1-3, 4-6, 7-9, 10-12", () => expect([1,3,4,6,7,9,10,12].map(tierOf)).toEqual([0,0,1,1,2,2,3,3]));
it("a wrong answer drops to the last ledge's points", () => {
  // correct through rung 5, then wrong: points LADDER[3] (ledge at 4)
  // wrong on rung 3: points 0
});
it("walking keeps current points, and only while climbing", () => { /* after 5 right: LADDER[4]; walk after fall returns same state */ });
it("rung 12 right tops out at 10000", () => { /* status top */ });
it("each lifeline works once per climb", () => { /* second call returns same state */ });
it("cutTwo hides two wrong options, never the answer", () => { /* assert */ });
it("crowdPoll sums to 100 and leans right less on higher rungs", () => { /* average across seeds: rung 1 share > rung 12 share */ });
it("swap replaces with the same tier, and no-ops without a spare", () => { /* spares null returns same state, lifeline not spent */ });
it("resumes a saved climb and ignores corrupt data", () => { /* stub localStorage */ });
it("handles a thin question set by ending at the top of what exists", () => { /* 2 categories: fewer than 12 questions never throws */ });
```

- [ ] **Step 2:** Run tests and see them fail. Implement. Each tier takes three clues, and the fourth becomes the spare. Draw the world.
- [ ] **Step 3:** Run tests. Commit: `feat: Top Rung engine and ladder world`.

### Task 11: Top Rung pages and daily

**Files:**
- Create: `app/toprung/page.tsx`, `app/toprung/[pool]/page.tsx`, `app/toprung/TopRungGame.tsx`
- Modify: `app/lib/daily.ts:4-7`, `app/daily/[game]/page.tsx`, `backend/src/services/daily.service.ts:4,16`, `backend/src/routes/daily.route.ts:28-32`, `backend/src/services/daily.service.test.ts`, `app/trivia/page.tsx:10-15,36`

**Interfaces:**
- Consumes: Task 10 engine.
- Produces: `DailyGame` gains `"toprung"`, with `DAILY_WORLD.toprung = "ladder"` and title `Top Rung`. The daily puzzle content is `{ pool, categories }`, using `getJeopardy(pool, [])`. `topicFor` offsets toprung by 6 so its topic differs from Summit and Hot Air. `TopRungGame` takes `{ categories, saveKey, onDone(state) }`.

- [ ] **Step 1:** Write a failing backend test: `isDailyGame("toprung")` is true, and `topicFor("toprung", day)` differs from `topicFor("summit", day)`.
- [ ] **Step 2:** Implement the backend change and see the test pass.
- [ ] **Step 3:** Build `TopRungGame`: world scene, question, options, lifeline buttons, Walk away with its points, original sound cues, end panel. Save after every action with `saveClimb`.
- [ ] **Step 4:** Add free play at `/toprung/[pool]` using `bundledCategories`, with topic chips from `hasTrivia`. Add the daily branch in `app/daily/[game]/page.tsx`, passing `scoreFraction` and a grid to `sendResult`.
- [ ] **Step 5:** Add Top Rung to `GAMES` in `app/trivia/page.tsx`. Change the heading "Three worlds" to "Four worlds".
- [ ] **Step 6:** Browser check at mobile width: full climb, a fall, a walk away, all lifelines, and a daily refresh mid-climb. Screenshot as proof.
- [ ] **Step 7:** Run sync, typecheck and tests. Commit: `feat: Top Rung pages and daily`.

## Spec step 6: Mafia

### Task 12: Mafia engine

**Files:**
- Create: `app/topicDraft/formats/mafia.ts`, `app/topicDraft/formats/mafia.test.ts`
- Modify: `app/play/types.ts`, `app/topicDraft/core.ts`, `backend/src/services/playRooms.ts:23,141-158,288,320,462-475`, `backend/src/services/playRooms.test.ts`, `app/play/formats.ts`

**Interfaces:**
- Produces:
  ```ts
  export const NIGHT_MS = 45_000, TALK_MS = 120_000, VOTE_MS = 45_000, MORNING_MS = 8_000;
  export type Role = "mafia" | "doctor" | "detective" | "villager";
  export const rolesFor: (n: number) => { mafia: number; doctor: number; detective: number; villager: number };
  export type MafiaState = { players: string[]; roles: Record<string, Role>; alive: string[]; phase: "night" | "morning" | "talk" | "vote" ; night: number; actions: { kill: string | null; save: string | null; check: string | null; done: string[] }; lastSave: string | null; checks: Record<string, { target: string; mafia: boolean }[]>; morning: { died: string | null } | null; votes: Record<string, string>; eliminated: { name: string; role: Role; by: "night" | "vote" }[]; winner: "village" | "mafia" | null; points: Record<string, number>; phaseAt: number; done: boolean; drinks?: DrinkState };
  export function init(o: { players: string[]; drinking?: boolean; seed: number; now: number }): MafiaState;
  export function nightAct(s, by, target, now), dayVote(s, by, target, now), skipTalk(s, by, now), tick(s, now), redactFor(s, me);
  ```
  New format id `"mafia"`, `MIN_PLAYERS.mafia = 5`, `pool: "mafia"`. New core actions: `nightAct { target: string }`, `dayVote { target: string }` (`"skip"` allowed), `skipTalk`. Add them to `ACTION_TYPES`. `skipTalk` is host only: in `act()`, reject it unless `seat === room.seats[0]`. All living villagers tap with `target: "ok"` so every phone acts at night; the night ends when all living players have acted or on the timer.

- [ ] **Step 1: Write failing tests**

```ts
it("deals the spec's role table", () => {
  expect(rolesFor(5)).toEqual({ mafia: 1, doctor: 1, detective: 0, villager: 3 });
  expect(rolesFor(7)).toEqual({ mafia: 1, doctor: 1, detective: 1, villager: 4 });
  expect(rolesFor(9)).toEqual({ mafia: 2, doctor: 1, detective: 1, villager: 5 });
  expect(rolesFor(12)).toEqual({ mafia: 2, doctor: 1, detective: 1, villager: 8 });
});
it("a doctor save stops the kill, and the same target can't be saved twice running", () => { /* assert */ });
it("the most recent mafia choice wins when two mafia differ", () => { /* assert */ });
it("the detective learns only their own check result", () => { /* redactFor shows checks only for that seat */ });
it("majority of votes cast eliminates, otherwise nobody", () => { /* tie and skip-heavy cases */ });
it("village wins with no mafia left; mafia win at parity", () => { /* assert winner and points */ });
it("a 5-player game can't end before the second night", () => {
  // 1 mafia, kill on night 1 leaves 4 alive, vote leaves 3: not parity.
});
it("rejects dead players, dead targets, wrong-role actions and repeats", () => { /* same state */ });
it("a timed-out night skips the missing action, and the game never stalls", () => { /* mafia left: no kill, day starts */ });
it("redacts roles: villager sees only self; mafia see partner; dead players see all", () => { /* redactFor */ });
it("never exposes night choices in another seat's snapshot", () => { /* actions fields blank for non-acting seats */ });
it("drinking: killed 1 sip, voted out an innocent 1 sip, final group toast", () => { /* drinks.calls */ });
```

Add a room test: `skipTalk` from a non-host returns an error, and a 4-seat Mafia start returns `Need at least 5 players`.

- [ ] **Step 2:** Run tests and see them fail. Implement and wire through core and rooms. Mafia stays redacted during play. At `done`, the existing early return shows everything, which is what we want.
- [ ] **Step 3:** Run sync, typecheck and tests. Commit: `feat: Mafia engine`.

### Task 13: Mafia screens and tuning

**Files:**
- Create: `app/play/views/MafiaView.tsx`, `app/topicDraft/formats/mafiaCopy.ts`
- Modify: `app/play/GameScreen.tsx`, `app/play/PartySetup.tsx`, `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: Task 12 engine and `DrinkCard`.

- [ ] **Step 1:** Write original, light narrator lines in `mafiaCopy.ts`, without gore. Add a test that every phase and outcome has at least 3 lines.
- [ ] **Step 2:** Build the screens: tap-to-view role card (same pattern as Imposter), night screen that looks the same on every phone at a glance with all players tapping, morning announcement, talk timer with the host's skip, vote, spectator view with all roles, and results with all roles.
- [ ] **Step 3:** Browser check with 5 seats at mobile width, using five tabs through the local API. Time a full game. Expected: about 10 minutes at default timers, or a note in the commit if not. If 5-player games feel lopsided, apply the spec's option (no kill on the first night at 5–6 players) with a test. Screenshot as proof.
- [ ] **Step 4:** Typecheck and tests. Commit: `feat: Mafia screens and narrator`.

### Task 14: Final pass

**Files:**
- Modify: `app/room/[code]/page.tsx`, `~/Documents/Obsidian Vault/TopPic/Colony/Colony.md`

- [ ] **Step 1:** Check the room page's game picker and "Surprise us" handle all new formats, and that history lines read properly for each.
- [ ] **Step 2:** At mobile width with 12 seats, check a vote guess screen, the In-Sync lobby and the Mafia vote list for overflow.
- [ ] **Step 3:** Run `npm run sync:shared`, both typechecks and `npx vitest run`. Expected: all pass, with no changes left in `backend/src/shared`.
- [ ] **Step 4:** Update Colony.md milestones and regenerate `architecture.html` with `/archify` only if the architecture changed. Never edit the Tabs section or write secrets.
- [ ] **Step 5:** Commit any remaining repo changes, push the branch and open a PR. Do not merge.
