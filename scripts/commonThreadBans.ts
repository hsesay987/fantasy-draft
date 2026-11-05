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
  geography: ["Antarctica", "Diego Garcia", "Kingdom of the Netherlands"],
};

/** The only "A <kind>" labels flags and geography may keep. */
export const KIND_ALLOW = ["landlocked country", "island country", "archipelagic state"];

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
  food: ["From Eurasia", "Made with fries", "Made with herb", "Made with spice", "Made with oil", "Made with egg", "Made with cow's milk", "Made with fried onion", "Made with edible mushroom"],
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
  /^Made with [A-Z][a-z]+ [a-z]+$/, /^Made with Kaffir/, / as food$/, /^Made with drinking water$/, /Greatest Films/, /Insular Oceania/, /^Blood type (?!(A|B|AB|O)$)/,
];

/** Characters that must be in neither the heroes nor the villains file: no clear side, or a side change. */
export const NEITHER: string[] = [];
/** Clearly not villains (heroes, anti-heroes, allies), removed from the villains pool. */
export const NOT_VILLAINS: string[] = [
  "Galactic Empire", "Skynet", "SPECTRE", "Manhunters", "Sentinel", "Twins", "Danger Room", "Blood Brothers", "Winged monkeys", "Mindless Ones", "Phalanx", "Controller", "Controllers", "Morlock", "White Walker", "Shoggoth", "Deep One", "Vogon", "Russian", "Triffid", "Top", "Rose", "Hunger", "Mist", "Eel", "Spot", "Sin", "Girder", "Destroyer", "Maker", "Siren", "Jester", "Gambler", "Jaws", "Joker", "Terminator", "Godzilla", "Gru", "Mini-Me", "Fat Bastard", "Boba Fett", "Greedo", "Loki", "Venom", "Wanda Maximoff", "Nebula", "Thunderbolt Ross", "Rick Flag", "Big Barda", "Swamp Thing", "Siryn", "Billy Butcher", "Soldier Boy", "King Shark", "Mazikeen", "Amanda Waller", "Glenn Talbot", "Michael Pointer", "Barney Barton", "Harry Osborn", "Mister Mxyzptlk", "Nathaniel Richards", "Black Knight", "Prowler", "Gladiator", "Ultraman", "Ajax", "Callisto", "Talos the Untamed", "Bushman", "Diamondback", "Sentry-459", "Sentry", "Jason Todd", "Deadpool", "Northstar", "Maxima", "Sandman", "Molecule Man", "Circe", "Blaze and Satanus", "Mr. Wint and Mr. Kidd", "Beowulf's dragon", "Ragnarok", "Blackout", "Godspeed", "Wintergreen", "Andrea Beaumont", "Seth Brundle", "Shockwave", "Dreadnought", "Hurricane", "Tracer", "Turtle", "Snowman", "Arion", "Leo", "Aries", "Gemini", "Taurus", "Typhon", "Valentina", "Montana", "Mister X", "Firebrand", "Human Cannonball", "Batwing", "Hive", "Power Girl", "Abomination", "Cyborg Superman",
];
/** Clearly not heroes, removed from the superheroes pool. */
export const NOT_HEROES: string[] = [
  "Clayface", "Abomination", "Sinestro", "Ares", "Enchantress", "Odin", "Hercules", "Sandman", "Inhumans", "Wonder Twins", "Global Guardians", "Samson & Goliath", "Moby Dick and Mighty Mightor", "Bulletman and Bulletgirl", "Bob, Agent of Hydra", "Frankenstein", "Frankenstein's Monster", "Kismet", "Angel", "Shield", "Guardian", "Lightning", "Thunder", "Jet", "Bug", "Chief", "Speed", "Zombie", "Puck", "Paladin", "Ray", "Ion", "Surge", "Legion", "Gladiator", "Isis", "Apollo", "Toxin", "Punisher", "Rorschach", "Spawn", "Werewolf by Night", "Man-Thing", "Hit-Monkey", "Agent X", "Red Guardian", "Black Cat", "Dogpool", "Icon", "Rom", "Nova", "Steel", "Ronin", "Speedy", "Bruce Wayne", "Clark Kent", "Hades", "Ultimate Wolverine", "Hyperion", "Spectre", "Mantis", "Deadman",
];

/** Single quirks: [topic, label, member name] removed from that category. */
export const BANNED_PAIRS: [string, string, string][] = [
  ["flags", "Has Spanish as an official language", "United States"],
  ["geography", "Has Spanish as an official language", "United States"],
  ["food", "Made with fish", "Fried rice"],
  ["food", "Made with fish", "Biryani"],
  ["food", "Part of Korean cuisine", "Tonkatsu"],
];

export const isBannedLabel = (topic: string, label: string) => BANNED_LABELS["*"]!.includes(label) || (BANNED_LABELS[topic] ?? []).includes(label) || BANNED_PATTERNS.some((r) => r.test(label));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A skip pattern that matches every label except these exact ones. */
export const onlyExact = (list: string[]) => new RegExp(`^(?!(?:${list.map(esc).join("|")})$)`);

/** Named pairs that must never appear on the real data: [topic, label pattern ("." for any), name]. The data test pins them. */
export const MUST_NOT: [string, RegExp, string][] = [
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
];
