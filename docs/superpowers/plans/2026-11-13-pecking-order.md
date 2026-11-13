# Pecking Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Pecking Order, a ranking guess game on real data, in party rooms (phones, screen host, tournaments, teams), as solo free play, and as a solo daily.

**Architecture:** Offline build script writes complete ranked lists as JSON under `app/topicDraft/pecking/data/`, so `npm run sync:shared` carries them to the server. A pure engine `app/topicDraft/formats/pecking.ts` owns questions, timing, locking and scoring; the server runs it like Party Trivia, and room screens get only redacted views. Solo play runs the same engine locally with one player.

**Tech Stack:** Next.js 16 + React 19 web, Express 5 + Socket.IO backend with in-memory rooms, Prisma (dailies only, no schema change), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-new-games-design.md`, section 1 and "Shared rules".

## Global Constraints

- Format id `"pecking"`, title "Pecking Order". Joins `PARTY_FORMATS` and `FORMAT_IDS`.
- Question types: "Where does it rank?" (`kind: "rank"`, number answer) and "Who's at #N?" (`kind: "name"`, pick a name). Host mode `"rank" | "name" | "mixed"`; mixed alternates, starting with `"rank"`. Default `"mixed"`.
- Scoring: error = |guess rank − true rank|; points = `Math.round(100 * Math.max(0, 1 - error / (0.25 * size)))`. Exact = 100.
- Closest player in the room: +20 each when tied. Needs more than 0 points. Needs 2 or more players who answered (so solo never gets it).
- Ties in data share a rank (competition ranking: 1, 2, 2, 4). A tie group with rank r and k members spans r..r+k−1; an answer anywhere in the span is exact. Error is the distance to the nearest end of the span.
- "Who's at #N": error = distance from N to the picked name's span. A name not on the list scores 0 and is never locked. Each list name can be locked by one player per question; a later pick of a taken name is refused and the player picks again before the timer ends. "Taken" never says who.
- Questions per game: default 6, host chooses 4, 6, 8 or 10 (stored in `opts.teamSize`, the field every party game uses for length). Answer timer 20 s.
- Teams: team score is the sum of its members' points.
- Solo daily: 5 questions, same for everyone each day; score fraction = points / 500.
- Hidden information: before the reveal no seat (including a seat with no token and the screen) sees the true rank, the answer name, any ranks of list items, or other players' answers. Only the `taken` names show during a "Who's at #N" question.
- Room screens (`app/play/views/*`, `app/room/*`) must never import `app/topicDraft/pecking/data/*` or `app/topicDraft/pecking/lists.ts` (same rule as `vowelWords.ts`).
- Layout works at 320px with 12 seats.
- Drinking mode (optional): 1 sip to a player who scored 0 on a question ("Way off") or did not answer ("No answer"). Nobody else sips.
- Every list file shows `source` and `asOf`; the UI shows them on the list picker and in reveals.
- No copied game content; all copy is our own.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never use `backend/.env.local` or the `api-local` config. Local API uses `DATABASE_URL=postgresql://localhost:5432/toppic_dev`.

## Rulings made while planning

- **Data location.** The spec says `app/pecking/data/`. Only `app/topicDraft` syncs to the backend, and the server must score, so data lives in `app/topicDraft/pecking/data/`. Cost if wrong: one folder move.
- **Rank range.** A rank guess must be an integer from 1 to the list size; anything else is refused by the engine. The UI clamps before sending.
- **Name matching.** Picks match on normalised text (case, accents, punctuation, a leading "the") plus stored aliases.
- **Question draw.** Questions draw uniformly from the whole list. Lists rotate round-robin across the chosen pools. A rematch avoids items already asked in this room (`room.seen` entries `pk:<list>:<name>`).
- **Reveal.** 8 s, and only the host can move on early (joins `HOST_MOVES_ON`).

## Review Focus

1. Two players lock the same name in the same tick: the first keeps it, the second gets a refusal, sees "Taken" and can pick another name. Test in Task 2.
2. A player leaves mid-question: the question closes once everyone still present has answered. Test in Task 2 (`settle`) and Task 4.
3. A tie group in the data (two items with the same value): both share a rank, and a guess at either rank is exact. Test in Tasks 1 and 2.
4. Raw API snapshot for a seat with no token during a "Who's at #N" question: it contains `choices` and `taken`, but no `pool`, no spans, no answer. Test in Task 4.
5. Typed rank out of range (0, size+1, 3.5, "12", NaN): refused, state unchanged. Test in Task 2.

---

### Task 1: Ranked list data

**Files:**
- Create: `scripts/buildPecking.ts`
- Create: `app/topicDraft/pecking/data/<id>.json` (one per list)
- Create: `app/topicDraft/pecking/lists.ts`
- Create: `app/topicDraft/pecking/meta.ts` (written by the build script; ids, titles, stat, size, source and date only, no items)
- Test: `app/topicDraft/pecking/lists.test.ts`

**Interfaces:**
- Produces:
  - `type PeckItem = { name: string; value: number; rank: number; aliases?: string[] }`
  - `type PeckList = { id: string; title: string; stat: string; unit?: string; fmt?: "big" | "int" | "dec"; source: string; asOf: string; items: PeckItem[] }` (items in rank order, best first)
  - `PECKING_LISTS: PeckList[]`, `peckingList(id: string): PeckList | undefined`, `PECKING_LIST_IDS: string[]`
  - `spanOf(list: PeckList, item: PeckItem): [number, number]`
  - `normName(text: string): string`, `matchName(list: PeckList, text: string): PeckItem | null`
  - `PECKING_META: { id: string; title: string; stat: string; size: number; source: string; asOf: string }[]` in `meta.ts`, which imports nothing from `data/`

Launch lists and ids: `countries-population`, `countries-area`, `countries-gdp` (UN members, 193), `cities` (top 100 most populous), `films-boxoffice` (top 100 worldwide gross), `buildings` (top 100 tallest), `nba-points` (top 100 all-time), `pokemon-bst` (all), `rivers` (top 100 longest), `mountains` (top 100 highest).
Sources: Wikidata SPARQL, PokéAPI, the NBA catalog. Reuse the fetch/backoff helpers' shape from `scripts/buildPinpoint.ts` (copy, don't import a script). Use the same User-Agent pattern as buildPinpoint. Any list the open data can't support cleanly is dropped or swapped for a comparable one; record why in the script's header comment. Ship at least 4 lists.

- [ ] **Step 1: Write the failing tests** in `lists.test.ts`:

```ts
it("PECKING_META matches the lists", () => { expect(PECKING_META.map((m) => m.id)).toEqual(PECKING_LIST_IDS); });
it("ships at least 4 lists, each complete and in rank order", () => {
  expect(PECKING_LISTS.length).toBeGreaterThanOrEqual(4);
  for (const l of PECKING_LISTS) {
    expect(l.items.length).toBeGreaterThanOrEqual(20);
    expect(l.source).toBeTruthy(); expect(l.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    l.items.forEach((it, i) => {
      if (i > 0) expect(it.value).toBeLessThanOrEqual(l.items[i - 1]!.value);
      // competition ranking: rank = 1 + number of items with a strictly higher value
      expect(it.rank).toBe(1 + l.items.filter((o) => o.value > it.value).length);
    });
    expect(new Set(l.items.map((i) => normName(i.name))).size).toBe(l.items.length);
  }
});
it("country lists have the 193 UN members", () => {
  for (const id of ["countries-population", "countries-area", "countries-gdp"]) if (peckingList(id)) expect(peckingList(id)!.items.length).toBe(193);
});
it("sanity: the real world's top spots", () => {
  const top = (id: string, n: number) => peckingList(id)?.items.slice(0, n).map((i) => i.name);
  if (peckingList("countries-population")) expect(top("countries-population", 2)).toEqual(expect.arrayContaining(["India", "China"]));
  if (peckingList("countries-area")) expect(top("countries-area", 1)).toEqual(["Russia"]);
  if (peckingList("mountains")) expect(top("mountains", 1)).toEqual(["Mount Everest"]);
  if (peckingList("buildings")) expect(top("buildings", 1)).toEqual(["Burj Khalifa"]);
  if (peckingList("rivers")) expect(top("rivers", 2)).toEqual(expect.arrayContaining(["Nile"]));
});
it("tie groups share a rank and span it", () => {
  const l: PeckList = { id: "t", title: "T", stat: "S", source: "x", asOf: "2026-11-13", items: [
    { name: "A", value: 9, rank: 1 }, { name: "B", value: 5, rank: 2 }, { name: "C", value: 5, rank: 2 }, { name: "D", value: 1, rank: 4 } ] };
  expect(spanOf(l, l.items[1]!)).toEqual([2, 3]);
  expect(spanOf(l, l.items[3]!)).toEqual([4, 4]);
});
it("matchName ignores case, accents, punctuation and a leading 'the', and knows aliases", () => {
  const l = { ...PECKING_LISTS[0]!, items: [{ name: "Côte d'Ivoire", value: 2, rank: 1, aliases: ["Ivory Coast"] }, { name: "The Gambia", value: 1, rank: 2 }] };
  expect(matchName(l, "cote divoire")?.name).toBe("Côte d'Ivoire");
  expect(matchName(l, "ivory coast")?.name).toBe("Côte d'Ivoire");
  expect(matchName(l, "gambia")?.name).toBe("The Gambia");
  expect(matchName(l, "Narnia")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run app/topicDraft/pecking/lists.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `lists.ts`** (types, helpers, imports of every JSON). Write `scripts/buildPecking.ts` (run: `npx tsx scripts/buildPecking.ts [id ...]`), run it, and commit the JSON it writes. Common English names (`Russia`, not `Russian Federation`); official names go in `aliases`.
- [ ] **Step 4: Run** the test again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pecking): ranked lists from open data`.

---

### Task 2: Engine

**Files:**
- Create: `app/topicDraft/formats/pecking.ts`
- Test: `app/topicDraft/formats/pecking.test.ts`

**Interfaces:**
- Consumes: Task 1 types and helpers; `addCalls`, `initDrinks`, `DrinkState` from `../party/drinks`; `has`, `own` from `../party/own`; the seeded RNG the other engines use.
- Produces:
  - `QUESTION_MS = 20_000`, `REVEAL_MS = 8_000`, `CLOSEST_BONUS = 20`, `DAILY_COUNT = 5`
  - `type PeckMode = "rank" | "name" | "mixed"`
  - `type PeckQuestion = { kind: "rank" | "name"; list: string; title: string; stat: string; size: number; item?: string; at?: number; answer: { span: [number, number]; names: string[]; value: number }; pool?: { name: string; span: [number, number]; aliases?: string[] }[] }` (`item` for rank kind; `at` = N and `pool` = whole list for name kind)
  - `type PeckAnswer = { guess: number | null; name?: string; at: number }`
  - `type PeckState = { players: string[]; questions: PeckQuestion[]; round: number; phase: "question" | "reveal"; answers: Record<string, PeckAnswer>; taken: string[]; points: Record<string, number>; history: { scores: Record<string, { guess: number | null; name?: string; points: number; bonus: boolean }> }[]; phaseAt: number; startedAt: number; done: boolean; drinks?: DrinkState }`
  - `type PeckView` = state with each question's `answer` and `pool` removed while it is asked; the asked name question gains `choices: string[]` (alphabetical names); other players' answers blanked to `{ guess: null, at: 0 }` while asking; plus `total: number`. After the reveal, `answer` shows and `pool` stays removed; each history score carries what the reveal needs.
  - `init(o: { players: string[]; lists: PeckList[]; mode: PeckMode; count: number; avoid?: string[]; drinking?: boolean; seed: number; now: number }): PeckState`
  - `makeQuestions(lists: PeckList[], mode: PeckMode, count: number, seed: number, avoid?: string[]): PeckQuestion[]` (also used by the daily)
  - `pointsFor(error: number, size: number): number`; `distance(x: number, span: [number, number]): number`
  - `guessRank(s, by, rank: unknown, now): PeckState`; `pickName(s, by, text: unknown, now): PeckState`; `settle(s, gone: string[], now)`; `next(s, now)`; `tick(s, now)`; `redactFor(s, me: string | null): PeckView`; `seenKeys(s): string[]` (`pk:<list>:<name>` for each asked item)

- [ ] **Step 1: Write the failing tests.** Use a small fixture list (size 20, with one tie group) so numbers are exact:

```ts
it("pointsFor: exact 100, linear to 0 at a quarter of the list", () => {
  expect(pointsFor(0, 20)).toBe(100); expect(pointsFor(1, 20)).toBe(80); expect(pointsFor(5, 20)).toBe(0); expect(pointsFor(9, 20)).toBe(0);
});
it("distance to a tie span is to its nearest end", () => { expect(distance(3, [2, 3])).toBe(0); expect(distance(6, [2, 3])).toBe(3); });
it("mixed mode alternates, starting with rank; count is respected; avoid skips asked items", () => { /* kinds = rank,name,rank,... ; length = count */ });
it("guessRank accepts only integers 1..size, once, before the deadline", () => { /* 0, 21, 3.5, "12", NaN → unchanged; a second answer → unchanged; at phaseAt+QUESTION_MS ok, +1 refused */ });
it("pickName locks a name for one player; a second pick of it is refused, then another name is accepted", () => {});
it("an unknown name is accepted, scores 0 and is not added to taken", () => {});
it("who's at #N scores by the picked name's span", () => { /* N inside a tie span → 100 */ });
it("reveal: closest player +20, ties each get it, 0 points get none, a lone answerer gets none", () => {});
it("everyone answered closes the question; tick closes it at the deadline; reveal moves on after REVEAL_MS; next only in reveal", () => {});
it("settle closes once everyone still present has answered", () => {});
it("drinking: 1 sip for 0 points or no answer, nobody else", () => {});
it("redactFor hides answer, pool, spans and other players' guesses during a question, for a player and for null", () => {
  // for each viewer in [...players, null]: JSON of the asked question has no "answer", no "pool", no "span";
  // name kind has `choices` sorted, and `taken`; other players' answers are { guess: null, at: 0 }; own answer visible.
});
it("done game: still no pool in the view", () => {});
```

- [ ] **Step 2: Run** `npx vitest run app/topicDraft/formats/pecking.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `pecking.ts`, modelled on `partytrivia.ts` (server clock, `has`/`own` for record lookups, immutable updates). `QUESTION_MS` is inclusive, as in Party Trivia.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pecking): engine`.

---

### Task 3: Shared wiring (types, core, pools, tournaments)

**Files:**
- Modify: `app/play/types.ts` (FormatId, `PARTY_FORMATS`, `Opts.peckMode?: PeckMode`)
- Modify: `app/topicDraft/core.ts` (GameState union, init, applyAction for `answer` with `rank` and `pick` with `name`, tick/next, `isDone`, results case with the other points games)
- Modify: `app/topicDraft/party/pools.ts` (`poolIdsFor("pecking")` = `PECKING_LIST_IDS`, `poolTitleFor` = list title)
- Modify: `app/topicDraft/party/tournament.ts` (`awardsFor`: add `"pecking"` to the `vote`/`imposter`/`vowelparty` case)
- Modify: `app/play/teamStandings.ts` if it lists teamed formats
- Run: `npm run sync:shared` and commit the regenerated `backend/src/shared`
- Test: `app/topicDraft/party/tournament.test.ts`, `app/topicDraft/mixedPools.test.ts`

**Interfaces:**
- Consumes: Task 2 `init`, `guessRank`, `pickName`, `next`, `tick`.
- Produces: action shapes `{ type: "answer", by, rank: number }` and `{ type: "pick", by, name: string }`; `setup.pools` = list ids; `opts.teamSize` = question count; `opts.peckMode`.

- [ ] **Step 1: Failing tests:** `awardsFor` for `"pecking"` ranks by points, ties share a place, with teams it ranks teams by summed points; `poolIdsFor("pecking")` equals `PECKING_LIST_IDS`; a mixed-pool pecking setup draws questions from every chosen list.
- [ ] **Step 2: Run** `npx vitest run app/topicDraft`. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring; run `npm run sync:shared`.
- [ ] **Step 4: Run** `npx vitest run app/topicDraft app/play` and `npx tsc --noEmit -p .`. Expected: PASS, no new type errors.
- [ ] **Step 5: Commit** `feat(pecking): shared wiring and tournament awards`.

---

### Task 4: Server rooms

**Files:**
- Modify: `backend/src/services/playRooms.ts`
- Test: `backend/src/services/playRooms.test.ts` (or a new `playRooms.pecking.test.ts` next to it)

Changes in `playRooms.ts`: `FORMAT_IDS`; party setup parsing (`teamed` includes pecking; `teamSize` snapped to 4/6/8/10, default 6; `peckMode` validated, default `"mixed"`; title `Pecking Order: <mixed>`); `settleParty`; `HOST_MOVES_ON`; `autoplay` returns null; redaction via `PK.redactFor`; `finish` adds `seenKeys` to `room.seen` and passes `avoid` on rematch; `MIN_PLAYERS` default (2).

- [ ] **Step 1: Failing tests:**
  - start a 3-seat pecking room; for every seat token and for no token, the snapshot during a name question has `choices` and `taken` and no `pool`, `span` or `answer`; other seats' guesses are blank. Same check for a rank question.
  - two seats pick the same name: the second `act` returns `{ ok: false }`, `taken` lists the name, and that seat's next pick of another name succeeds.
  - a seat leaves after the others answered: the question reveals.
  - `next` from a non-host seat is refused during the reveal.
  - a rematch avoids items from the first game.
  - a 4-game tournament with pecking in it credits awards.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/services`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the backend tests and `npx tsc --noEmit` in `backend`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pecking): server rooms`.

---

### Task 5: Room lobby and setup

**Files:**
- Modify: `app/play/formats.ts` (entry: title "Pecking Order", tagline and 3 `how` lines in our own words, an icon from lucide-react, `usesPool: true`)
- Modify: `app/play/categories.ts` (short label)
- Modify: `app/play/topicOptions.ts` (options = list ids with titles; multi-topic like Party Trivia)
- Modify: `app/play/PartySetup.tsx` (Questions chips 4/6/8/10, default 6; Question type chips "Where does it rank?" / "Who's at #N?" / "Mixed", default Mixed; Teams and Drinking panels as for Vowel Party)
- Modify: `app/room/[code]/page.tsx` (picker condition, setup summary line `"<n> questions · <type> · <teams or every player for themselves> · 2+ players"`, played-games line)
- Test: `app/play/topicOptions.test.ts`, `app/play/tournamentPlan.test.ts`

The list picker shows each list's source and date from `PECKING_META` (Task 1, `app/topicDraft/pecking/meta.ts`). Rooms import only that file, so no item data enters room bundles.

- [ ] **Step 1: Failing tests:** `topicOptions("pecking")` lists every list id; `fitsTable("pecking", 2)` is true; a tournament lineup can add pecking with its own list.
- [ ] **Step 2: Run** `npx vitest run app/play`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `npx tsc --noEmit -p .` and `npx eslint` on the changed files. Expected: PASS, no new lint errors.
- [ ] **Step 5: Commit** `feat(pecking): lobby and setup`.

---

### Task 6: Phone view, results and TV screen

**Files:**
- Create: `app/play/views/PeckingView.tsx`
- Modify: `app/play/GameScreen.tsx` (view case and results case)
- Modify: `app/play/screenInfo.ts` (phase line `Question <i> of <n> · <Where does it rank? | Who's at #N?>`, `Answer` in reveal; board rows from `points`)
- Test: `app/play/screenInfo.test.ts`

