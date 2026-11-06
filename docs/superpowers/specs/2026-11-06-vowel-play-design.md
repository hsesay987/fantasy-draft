# Vowel Play: design

Status: draft for owner approval. Nothing is built yet.

## Intent

A fast guessing game. A name from a chosen topic appears with its vowels removed and everything squashed into one block of letters, and players race to work out what it was. `SPDRMN` is Spider-Man. `PKCH` is Pikachu.

The owner wants it across TopPic's topics, playable alone against the clock and online with friends. Online, the owner's first wish is that players say the answer out loud, because shouting it is the fun. Players who can't hear each other still need to play, so typing is available too.

## Goals

- Solo play that scores by speed.
- Online play outside party mode, in two modes: first correct answer takes the point, and head to head.
- A party-mode version where everyone competes at once.
- A voice way to play and a type way to play.
- Different topics, using the content TopPic already has.
- Pixel art of the same standard as the other new games, with its own theme.

## Non-goals

- Public matchmaking. Online means a room with a code, as elsewhere in TopPic. Strangers can play if they share a code.
- A daily puzzle, for now.
- Speech recognition. The app never listens. Other players judge what they hear.
- Built-in voice chat. Voice mode assumes players are in the same room or already on a call.
- Player-chosen pixel characters. Those stay a separate later project; use the `playerSprite` helper so they can be swapped in.

## Anti-goals

- Answers reaching a phone before they should in online play.
- Puzzles that are unfair: too short to work out, or with several real answers where only one is accepted.
- A typo costing someone a word they clearly knew.
- Copying the name, look or wording of an existing word show or game.

## The puzzle

Decided by the owner: **no spaces and no hyphens in the puzzle.** The letters run together as one block.

Builder's rules for making a puzzle from a name (Claude's calls):

- Remove A, E, I, O and U. Y stays.
- Fold accents first, so Pokémon becomes `PKMN`.
- Remove spaces, hyphens, apostrophes and all other punctuation. Digits stay.
- Show in capitals.
- Drop a leading "The" from the name before making the puzzle.

A name can be used only if:

- at least one vowel was removed;
- at least 3 letters remain, and no more than 16, so it fits on a phone in one line.

Two names in a topic can give the same letters. Any of them counts as correct, so nobody is marked wrong for a real answer.

## Topics

Use the existing catalogs in `app/topicDraft/catalogs` and the topic list in `app/play/categories.ts`. List only topics that have at least 40 usable names after the rules above. The topic's name is the only hint; there are no other clues. (Claude's call on the number.)

Some catalogs hold a form of a name players wouldn't say, such as a name with a qualifier in brackets. Clean these when building the word lists, and leave out any that can't be cleaned. Don't repeat a name within one game, and avoid names the room has seen on a rematch, as other games do with `seen`.

## Answering by typing

Typed answers are forgiving (the owner approved this):

- Ignore case, accents, spaces, hyphens and punctuation.
- A leading "the" is optional.
- Allow one wrong, missing, extra or swapped letter in names of 8 or more letters. Shorter names must be exact.
- Wrong attempts cost nothing and can be retried until time runs out. The server limits attempts to about 3 a second per seat.
- Typed attempts are compared and thrown away. Other players never see them, so they don't need moderation.

## Solo

Typed only. 10 names from the chosen topic, 20 seconds each. A right answer scores up to 100 points, fading with time taken: full points in the first 2 seconds, falling evenly to 10 points at 20 seconds. No answer scores 0 and shows the name. The player can skip. The final screen shows the score, the best for that topic in this browser, and the names they missed.

The answers can sit in the browser for solo, as they do in other solo trivia.

## Online rooms (outside party mode)

These are options in the same room flow the other games use. The host picks the topic, the mode and how players answer (**Voice** or **Type**). Voice is the default.

The server holds the answers. Phones receive only the letters until the word is finished.

### Modes

