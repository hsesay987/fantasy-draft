# Friend-group games: design

Date: 2026-11-04
Branch: `more-party-games`

## Why

TopPic's party games should suit a close group of friends relaxing together: 5 to 12 people, usually in one room, on their phones. This is not a loud party product. Rules should be quick to learn, games should give friends something to laugh and argue about, and every game must stay fun at its smallest allowed group.

## Goals

- Add four party features: the vote game rework, drinking mode, In-Sync and party trivia with optional teams, plus Mafia.
- Add two solo-friendly trivia games outside party mode: Common Thread (hidden category, every topic) and Top Rung (a climbing question ladder).
- Tune each game's rules by group size so the minimum player count is good, not just allowed.

## Non-goals

- Voice or video chat. Friends are expected to talk in the room.
- The TV-plus-phones layout. It stays a separate milestone.
- AI players in party games.
- New accounts, payments or leaderboards.

## Anti-goals

These would make the work a failure even if it runs:

- Copying an existing game's name, art, music, catchphrases or look. In-Sync must not look like the Wavelength board game (no semicircular dial with coloured wedges and a sliding screen). Top Rung must not use Who Wants to Be a Millionaire's name, dark-blue spotlight set, money ladder wording, music or "final answer" phrase. Spectrum guessing and ladder quizzes are fine as mechanics.
- Drinking mode that pressures people, encourages heavy drinking or appears by default.
- Mafia that needs a human narrator or a long rules explanation.
- Screens that break at phone width.

## Build order

Each step is shippable by itself:

1. Vote game rework and drinking mode (shared by later games)
2. In-Sync
3. Common Thread
4. Party trivia with teams
5. Top Rung
6. Mafia

## Shared rules for party games

Party games follow the existing pattern: server-owned state in `app/topicDraft/formats/`, synced to the backend with `npm run sync:shared`, per-seat redaction in `snapshot()`, and timers through `tickRooms`. New formats are added to `FormatId`, `PARTY_FORMATS`, `FORMAT_IDS`, `PARTY_GAMES`, `ACTION_TYPES` and `PartySetup`.

Raise the party room cap from 10 to 12. Drafts and regular trivia stay at their current limits.

Each format sets its own minimum:

| Game | Min | Tuning |
|---|---|---|
| Vote games | 3 | Everyone guesses everyone up to 6 players. At 7+, each player guesses 3 assigned people per card, spread evenly, so cards stay short. |
| In-Sync | 2 | At 2, one gives the clue and one moves the signal. Rounds default to one per player, never below 4. |
| Party trivia | 2 | Teams can be used from 4 players. |
| Mafia | 5 | See the Mafia section. |
| Imposter | 3 | Unchanged. |

## Vote game rework

