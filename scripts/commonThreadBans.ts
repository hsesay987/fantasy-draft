// Hand-checked lists for Common Thread. Anything here was read by a person and judged false, misleading or
// badly worded; the data test pins the same lists against the real files. A smaller true set beats a bigger shaky one.

/** The only organisations a flags or geography "Member of" category may name. Exact Wikidata labels. */
export const ORG_ALLOW = [
  "G7", "G20", "BRICS", "ASEAN", "European Union", "Arab League", "Organization of American States", "Asia-Pacific Economic Cooperation",
  "Caribbean Community", "Commonwealth of Nations",
];

/** Dish types a food "A <kind>" label may use: direct instance-of values that are plainly checkable. */
export const FOOD_KINDS = [
  "soup", "salad", "sandwich", "dessert", "pasta", "bread", "cake", "pastry", "sauce", "noodle dish", "rice dish", "stew", "dumpling", "pancake", "pie",
  "curry", "street food", "cookie", "sausage", "cheese", "flatbread", "snack", "fried food", "meat dish", "fish dish", "seafood dish", "pizza", "porridge",
  "breakfast", "casserole", "kebab", "omelette", "tart", "biscuit", "candy", "ice cream", "pudding", "roll", "salad dressing", "dip", "spread",
];

/** Entities that should not appear in a topic at all (not a country, a disputed or odd listing). */
export const EXCLUDE_ENTITIES: Record<string, string[]> = {
  flags: ["Antarctica", "Diego Garcia", "Kingdom of the Netherlands", "Sark", "Clipperton Island", "United States Minor Outlying Islands"],
  geography: ["Antarctica", "Diego Garcia", "Kingdom of the Netherlands", "Jordan River"],
  football: ["O. J. Simpson", "Niels Bohr"],
  music: ["Shaquille O'Neal", "Paris Hilton"],
  disney: ["Sofia la princesss", "Marinette Dupain-Cheng", "Adrien Agreste", "Chloé Bourgeois", "Cat Noir", "Ladybug"],
};

/** The only "A <kind>" labels flags and geography may keep. */
export const KIND_ALLOW = ["island country", "archipelagic state"];

/** Teams a hero may be listed under. */
export const TEAM_ALLOW = [
  "Avengers", "X-Men", "Justice League", "Fantastic Four", "Teen Titans", "Guardians of the Galaxy", "Justice Society of America",
  "Defenders", "Young Avengers", "Runaways", "Green Lantern Corps", "Doom Patrol", "Birds of Prey", "Inhumans",
];

/** Labels (exact) dropped after the hand pass, by topic ("*" = every topic). */
export const BANNED_LABELS: Record<string, string[]> = {
  "*": [],
  books: [
    "Published by Qanun", "Part of the Platonic dialogue series", "Part of the Adventures of Sherlock Holmes series", "Part of the Sherlock Holmes novels series",
    "Religious books", "Won the 20th Century's Greatest Hits: 100 English-Language Books of Fiction", "Won the Le Monde's 100 Books of the Century",
    "Won the NPR Top 100 Science Fiction and Fantasy Books",
  ],
  disney: ["From an A. Film A/S film", "From the Forest universe"],
  food: ["From Eurasia", "Part of cuisine of the United States", "Made with fries", "Made with herb", "Made with spice", "Made with oil", "Made with egg", "Made with cow's milk", "Made with fried onion", "Made with edible mushroom"],
  flags: ["Shows a fimbriation on its flag", "Shows a flanche on its flag", "Shows a bend sinister on its flag", "Shows a Crux on its flag", "Shows an equilateral triangle on its flag"],
  history: ["Awarded the star on Hollywood Walk of Fame", "Died of disease", "Citizen of Cisleithania"],
  movies: [
    "From Crossover fiction films", "Played by Lloyd Ahlquist", "Played by Peter Shukoff", "Member of Death Eater", "Member of Justice League", "Member of Galactic Empire",
    "Member of Jedi", "Member of Jedi Council", "Member of The Slug Club", "Member of Injustice League",
  ],
  videogames: [
    "Member of Galactic Empire", "Member of Justice League", "Member of Injustice League", "Member of Secret Society of Super Villains", "Member of Suicide Squad",
    "Member of United States Army Special Forces",
  ],
  music: ["Symphony artists", "From Russian Empire"],
  nba: ["Won the FIBA Hall of Fame"],
  superheroes: [
    "Is a business executive", "Is a martial artist", "Is a scientist", "Is a telepath", "Is an empath", "Is an orphan", "Is military personnel", "Is a Kryptonian", "Is a vigilante",
    "Has precognition", "Has electric or magnetic powers", "Published by Capcom",
    "Female characters", "Published by Sony Interactive Entertainment", "Published by Detective Comics, Inc.", "Published by National Allied Publications, Inc."],
  villains: [
    "Is a gunfighter", "Is a hypnotist", "Is a dictator", "Is a scientist", "Is a business executive", "Is an orphan", "Is a robot", "Can change size", "Can turn invisible",
    "Can turn intangible", "Can shapeshift", "Was in the Suicide Squad", "Is a Justice League character",
    "Female characters", "Published by Feral Interactive", "Published by Jonathan Cape", "Published by Sony Interactive Entertainment", "Published by Detective Comics, Inc."],
};
/** Label patterns dropped everywhere: Latin binomials, "as food" duplicates, lists posing as awards, nonsense blood types. */
export const BANNED_PATTERNS: RegExp[] = [
  /^Made with [A-Z][a-z]+ [a-z]+( var\. [a-z]+)?$/, /Indonesian peanut sauces/, /Brassica/, /^Made with Kaffir/, / as food$/, /^Made with drinking water$/, /Greatest Films/, /Star Wars Legends/, /Insular Oceania/, /^Blood type (?!(A|B|AB|O)$)/,
];

