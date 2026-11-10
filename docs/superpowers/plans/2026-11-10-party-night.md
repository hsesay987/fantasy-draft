# Party Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Party-room hosts can mix topics, set teams, run the game from a TV as a non-playing screen host, use buzz mode in person, and run tournaments with a leaderboard.

**Architecture:** `GameSetup` gains `pools: string[]` (with `pool === pools[0]`). Each party engine's `init` draws from all pools, and the server validates each id. A pure `app/play/tournament.ts` computes per-game awards from a finished state. The in-memory server room gains an optional `tournament` object that `finish()` updates. The lobby gets tournament controls and a leaderboard.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest; Express 5 + Socket.IO backend with in-memory rooms; shared engines synced by `npm run sync:shared`.

**Spec:** `docs/superpowers/specs/2026-11-10-party-night-design.md`

## Global Constraints

- Edit shared code in `app/topicDraft` or `app/play/types.ts`, then run `npm run sync:shared`. Never edit `backend/src/shared` by hand.
- Nothing included by the root `tsconfig.json` may import `backend/`.
- Room screens never import `app/topicDraft/party/vowelWords.ts` (it ships the answers). They use `vowelTopics.ts`.
- One topic picked must play exactly as it does today, and existing tests must pass unchanged.
- Hidden information is tested through the snapshot for every seat, including a seat with no token.
- Checks: `npm run sync:shared`, `npx tsc --noEmit` at the root and in `backend`, root `npx vitest run`, backend tests.
- Browser checks: run the API from an empty scratch directory with `DATABASE_URL` set to local `toppic_dev`. Never use `backend/.env.local` or the `api-local` config. Stop only servers you started, by PID. Never use `pkill -f`.
- Pixel-art look of the new games (`app/components/pixel`), working at 320px with 12 seats.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

- An old client that sends only `pool` still works, and `pools` is filled with `[pool]`.
- `pools` with duplicates, an empty list, or an unknown id: duplicates are removed, while an empty list or an unknown id is refused.
- Tournament with a player who leaves mid-game, then rejoins under the same name: earlier points stay, and the left game gives nothing.
- Draft verdict arriving after the room has started the next tournament game still credits the right game.
- Host ends a tournament early, or the room empties: no crash, and the leaderboard so far stands.

---

### Task 1: `pools` in setups, engines and server
**Files:**
- Modify: `app/play/types.ts`, `backend/src/services/playRooms.ts` (`sanitizeParty`, title), `app/play/formats.ts` or a new `app/play/poolTitle.ts`
- Test: `backend/src/services/playRooms.test.ts`, `app/play/poolTitle.test.ts`

**Interfaces:**
- Produces: `GameSetup.pools?: string[]`; `poolsOf(setup: GameSetup): string[]` (returns `setup.pools?.length ? setup.pools : [setup.pool]`); `mixTitle(titles: string[]): string`; `poolIdsFor(format: FormatId): string[]` (every valid id for that party format; `[]` for mafia).

- [ ] **Step 1: Tests.** `mixTitle(["A"])` is `"A"`; `mixTitle(["A","B"])` is `"A and B"`; `mixTitle(["A","B","C"])` is `"A, B and C"`; `mixTitle(["A","B","C","D","E"])` is `"Mixed: A, B +3 more"`. `sanitizeParty` cases: only `pool` gives `pools: [pool]`; `pools: ["wrong","wrong","icks"]` for vote gives `["wrong","icks"]` and `pool: "wrong"`; an unknown id is refused; an empty list falls back to `pool`; more ids than `poolIdsFor(format)` holds are refused; mafia ignores `pools`.
- [ ] **Step 2: Implement.** Validate each id with today's single-id rule per format. Cap list length at `poolIdsFor(format).length`. Clean each id at 30 characters. The title uses `mixTitle` over each id's title, keeping today's prefix ("Vowel Party: ", "Imposter: ", ...).
- [ ] **Step 3: Run checks, commit** `feat(party): setups can carry several topics`.


**Files:**
- Modify: `app/topicDraft/core.ts`, `app/topicDraft/formats/vote.ts`, `insync.ts`, `imposter.ts`, `vowelplay.ts`, `backend/src/routes/playRooms.route.ts` (`quizFor`)
- Test: the matching `*.test.ts` files and `backend/src/routes/playRooms.route.test.ts`

**Interfaces:**
- Consumes: `poolsOf` from this task's first half.
- Produces: Vowel Play words carry `topic: string` (the vowel topic id), visible in the snapshot from the moment the word is shown. Imposter rounds carry `topic: string`.

