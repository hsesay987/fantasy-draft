# Vowel Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Vowel Play: guess a topic's names from their consonants, solo against the clock, online in First correct and Head to head by voice or typing, and in party mode with everyone competing.

**Architecture:** One pure engine, `app/topicDraft/formats/vowelplay.ts`, runs all three ways: synced to the server for rooms, and run in the browser for solo. Two room formats share it: `vowelplay` (First correct and Head to head) and `vowelparty` (everyone competes). Word lists are generated ahead of time into a JSON file that both browser and server can read.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest, Express 5, existing room polling and pixel kit. No new dependencies, data sources or database changes.

**Spec:** `docs/superpowers/specs/2026-11-06-vowel-play-design.md`

**Starting point:** Merge `origin/main` into branch `vowel-play` before Task 1, and only after the final-review fixes of the friend-group games have merged. Those fixes add the computed host, a Leave control in running games, host-only `next` and the `settle(s, gone, now)` pattern, and this plan uses all four.

## Global Constraints

- Puzzle: remove A, E, I, O, U; Y and digits stay; fold accents; remove spaces, hyphens, apostrophes and all other punctuation; capitals; drop a leading "The". **No spaces or hyphens in the puzzle.**
- A name is usable only if at least one vowel was removed and 3 to 16 letters remain.
- Topics need at least 40 usable names; the topic name is the only hint.
- Typing: ignore case, accents, spaces, hyphens and punctuation; leading "the" optional; one wrong, missing, extra or swapped letter allowed in names of 8 or more letters.
- Two names with the same letters in a topic: either is correct.
- Speed points: 100 for the first 2 seconds, falling evenly to 10 at 20 seconds. No answer scores 0.
- Clocks: word 20 s, speak 5 s, judge 6 s, reveal 3 s (5 s in everyone-competes mode so the standings can be read).
- First correct: 2 to 12 players; 10, 15 or 20 words, default 15. Head to head: exactly 2 players; 5 steps ahead wins; ends at 30 words.
- Party: 2 to 12 players, 10 words, typed only. Solo: 10 words, typed only.
- Server holds the answers: until a word is finished, no room snapshot for any seat, including a seat with no token, may hold a current or later name.
- The app never listens. No speech recognition and no voice chat.
- Nothing included by the root `tsconfig.json` may import `backend/`. Run `npm run sync:shared` after changing anything under `app/topicDraft` or `app/play/types.ts`.
- Use `playerSprite(i)` from `app/play/views/partyBits.tsx` for player sprites.
- Use `Object.hasOwn` when reading records keyed by player name.
- Never use `backend/.env.local` or the `api-local` config in checks: they point at the hosted database. Run the API from an empty scratch directory with `DATABASE_URL` set to local `toppic_dev`.

## Review Focus

1. A name with odd characters (`Beyoncé`, `Guns N' Roses`, `AC/DC`, `Kareem Abdul-Jabbar`) should still make a fair puzzle and accept the obvious typed answer. Test in Task 1.
2. A browser opening the API URL with no token during any phase before reveal should see no current or later name. Test in Task 4.
3. Two buzzes or two right answers arriving together should credit only the first. Test in Task 3.
4. A speaker leaving mid-speak, or every judge leaving mid-judge, should move the game on at once rather than waiting out the clock. Test in Task 3.
5. A third player joining a room after Head to head was chosen should get a clear refusal at Start, not a broken game. Test in Task 4.

---

### Task 1: Puzzle text and word lists

**Files:**
- Create: `app/topicDraft/party/vowelText.ts`, `app/topicDraft/party/vowelText.test.ts`, `app/topicDraft/party/vowelWords.ts`, `app/topicDraft/party/vowelWords.json`, `app/topicDraft/party/vowelWords.test.ts`, `scripts/buildVowelWords.ts`

