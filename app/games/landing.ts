// One landing page per game, at /games/<slug>. Each is written to be found by the game's own name in a search:
// the title leads with the name and says what kind of game it is, and the copy is the game's own, not a template.
import { formatMeta } from "../play/formats";
import { libraryGame, type LibraryGame } from "../play/library";

export type Landing = {
  slug: string;
  /** Library ids this page covers. The first is the one "Play" opens; a second is the same game in another mode. */
  ids: string[];
  /** The page title in search results, game name first. Under 60 characters with the site name. */
  seoTitle: string;
  /** The search-result snippet, under 160 characters. */
  description: string;
  /** Two short paragraphs on what the game is and why it is fun. */
  about: [string, string];
  /** How to play, when the game has no format entry that already says it. */
  how?: string[];
  /** Search phrases people use for this kind of game; shown as "Also known as". */
  aka?: string[];
};

export const LANDINGS: Landing[] = [
  {
    slug: "classic-draft", ids: ["snake"], seoTitle: "Classic Draft: Snake Draft Game for Any Topic",
    description: "Take turns drafting superheroes, anime, NBA legends or movie icons in snake order, with roles and bans. An AI judge scores every team. Free, solo or with friends.",
    about: ["Classic Draft is the snake draft you know from fantasy sports, for anything. Pick a topic, take turns choosing from the pool, and watch the order flip every round so nobody keeps the first pick.", "Add roles and bans to make every pick count. When the rosters are full, the AI judge reads each team against the mission and explains who drafted best."],
    aka: ["snake draft game", "fantasy draft with friends"],
  },
  {
    slug: "auction-draft", ids: ["auction"], seoTitle: "Auction Draft: Bid on Characters With a Budget",
    description: "Everyone gets the same budget. Bid on random characters, outlast your friends and fill every slot. A free online auction draft game for any topic.",
    about: ["Auction Draft hands every player the same budget and puts one random pick up for bid at a time. The highest bid when the timer ends takes them.", "Spend big on a star and you may run dry before your last slot. Hold back and someone else gets the bargain. The judge scores the finished teams."],
    aka: ["auction draft game", "bidding draft"],
  },
  {
    slug: "loadout", ids: ["loadout"], seoTitle: "Loadout: Build a Kit Within Budget to Beat a Boss",
    description: "Fill Weapon, Gadget and Sidekick slots on a budget, where prices follow each item's real stats. Cover the boss's weaknesses to win. Free to play online.",
    about: ["Loadout gives you a boss, a set of slots and a budget. Every item's price follows its stats, so the best picks are never cheap.", "Read the boss's weaknesses, cover them with what you can afford, and see if your kit holds up when the judge runs the fight."],
  },
  {
    slug: "positions", ids: ["position"], seoTitle: "Positions: Assign Your Captain, Healer and Tank",
    description: "You're dealt a random hand of characters. Put each one in the role that suits them best: Captain, Healer, Tank and more. A quick free draft game.",
    about: ["Positions deals you a random hand from your topic and a set of roles to fill. There is no picking, only placing.", "Who leads, who heals and who takes the hits? Best fit across every role wins, and you can write your own roles for the table."],
  },
  {
    slug: "blind-rank", ids: ["blind"], seoTitle: "Blind Rank: Rank Each Reveal With No Take-Backs",
    description: "Picks are revealed one at a time and you must slot each into a rank before seeing the next. Closest to the true order wins. Play blind ranking free online.",
    about: ["Blind Rank reveals picks one by one. Each has to go into a rank right away, before you know what comes next.", "Put a legend at number three and then watch a bigger one arrive. The player whose list lands closest to the real order wins."],
    aka: ["blind ranking game", "rank it blind"],
  },
  {
    slug: "spin-draft", ids: ["spin"], seoTitle: "Spin Draft: Choose One of a Few Random Picks",
    description: "Each turn spins up a few random options. Take one or spend a reroll. A fast, lucky draft game for superheroes, anime, sports legends and more.",
    about: ["Spin Draft gives every turn a handful of random options instead of the whole pool. Take one, or spend one of your rerolls hoping for better.", "It is quick, a little lucky, and the best way to start: the home page's Quick play opens a Spin Draft."],
  },
  {
    slug: "keep-or-delete", ids: ["keep"], seoTitle: "Keep or Delete: Keep It or Lose It Forever",
    description: "One stream of reveals, one decision each: keep the pick for your roster or delete it for good. Fill your team before the stream runs out. Free online.",
    about: ["Keep or Delete shows one pick at a time to the whole table. Whoever's turn it is keeps it for their roster or deletes it, and a deleted pick never comes back.", "Wait too long for someone better and the stream runs dry. Keep too early and you'll watch a legend go to the next player."],
    aka: ["keep or delete game", "smash or pass draft"],
  },
  {
    slug: "hot-air", ids: ["feud"], seoTitle: "Hot Air: Survey Trivia Game, Name the Top Answers",
    description: "Name what most people would say. The more popular your answer, the higher your balloon rises. Free survey trivia with a new daily puzzle.",
    about: ["Hot Air asks you to name something and rewards the answers most people give. Popular answers lift your balloon from the sea toward the edge of space.", "Three misses ends the round. Play any topic in free play, or take the daily survey that is the same for everyone."],
    aka: ["survey game online", "name the top answers game"],
  },
  {
    slug: "summit", ids: ["jeopardy"], seoTitle: "Summit: Trivia Board Game, Climb the Mountain",
    description: "Pick a category and a camp: higher camps are harder clues. Right answers climb, wrong ones slide you back. Free trivia board game with a daily climb.",
    about: ["Summit is a trivia board where every category is a mountain. Pick a camp to choose your clue: the higher the camp, the harder the question and the further it lifts you.", "Get it wrong and you slide back down. Climb past nine named camps to the top in free play, or try today's board, the same for everyone."],
    aka: ["trivia board game online", "category trivia"],
  },
  {
    slug: "top-rung", ids: ["toprung"], seoTitle: "Top Rung: Climb the Trivia Ladder, Know When to Stop",
    description: "One question a rung, up a lighthouse ladder. A slip drops you to your last safe ledge, so know when to walk away. Free daily trivia ladder game.",
    about: ["Top Rung puts you at the bottom of a lighthouse ladder. Every right answer climbs a rung; safe ledges along the way keep what you've earned.", "Miss once and you fall to the last ledge you passed, so the real question is when to stop. A new ladder comes every day."],
    how: ["Answer one question to climb each rung.", "Pass a safe ledge to bank your height.", "Walk away whenever you like; a wrong answer drops you to your last ledge."],
    aka: ["trivia ladder game", "quiz ladder"],
  },
  {
    slug: "pinpoint", ids: ["pinpoint"], seoTitle: "Pinpoint: Daily Guessing Game With Real Facts",
    description: "Guess today's hidden pick in eight tries. Every guess is checked against real facts and shows how close you are. A free daily guessing game for any topic.",
    about: ["Pinpoint hides one pick from a topic, like a country, a Pokémon or an NBA legend. Each guess you make is compared to it on real facts, with arrows for higher or lower.", "Use every clue to close in within eight guesses. There is a new pick each day per topic, and a practice mode for more."],
    how: ["Choose a topic and make a guess.", "Each fact turns green when it matches and shows an arrow when it is higher or lower.", "Narrow it down and find the pick within eight guesses."],
    aka: ["daily guessing game", "guess the hidden answer"],
  },
  {
    slug: "vowel-play", ids: ["vowelplay"], seoTitle: "Vowel Play: Missing Vowels Quiz Game",
    description: "The vowels are gone. Name the character, country or player from the letters that are left. A fast missing-vowels quiz, solo or head to head.",
    about: ["Vowel Play shows a name with every vowel removed. SPDRMN, anyone? Work out what's left and say it before the time runs down.", "Play solo against the clock or head to head against a friend, with topics from superheroes to capital cities."],
    aka: ["missing vowels game", "no vowels quiz"],
  },
  {
    slug: "pecking-order", ids: ["pecking-solo", "pecking"], seoTitle: "Pecking Order: Guess Where Things Rank",
    description: "Guess where a country, building or player ranks on a real top list, or who sits at a given rank. The closer you get, the more you score. Daily and party modes.",
    about: ["Pecking Order shows an item from a real top list and asks where it ranks, or names a rank and asks who holds it. Exact scores 100 and points fall away the further off you are.", "Play the daily alone, or open a party room where everyone answers at once on their own phone."],
    aka: ["ranking guessing game", "higher or lower ranking"],
  },
  {
    slug: "common-thread", ids: ["commonthread"], seoTitle: "Common Thread: Find What Six Clues Share",
    description: "Six clues share one hidden fact, from obscure to obvious. Name the link with as few clues as you can. A free daily connections-style puzzle for any topic.",
    about: ["Common Thread gives you six clues that all share one hidden fact. The first are obscure and the last are obvious.", "Name the link early for a big score, or open another clue and play it safe. Every topic has a new thread each day."],
    how: ["Open the first clue and look for what it could share with the rest.", "Guess the hidden fact, or open another clue.", "The fewer clues you need, the more you score."],
    aka: ["connections puzzle", "find the link game"],
  },
  {
    slug: "costimation", ids: ["costimation"], seoTitle: "Costimation: Guess the Price of Real Products",
    description: "Guess what real grocery products cost. Close guesses fly your ship further. A free daily price guessing game with real prices from Open Prices.",
    about: ["Costimation shows a real product and asks what it costs. Prices come from Open Prices, recorded by real shoppers.", "The closer your guess, the further your ship flies. A new set of products comes every day, the same for everyone."],
    how: ["Look at the product and its size.", "Guess the price.", "Close guesses fly your ship further; compare with everyone once you finish."],
    aka: ["price guessing game", "guess the price"],
  },
  {
    slug: "stat-draft", ids: ["statdraft"], seoTitle: "Stat Draft: NBA, NFL and Cartoon Drafts on Real Stats",
    description: "Draft NBA and NFL players or cartoon characters by era and team, scored on full career stats. Play solo or in a live room with friends. Free.",
    about: ["Stat Draft is for people who know their numbers. Draft NBA or NFL players by era and team, or cartoon characters, and every team is scored on full career stats.", "Build a lineup alone, or open a live room and draft against friends pick by pick."],
    how: ["Choose a league, an era and the rules.", "Draft your lineup, alone or in a live room.", "Teams are scored on the players' real career stats."],
    aka: ["NBA draft game", "fantasy basketball draft"],
  },
  {
    slug: "imposter", ids: ["imposter"], seoTitle: "Imposter: Find the Faker, a Party Game on Your Phones",
    description: "Everyone knows the secret pick except one player. Give clues, vote out the imposter, or blend in if it's you. A free party game, everyone on their own phone.",
    about: ["Imposter gives everyone at the table the same secret pick, except one player who gets nothing. Take turns giving a single clue without giving it away.", "Then vote. Catch the imposter and the table wins; if they blend in, or name the secret, they do."],
    aka: ["imposter party game", "who is the spy game"],
  },
  {
    slug: "vote-games", ids: ["vote"], seoTitle: "Vote Games: Who Would Win, Icks and Who's Wrong",
    description: "Vote in secret, then guess how your friends voted. Who Would Win, Princess Treatment or Bare Minimum, Who's Wrong, Icks and more. A free party game on your phones.",
    about: ["Vote Games is seven decks in one: Who Would Win, Who Would Win: The Room, Princess Treatment or Bare Minimum, Who's Wrong, Icks, Ultimatums and Did That Happen. Each card shows two sides; The Room pits people at your table against each other.", "Everyone votes in secret, then guesses how the room voted. Read your friends right, or be the one nobody can read."],
    aka: ["who would win game", "princess treatment or bare minimum", "would you rather party game", "voting party game"],
  },
  {
    slug: "in-sync", ids: ["insync"], seoTitle: "In-Sync: One Clue, One Hidden Spot, Tune In Together",
    description: "One player sees a hidden spot between two opposites and gives one clue. Everyone tunes their own dial to find it. A free co-op party game on your phones.",
    about: ["In-Sync puts a hidden spot on a line between two opposites, like cold and hot. One player sees it and gives a single clue.", "Everyone else tunes their own dial and talks it over. The room's signal is where your dials average out, and the closer it lands, the more the whole table scores."],
    aka: ["wavelength style game", "co-op guessing game"],
  },
  {
    slug: "party-trivia", ids: ["partytrivia"], seoTitle: "Party Trivia: Answer Fast, Solo or in Teams",
    description: "Everyone sees the same question and answers on their own phone. Faster right answers score more. Play solo or split into teams. Free party trivia.",
    about: ["Party Trivia puts the same question and four options on every phone at once. Answer right and fast for up to 150 points.", "With four or more players, split into teams: each team's most-voted option becomes its answer."],
    aka: ["trivia night game", "phone trivia game"],
  },
  {
    slug: "mafia", ids: ["mafia"], seoTitle: "Mafia: The Party Game With No Narrator Needed",
    description: "Secret roles, a rainy town and every phone tapping at night, so nobody can tell who's up to what. Find the mafia before they outnumber you. Free, 5 to 12 players.",
    about: ["Mafia gives everyone a secret card. At night every phone taps a name, so the table can't tell who did what, and nobody has to sit out as narrator.", "Each morning the town hears who's gone. Talk it out, vote someone onto the next bus, and win when the mafia are gone."],
    aka: ["mafia game online", "werewolf party game"],
  },
  {
    slug: "vowel-party", ids: ["vowelparty"], seoTitle: "Vowel Party: Race to Name Missing-Vowel Words",
    description: "Everyone races the same name with its vowels removed. Type it fast: quick right answers score up to 100. A free missing-vowels party game on your phones.",
    about: ["Vowel Party is Vowel Play for the whole room. Everyone sees the same name with its vowels gone and races to type it.", "Faster answers score more, and you can give up on a word to move on without waiting."],
  },
  {
    slug: "say-less", ids: ["sayless"], seoTitle: "Say Less: Describe the Word in Few Words",
    description: "Describe a secret word with a tiny word budget while everyone else guesses. Early correct guesses score the most. A free word party game on your phones.",
    about: ["Say Less gives one player a secret word and a small budget of words to describe it. Everyone else guesses.", "Land it early for the most points, then pass the turn. Fewer words, bigger laughs."],
    aka: ["describe the word game", "taboo style game"],
  },
  {
    slug: "name-place-animal-thing", ids: ["npat"], seoTitle: "Name Place Animal Thing Online: Daily and Party",
    description: "A letter comes up: name a person, place, animal and thing that start with it before time runs out. Rarer answers score more. Free daily and party rooms.",
    about: ["Name Place Animal Thing is the classic pen-and-paper game, online. One letter, a category at a time, and a clock.", "Every answer is checked against real lists, and rarer answers dig up bigger gems. Play the daily dig alone, or open a room and play with friends."],
    aka: ["NPAT game", "Stop game", "Scattergories style game"],
  },
  {
    slug: "toppic-cards", ids: ["cards"], seoTitle: "TopPic Cards: Play Your Best Character Card",
    description: "Everyone plays the character card that best finishes the prompt. The AI judge, a vote or a rotating judge picks the winner. A free card party game for up to 20 players.",
    about: ["TopPic Cards deals everyone a hand of character cards. Each round a prompt goes up and everyone plays the card that finishes it best.", "The AI judge, a player vote or a rotating judge picks each round's winner, and up to 20 people can play."],
    how: ["Everyone gets a hand of character cards.", "A prompt goes up; play the card that fits it best.", "The AI judge, a vote or a rotating judge picks the winner."],
  },
];

export const landing = (slug: string) => LANDINGS.find((l) => l.slug === slug);
export const landingFor = (gameId: string) => LANDINGS.find((l) => l.ids.includes(gameId));
export const landingHref = (gameId: string) => { const l = landingFor(gameId); return l ? `/games/${l.slug}` : null; };

/** The library games a landing page covers, in its order. */
export const landingGames = (l: Landing): LibraryGame[] => l.ids.map(libraryGame).filter((g): g is LibraryGame => !!g);

/** How to play: the page's own steps, or the format's. */
export const howToPlay = (l: Landing): string[] => l.how ?? formatMeta(l.ids[0])?.how ?? [];