- [ ] **Step 1: Tests.**
  - vote/insync: with two decks, every dealt card id belongs to one of them, and with a seed both decks appear across a long game; unseen-first still holds over the union.
  - imposter: every round's secret and all its options come from the round's single `topic`, which is one of the picked topics.
  - vowelplay: with two topics, every word's `topic` is one of them and its name is in that topic's list; no name repeats; the redacted snapshot shows `topic` but never the name before the reveal (all seats, including no token).
  - quizFor partytrivia: with pools `[a,b]` it asks each pool for categories, splitting the count as evenly as possible (for 5 categories: 3 and 2), and returns them shuffled with the setup seed; if one pool fails it fills from the other; if all fail it returns undefined as today.
  - One pool: every existing test still passes unchanged.
- [ ] **Step 2: Implement** each mix as the spec's "How each game mixes" section says. Bundled-quiz fallback for partytrivia mixes `bundledCategories` of each pool.
- [ ] **Step 3: UI hint.** Vowel room screens and solo show the word's `topic` title (via `vowelTopicTitle`) when the game has more than one pool. Imposter shows the round's topic title when more than one.
- [ ] **Step 4: Run checks, commit** `feat(party): mixed topics in every party game`.

### Task 2: Topic picker and teams
**Files:**
- Modify: `app/play/PartySetup.tsx`, `app/room/[code]/page.tsx` (titles in "Next game" and history use the setup's mission title)
- Create: `app/play/PoolPicker.tsx`

**Interfaces:**
- Produces: `PoolPicker({ options: {id: string; title: string}[], value: string[], onChange: (ids: string[]) => void })`.

- [ ] **Step 1:** `PoolPicker` renders chips with `aria-pressed`, a "Mix all" chip, and keeps at least one selected. Unit test the pure toggle helper `togglePool(value, id, all)`: adding, removing, refusing to remove the last, and "Mix all" selecting every id.
- [ ] **Step 2:** `PartySetup` uses `PoolPicker` for every format with topics or decks, sends `pools` and `pool: pools[0]`, and starts from `room` setup's `pools` when present.
- [ ] **Step 3: Browser check** with 3 seats at 375px and 320px: a Vowel Party with three topics and a vote game with two decks, from setup to results. Save shots.
- [ ] **Step 4: Run checks, commit** `feat(party): pick several topics in party setup`.


**Files:**
- Modify: `app/play/PartySetup.tsx`, `backend/src/services/playRooms.ts` (`sanitizeParty` teams for vowelparty, vote, imposter), `app/play/views/quizBoard.ts` or new `app/play/teamStandings.ts`, results views of vote, imposter and vowelparty
- Test: `app/play/teamStandings.test.ts`, `backend/src/services/playRooms.test.ts`

**Interfaces:**
- Produces: `teamStandings(points: Record<string, number>, teams: string[][]): { name: string; score: number; members: string[] }[]` (team names from `teamMoves`).

- [ ] **Step 1: Tests:** `teamStandings` sums members, sorts, ties keep team order; sanitize keeps teams for vowelparty, vote and imposter, still forces 0 for vowelplay and mafia.
- [ ] **Step 2:** `PartySetup` offers the team picker for those formats at 4 or more players (the screen seat excluded). Results, the leaderboard and the screen show team standings when teams are set.
- [ ] **Step 3: Run checks, commit** `feat(party): teams in more party games`.

### Task 3: Screen host on the server
**Files:**
- Modify: `backend/src/services/playRooms.ts`, `backend/src/routes/playRooms.route.ts`, `app/play/onlineApi.ts`, `app/topicDraft/formats/imposter.ts`
- Test: `backend/src/services/playRooms.test.ts`, `backend/src/routes/playRooms.route.test.ts`, `app/topicDraft/formats/imposter.test.ts`

**Interfaces:**
- Produces: `Seat.screen?: boolean`; route `POST /:code/screen` (host only, lobby only, body `{ on: boolean }`), which sets the flag on the host's own seat and clears it on every other seat. `RoomSnapshot.seats[].screen`, `RoomSnapshot.screen: boolean` (true when `me` is the screen seat). Client `setScreen(code, token, on)`. `HOST_ACTIONS: string[]`: the action types a screen seat may send (`next`, `skipTalk`, and any host-only control that exists).

- [ ] **Step 1: Tests.**
  - The screen seat is left out of `setup.players` at every write and at `startRoom`. It is not counted for min players or the seat cap. A room with a screen host and 12 players can start.
  - Snapshot state for the screen seat equals the snapshot state for no token, for every party format. Imposter: the screen never gets `secret` or `imposter`.
  - The screen seat sending a player action (vote, answer, guess, buzz, accuse, mark) gets refused. `next` is accepted.
  - Only the host can turn it on, only in the lobby. Turning it on moves the flag off any other seat. Host hand-over to another seat clears it.
  - `IM.accuse` and any other engine action whose `by` is not in `players` is refused (add the guard where missing).
- [ ] **Step 2: Implement** as the design's "Screen host" section says. Redact the screen seat as `me = null`.
- [ ] **Step 3: Run checks, commit** `feat(party): screen host seat`.

### Task 4: Screen host view
**Files:**
- Create: `app/play/views/ScreenFrame.tsx`, `app/play/views/Leaderboard.tsx`, `app/play/screenInfo.ts`, `app/play/screenInfo.test.ts`
- Modify: `app/room/[code]/page.tsx`, `app/play/GameScreen.tsx`, `app/play/views/ImposterView.tsx`, `VoteView.tsx`, `InSyncView.tsx`, `app/components/pixel/pixel.css`

**Interfaces:**
- Consumes: Task 3.
- Produces: `screenInfo(setup: GameSetup, state: GameState): { turn: string | null; phase: string }` (Imposter clue giver, In-Sync giver, Vowel buzzer, Party Trivia buzzer, else null). `Leaderboard({ rows: { name: string; score: number; last?: number; left?: boolean; team?: number }[], teams?: { name: string; score: number }[] })`.

- [ ] **Step 1:** `screenInfo` tests for each format's turn.
- [ ] **Step 2: Lobby:** the host sees a Play / Host on a screen switch that calls `setScreen`. The players list marks the screen seat and leaves it out of player counts and `seatsNeeded`.
- [ ] **Step 3: Screen layout:** when `snap.screen` is true, the room renders `ScreenFrame` around the game's own view in watch mode: big title, "<name>'s turn" banner from `screenInfo`, the phase clock, and `Leaderboard` beside the board (below it under 900px). Host controls (Next, End, Back to lobby) stay available on the screen.
- [ ] **Step 4: Watch mode in every view:** Imposter, Vote and In-Sync get the `seated` guard that Party Trivia, Vowel and Mafia have: no action buttons, no "tap to see your card", and Imposter no longer treats a viewer as the imposter. Mafia's screen must not use the dead-player `Spectator` view that shows roles.
- [ ] **Step 5: Browser check** at 1280x720 and 375px with a screen host and 3 player seats: Imposter, a vote game, Party Trivia and Vowel Party from setup to results. Check no secret shows on the screen. Save shots.
- [ ] **Step 6: Run checks, commit** `feat(party): screen host view with turn banner and leaderboard`.

### Task 5: Buzz mode
**Files:**
- Modify: `app/play/types.ts` (`Opts.answer: "phones" | "buzz"`), `app/topicDraft/formats/partytrivia.ts`, `app/play/views/PartyTriviaView.tsx`, `app/play/PartySetup.tsx`, `backend/src/services/playRooms.ts`, `app/topicDraft/core.ts`
- Test: `app/topicDraft/formats/partytrivia.test.ts`, `backend/src/services/playRooms.test.ts`

**Interfaces:**
- Produces: Party Trivia actions `buzz { by }` and the existing `answer` limited to the buzzer in buzz mode; state `buzzer: string | null`, `buzzAt`, `buzzMs`, `locked: string[]`. Constants `BUZZ_ANSWER_MS = 5000`, `WRONG_BUZZ = 50`.

- [ ] **Step 1: Tests (Party Trivia, buzz):** first buzz wins and records `buzzMs` from the server clock; others can't buzz while one is answering; the buzzer's right answer scores as today and ends the question; a wrong answer or 5 s timeout takes 50 (never below 0), locks them out and reopens buzzing; question ends at 25 s or when every player is locked out; with teams, a buzz answers for the team and locks the team; redaction hides the answer until reveal for every seat; on-phones mode unchanged.
- [ ] **Step 2: Vowel Party, Buzz:** setup with `answer: "buzz"` for vowelparty starts a Vowel Play voice game in First correct mode (2 to 12 players). Test through `startRoom`.
- [ ] **Step 3: UI:** Answer chips (On phones / Buzz) in setup for Party Trivia and Vowel Party; phones show a big Buzz button, then the options for the buzzer only; everyone and the screen see "<name> buzzed in 1.234s" and who is locked out.
- [ ] **Step 4: Browser check** with 3 seats and a screen host: Party Trivia buzz with a wrong then a right buzz. Save shots.
- [ ] **Step 5: Run checks, commit** `feat(party): buzz mode for in-person play`.

### Task 6: Tournament awards (pure)
**Files:**
- Create: `app/play/tournament.ts`, `app/play/tournament.test.ts`

**Interfaces:**
- Produces:
  - `type Awards = Record<string, number>`
  - `PLACE_POINTS = [5, 3, 2]`, `REST_POINTS = 1`, `COOP_POINTS = 2`, `DRAW_POINTS = 3`
  - `awardsFor(setup: GameSetup, state: GameState, seated: string[], verdict?: { teams: { name: string; score: number }[] } | null): Awards | null` — `seated` are the names not `left` when the game ended; null means "no result, no points".
  - `rankAwards(scores: Record<string, number>): Awards` — ties share the higher place.
  - `type Tournament = { plan: FormatId[]; index: number; games: { format: FormatId; title: string; awards: Awards | null }[]; totals: Record<string, number>; done: boolean }`
  - `addGame(t: Tournament, format: FormatId, title: string, awards: Awards | null): Tournament`
  - `standings(t: Tournament, present: string[]): { name: string; total: number; last: number; left: boolean; rank: number }[]`

- [ ] **Step 1: Tests** for each rule in the spec's "Scoring" section: points ranking with a tie for 1st (scores 9, 9, 4, 1 give 5, 5, 2, 1); teams; duel win and draw; mafia sides; insync; draft verdict ranking and null verdict (everyone 1); a seated player with no points entry gets `REST_POINTS`; a left player gets nothing; all left gives null. `standings` sorts by total, shares rank on ties, lists left players faded, and includes present players with 0.
- [ ] **Step 2: Implement.** Tie rule: players with equal scores share the place of the first of them; the next distinct score takes the place after all of them.
- [ ] **Step 3: Run checks, commit** `feat(party): tournament scoring`.

### Task 7: Tournament on the server
**Files:**
- Modify: `backend/src/services/playRooms.ts`, `backend/src/routes/playRooms.route.ts`, `app/play/onlineApi.ts`
- Test: `backend/src/services/playRooms.test.ts`, `backend/src/routes/playRooms.route.test.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces: routes `POST /:code/tournament` (host, lobby only; body `{ plan: FormatId[] }`, 2 to 8 formats, each a room format), `POST /:code/tournament/end` (host). `RoomSnapshot.tournament?: Tournament & { standings: ReturnType<typeof standings> }`. Client calls `startTournament(code, token, plan)` and `endTournament(code, token)`.

- [ ] **Step 1: Tests.**
  - Starting a tournament stores the plan with `index: 0`. A guest, a running room, an empty or 9-game plan, or an unknown format is refused.
  - `finish()` on a tournament room calls `awardsFor` with the names not `left`, appends the game, and bumps `index`. When `index` reaches the plan length, `done` is true.
  - A draft game's points are added when its verdict arrives, to the game that produced it, even if the room has already started the next game.
  - Ending early sets `done`, and no later finish changes totals.
  - The snapshot carries `standings` for every seat, including a seat with no token.
- [ ] **Step 2: Implement.** Keep the tournament on the room object. `setGame` stays host-driven: the lobby suggests `plan[index]` as the next format (Task 6). A finished tournament stays visible until a new one starts or the room closes.
- [ ] **Step 3: Run checks, commit** `feat(party): tournaments in rooms`.

### Task 8: Tournament screens
**Files:**
- Create: `app/play/views/TournamentSetup.tsx`
- Modify: `app/room/[code]/page.tsx`, `app/components/pixel/pixel.css`

- [ ] **Step 1: `TournamentSetup`** in the lobby, host only: tap games to add in order (2 to 8, repeats allowed, only games that fit the seat count), remove with a tap, "Surprise me" fills 4 random fitting games, Start calls `startTournament`. Guests see the plan once it starts.
- [ ] **Step 2: Lobby during a tournament:** a "Game N of M: <format>" card. The host's next pick opens that format's normal setup, prefilled with the last settings used for that format in this room. Show `Leaderboard`, plus an "End tournament" control for the host.
- [ ] **Step 3: `Leaderboard`:** rank, `playerSprite`, name, total, "+N" for the last game, faded left players, pixel style, fits 12 rows at 320px. Show it on each game's finished banner in a tournament, and as a champion screen when `done` (shared title on a tie), with "Play again" (same plan) and "Back to the room".
- [ ] **Step 4: Browser check** with 3 seats at 375px and 320px: a 3-game tournament (Vowel Party mixed, a vote game, Imposter) to the champion screen, with one player leaving during game 2. Save shots.
- [ ] **Step 5: Run checks, commit** `feat(party): tournament screens and leaderboard`.

