// Builds app/topicDraft/party/vowelWordList.json: fair names per topic for Vowel Play.
// Run: npx tsx scripts/buildVowelWords.ts   (then read the lists; add unfair names to EXCLUDE and re-run)
import fs from "node:fs";
import path from "node:path";
import { CATALOG_META, getCatalog } from "../app/topicDraft/catalogs";
import { cleanName, isUsable, toPuzzle } from "../app/topicDraft/party/vowelText";

const MIN_NAMES = 40;
const OUT = path.resolve(__dirname, "../app/topicDraft/party/vowelWordList.json");
const TOPICS_OUT = path.resolve(__dirname, "../app/topicDraft/party/vowelTopics.ts");

/** Names left out after reading every list as a player would: obscure, a generic word that isn't really the name,
 * a form nobody says, or too ambiguous to answer fairly. A key is a topic id and removes those names from that topic
 * only. The "*" key removes names from every topic; use it for names that are unfair wherever they appear, which
 * includes the unions (fictional, heroes-villains) built from other topics. */
const EXCLUDE: Record<string, string[]> = {
  "*": ["Atom Eve", "A-Train", "Billy Butcher", "Starlight", "Deathlok", "Booster Gold", "Captain Atom", "Savage Dragon", "Plastic Man", "Mothra", "Beast", "Static", "Doctor Fate", "Huntress", "Cell", "Terminator T-800", "Handsome Jack", "Captain Cold", "Cheetah", "Geralt's Ciri", "Nemo's Dory", "Jaws Shark", "Steve", "Donkey", "Dante", "L Lawliet", "Isaac Clarke", "Giyu Tomioka", "Trafalgar Law", "Dio Brando", "Madara Uchiha", "Zenitsu", "Hisoka", "Lelouch", "Genos", "Sukuna", "Rukia Kuchiki", "Reinhardt", "Joel Miller", "Tails", "Tracer", "Mercy", "Ratchet", "Spyro", "Knuckles", "Maximus", "Remy", "Raven", "Falcon", "Wasp", "Vision", "Invincible"],
  superheroes: ["Harley Quinn", "Black Adam", "Venom", "Catwoman", "Hercules", "Constantine"],
  football: ["Ronaldo Nazário"],
  films: ["Se7en", "Léon: The Professional", "Dune: Part Two"],
  shows: ["Dark", "Lost", "Star Trek: The Next Generation"],
  nba: ["Dolph Schayes", "Bob Pettit", "Artis Gilmore", "Dan Issel", "Hal Greer", "Paul Arizin", "Bill Sharman", "Chet Walker", "Jerry Lucas", "Neil Johnston", "Bailey Howell", "Ed Macauley", "Sam Jones", "Vern Mikkelsen", "Walt Bellamy", "Zelmo Beaty", "Cliff Hagan", "Detlef Schrempf", "Richie Guerin", "Harry Gallatin", "Lou Hudson", "Jack Twyman", "Gail Goodrich", "Spencer Haywood", "Tom Heinsohn", "Walter Davis", "Slater Martin", "Bob Dandridge", "Larry Foust", "Otis Thorpe", "Louie Dampier", "Tom Chambers", "Terry Cummings", "Sam Perkins", "Marques Johnson", "Larry Costello", "George Yardley", "Clyde Lovellette", "Connie Hawkins", "Calvin Murphy", "Bobby Jones", "Terry Porter", "Dave Bing", "George McGinnis", "Mark Price", "Jack Sikma", "Adrian Dantley", "Bernard King", "Buck Williams", "Billy Cunningham", "Dennis Johnson", "Paul Westphal", "Bob McAdoo", "Glen Rice", "Jeff Hornacek", "Bob Lanier", "Alex English", "Sidney Moncrief", "Nate Thurmond", "Lenny Wilkens", "Eddie Jones", "Tiny Archibald", "A.C. Green", "Kevin Johnson", "Maurice Cheeks", "Mark Price", "Anthony Mason", "Jason Terry", "Joe Johnson", "Rashard Lewis", "Paul Millsap", "Larry Nance", "Jermaine O'Neal", "Mike Conley", "Horace Grant", "Mitch Richmond", "Joe Dumars", "Bill Laimbeer", "Marc Gasol", "Bob Cousy", "Elgin Baylor", "Rick Barry", "Robert Parish", "Elvin Hayes", "John Havlicek", "Walt Frazier", "Wes Unseld", "Dave Cowens", "George Mikan", "Willis Reed", "Earl Monroe", "Dave DeBusschere", "Rudy Tomjanovich", "Chris Mullin", "Tim Hardaway", "Shawn Marion", "Ben Wallace", "Rasheed Wallace", "Tyson Chandler", "DeAndre Jordan", "Elton Brand", "Vlade Divac", "James Worthy", "Chauncey Billups", "LaMarcus Aldridge"],
  food: ["Kimchi Jjigae", "Doro Wat", "Bunny Chow", "Xiaolongbao"],
  books: ["Nineteen Eighty-Four", "Foundation", "Beloved"],
};

/** Names whose catalog form is not what people say (applied before the fairness check). */
const RENAME: Record<string, string> = {
  "Martin Luther King Jr.": "Martin Luther King",
  "Neymar Jr": "Neymar",
  "Star Wars: A New Hope": "Star Wars",
};

const topics: { id: string; title: string }[] = [];
const words: Record<string, string[]> = {};
const dropped: Record<string, number> = {};

for (const meta of CATALOG_META) {
  const skip = new Set([...(EXCLUDE["*"] ?? []), ...(Object.hasOwn(EXCLUDE, meta.id) ? EXCLUDE[meta.id]! : [])].map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const list: string[] = [];
  let excluded = 0;
  for (const item of getCatalog(meta.id)) {
    const name = cleanName(RENAME[item.name] ?? item.name);
    if (!name || !isUsable(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (skip.has(key)) { excluded++; continue; }
    list.push(name);
  }
  dropped[meta.id] = excluded;
  if (list.length < MIN_NAMES) { console.log(`skip ${meta.id}: ${list.length} usable`); continue; }
  topics.push({ id: meta.id, title: meta.title });
  words[meta.id] = list;
}

fs.writeFileSync(OUT, JSON.stringify({ topics, words }, null, 1) + "\n");
// The same topics with no names, for the room screens.
const topicsTs = [
  "// Vowel Play's topic ids and titles, with no names in them: room screens import this, never the word list, so a phone never holds the answers.",
  "// Generated by scripts/buildVowelWords.ts alongside vowelWordList.json (do not edit by hand); vowelTopics.test.ts checks they agree.",
  "",
  "/** Topics with at least 40 fair names; the title is the only hint players get. */",
  "export const VOWEL_TOPICS: { id: string; title: string }[] = [",
  ...topics.map((t) => `  { id: ${JSON.stringify(t.id)}, title: ${JSON.stringify(t.title)} },`),
  "];",
  "",
  "/** The topic's title, or its id for an unknown topic. */",
  "export const vowelTopicTitle = (id: string): string => VOWEL_TOPICS.find((t) => t.id === id)?.title ?? id;",
  "",
].join("\n");
fs.writeFileSync(TOPICS_OUT, topicsTs);
for (const t of topics) console.log(`${t.id}: ${words[t.id]!.length} (excluded ${dropped[t.id]})`);
if (process.argv.includes("--print")) for (const t of topics) console.log(`\n## ${t.id}\n` + words[t.id]!.map((w) => `${w} = ${toPuzzle(w)}`).join("\n"));