/** Characters that must be in neither the heroes nor the villains file: no clear side, or a side change. */
export const NEITHER: string[] = [];
/** Clearly not villains (heroes, anti-heroes, allies), removed from the villains pool. */
export const NOT_VILLAINS: string[] = [
  "Galactic Empire", "Skynet", "SPECTRE", "Manhunters", "Sentinel", "Twins", "Danger Room", "Blood Brothers", "Winged monkeys", "Mindless Ones", "Phalanx", "Controller", "Controllers", "Morlock", "White Walker", "Shoggoth", "Deep One", "Vogon", "Russian", "Triffid", "Top", "Rose", "Hunger", "Mist", "Eel", "Spot", "Sin", "Girder", "Destroyer", "Maker", "Siren", "Jester", "Gambler", "Jaws", "Joker", "Terminator", "Godzilla", "Gru", "Mini-Me", "Fat Bastard", "Boba Fett", "Greedo", "Loki", "Venom", "Wanda Maximoff", "Nebula", "Thunderbolt Ross", "Rick Flag", "Big Barda", "Swamp Thing", "Siryn", "Billy Butcher", "Soldier Boy", "King Shark", "Mazikeen", "Amanda Waller", "Glenn Talbot", "Michael Pointer", "Barney Barton", "Harry Osborn", "Mister Mxyzptlk", "Nathaniel Richards", "Black Knight", "Prowler", "Gladiator", "Ultraman", "Ajax", "Callisto", "Talos the Untamed", "Bushman", "Diamondback", "Sentry-459", "Sentry", "Jason Todd", "Deadpool", "Northstar", "Maxima", "Sandman", "Molecule Man", "Circe", "Blaze and Satanus", "Mr. Wint and Mr. Kidd", "Beowulf's dragon", "Ragnarok", "Blackout", "Godspeed", "Wintergreen", "Andrea Beaumont", "Seth Brundle", "List of Superman enemies", "Midgard Serpent", "Baba Yaga", "Tezcatlipoca", "Ravan", "Match", "Walrus", "Sensei", "Shimmer", "Bloody Mary", "Shadow the Hedgehog", "Shockwave", "Dreadnought", "Hurricane", "Tracer", "Turtle", "Snowman", "Arion", "Leo", "Aries", "Gemini", "Taurus", "Typhon", "Valentina", "Montana", "Mister X", "Firebrand", "Human Cannonball", "Batwing", "Hive", "Power Girl", "Abomination", "Cyborg Superman",
];
/** Clearly not heroes, removed from the superheroes pool. */
export const NOT_HEROES: string[] = [
  "Clayface", "Abomination", "Sinestro", "Ares", "Enchantress", "Odin", "Hercules", "Sandman", "Inhumans", "Wonder Twins", "Global Guardians", "Samson & Goliath", "Moby Dick and Mighty Mightor", "Bulletman and Bulletgirl", "Bob, Agent of Hydra", "Frankenstein", "Frankenstein's Monster", "Kismet", "Angel", "Shield", "Guardian", "Lightning", "Thunder", "Jet", "Bug", "Chief", "Speed", "Zombie", "Puck", "Paladin", "Ray", "Ion", "Surge", "Legion", "Gladiator", "Isis", "Apollo", "Toxin", "Punisher", "Rorschach", "Spawn", "Werewolf by Night", "Man-Thing", "Hit-Monkey", "Agent X", "Red Guardian", "Black Cat", "Dogpool", "Icon", "Rom", "Nova", "Steel", "Ronin", "Speedy", "Bruce Wayne", "Clark Kent", "Hades", "Ultimate Wolverine", "Hyperion", "Spectre", "Mantis", "Deadman",
  // Supporting cast, civilians, teams, pets and non-comics characters the Wikipedia lists let in:
  "Lois Lane", "Lucy Lane", "Alfred Pennyworth", "Thomas Wayne", "John Jameson", "Sasha Bordeaux", "G. W. Bridge", "Pat Dugan", "Peggy Carter", "Nick Fury", "Metron", "Ganthet", "Mogo",
  "Geralt of Rivia", "Zuko", "The Mask", "The Umbrella Academy", "Justice Society of America", "Invaders", "Marvel Family", "All-Winners Squad", "Seven Soldiers of Victory", "Boy Commandos",
  "Liberty Legion", "Justice Guild of America", "Little Wise Guys", "Young Allies", "Beasts of Burden", "Haunted Tank", "Flaming Carrot Comics", "Spawn: Godslayer", "Kato", "Cat-Man and Kitten",
  "Thunder and Lightning", "Slam Bradley", "Kid Colt", "Two-Gun Kid", "Devil Dinosaur", "Prez", "King Faraday", "Happy Sam Sawyer", "Debrii", "Lieutenant Marvels", "Uncle Marvel", "Rocket", "Hornet", "Flame", "Avenger", "Venus", "Prophet", "Nemesis", "Solo", "Vigilante", "Phantom", "Madman", "Invincible",
  "Ace the Bat-Hound", "Solovar", "Fandral", "Balder", "Bizarra", "Bozo the Iron Man",
];

