# Elimination mode

Approved by the owner on 2026-11-27 ("pick sensible defaults and show me the design", then "approved, go ahead").

## Why
Party nights with bigger groups want a thinning-out finish: a full room that narrows to a final showdown, in single games
and across a tournament night.

## Goals
- In-game elimination for party games that score every player every round.
- A tournament cut after each game.
- Eliminated or cut players stay in the room and watch.

## Non-goals
- Drafts, Mafia, Imposter, duos, team play, local (pass and play) games.
- Changing any game's rules when elimination is off.

## Anti-goals
- Knocking someone out at random. Ties never decide by chance.
- Leaving fewer than 2 players in a game or a tournament.
- Breaking rooms that are already running.

## Approaches
1. **Room-level layer (chosen).** Every fitting game already has `settle(s, gone)`: players who left are skipped and
   nobody waits on them. Eliminated players are added to that list (without being marked as left), and the server
   blocks their actions. One shared module decides who goes out; each game needs only a round counter.
2. Elimination inside every engine: about 8 times the code for the same behaviour.
3. Tournament cut only: simplest, but drops in-game elimination, which the owner asked for.

## In a game
- Setting: "Elimination" toggle in party setup (`opts.elimination`). Shown only for a fitting format with 4+ players
  and teams off. The server ignores it otherwise.
- Formats: partytrivia, pecking, vowelparty, sayless, npat (all styles), dodge, vote, insync (3+ players).
- When: each time the game's round counter moves on and the game is not done, so the last round never eliminates.
  Round counter per format: `round` (partytrivia, pecking, vowelparty, npat sheet, dodge, vote, insync), `turn`
  (sayless), `cat` (npat dig and question style).
- Who: the active player with the lowest total `points`. Tie: lowest points gained since the previous round change.
  Still tied: nobody goes out that round.
- Floor: never below 2 active players.
- Out player: treated like a departed player by the engine (`settle`), actions refused by the server, score frozen
  as it was when they went out. Their phone shows "You're out · round N, Kth place" over the live game in watch mode.
- Everyone sees a short "Eliminated: Name" banner when it happens (phones and TV).
- Results: an "Eliminated" list below the game's own results, in the order players went out.
- Drinking mode: going out costs 1 sip.

## In a tournament
- Setting: "Cut after each game": Off / 1 / 2 (`tournament.cut`, default 0).
- After each game's awards: the lowest tournament totals are cut. A tie at the cut line keeps everyone tied.
  Never below 2 finalists.
- Cut players stay in the room, watch, and are not dealt into later games.
- Final standings: finalists by total, then cut players by when they were cut (latest first).

## Builder's calls
- Data lives on the room (`room.out`, `tournament.out`) and goes out in the snapshot; engines stay untouched.
- Spectator view reuses the existing watch mode: the online controller reports `me` as null for an out seat.
