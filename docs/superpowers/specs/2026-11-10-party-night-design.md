# Party night: screen host, teams, mixed topics, buzz mode and tournaments: design

Status: requested by the owner on 2026-11-10. The owner skipped the design questions, so every rule below marked "Claude's call" is Claude's decision and the owner can change it.

## Intent

The owner asked for two things in online party rooms:

1. "For all the party games allow the host to choose the topics allowing multiple choices to mix."
2. "Add a version to make a tournament in the party with multiple games and a leaderboard."
3. "Create an option that the host can choose to play or it can act as host that displays the game to everyone, shows whose turn and shows the leaderboard, allow the host to customize the teams and topics (choosing one or multiple)."
4. "Add a buzz option for all party games if they want to do it in person rather than on their phone."

The owner asked for it as fast as possible.

A friend group plays several games in one night. Mixing topics keeps rounds fresh. A tournament gives the night a single overall winner.

## Goals

- In every party game that has a topic or deck, the host can pick one or more of them, and the game draws from all picked ones.
- The host can run a tournament: a list of games played in order, with a leaderboard after each game and a champion at the end.
- Both work with every existing party game, including Vowel Play and Vowel Party.
- The host can run the night from a TV or laptop instead of playing.
- Friends in one room can buzz in.

## Non-goals