**Interfaces:**
- Produces: `toPuzzle(name: string): string`; `isUsable(name: string): boolean`; `cleanName(raw: string): string | null`; `matches(guess: string, name: string): boolean`; `VOWEL_TOPICS: { id: string; title: string }[]`; `wordsFor(topic: string): string[]`.

- [ ] **Step 1: Write failing tests in `vowelText.test.ts`**

```ts
expect(toPuzzle("Spider-Man")).toBe("SPDRMN");
expect(toPuzzle("Pikachu")).toBe("PKCH");
expect(toPuzzle("Pokémon")).toBe("PKMN");
expect(toPuzzle("The Beatles")).toBe("BTLS");
expect(toPuzzle("Kareem Abdul-Jabbar")).toBe("KRMBDLJBBR");
expect(toPuzzle("Guns N' Roses")).toBe("GNSNRSS");
expect(toPuzzle("Lynx")).toBe("LYNX");
expect(isUsable("Lynx")).toBe(false);          // no vowel removed
expect(isUsable("R2-D2")).toBe(false);         // no vowel removed
expect(isUsable("Elsa")).toBe(false);          // 2 letters left
expect(isUsable("Pikachu")).toBe(true);
expect(isUsable("Harry Potter and the Philosopher's Stone")).toBe(false); // over 16
expect(cleanName("Deku (Izuku Midoriya)")).toBe("Deku");
expect(cleanName("The Office (US)")).toBe("The Office");
expect(matches("spider man", "Spider-Man")).toBe(true);
expect(matches("SPIDERMAN", "Spider-Man")).toBe(true);
expect(matches("spidermn", "Spider-Man")).toBe(true);   // one missing, 9 letters
expect(matches("spiderman", "The Spider-Man")).toBe(true); // "the" optional both ways
expect(matches("pokemon", "Pokémon")).toBe(true);
expect(matches("beatles", "The Beatles")).toBe(true);
expect(matches("pikchu", "Pikachu")).toBe(false);       // 7 letters must be exact
expect(matches("ragnork", "Ragnarok")).toBe(true);      // 8 letters, one missing
expect(matches("sipderman", "Spider-Man")).toBe(true);  // one swap
expect(matches("spdrmn", "Spider-Man")).toBe(false);    // typing the puzzle back is not an answer
expect(matches("", "Goku")).toBe(false);
```

