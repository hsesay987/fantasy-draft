# Four new games: Pecking Order, Say Less, Name Place Animal Thing, Top Rung rooms

Date: 2026-11-13. Owner: TopPic. Status: draft for the owner's approval.

## Why

The owner wants more games for party nights and daily play. They picked four from their own list:

- "closest to a rank"
- Name Place Animal Thing
- everyone-climbs Top Rung
- a new word game with a word budget

Each game must work in the existing party system: online rooms, party mode on phones, screen host on a TV, tournaments, teams where it makes sense, and the pixel-art look.

Build order is the order of this document. Each game is its own project with its own plan, and each ships on its own.

## Shared rules (all four)

- **Shared engine.** A pure engine lives in `app/topicDraft/formats/<game>.ts`, synced to the backend with `npm run sync:shared`. The server owns time, scoring and hidden information, as the other party games do.
- **New format id.** Each game gets a new `FormatId` and joins `PARTY_FORMATS`. It also works in:
  - tournaments: `awardsFor` handles it, and each lineup slot can carry its own topic;
  - the screen host: watch mode with a turn and phase banner and a leaderboard;
  - buzz mode, only where a game says so.
- **Hidden information.** Every seat's snapshot is tested, including a seat with no token.
- **Mobile layout.** Works at 320px with 12 seats.
- **Drinking mode.** It is optional and follows the existing rule: sips go only to whoever made the mistake.
- **No copied game content.** The ideas are inspired by common party games. All word lists, prompts and tier names are our own.
- **Tournament topics (my call).** Each game maps its own config ids to a lineup slot's topic: Pecking Order list ids, Say Less deck ids, NPAT category-set ids and Top Rung trivia topics.
- **Tournament awards.** Ranked by game points. Ties share a place.
- **Dailies (my call).** Each solo daily is its own plan task. A daily is seeded by the date, like Pinpoint, so no scheduled job is needed. Its Trivia hub tile uses the HubArt style.
- **Drinking per game.** The builder picks which mistake earns a sip in each game, within the rule above.

---

## 1. Pecking Order (closest to a rank)

**What it is.** A ranking guess game on real data, with two question types:

- **"Where does it rank?"** For example: "Where does Brazil rank by population?" You answer with a number.
- **"Who's at #N?"** For example: "Which country ranks 25th in population?" You answer by picking a name.

The host chooses one type or Mixed, which alternates them.