Applies to all four decks (Who's Wrong, Icks, Ultimatums, Did That Happen). It replaces majority scoring.

1. **Vote:** everyone secretly picks side A or B.
2. **Guess:** everyone guesses how the other players voted. Guess screens show player rows with A and B buttons.
3. **Reveal:** score and show results.

Scoring per card:

- +1 for each correct guess.
- If nobody who guessed a player got them right, that player gets +1.
- On Did That Happen, a vote matching the true answer also earns +1, and the true answer is shown.

A host setting, **Show votes** (on by default), controls the reveal:

- **On:** the booths open and everyone sees how each person voted and who guessed them right.
- **Off:** votes stay secret for the whole game, including the results screen. Players see only their own score changes and whether they were the "nobody got you" scorer. The server must not send other players' votes or guesses to any phone while this is off.

While Show votes is off, other players' totals also stay hidden until the final screen, because comparing totals between cards would reveal who scored. The final screen shows totals only. Vote-game drinking callouts must not expose votes in this mode, so the named callouts are replaced with a group toast (see Drinking mode).

Each phase has its own timer. Unanswered guesses simply score nothing. The rework adds a guess phase and removes `scoringSide` majority scoring. Keep the pixel voting booths.

## Drinking mode

An off-by-default toggle on every party game's setup screen. Turning it on asks the host to confirm that everyone playing is of legal drinking age. It never appears on non-party games.

- Calls are sips, capped at 3 per call. No chugging, downing or finishing a drink.
- Every drinking screen has a small line saying water counts and nobody has to drink.
- Callouts are server-decided, so every phone shows the same thing. They appear at the end of a round or phase, as a short animated pixel card with the player's sprite, a funny reason and the sip count. They never block play for more than a few seconds, and can be tapped past.
- Eliminated or disconnected players are skipped.
- **Pacing limits:** a player gets at most 3 sips per round and at most 10 sips per game. Once a player reaches 10, callouts skip them and show a playful "you're done, water break" card once. The server tracks these totals.
- **Handing out sips is display-only:** the card says "Sam hands out 3" and the room settles it out loud. There is no picker, phase or action for it.
- **Show votes off:** vote-game callouts that would name a voter's result (nobody guessed you, worst guesser, everyone fooled) are replaced with one group toast of 1 sip per card, the same on every phone.

Starting rules (copy can be sharpened, the reasons should be playful):

| Game | Who sips |
|---|---|
| Imposter | Everyone who voted wrong: 1. A caught imposter: 2. An uncaught imposter hands out 3 to players they choose. |
| Vote games | Anyone nobody guessed gets to hand out 1. The worst guesser of the card: 1. Did That Happen: everyone fooled: 1. |
| In-Sync | Clue giver on a total miss: 2. Everyone on a bullseye toasts: 1. |
| Party trivia | Wrong answers: 1. Slowest team or player on a round: 1. |
| Mafia | Each player killed: 1. Everyone who voted out an innocent: 1. Everyone toasts at game end: 1. |

## In-Sync

Players try to get on the same wavelength of thinking, without using that name anywhere.

**How a round works:**

1. One player, in turn order, privately sees a pair of opposites (for example "Overrated / Underrated") and a hidden target position on the line between them.
2. They type one clue that points to that spot.
3. All other players drag one shared marker on their phones. Anyone can move it, and every phone shows it moving live, throttled to about 5 updates a second. The room talks it over.
4. It locks when more than half the guessers tap Lock, or when the timer ends. At 2 players, the one guesser's lock decides it.
5. The reveal animation plays and the group scores.

**Scoring:** it is co-operative, a single group score. Bullseye 4, close 3, near 2, miss 0. The end screen gives a playful rank, from "Out of Sync" up to "Perfectly In-Sync". Room history records no individual winner.

**Look and animation:** this is the signature moment. Use a horizontal signal line, not a dial. Two moving sine waves sit on a dark screen: a calm one for the marker, and a scrambled one for the hidden target. While guessers drag, the marker wave's frequency shifts. On lock, the static clears across the screen, the target wave resolves and slides toward the marker, and the score bands light up. The closer the guess, the more the two waves lock into a single bright wave, with a burst on a bullseye and a flat, sad fizzle on a miss. Use canvas or SVG at phone frame rates, add sound through `useSound`, and honour reduced motion with a simple fade.

**Topics:** the host picks one deck. Default is **Friends & Hot Takes**, a general deck. Topic decks, chosen because people have strong opinions and a wide range to place things on:

Food, Films, TV Shows, Music, Books, Geography, History, Heroes & Villains (one combined deck), Anime, Video Games, NBA, Football.

Left out: Flags, Pokémon, Disney & Pixar and Movie Icons, which are too narrow to fill a deck with good opposites.

Write original pairs: about 60 for the general deck and at least 20 per topic deck. Avoid repeats within a room across rematches, as vote games do.

## Common Thread

The hidden-category game. **It is not a party game.** It lives in the Trivia hub, with one entry per topic, for **every topic in `PINPOINT_TOPICS`**. It has a daily puzzle for each topic (same answer for everyone that day, using the Pinpoint date logic) and practice rounds, like Pinpoint.

**How it plays:**

1. The round opens with the first clue already on screen. A clue is a pick that belongs to the hidden category, with its image and name.
2. The player can guess the category at any time from a fixed list of 8 options, or ask for the next clue.
3. There are 6 clues. Clues go from hardest to most obvious, so the last one nearly gives it away.
4. A wrong guess removes that option and reveals the next clue. Out of clues with no right guess is a loss.
5. Score: right on clue 1 earns 6 points, down to 1 point on clue 6. Share result is a grid like Pinpoint's.

**Content:** categories must be true facts. Build them offline into JSON, extending the approach in `scripts/buildPinpoint.ts`, from shared values in the real-fact data: for example "Directed by Christopher Nolan", "Debuted in the 1960s" or "Played for Real Madrid".

Quality rules:

- A category needs at least 6 picks, and must be neither too broad (no "Male" or "Human") nor a rewording of something obvious.
- Clue order runs from least to most famous within the category. Use a real fame signal such as Wikipedia pageviews or sitelinks, stored by the build script.
- The 7 wrong options come from the same topic, and are close enough to be tempting, with a mix of fact types so the options don't give away the answer's type. A clue pick must not also fit a wrong option shown in that round.
- Each topic needs at least 15 usable categories. If a topic falls short from existing columns, the script should fetch more facts for it. Hand-written categories are allowed only when their membership is checked against facts.

Do not add a separate Common Thread room mode in this project.

## Party trivia and teams

A new party format using the existing trivia bank (`TriviaCategory`, the same server loading as Summit), so questions stay real and fact-checked.

- The host picks a topic (any `hasTrivia` topic) and a question count (10, 15 or 20).
- **Teams option:** available from 4 players. The host chooses 2, 3 or 4 teams, and players are auto-split evenly with a Shuffle button and tap-to-move before starting.
- **Play:** everyone sees the question and 4 options at the same time, then a timer runs. Correct answers score, with a small speed bonus.
- **Team answers:** each member votes; the team's answer is its most-voted option, and a tie goes to whichever option was chosen first. Teammates can see their team's votes live. Other teams cannot.
- **Reveal:** shows the answer and the current standings after each question. Results show the winner, plus a per-player "carried the team" stat.

## Top Rung

A climbing quiz in the Trivia hub, as a fourth world. Original name and pixel-art look: a character climbing a tall ladder up a pixel structure, using the existing `WorldScene` system, with points rather than money.

- **Topics:** every `hasTrivia` topic, with a daily puzzle and free play like the other trivia worlds.
- **Climb:** 12 rungs, one question each, 4 options. Rungs 1 to 3 use 100-tier clues, 4 to 6 the 200 tier, 7 to 9 the 300 tier, and 10 to 12 the 400 tier.
- **Points:** grow with each rung, reaching a top prize on rung 12.
- **Safe ledges:** at rungs 4 and 8. A wrong answer drops you to your last ledge's points.
- **Walk away:** on any question before answering, keep your current points.
- **Lifelines, once each per climb:** Cut Two (remove two wrong options), Crowd Poll (a simulated poll that leans right, less reliably on higher rungs), Swap (replace the question at the same tier).
- **Playing with friends:** free play can be played in an online room: everyone answers the same questions at the same time with their own lifelines and walks away on their own. Highest points wins. This is not a party format in the setup list; it follows how Summit and Hot Air work online.
- **Tension:** build it with original sound cues and a growing height on screen.

Fall back to the bundled bank if the server has too few fresh clues, as Summit does.

## Mafia

A generic social deduction game, with the app as narrator, played on phones with talking in the room. The room is 5 to 12 players.

**Roles** (dealt privately, tap to view like Imposter's card):

| Players | Mafia | Doctor | Detective | Villagers |
|---|---|---|---|---|
| 5–6 | 1 | 1 | 0 | rest |
| 7–8 | 1 | 1 | 1 | rest |
| 9–12 | 2 | 1 | 1 | rest |

**Night:** every living player's phone shows a night screen, and everyone taps something so nobody can spot who is acting by watching phones. Villagers tap a harmless prompt. Mafia choose a target and can see each other's choices (if two mafia differ, the most recent choice wins). The doctor protects one player, not the same one twice in a row. The detective checks one player and privately learns "Mafia" or "Not Mafia".

**Day:** the app announces who died, or that nobody did. A timer runs for talking (2 minutes by default, host can tap to skip it). Then everyone votes to eliminate someone or skip. A majority of votes cast eliminates that player; otherwise nobody goes. The eliminated player's role is revealed.

**Winning:** the village wins when all mafia are gone. Mafia win when they equal or outnumber the rest. Winners score in room history.

**Smallest game:** with 5 players, the first night has a doctor save possible, and the mafia only need two eliminations plus a bad vote. Check that a 5-player game takes about 10 minutes and doesn't end on the first night through bad luck, and adjust if it does. One option: no kill on the first night at 5–6 players.

**Secrets:** the server sends a player only their own role, and mafia their partner. Night choices are never sent to anyone who shouldn't see them. Eliminated players become spectators and see all roles. If a player doesn't act before the timer, the action is skipped. A disconnected player is treated the same way.

**Copy:** an original, playful narrator voice. Keep it light, without gore.

## Testing

- Engine tests for each format: scoring, phase changes, timers, tuning at minimum and maximum player counts.
- Redaction tests: hidden votes, In-Sync target, Mafia roles and night actions must never reach the wrong seat. Cover Show votes off specifically.
- Common Thread data test: every topic has at least 15 categories, 6 clues each, and no clue fits a wrong option.
- Browser check at phone width with real rooms for every new screen.

## Left to the builder

- Exact timers, point values within the rules above, and copy.
- Component and file structure, following existing patterns.
- The exact Top Rung point table and the Crowd Poll odds.
- Wrong-option selection logic for Common Thread within the quality rules.

## My calls, not yet confirmed

- The names Common Thread and Top Rung.
- Show votes meaning "revealed after guessing", on by default, with votes secret all game when off.
- In-Sync being co-operative, with one shared marker.
- The In-Sync topic list.
- Drinking callouts capped at 3 sips, with a legal-age confirmation.
- Common Thread and Top Rung having daily puzzles.
- Top Rung's online room play, and Common Thread staying solo.
- Mafia role counts, including the doctor and detective.
- Drinking limits of 3 sips per round and 10 per game, display-only handing out, and a group toast replacing named callouts while Show votes is off.
- Other players' totals hidden until the final screen while Show votes is off.