- Mixing topics in the draft games, Summit (Jeopardy) or Hot Air (Feud). They keep one topic. (Claude's call: the owner said "party games".)
- Saving tournaments after the room closes. Rooms live in memory, and a tournament lives with its room.
- Tournaments across rooms, public leaderboards or accounts.

## Anti-goals

- A mixed game that leaks an answer to phones early (the Vowel Play rule still holds: room screens never load the word list).
- A tournament that a player leaving, a tie, or a game with no single winner can break.
- Changing how a single game plays when the host picks only one topic.

## Mixed topics (Claude's calls)

- Applies to Imposter (character topics), the vote games (decks: Who's Wrong, Icks, Ultimatums, Did That Happen), In-Sync (pair decks), Party Trivia (trivia topics), Vowel Play and Vowel Party (vowel topics). Mafia has no topic and is unchanged.
- The setup screen turns the topic or deck chips into multi-select. One chip is selected by default, as today. "Mix all" selects every chip; tapping a selected chip removes it; at least one stays selected.
- The setup sends `pools: string[]` (1 to all of the format's ids). `pool` stays and equals `pools[0]`, so old clients and history keep working.
- The server checks every id with the same rule it uses today for one id, removes duplicates, and refuses the setup if any id is unknown.
- How each game mixes:
  - **Vote games and In-Sync:** the cards or pairs of all picked decks are pooled, then dealt with the existing unseen-first rule.
  - **Imposter:** each round picks one of the picked topics at random, then the secret and its look-alikes come from that topic, so the options stay a fair set. The round shows its topic.
  - **Party Trivia:** the server fetches categories from each picked topic, spread as evenly as it can, and deals them in a shuffled order.
  - **Vowel Play and Vowel Party:** names from all picked topics are pooled. Each word shows its own topic as the hint, because the topic is the only hint the spec allows.
- Titles: one topic shows as today. Two or three show as "A, B and C". More show as "Mixed: A, B +N more".
- Seen and avoid tracking works as today; the ids are already unique across decks and topics.

## Tournament (Claude's calls)

### Setting one up

- In the lobby the host taps "Start a tournament", next to "Surprise us".
- The host builds a list of 2 to 8 games by tapping games in order. A "Surprise me" button fills a list of 4 random games that fit the current seat count. A game can appear more than once.
- Before each game the host sees that game's normal setup screen, filled with the last settings used for that format, and confirms or changes it. This reuses every existing setup screen.
- The host can end the tournament early. Then the leaderboard so far is final.

### Scoring

Each finished game gives tournament points to the players who were seated when it started:

- Games with per-player points (vote games, Imposter, Party Trivia without teams, Vowel Play, Vowel Party, Summit, Hot Air): players are ranked by those points. 1st gets 5, 2nd 3, 3rd 2, and everyone else 1. Tied players share the higher place.
- Party Trivia with teams: teams are ranked by team points, and every teammate gets the team's place points.
- Vowel Play head to head: the winner gets 5 and the other 1; a draw gives both 3.
- Mafia: everyone on the winning side gets 5, everyone else 1.
- In-Sync (co-operative): everyone gets 2.
- Draft games: ranked by the judge's team scores when the verdict arrives; if judging fails, everyone gets 1.
- A player who left during the game gets nothing for that game but keeps earlier points.
- A game that ends with no result (everyone walked out) gives no points.

### Leaderboard

- Shown in the lobby between games, on each game's finished banner, and on a final champion screen.
- Shows rank, player sprite, name, total, and the points from the last game.
- Players who join mid-tournament start at 0. Players who left stay listed, faded.
- The top total wins. A tie at the top is a shared title.
- The champion screen has "Play again" (same list, new totals) and "Back to the room".

### Where it lives

- Server: the room gains an optional `tournament` object with the list, the position, per-game awards and totals. Awards are computed by a pure function in shared code from the finished state, so tests can pin them.
- Client: a tournament panel in the room lobby, a leaderboard component in the pixel kit's style, and the champion screen.

## Screen host (Claude's calls)

- In the lobby the host has a switch: **Play** (default, as today) or **Host on a screen**.
- A screen host is a seat that stays in the room and keeps every host control (pick game, setup, start, next, end, back to lobby), but is never a player. It does not count towards player minimums or the seat cap, and no game state ever treats it as a player.
- Its device shows the public view of the game, laid out large for a TV or laptop:
  - the game and topic title;
  - whose turn it is, when the game has turns (Imposter's clue giver, In-Sync's giver, Vowel Play's buzzer, Party Trivia's buzzer in buzz mode);
  - the phase and its clock;
  - the public board (question and options, clues, prompt, letters);
  - the leaderboard, by player or by team.
- It never shows secrets: no Imposter secret or imposter, no Mafia roles or night actions, no In-Sync target before the reveal, no answers before their reveal. The server redacts the screen seat's state exactly as for a viewer with no seat.
- The server refuses any game action from the screen seat except host controls.
- Only one screen host per room; switching back to Play makes it a player again from the next game.

## Teams (Claude's calls)

- The host can split players into 2 to 4 teams for Party Trivia (as today), Vowel Party, the vote games and Imposter. Mafia keeps its roles; In-Sync is already one team; head to head stays 1 v 1.
- Party Trivia keeps its own team rules. For the other games, a team's score is the sum of its players' points, shown as team standings on the leaderboard, the screen and the results. The game itself plays the same.
- The team picker is the existing one (random split, then tap to move).

## Buzz mode for in-person play (Claude's calls)

- Party games with a right answer get an **Answer** choice: **On phones** (today) or **Buzz**.
  - **Party Trivia, Buzz:** the question and options show on everyone's screen. Phones show one big Buzz button. The first to buzz gets 5 seconds to tap their answer; their buzz time shows to everyone, to the millisecond, measured by the server. Right scores as today. Wrong costs 50 points (never below 0), locks that player out of this question, and reopens buzzing for the rest until time runs out. With teams, a buzz answers for the team.
  - **Vowel Party, Buzz:** plays as Vowel Play's Voice mode (buzz, say it aloud, the others vote Right or Wrong), with up to 12 players.
- Games without a single right answer (Imposter, the vote games, Mafia, In-Sync) have nothing to buzz for and keep their phone controls.

## Checks

- Unit tests for each format's mixing and for every scoring rule, including ties, departures, teams, the Mafia side and late draft verdicts.
- Route tests that a mixed setup with an unknown id is refused and that `pool` equals `pools[0]`.
- The hidden-information snapshot tests still pass for every seat, including a seat with no token.
- A real browser check with 3 seats: a mixed Vowel Party, then a 3-game tournament to the champion screen, at 375px and 320px.