/** Single quirks: [topic, label, member name] removed from that category. */
export const BANNED_PAIRS: [string, string, string][] = [
  ["flags", "Has Spanish as an official language", "United States"],
  ["geography", "Has Spanish as an official language", "United States"],
  ["flags", "Has Russian as an official language", "Turkmenistan"], ["flags", "Has Russian as an official language", "Uzbekistan"], ["flags", "Has Russian as an official language", "Azerbaijan"],
  ["flags", "Has Spanish as an official language", "Belize"], ["flags", "Has Spanish as an official language", "Guam"],
  ["geography", "Has Russian as an official language", "Turkmenistan"], ["geography", "Has Russian as an official language", "Uzbekistan"], ["geography", "Has Russian as an official language", "Azerbaijan"],
  ["geography", "Has Spanish as an official language", "Belize"], ["geography", "Has Spanish as an official language", "Guam"],
  ["food", "Made with fish", "Fried rice"],
  ["food", "Made with fish", "Biryani"],
  ["food", "Part of Korean cuisine", "Tonkatsu"],
  ["food", "Part of Italian cuisine", "Caesar salad"], ["food", "Part of French cuisine", "Pancake"], ["food", "Part of Polish cuisine", "Pancake"], ["food", "Part of Austrian cuisine", "Pancake"],
  ["disney", "From the Cars series", "Buzz Lightyear"], ["disney", "From the Cars series", "James P. Sullivan"],
  ["history", "Fought in World War I", "Nikita Khrushchev"],
  ["villains", "First appeared in the 2000s", "King Tut"],
  ["superheroes", "Appears in Arrow", "Geo-Force"],
  ["flags", "Has French as an official language", "Mauritius"], ["geography", "Has French as an official language", "Mauritius"],
  ["flags", "Has English as an official language", "Christmas Island"], ["geography", "Has English as an official language", "Christmas Island"],
  ["music", "Signed to RCA Victor", "The Mamas & the Papas"],
];

export const isBannedLabel = (topic: string, label: string) => BANNED_LABELS["*"]!.includes(label) || (BANNED_LABELS[topic] ?? []).includes(label) || BANNED_PATTERNS.some((r) => r.test(label));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A skip pattern that matches every label except these exact ones. */
export const onlyExact = (list: string[]) => new RegExp(`^(?!(?:${list.map(esc).join("|")})$)`);

/**
 * Named pairs that must never appear on the real data: [topic, label pattern ("." for any), name]. The data test pins them.
 * A fourth value "clue" is for a true fact that gives itself away: the name stays a member but may not be a clue.
 */