**Data (owner's decision, required).** Ranks must match the real world, so it uses complete ranked lists, not Pinpoint's samples:

- A new offline build script, `scripts/buildPecking.ts`, produces one JSON per list in `app/pecking/data/`. Each file holds its id, title, stat label, unit, source, `asOf` date, and items in rank order with their value and any aliases.
- Sources are Wikidata and the open sources Pinpoint already uses.
- Launch lists (the builder may swap any that the data can't support cleanly):
  - countries by population, area and GDP per person (UN members, 193);
  - most populous cities (top 100);
  - films by worldwide box office (top 100);
  - tallest buildings (top 100);
  - NBA all-time points (top 100), from the NBA catalog;
  - Pokémon by base stat total (all);
  - longest rivers (top 100);
  - highest mountains (top 100).
- Each list shows its source and date.
- The game launches with at least 4 lists, even if some of the lists above can't be built cleanly (my call).
- Ties share a rank, and an answer at any of the tied ranks is exact.

**Answering.**

- **"Where does it rank?"** Drag a marker along the ladder to get close, then fine-tune with + and −. Typing a number also works. (Owner chose this input.)
- **"Who's at #N?"** Search the list with autocomplete, like Pinpoint. A name outside the list scores 0.
  - A name can be taken by only one player per round; whoever locks it first keeps it. (My call: this stops everyone copying the obvious pick.)
  - A player who loses a lock race sees "Taken" and picks again within the same timer. "Taken" never says who took it (my call).
  - Error for a pick = |true rank of the picked name − N|.
  - The reveal shows each pick's real rank.

**Scoring.** It is the same for both types.

- Error = |guess rank − true rank|.
- Points = round(100 × max(0, 1 − error / (0.25 × list length))). An exact answer earns 100.
- The closest player in the room gets +20. Ties share the bonus. The bonus needs more than 0 points (my call).
- A round is 6 questions by default; the host can choose 4 to 10.

**Modes.**

- **Online rooms, party mode and tournaments.** Teams score the sum of their members. Everyone answers at once, with a 20 s timer.
- **Solo daily.** The same 5 questions for everyone each day. It joins the daily system (`DailyGame` and `DailyPuzzle`), shows on the Trivia hub, and has a shareable result.
- **Solo free play.** Pick a list.

**Screen and TV.** A long ranked ladder. Players' guesses appear as their sprites when answers lock, then the true spot lights up, and the leaderboard shows "+N".

**Hidden information.** No seat sees the true rank or other players' answers before the reveal, except that a locked "Who's at #N" name shows as taken without saying who took it.

---

## 2. Say Less (word-budget describing game)

**What it is.**

- Players take turns as the **describer**. The describer gets a secret word and describes it in as few words as possible, without saying it.
- The others race to guess it.
- Each word has a **par**: the number of clue words a good describer needs.

**Turn flow.**

1. The describer sees the word and its par on their phone. Nobody else sees the word, and neither does the screen.
2. The describer sends clues **one word at a time** from their phone. Each clue shows on every phone and the TV.
   - A clue must be one word with no spaces. It is refused automatically, and the describer must send a different clue, when (my call):
     - the clue contains the secret word, or any part of a multi-word answer that has 3 or more letters;
     - the secret word contains the clue, and the clue has 4 or more letters;
     - the clue is a plural of the secret word.
3. Guessers type guesses at any time. Typed guesses match on normalised text plus stored aliases (my call). In buzz mode in a room, they buzz and say the answer out loud, and the describer alone calls it Right or Wrong within 6 s (no call counts as right). A wrong call locks that buzzer out of the word and buzzing reopens. Only the describer judges because only they can see the word: other judges would vote blind, and showing them the word would give it away to the guessers still in after a wrong call.
4. The word ends on the first right guess, when the describer passes, or after 60 s.

**Scoring (owner agreed to this proposal).**

- The first right guesser scores `par + 2 − clues used`, at least 1. The describer scores the same amount, so both want it fast and nobody gains from holding back a guess.
  - Example: with par 3, a guess after 2 clues gives both players 3 points. A guess after 5 clues gives both 1 point.
- **Rounds (my call).** Each player describes once per round. The host sets 1 to 3 rounds.
- **Budget.** The describer has a word budget for their turn: the sum of the pars of their words, plus 5. Their turn has 3 words by default; the host can pick 3 to 5.
  - When the budget runs out, the turn ends after the current word ends.
  - Each unused budget word at the end of the turn is +1 for the describer.
- **Pass.** Skips the word: 0 points, and 1 budget word spent.
- If nobody gets the word, nobody scores.
- Optional host toggle, **Par guard** (the owner's original idea, off by default): when a word is guessed after more clues than par, every guesser except the winner loses 1 point for each clue over par.

**Words.**

- Our own lists of decks: Easy (par 2), Medium (par 3) and Hard (par 4).
- Topic decks reuse TopPic topics, using item names from the character catalogs: Superheroes, Films, Food and more.
- Every word in a deck has its par stored with it.

**Teams.** With teams, guessers only score for their own team's describer, and the other team watches. Describer points go to the describer's team, and describers rotate within each team (my call). Without teams, everyone races.

**Screen and TV.** A big clue strip that counts up against par, the describer's budget meter, and the guess race. The word itself is never shown before the word ends.

**Hidden information.** The word and any stored aliases go only to the describer's seat until the word ends, including while a buzz is being judged (which is why the describer is the only judge).

---

## 3. Name Place Animal Thing (NPAT)

**What it is.** The classic letter game. Each round has a random letter, and every player fills each category with an answer starting with that letter. Rarer valid answers score more.

**Categories (owner: offer all three; my recommendation adopted).**

- **Classic** (the default): Name, Place, Animal, Thing.
- **Topic sets**, built from TopPic topics: Superhero, Footballer, Film, Food, Country, Pokémon, and so on.
- **Custom**: the host picks 4 to 6 categories from the full list.
- The launch list is about 12 categories. Each has its own list of accepted answers.

**Round.**

- A random letter is drawn. Hard letters (Q, X, Z, Y and similar) are left out unless the host turns on "Hard letters".
- A letter is only drawn when every chosen category has at least 15 accepted answers for it (my call).
- Timer: 60 s by default. The host can choose 45, 60 or 90 s. The round ends early when every player has filled every category, or when the host's "First to finish stops the clock" option is on and someone finishes.
- One answer per category.

**Validity.**

- Each category has an accepted-answer list built offline from Wikidata and other open sources, the same way as Pinpoint (`scripts/buildNpat.ts`). Answers are normalised: case, accents, "the", and the aliases we store.
- An answer that doesn't start with the letter is rejected automatically.
- An answer not on the list goes to a quick room vote at the reveal: majority accepts, and a tie accepts. The vote needs at least 3 voters besides the answerer; with fewer, the answer is accepted (my call). Accepted unknown answers are saved for review and never added automatically.
- In the solo daily, an unknown answer scores 0 and is saved for review (my call).

**Rarity scoring (owner chose a + b, informed by Krillion).**

- **(b) Familiarity.** This sets each answer's base tier.
  - Everyday words use a word-frequency list.
  - People, places, animals and media use Wikipedia page views.
  - Familiarity data is built offline and needs a free, open licence.
  - Base tiers are percentile bands of familiarity within each category, so every category spreads across the tiers (my call). The builder sets the band edges.
- **(a) Player history.** A new table keeps a running count for each category and answer (`NpatAnswer { category, answer, count, updatedAt }`).
  - An answer that TopPic players give often moves down a tier.
  - An answer whose base tier is Rare or higher but which players give very often becomes **Too Obvious**, our trap tier, worth 15. It is the "obscure pick everyone thinks of".
  - History only changes a tier once the category has at least 30 recorded plays. Too Obvious applies when the base tier is Rare or higher and the answer appears in at least 5% of that category's plays (my call).
  - Counts update only from finished rooms and dailies, and one player adds at most 1 per answer per day.
  - `NpatAnswer` is added with a Prisma migration. There is no admin page, only the table (my call).
- **Tiers (our own names):**

  | Tier | Points |
  |---|---|
  | Common | 10 |
  | Too Obvious | 15 |
  | Solid | 30 |
  | Rare | 60 |
  | Deep Cut | 85 |
  | Unicorn | 100 |

- **Same answer as someone else in the room:** each player who gave it gets half the tier's points, rounded up. (This is the owner's "docked" rule.) Answers match on normalised text plus aliases. Teammates with the same answer aren't docked; their team scores it once (my call).
- **Invalid or blank:** 0.

**Reveal.** One category at a time. All answers flip together, with tier badges, matching answers grouped, and the vote shown for any unknown answer. The TV shows the same view.

**Modes.**

- **Rooms, party mode and tournaments.** Teams sum their members.
- **Solo daily.** One letter and four categories, the same for everyone. It is scored on the tier ladder and has a shareable result.

**Hidden information.** Nobody sees other players' answers until the reveal.

---

## 4. Top Rung rooms (everyone climbs)

**What it is.** The existing Top Rung ladder (`app/toprung/engine.ts`): 12 rungs, safe ledges at 4 and 8, and walk away to keep your points. In a room, everyone climbs the same questions at the same time.

**Flow.**

- Every player answers the same question on their phone, with a 20 s timer.
- A right answer goes up one rung. A wrong answer drops the player to their last ledge, and they are out for the rest of the climb with the points of that ledge.
- **Walk away** banks the current rung's points and ends that player's climb.
- Each player gets the solo lifelines once each: cut two, crowd poll and swap.
  - Crowd poll uses the room's real answers so far for that question when at least 3 players have answered, and the solo poll otherwise.
- Because a wrong answer puts a player out, everyone still climbing is always on the same rung, so one shared question per rung works and difficulty rises each step. Players who are out watch.
- The climb ends when every player is out, has walked, or has reached the top.
- Highest points win. Ties share a place.

**Screen and TV.** One lighthouse ladder with every player's sprite on their rung, and falls and walk-aways shown as they happen.

**Topics.** The trivia topics Top Rung already uses. Tournament slots can pick the topic.

**Hidden information.** The right answer is hidden until everyone still climbing has answered or the timer ends.

---

## Out of scope

- Voice chat.
- Pixel character picker.
- Movie timestamp.
- Connect the actors.
- Draft video.
- International football.
- Live, continuously recalculated rarity (rarity counts update after games, not during a round).

## Left to the builder

- Exact launch lists for Pecking Order and the NPAT categories, if the open data makes a list impractical. Swap in a comparable list and say why.
- Visual design within the pixel kit.
- Timer lengths within the ranges above.
- Word lists for Say Less, which are our own writing.