- **First correct:** 2 to 12 players. Each word's point goes to the first player to get it. 15 words by default; the host can choose 10, 15 or 20. Most points wins. A tie at the end is a shared win.
- **Head to head:** exactly 2 players, shown as a tug of war. A word moves the marker one step towards whoever got it. Getting 5 steps ahead wins. If 30 words go by without that, whoever is ahead wins, or it's a draw if level.

### Each word in Type

The word stays up for 20 seconds. The first correct answer takes it, and everyone sees the name. If nobody gets it, the name is shown with no point. A short reveal of about 3 seconds follows.

### Each word in Voice

1. Everyone sees the letters and a Buzz button.
2. The first to buzz has 5 seconds to say the answer aloud. Their phone shows the countdown. Nobody else can buzz meanwhile.
3. When they've spoken, or the 5 seconds end, the name is shown to everyone.
4. Everyone else taps **Right** or **Wrong**, with 6 seconds to do it. A tie goes to the speaker, and so do no taps at all. In head to head the opponent's single tap decides.
5. Right scores the point. Wrong scores nothing, and the word ends.
6. If nobody buzzes within 20 seconds, the name is shown with no point.

**A change from the summary the owner approved.** The summary said a wrong speaker is locked out while the others keep going. That can't work: the judges must see the answer to judge, and at that moment it's visible to everyone still guessing. So a wrong buzz ends the word. To stop people buzzing just to kill words, a wrong buzz in First correct loses a point (never below 0), and in head to head it moves the marker one step towards the opponent. Claude's call, for the owner to check.

### When someone leaves or a phone dies

Follow the pattern the other games have after the final review of the friend-group games: the computed host hand-over, a Leave control in running games, and `settle` for departed seats. Specifically, a departed speaker's word ends at once. Departed seats don't vote. If head to head drops to 1 player, the one left wins.

## Party mode

2 to 12 players. **Everyone competes on every word, all at once.** 10 words, 20 seconds each, and each player who gets it scores up to 100, fading with time as in solo. The word ends early once everyone has it or has given up. Standings show between words, and the name is shown to all at the end of the word.

Answers are typed. A voice version doesn't work here: a dozen people can't each be heard and judged at once, and saying it aloud hands it to everyone else. Claude's call, for the owner to check.

Drinking mode applies through the toggle and sip cards all party games share. Slowest correct and anyone who missed it take the sip cards. Exact calls use the existing `addCalls` and `DrinkCard`, and the sip card must not hide the letters.

## Look and feel

A pixel-art typewriter repair shop: a battered machine whose vowel keys have popped off and lie scattered on the bench. The puzzle is typed onto paper in the carriage. Correct answers make the missing keys snap back into the name. The tug of war is a sheet of paper pulled between two typewriters. Fits the existing pixel kit in `app/components/pixel`, with sound using existing sound helpers. Must work at 320px with 12 seats.

The name "Vowel Play" was Claude's suggestion and the owner has used it. Before launch, check the name isn't an existing game's.

## Where it lives

(Claude's calls, following what's already there.)

- Solo: its own pages under `app/vowelplay`, linked from the Trivia hub, like Top Rung.
- Online and party: a new format in the existing room system, with the pure engine in `app/topicDraft/formats/` synced to `backend/src/shared` by `npm run sync:shared`, and server state through `playRooms.ts`. It appears in the room's game picker and in Surprise us.
- The online non-party game shows under the normal games with the 2 to 12 seat limit; the party version sits in `PARTY_GAMES`. They share one engine if that proves simple.
- Word lists built ahead of time and included in the bundle. No new data sources, no database changes, no AI.

## Left to the builder

File layout inside these folders, exact timings for reveals and animation, the sound choices, how the shared engine is split between online and party, and test layout. The usual checks apply: nothing included by the root `tsconfig.json` may import `backend/`, and hidden information must be tested through the snapshot for every seat, including a seat with no token.

## How we know it's good

- A person who has never seen it understands the game from the first word.
- A group on a call can run a full First correct game in Voice in under 10 minutes without arguing about how it works.
- No name in any topic list looks unfair when a person reads through the list.
- At no point can a raw API response reveal a current answer in online play.
