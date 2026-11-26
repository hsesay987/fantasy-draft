# Elimination Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-game elimination for scoring party games and a tournament cut, with eliminated players watching.

**Architecture:** A pure shared module (`app/topicDraft/party/elimination.ts`, synced to the backend) decides who goes out and
who is cut. The server keeps the result on the room (`room.out`, `tournament.out`), feeds out players into each game's
existing `settle(s, gone)`, refuses their actions, and sends `out` in the snapshot. The web reports an out seat as a
watcher and shows banners and an Eliminated list.

**Tech Stack:** TypeScript, Next.js 16, Express 5, Vitest.

**Spec:** docs/superpowers/specs/2026-11-27-elimination-design.md

## Global Constraints
- Formats: partytrivia, pecking, vowelparty, sayless, npat, dodge, vote, insync. Nothing else changes.
- Elimination is on only when `opts.elimination` is true, there are 4+ players, and teams are off (`opts.teams < 2`).
- Round counter: `round` (partytrivia, pecking, vowelparty, npat sheet, dodge, vote, insync), `turn` (sayless), `cat` (npat dig/question).
- Never below 2 active players; never below 2 tournament finalists. Ties never decide by chance.
- Tournament cut: 0 / 1 / 2 per game, default 0.
- Run `npm run sync:shared` after editing `app/topicDraft/**` or `app/play/types.ts`.

## Review Focus
- A player who leaves the room after being eliminated: stays in the Eliminated list, no double handling.
- An eliminated host: the room still moves on (host-only Next must work for the remaining host logic).
- A rematch or the next tournament game: `room.out` resets; cut players stay out for the tournament only.
- Two players tied lowest on total and on the round: nobody goes out.
- Elimination on but players drop to 3 by leaving: still never below 2.

---

### Task 1: Shared elimination rules
**Files:** Create `app/topicDraft/party/elimination.ts`, test `app/topicDraft/party/elimination.test.ts`.
**Produces:**
- `ELIMINATION_FORMATS: Set<FormatId>`
- `eliminationOn(setup: Pick<GameSetup,"format"|"opts">, players: number): boolean`
- `roundOf(format: FormatId, s: unknown): number`
- `pickOut(points: Record<string,number>, gained: Record<string,number>, active: string[]): string | null`
- `cutAfter(totals: Record<string,number>, finalists: string[], cut: number): string[]`
- `OUT_SIP: DrinkCall` factory `outSip(name)`.
- [ ] Tests: lowest total out; tie broken by round gains; full tie → null; 2 active → null; cutAfter keeps line ties, never below 2, cut 0 → [].
- [ ] Implement, run `npx vitest run app/topicDraft/party/elimination.test.ts`, commit.

### Task 2: Server: eliminate during a game
**Files:** `backend/src/services/playRooms.ts`, test `backend/src/services/playRooms.elimination.test.ts`.
**Consumes:** Task 1. **Produces:** `room.out: { name: string; round: number; place: number }[]`, `room.outPrev: Record<string,number>`, `room.outRound: number`; snapshot field `out`.
- [ ] Tests (Party Trivia room, 5 players, elimination on): after round 1 moves on, lowest is in `out`; their action is refused; settle skips them (question closes without them); never below 2; off by default; teams on → never.
- [ ] Implement: check in `commit` when `roundOf` increases and the game is not done; add out names to `settleParty`'s gone list; refuse actions from out seats; reset on start; drinking sip via `addCalls`.
- [ ] Run backend tests, commit.

### Task 3: Server: tournament cut
**Files:** `app/topicDraft/party/tournament.ts` (`Tournament.cut?`, `Tournament.out?`), `backend/src/services/playRooms.ts` (`startTournament` takes `cut`, `recordTournamentGame` cuts, `startRoom` deals only finalists), standings order.
- [ ] Tests: cut 1 after game 1 removes the lowest total from the next game's players; tie at the line keeps both; never below 2; standings list finalists first then cut players latest first.
- [ ] Implement, run, commit.

### Task 4: Web: watch mode, banners, results list
**Files:** `app/play/onlineApi.ts` (`RoomSnapshot.out`), `app/play/useRemoteGame.ts` (out seat → `me: null`, out names in `gone`), new `app/play/EliminationBar.tsx` (banner "Eliminated: Name", own "You're out · round N, Kth place"), `app/play/GameScreen.tsx` (mount bar; Eliminated list under results), room page wiring.
- [ ] Typecheck, preview locally with a stub snapshot, commit.

### Task 5: Setup and lobby text
**Files:** `app/play/PartySetup.tsx` (toggle, only when it fits), `app/play/types.ts` (`elimination?: boolean`), server opts sanitiser, room lobby line (" · elimination"), tournament setup cut chips (`TournamentSetup.tsx`) and `startTournament` call.
- [ ] Typecheck, full tests, commit.