Phone, rank question: prompt "Where does <item> rank by <stat>?" with list title. A drag marker along a vertical ladder 1..size gets close, + and − fine-tune by 1, and a number field also works. All three set the same value, clamped to 1..size. Lock sends `answer`.
Phone, name question: prompt "Who's #<N> by <stat>?". Autocomplete over `choices` (filter by `normName` substring), names in `taken` greyed out with "Taken". Free text is allowed (scores 0 if unknown). A refused pick shows "Taken, pick another".
Reveal (phone and TV): the true answer with its value and unit, each player's guess with points and "+20 closest", source and date of the list.
TV: a long ladder 1..size. During the question it shows only who has locked (no positions). At the reveal, sprites jump to their guesses, then the true span lights up, and the leaderboard shows "+N". Uses `ScreenFrame` and `Leaderboard` as the other party views do.
Results: final table, team totals when teamed, Play again / Rematch like `PartyTriviaResults`.

- [ ] **Step 1: Failing test:** `screenInfo` phase strings for both kinds, reveal and done.
- [ ] **Step 2: Run** `npx vitest run app/play/screenInfo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `PeckingView.tsx` must not import from `app/topicDraft/pecking/`.
- [ ] **Step 4: Browser check** with the local recipe (API from an empty scratch dir with `CORS_ORIGIN`, `DATABASE_URL=postgresql://localhost:5432/toppic_dev`; web with `NEXT_PUBLIC_API_URL`). Three seats plus a screen seat: play one rank and one name question, lose a lock race, check the reveal and the TV ladder. Check 320px with 12 seats. Stop only the servers you started, by PID.
- [ ] **Step 5: Commit** `feat(pecking): phone view, results and TV ladder`.