- [ ] **Step 2: Run** `npx vitest run app/topicDraft/party/vowelText.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `vowelText.ts`.** Compare on a normalized form: NFD accent folding, lower case, letters and digits only, leading "the" removed. Allow optimal string alignment distance of at most 1 when the normalized name has 8 or more characters; otherwise require equality. The `spdrmn` assertion should fall out of the distance rule; confirm it does.

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Write `scripts/buildVowelWords.ts`.** Read character and place catalogs through `app/topicDraft/catalogs/index.ts`, apply `cleanName` and `isUsable`, dedupe within a topic, skip topics under 40, and write `vowelWords.json` as `{ topics: { id, title }[], words: Record<string, string[]> }`. Keep a short hand-written `EXCLUDE: Record<string, string[]>` at the top of the script for unfair names. Import nothing from `backend/`.

- [ ] **Step 6: Run the script, then read every list in the JSON as a player would.** Add unfair names to `EXCLUDE` (obscure, a generic word that isn't really the name, or a form nobody says) and re-run. Report the per-topic counts. At today's catalog sizes, `disney` (37) and `movies` (39) fall under the floor and are dropped; that's expected.

- [ ] **Step 7: Write `vowelWords.ts` and `vowelWords.test.ts`.** Test: every topic has at least 40 names; every name passes `isUsable`; no name holds `(`; no name repeats in a topic; `wordsFor("nope")` returns `[]`.

- [ ] **Step 8: Run** `npm run sync:shared`, `npx tsc --noEmit`, and the two test files. Expected: all pass.

- [ ] **Step 9: Commit** with message `feat(vowelplay): puzzle text and word lists`.

### Task 2: Engine, typed play

**Files:**
- Create: `app/topicDraft/formats/vowelplay.ts`, `app/topicDraft/formats/vowelplay.test.ts`

**Interfaces:**
- Consumes: Task 1's `toPuzzle`, `matches`, `wordsFor`; `shuffle` from `../rng`; `initDrinks`, `addCalls` from `../party/drinks`.
- Produces:
```ts
export const GUESS_MS = 20_000, SPEAK_MS = 5_000, JUDGE_MS = 6_000, REVEAL_MS = 3_000, REVEAL_ALL_MS = 5_000, DUEL_WORDS = 30, DUEL_LEAD = 5;
export type VPMode = "first" | "duel" | "all";
export type VPAnswer = "voice" | "type";
export type VPWord = { name: string; puzzle: string; also: string[] };
export type VPHistory = { name: string; puzzle: string; winner: string | null; wrongBuzz?: string; gotMs: Record<string, number> };
export type VPState = {
  players: string[]; topic: string; mode: VPMode; answer: VPAnswer;
  words: VPWord[]; total: number; round: number;
  phase: "guess" | "speak" | "judge" | "reveal";
  points: Record<string, number>; rope: number;
  buzzer: string | null; marks: Record<string, "right" | "wrong">;
  gotMs: Record<string, number>; gaveUp: string[];
  history: VPHistory[]; phaseAt: number; startedAt: number; done: boolean; forfeit: string | null; seed: number; drinks?: DrinkState;
};
export function speedPoints(ms: number): number;
export function init(o: { players: string[]; topic: string; mode: VPMode; answer: VPAnswer; count: number; avoid?: string[]; drinking?: boolean; seed: number; now: number }): VPState;
export function guess(s: VPState, by: string, text: string, now: number): VPState;
export function giveUp(s: VPState, by: string, now: number): VPState;
export function tick(s: VPState, now: number): VPState;
export function winners(s: VPState): string[];
export function redactFor(s: VPState, me: string | null): VPState;
```
`rope` is positive towards `players[0]`. `also` holds the other names in the topic with the same puzzle, computed in `init` from the whole topic.

- [ ] **Step 1: Write failing tests:**
  - `speedPoints(0)` and `speedPoints(2000)` are 100; `speedPoints(11000)` is 55; `speedPoints(20000)` is 10.
  - `init` takes names not in `avoid` first, then fills from `avoid`, never repeats a name, and fixes `total` at `count` (or `DUEL_WORDS` for duel).
  - Two names with the same puzzle: either is accepted.
  - **first:** a right `guess` gives 1 point and moves to `reveal`; a wrong one returns the same state object; a right one in `reveal` changes nothing; `tick` after 20 s goes to `reveal` with `winner: null`; `tick` after 3 s of reveal goes to the next word; the last word sets `done`.
  - **all:** a right guess records `gotMs` and `speedPoints`, and the word stays open for others; the same player guessing again changes nothing; the word ends when each player has got it or given up; reveal lasts 5 s.
  - `giveUp` is refused outside `all`.
  - **drinks, all mode only:** at word end, the slowest correct player (if 2 or more got it) and each who missed get a call of 1 sip.
  - `winners`: most points, ties share.
  - **`redactFor`:** in `guess`, every seat's current word has `name: ""` and `also: []`, later words are gone from `words`, `total` is unchanged, and `seed` is 0. In `reveal` the current name shows. When `done`, all show. A player named `constructor` can score.

- [ ] **Step 2: Run** `npx vitest run app/topicDraft/formats/vowelplay.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** A wrong `guess` must return the same state object, so the server sends no update.

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Commit** with message `feat(vowelplay): engine for typed play`.

### Task 3: Engine, voice, head to head and departures

**Files:**
- Modify: `app/topicDraft/formats/vowelplay.ts`, `app/topicDraft/formats/vowelplay.test.ts`

**Interfaces:**
- Produces: `buzz(s, by, now)`, `spoke(s, by, now)`, `mark(s, by, verdict: "right" | "wrong", now)`, `settle(s, gone: string[], now)`, all returning `VPState`.

- [ ] **Step 1: Write failing tests:**
  - **Voice:** `guess` is refused when `answer` is voice. `buzz` moves `guess` to `speak`. A second `buzz` is refused, so the first buzzer stands. `spoke` by the buzzer, or `tick` after 5 s, moves to `judge`. Only the buzzer can `spoke`.
  - **Judging:** the buzzer can't `mark`; one mark per player; everyone but the buzzer marking resolves at once; `tick` after 6 s resolves. More wrong than right is wrong; a tie or no marks at all is right.
  - **Right** gives 1 point. **Wrong** in `first` takes 1 point, never below 0; `history` records `wrongBuzz`; the word ends either way.
  - No buzz in 20 s goes to `reveal` with `winner: null`.
  - **`redactFor`:** `speak` hides the name from everyone, buzzer included; `judge` shows it to everyone.
  - **Duel:** a win moves `rope` one step towards the winner; a wrong buzz moves it one step towards the opponent; a lead of 5 sets `done`; 30 words end the game; `winners` returns whoever is ahead, or both if level. The opponent's one mark decides, and no mark goes to the speaker.
  - **Duel, typed:** first right guess moves the rope.
  - **`settle`:** a departed buzzer in `speak` or `judge` ends the word at once with no point. Departed players don't count towards judging or "everyone has it". If only departed judges remain, it resolves to the speaker. Duel with one player left sets `done` and `forfeit` to the departed player, and `winners` returns the other. Nothing changes returns the same state object.

- [ ] **Step 2: Run the test.** Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Commit** with message `feat(vowelplay): voice, head to head and departures`.

### Task 4: Rooms on the server

**Files:**
- Modify: `app/play/types.ts`, `app/play/formats.ts`, `app/topicDraft/core.ts`, `backend/src/services/playRooms.ts`, `backend/src/services/playRooms.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  - `FormatId` gains `"vowelplay" | "vowelparty"`. Both go in `PARTY_FORMATS`, which also gives them the 12-seat cap and the party setup path.
  - `Opts` gains `vowelMode: "first" | "duel"` (default `"first"`) and `vowelAnswer: "voice" | "type"` (default `"voice"`).
  - `ROOM_GAMES: FormatMeta[]` in `formats.ts`, holding `vowelplay`. It is kept out of `FORMATS`, so it never shows as a solo draft. `vowelparty` goes in `PARTY_GAMES`. `formatMeta` searches all three.
  - `Action` gains `guess { by, text }`, `buzz { by }`, `spoke { by }`, `mark { by, verdict }`, `giveUp { by }`.

- [ ] **Step 1: Write failing tests in `playRooms.test.ts`:**
  - `sanitizeSetup` accepts `vowelplay` and `vowelparty` only for a topic in `VOWEL_TOPICS`.
  - `vowelplay` snaps `teamSize` to 10, 15 or 20 and forces `drinking` off.
  - `vowelparty` forces 10 words and typed answers, and keeps `drinking`.
  - `startRoom` for Head to head with 3 present seats gives the error `Head to head takes exactly 2 players`, and starts with 2.
  - Snapshot with no token, with a player's token, and with the buzzer's token: in `guess` and `speak`, `JSON.stringify(state)` does not contain the current name or any later name.
  - More than 3 `guess` actions in one second from a seat are refused until the second passes, and another seat is unaffected.
  - A guess longer than 60 characters is refused.
  - `leaveRoom` by the buzzer ends the word at once.
  - Rematch prefers names not yet seen in the room.
  - `finish` records one winner, or null on a tie.

- [ ] **Step 2: Run** `cd backend && npx vitest run src/services/playRooms.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Each of these has a spot beside the `insync` and `partytrivia` cases:
  - **`core.ts`:** init, apply, turn (`null`), result (the `points` case).
  - **`playRooms.ts`:** `FORMAT_IDS`, `ACTION_TYPES`, `sanitizeParty`, title, `startRoom` duel check and `avoid`, `settleParty`, `leaveRoom`, the left-seat return in `act`, `autoplay` (`null`), `redact`, `finish` (`VP.winners`, single name or null) and `room.seen` with `vp:<name>`.
  - **Rate limit:** in `act`, held in memory per room and seat, for `guess` only.
  - **Who may act:** the server takes `by` from the seat as usual.

- [ ] **Step 4: Run** `npm run sync:shared`, both typechecks and both full test suites. Expected: all pass.

- [ ] **Step 5: Commit** with message `feat(vowelplay): rooms on the server`.

### Task 5: Solo and the typewriter

**Files:**
- Create: `app/vowelplay/page.tsx`, `app/vowelplay/[pool]/page.tsx`, `app/vowelplay/VowelPlayGame.tsx`, `app/vowelplay/best.ts`, `app/vowelplay/best.test.ts`, `app/components/pixel/Typewriter.tsx`
- Modify: `app/components/pixel/pixel.css`, `app/components/pixel/sprites.ts`, `app/components/pixel/worlds.ts`, `app/trivia/page.tsx`

**Interfaces:**
- Consumes: `init`, `guess`, `giveUp`, `tick`, `speedPoints` with `mode: "all"`, `answer: "type"`, `count: 10`, one player. Solo needs no `redactFor`.
- Produces: `<Typewriter puzzle: string; name: string | null; solved: boolean />`; `bestFor(topic): number`, `saveBest(topic, score): void`, under key `toppic:vowelplay:best:v1`, with reads and writes wrapped in try/catch.

- [ ] **Step 1: Write a failing test for `best.ts`:** it returns 0 when empty, keeps the higher score, and survives `localStorage` throwing. Run it, expect FAIL, implement, and run again to PASS.

- [ ] **Step 2: Build `Typewriter`.** A pixel typewriter with the puzzle typed on paper in the carriage and vowel keys lying on the bench. When solved, the missing keys snap back into the full name. Respect `prefers-reduced-motion`. The block of letters must fit one line at 320px (up to 16 letters; scale the type to fit).

- [ ] **Step 3: Build the pages.** Topic list at `/vowelplay` from `VOWEL_TOPICS`. Game at `/vowelplay/[pool]`, `notFound()` for an unknown topic. Show one input that keeps focus between words, a shake on a wrong guess, a Skip button (`giveUp`), a clock, and the running score. The final screen has the score, best for the topic and missed names, plus Play again. Use existing sound helpers. Use `track` as Top Rung does.

- [ ] **Step 4: Add the hub entry** to `app/trivia/page.tsx`: title "Vowel Play", `href: "/vowelplay"`, `topics: true`, `topicHref`, and a new `typewriter` world in `worlds.ts`. Vowel Play has no daily; make the entry's `daily` field optional if the type needs it.

- [ ] **Step 5: Check in the browser** at 320px and 375px: a full 10-word game, a typo accepted, a wrong guess shakes, Skip, best score kept after reload. No backend needed. Save shots.

- [ ] **Step 6: Run** the typecheck and full tests, then commit with message `feat(vowelplay): solo and the typewriter`.

### Task 6: Room screens, typed

**Files:**
- Create: `app/play/views/VowelPlayView.tsx`
- Modify: `app/play/PartySetup.tsx`, `app/play/GameScreen.tsx`, `app/play/SetupScreen.tsx`, `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: Task 4's `ROOM_GAMES` and opts; Task 5's `Typewriter`.
- Produces: `VowelPlayView({ setup, ctl })`, `VowelPlayResults({ setup, ctl, onAgain, onRematch })`.

- [ ] **Step 1: `PartySetup`.** Add both formats to its prop union. Both get a topic picker from `VOWEL_TOPICS`. `vowelplay` gets Mode chips (First correct, Head to head), Answer chips (Voice, Type; Voice first), and Words chips (10, 15, 20, default 15; hidden for Head to head). The drinking panel shows only for `vowelparty`. Voice's hint: "Best in the same room or on a call."

- [ ] **Step 2: Room page.** Show `ROOM_GAMES` with the normal games in the picker, and keep it available above 6 seats. Add both to Surprise us and to `seatsNeeded`. Head to head short or over 2 shows `Head to head takes exactly 2 players` for host and guests, with Start disabled. Add both to the `picking` check, the "Next game" summary line, and history lines (topic title, winner or "tie").

- [ ] **Step 3: `VowelPlayView`, typed path.**
  - Show the typewriter, clock, input and player list with scores.
  - A refused guess shakes. If `ctl` doesn't surface refusal, add the smallest way to.
  - In `all` mode, show who has got it (without the word), a Give up button and standings on reveal.
  - Render `DrinkCard` **below** the typewriter so it never hides the letters, with `game` set to `startedAt` and `names` from `players`.
  - Use `playerSprite` for players.

- [ ] **Step 4: `VowelPlayResults`.** Winner or shared win, final scores, and each word with who got it. Rematch only behind `onRematch`, as Party Trivia does. Wire both into `GameScreen`, and add both to the record in `SetupScreen`.

- [ ] **Step 5: Check in a real browser** with the local-database API and 3 seats in isolated contexts, at 375px: First correct typed and party typed from setup to results and on to another game. Stop the servers. Save shots.

- [ ] **Step 6: Run** sync, both typechecks and both test suites, then commit with message `feat(vowelplay): room screens for typed play`.

### Task 7: Voice screens and the tug of war

**Files:**
- Modify: `app/play/views/VowelPlayView.tsx`, `app/components/pixel/pixel.css`
- Create: `app/components/pixel/PaperPull.tsx`

**Interfaces:**
- Consumes: Task 3's actions, sent through `ctl`.
- Produces: `<PaperPull rope: number; lead: number; left: string; right: string />`.

- [ ] **Step 1: Voice screens.**
  - `guess`: a big Buzz button, no input.
  - `speak`: the buzzer sees "Say it now!", a 5-second countdown and "Done"; others see who is speaking, with no way to buzz.
  - `judge`: the name shows; everyone but the speaker gets large Right and Wrong buttons and a 6-second clock; the speaker waits.
  - `reveal`: the name, result, and scores. A wrong buzz in First correct shows the lost point.

- [ ] **Step 2: `PaperPull`.** A sheet of paper pulled between two typewriters; the marker moves one step per word, and ±5 is the win. Show it for `mode: "duel"` in both Voice and Type, and on results.

- [ ] **Step 3: Check in a real browser** with the local-database API at 320px and 375px:
  - Voice First correct with 3 seats: right, wrong, tie, no-buzz.
  - Head to head with 2 seats to a win, and with one player leaving.
  - 12 seats in First correct and in party for overflow.
  - Stop the servers. Save shots.

- [ ] **Step 4: Run** sync, both typechecks and both test suites, then commit with message `feat(vowelplay): voice and head to head screens`.

### Task 8: Final pass

**Files:**
- Modify only what the checks below turn up.

- [ ] **Step 1: Hidden-information sweep.** With the local API, read raw `GET /:code` responses with no token and with each seat's token through a full Voice word and a full party word. Expected: no unrevealed name in any body.

- [ ] **Step 2: Build as Vercel does.** Copy the tree to a scratch directory, with `node_modules` copied by `cp -c -R`, remove `backend/`, run `npx next build`, and delete the copy. Expected: exit 0.

- [ ] **Step 3: Run** `npm run sync:shared`, both typechecks and both test suites. Expected: all pass, with `git status` showing no sync changes.

- [ ] **Step 4: Commit any fixes** with message `fix(vowelplay): final pass`. Do not push or deploy. Rooms need a Fly deploy, which needs the owner's explicit word.

The controller, not the implementer, then checks the name "Vowel Play" against existing games and updates `Colony.md`.