export const MUST_NOT: [string, RegExp, string, "clue"?][] = [
  ["movies", /extraterrestrial/i, "Han Solo"],
  ["movies", /extraterrestrial/i, "Princess Leia"],
  ["movies", /extraterrestrial/i, "Darth Vader"],
  ["videogames", /released in the 1970s/, "Han Solo"],
  ["movies", /released in the 1890s/, "Mowgli"],
  ["disney", /released in the 0s/, "Yoda"],
  ["superheroes", /First appeared in the 2000s/, "Supergirl"],
  ["superheroes", /First appeared in the 1990s/, "Hawkgirl"],
  ["movies", /vigilante/i, "Hagrid"],
  ["movies", /military/i, "Trinity"],
  ["football", /./, "Sean Connery"],
  ["football", /./, "Elie Wiesel"],
  ["music", /./, "Brie Larson"],
  ["music", /./, "Sasha Grey"],
  ["music", /./, "John Gielgud"],
  ["villains", /./, "Big Barda"],
  ["villains", /./, "Northstar"],
  ["villains", /./, "Siryn"],
  ["villains", /./, "Swamp Thing"],
  ["villains", /./, "Deadpool"],
  ["villains", /./, "Rick Flag"],
  ["villains", /./, "Sentry"],
  ["villains", /./, "Jason Todd"],
  ["villains", /./, "Sara Lance"],
  ["villains", /./, "Zor-El"],
  ["superheroes", /./, "Sinestro"],
  ["superheroes", /./, "Abomination"],
  ["superheroes", /./, "Clayface"],
  ["superheroes", /./, "Hades"],
  ["superheroes", /./, "Ares"],
  ["villains", /Hydra/, "Doctor Octopus"],
  ["videogames", /Sonic Team/, "Joker"],
  ["food", /Korean cuisine/, "Tonkatsu"],
  ["food", /stuffed pasta/, "Kenkey"],
  ["disney", /dog/, "Pongo"],
  ["flags", /ASEAN/, "Australia"], ["geography", /ASEAN/, "Australia"],
  ["flags", /European Union/, "United Kingdom"], ["geography", /European Union/, "United Kingdom"],
  ["flags", /Australian dollar/, "Zimbabwe"], ["flags", /pound sterling/, "Bermuda"], ["flags", /pound sterling/, "Zimbabwe"],
  ["flags", /Spanish as an official language/, "Antigua and Barbuda"], ["geography", /Spanish as an official language/, "Antigua and Barbuda"],
  ["geography", /Nepal/, "Brahmaputra"], ["geography", /Syria/, "Jordan River"],
  ["disney", /./, "Marinette Dupain-Cheng"], ["disney", /./, "Sofia la princesss"],
  ["disney", /1920s/, "Jim Hawkins"], ["movies", /1920s/, "Jim Hawkins"], ["movies", /1960s/, "Baragon 2001 (GMK)"],
  ["movies", /Legends/, "Maz Kanata"], ["videogames", /Legends/, "Maz Kanata"], ["videogames", /Created by/, "Helena Harper"],
  ["movies", /terrorist/, "Lord Voldemort"], ["villains", /terrorist/, "Lord Voldemort"], ["villains", /gangster/, "Hobgoblin"],
  ["villains", /martial artist/, "Lex Luthor"], ["villains", /artificial intelligence/, "Thinker"], ["villains", /artificial intelligence/, "Faora"],
  ["food", /From Iran/, "Rogan josh"], ["food", /From Iran/, "Port sausage"], ["food", /From Egypt/, "Simit"], ["food", /From France/, "Waffle"],
  ["football", /./, "O. J. Simpson"], ["football", /./, "Niels Bohr"], ["music", /./, "Shaquille O'Neal"], ["music", /./, "Paris Hilton"],
  ["superheroes", /./, "Lois Lane"], ["superheroes", /./, "Lucy Lane"], ["superheroes", /./, "Alfred Pennyworth"], ["superheroes", /./, "Thomas Wayne"],
  ["superheroes", /./, "John Jameson"], ["superheroes", /./, "Sasha Bordeaux"], ["superheroes", /./, "G. W. Bridge"], ["superheroes", /./, "Nick Fury"],
  ["superheroes", /./, "Metron"], ["superheroes", /./, "Ganthet"],
  ["flags", /^In Micronesia$/, "Federated States of Micronesia", "clue"], ["geography", /^In Micronesia$/, "Federated States of Micronesia", "clue"],
  ["geography", /^In China$/, "People's Republic of China", "clue"], ["geography", /^In New York$/, "New York City", "clue"], ["geography", /^In Ontario$/, "Lake Ontario", "clue"],
  ["flags", /^In Middle Africa$/, "Central African Republic", "clue"], ["geography", /^In Middle Africa$/, "Central African Republic", "clue"],
  ["superheroes", /./, "Ace the Bat-Hound"], ["superheroes", /./, "Solovar"], ["superheroes", /./, "Fandral"], ["superheroes", /./, "Balder"], ["superheroes", /./, "Bizarra"], ["superheroes", /./, "Bozo the Iron Man"],
  ["disney", /Cars series/, "Buzz Lightyear"], ["disney", /Cars series/, "James P. Sullivan"],
  ["history", /^Fought in World War I$/, "Nikita Khrushchev"],
  ["villains", /^First appeared in the 2000s$/, "King Tut"],
  ["superheroes", /^Appears in Arrow$/, "Geo-Force"],
  ["flags", /French as an official language/, "Mauritius"], ["geography", /French as an official language/, "Mauritius"],
  ["flags", /English as an official language/, "Christmas Island"], ["geography", /English as an official language/, "Christmas Island"],
  ["music", /RCA Victor/, "The Mamas & the Papas"],
];