---

### Task 7: Solo free play

**Files:**
- Create: `app/pecking/page.tsx` (list picker: title, stat, size, source and date)
- Create: `app/pecking/[list]/page.tsx`
- Create: `app/pecking/PeckingSolo.tsx` (runs the engine locally with players `["You"]`, 6 mixed questions, ticks the clock with a timer, reuses the phone question and reveal parts from Task 6 by extracting them into `app/pecking/parts.tsx` if Task 6 kept them private)
- Modify: `app/trivia/page.tsx` (free-play tile with `href: "/pecking"`)

- [ ] **Step 1: Browser check plan:** solo game of 6 questions ends with a total out of 600 and a "Play again" that deals new questions.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `npx tsc --noEmit -p .`, eslint on changed files, and the browser check. Expected: PASS.
- [ ] **Step 4: Commit** `feat(pecking): solo free play`.

---

### Task 8: Solo daily

**Files:**
- Modify: `app/lib/daily.ts` (`DailyGame` gains `"pecking"`, title "Pecking Order"; `DAILY_WORLD` stays for the pixel-world games only, so type it over the games that have a world)
- Modify: `backend/src/services/daily.service.ts` (`DAILY_GAMES` gains `"pecking"`)
- Modify: `backend/src/routes/daily.route.ts` (`build("pecking", day)` = `{ questions: makeQuestions(PECKING_LISTS, "mixed", DAILY_COUNT, dayNumber(day)) }`)
- Modify: `app/daily/[game]/page.tsx` (pecking branch before the world lookup: plays the daily with `PeckingSolo` in daily mode, records `Played` with a share grid of one square per question, e.g. 🟩 ≥ 80, 🟨 ≥ 40, 🟥 below, and checkpoint text from the score band)
- Modify: `app/trivia/HubArt.tsx` (new `art: "pecking"`: a small pixel ladder with three birds on different rungs) and `app/trivia/page.tsx` (tile gets `daily: "pecking"`, `art: "pecking"`)
- Test: `backend/src/services/daily.service.test.ts`

- [ ] **Step 1: Failing tests:** `isDailyGame("pecking")`; the daily build for one day is the same on two calls and has 5 questions alternating rank/name; two different days differ.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/services/daily.service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Run `npm run sync:shared` if the shared engine changed.
- [ ] **Step 4: Run** all tests (`npm test` in root and backend), type checks, and a browser check of `/daily/pecking` and the hub tile. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pecking): solo daily`.
