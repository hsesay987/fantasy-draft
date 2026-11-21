import type { Scenario } from "./types";
import { SCENARIOS } from "./scenarios";
import { catalogMeta } from "./catalogs";
import { FAMILY_OF, statBest, statLabel } from "./stats";

export const HISTORY_MISSIONS: Scenario[] = [
  { id: "dinner-party", title: "Host the Perfect Dinner Party", blurb: "Charm, wit and conversation win the night.", weights: { charisma: 3, intellect: 2.5, influence: 1.5, courage: 0.5, leadership: 1, strategy: 0.5 } },
  { id: "win-a-war", title: "Win a Great War", blurb: "Strategy and command decide empires.", weights: { strategy: 3, leadership: 3, courage: 2, influence: 1, intellect: 1.5, charisma: 1 } },
  { id: "found-a-nation", title: "Found a New Nation", blurb: "Vision, influence and leadership.", weights: { leadership: 3, influence: 3, intellect: 2, charisma: 2, strategy: 1.5, courage: 1 } },
  { id: "survive-apocalypse", title: "Survive the Apocalypse", blurb: "Courage, smarts and keeping people together.", weights: { courage: 3, strategy: 2, leadership: 2, intellect: 2, charisma: 1, influence: 0.5 } },
  { id: "all-around-history", title: "Greatest All-Round Team", blurb: "No mission. Pure greatness.", weights: { leadership: 1, intellect: 1, courage: 1, influence: 1, charisma: 1, strategy: 1 } },
];

export const MYTHOLOGY_MISSIONS: Scenario[] = [
  { id: "ragnarok", title: "Survive Ragnarök", blurb: "The end of the world. Last ones standing win.", weights: { durability: 3, combat: 2.5, power: 2, speed: 1, intellect: 1 } },
  { id: "storm-olympus", title: "Storm Mount Olympus", blurb: "Take the throne of the gods by force.", weights: { power: 3, combat: 2.5, durability: 1.5, speed: 1, intellect: 1 } },
  { id: "golden-fleece", title: "Steal the Golden Fleece", blurb: "Get in, outwit the guardian, get out.", weights: { intellect: 3, speed: 2.5, combat: 1, power: 0.5, durability: 1 } },
  { id: "escape-underworld", title: "Escape the Underworld", blurb: "Talk, trick or fight your way back to the living.", weights: { intellect: 2.5, durability: 2.5, speed: 1.5, combat: 1.5, power: 1 } },
  { id: "all-around-myth", title: "Greatest Pantheon", blurb: "No quest. Pure legend.", weights: { power: 1, intellect: 1, speed: 1, durability: 1, combat: 1 } },
];

export const ANIMAL_MISSIONS: Scenario[] = [
  { id: "rule-savanna", title: "Rule the Savanna", blurb: "Top of the food chain, by force.", weights: { power: 3, combat: 3, durability: 1.5, speed: 1, intellect: 0.5 } },
  { id: "escape-zoo", title: "Break Out of the Zoo", blurb: "Brains to plan it, speed to pull it off.", weights: { intellect: 3, speed: 2.5, power: 1, durability: 0.5, combat: 0.5 } },
  { id: "survive-wild", title: "Survive a Year in the Wild", blurb: "Storms, hunger and everything that wants to eat you.", weights: { durability: 3, intellect: 2, speed: 1.5, combat: 1.5, power: 1 } },
  { id: "relay-race", title: "Win the Animal Relay", blurb: "Land, sea and sky: fastest team takes it.", weights: { speed: 3.5, durability: 1, power: 1, intellect: 0.5, combat: 0.5 } },
  { id: "all-around-animals", title: "Greatest Animal Team", blurb: "No challenge. Pure nature.", weights: { power: 1, intellect: 1, speed: 1, durability: 1, combat: 1 } },
];

export const CELEBRITY_MISSIONS: Scenario[] = [
  { id: "awards-night", title: "Sweep Awards Night", blurb: "Talent wins trophies. Charm wins the speeches.", weights: { talent: 3, charisma: 2, style: 1.5, fame: 1, influence: 1, longevity: 1 } },
  { id: "blockbuster", title: "Open a Blockbuster", blurb: "Names on the poster that fill every seat.", weights: { fame: 3, charisma: 2.5, talent: 1.5, style: 1, influence: 1, longevity: 0.5 } },
  { id: "launch-brand", title: "Launch a Brand", blurb: "Taste, reach and people who follow your lead.", weights: { influence: 3, style: 2.5, fame: 2, charisma: 1, talent: 0.5, longevity: 0.5 } },
  { id: "celeb-dinner", title: "Host the Celebrity Dinner Party", blurb: "Great stories and better company.", weights: { charisma: 3, longevity: 2, talent: 1, fame: 1, style: 1, influence: 1 } },
  { id: "all-around-celebs", title: "Greatest A-List", blurb: "No theme. Pure star power.", weights: { fame: 1, talent: 1, charisma: 1, style: 1, influence: 1, longevity: 1 } },
];

export const FOOTBALL_MISSIONS: Scenario[] = [
  { id: "world-cup-final", title: "Win the World Cup Final", blurb: "One match, everything on the line. Balance and nerve.", weights: { shooting: 2.5, passing: 2, defending: 2, dribbling: 1.5, pace: 1.5, physical: 1.5 } },
  { id: "counter-attack", title: "Lethal Counter-Attack", blurb: "Win the ball, burn them on the break.", weights: { pace: 3, shooting: 2.5, dribbling: 2, passing: 1.5, defending: 0.5, physical: 1 } },
  { id: "tiki-taka", title: "Tiki-Taka Masterclass", blurb: "Own the ball, pass them to sleep.", weights: { passing: 3, dribbling: 2.5, shooting: 1, pace: 0.5, defending: 1, physical: 0.5 } },
  { id: "park-the-bus", title: "Park the Bus", blurb: "Nothing gets through. Defend and hit hard.", weights: { defending: 3, physical: 2.5, passing: 1, pace: 1, shooting: 0.5, dribbling: 0.5 } },
  { id: "penalty-shootout", title: "Survive a Penalty Shootout", blurb: "Cool heads, clean strikes.", weights: { shooting: 3, physical: 1.5, passing: 1, dribbling: 1, defending: 1.5, pace: 0.5 } },
  { id: "all-around-football", title: "Greatest All-Round XI", blurb: "No tactic. Pure quality.", weights: { pace: 1, shooting: 1, passing: 1, dribbling: 1, defending: 1, physical: 1 } },
];

// Films and shows have no "mission": the draft is judged on a lens (who is judging, or what the night is for).
export const FILM_MISSIONS: Scenario[] = [
  { id: "critics-choice", title: "Critics\u2019 Choice", blurb: "What the reviewers put on their best-of lists.", weights: { critics: 3, impact: 1.5, visuals: 1 } },
  { id: "crowd-favourite", title: "Crowd Favourite", blurb: "What audiences actually love.", weights: { audience: 3, rewatch: 2, boxOffice: 1 } },
  { id: "box-office", title: "Opening Weekend", blurb: "Fill every seat in the building.", weights: { boxOffice: 3, audience: 1.5, visuals: 1 } },
  { id: "rewatch-king", title: "Rewatch King", blurb: "Comfort viewing, again and again.", weights: { rewatch: 3, audience: 2 } },
  { id: "visual-spectacle", title: "Visual Spectacle", blurb: "Big screen, big sound, big eyes.", weights: { visuals: 3, boxOffice: 1.5, audience: 1 } },
  { id: "cultural-impact", title: "Cultural Impact", blurb: "What shaped everything after.", weights: { impact: 3, critics: 1.5, boxOffice: 1 } },
  { id: "all-around-screen", title: "Overall Best", blurb: "No lens. Pure greatness.", weights: { critics: 1, audience: 1, boxOffice: 1, impact: 1, visuals: 1, rewatch: 1 } },
];

export const SHOW_MISSIONS: Scenario[] = [
  { id: "critics-choice", title: "Critics\u2019 Choice", blurb: "What the reviewers put on their best-of lists.", weights: { critics: 3, impact: 1.5, visuals: 1 } },
  { id: "crowd-favourite", title: "Crowd Favourite", blurb: "What audiences actually love.", weights: { audience: 3, rewatch: 2 } },
  { id: "rewatch-king", title: "Rewatch King", blurb: "Comfort viewing, again and again.", weights: { rewatch: 3, audience: 2, longevity: 1 } },
  { id: "long-haul", title: "In It for the Long Haul", blurb: "Hundreds of episodes and still going.", weights: { longevity: 3, rewatch: 1.5, audience: 1 } },
  { id: "cultural-impact", title: "Cultural Impact", blurb: "What everyone was talking about.", weights: { impact: 3, critics: 1, longevity: 1 } },
  { id: "all-around-screen", title: "Overall Best", blurb: "No lens. Pure greatness.", weights: { critics: 1, audience: 1, longevity: 1, impact: 1, visuals: 1, rewatch: 1 } },
];

export const POKEMON_MISSIONS: Scenario[] = [
  { id: "tournament", title: "Win the Champion\u2019s League", blurb: "Six on six. Hit hard, move first, survive the reply.", weights: { power: 2.5, speed: 2, durability: 1.5, combat: 2 } },
  { id: "fast-sweep", title: "Sweep Before They Blink", blurb: "Out-speed everything and knock it out.", weights: { speed: 3, power: 2.5, combat: 0.5 } },
  { id: "stall", title: "Wall Them Out", blurb: "Take every hit and outlast them.", weights: { durability: 3, combat: 1.5, power: 0.5 } },
  { id: "all-around-pokemon", title: "Best Team of Six", blurb: "No plan. Pure base stats.", weights: { power: 1, speed: 1, durability: 1, combat: 1 } },
];

export const BASKETBALL_MISSIONS: Scenario[] = [
  { id: "bucket-getters", title: "Bucket Getters", blurb: "Points, points and more points.", weights: { scoring: 3, shooting: 2, impact: 1.5, playmaking: 0.5, rebounding: 0.5, defense: 0.5 } },
  { id: "two-way", title: "Two-Way Stars", blurb: "Score on one end, stop them on the other.", weights: { scoring: 2, defense: 2.5, impact: 1.5, rebounding: 1, shooting: 1, playmaking: 0.5 } },
  { id: "pass-first", title: "Pass-First Offense", blurb: "Share the ball and shoot it well.", weights: { playmaking: 3, shooting: 2, scoring: 1.5, impact: 1, rebounding: 0.5, defense: 0.5 } },
  { id: "paint-patrol", title: "Paint Patrol", blurb: "Own the glass and the rim.", weights: { rebounding: 3, defense: 2.5, impact: 1, scoring: 1, shooting: 0.5, playmaking: 0.5 } },
  { id: "all-around-basketball", title: "Greatest Five", blurb: "No system. Pure quality.", weights: { scoring: 1, playmaking: 1, rebounding: 1, defense: 1, shooting: 1, impact: 1 } },
];

export const FOOD_MISSIONS: Scenario[] = [
  { id: "dinner-date", title: "Impress on a Dinner Date", blurb: "Looks stunning, tastes better.", weights: { presentation: 3, taste: 2.5, health: 1, comfort: 1, spice: 0.5, versatility: 0.5 } },
  { id: "rainy-night", title: "Rainy Night In", blurb: "Warm, filling, no effort.", weights: { comfort: 3, taste: 2.5, versatility: 1, spice: 1, presentation: 0.5, health: 0.5 } },
  { id: "food-festival", title: "Win a Street Food Festival", blurb: "Big flavour that travels.", weights: { taste: 3, versatility: 2.5, spice: 1.5, comfort: 1.5, presentation: 1, health: 0.5 } },
  { id: "training-camp", title: "Fuel an Athlete", blurb: "Healthy food that still tastes good.", weights: { health: 3, taste: 1.5, versatility: 1.5, comfort: 1, presentation: 0.5, spice: 0.5 } },
  { id: "heat-challenge", title: "Spice Challenge", blurb: "Bring the heat, keep the flavour.", weights: { spice: 3, taste: 2.5, comfort: 1, presentation: 1, health: 0.5, versatility: 0.5 } },
  { id: "all-around-food", title: "Greatest Menu", blurb: "No theme. Pure flavour.", weights: { taste: 1, comfort: 1, health: 1, spice: 1, presentation: 1, versatility: 1 } },
];

export const COUNTRY_MISSIONS: Scenario[] = [
  { id: "build-a-superpower", title: "Build a Superpower", blurb: "Money and might run the world.", weights: { economy: 3, military: 3, culture: 0.5 } },
  { id: "dream-holiday", title: "Plan the Dream Holiday", blurb: "Views, food and places worth the flight.", weights: { landscape: 3, cuisine: 2.5, tourism: 2, culture: 2 } },
  { id: "foodie-tour", title: "Go on a Food Tour", blurb: "Eat your way around the world.", weights: { cuisine: 3, culture: 1.5, tourism: 1 } },
  { id: "great-outdoors", title: "Into the Wild", blurb: "Mountains, forests, coastlines.", weights: { landscape: 3, tourism: 0.5 } },
  { id: "cultural-capital", title: "Cultural Capital", blurb: "Heritage sites, history and soft power.", weights: { culture: 3, tourism: 1.5, cuisine: 1.5 } },
  { id: "all-around-geography", title: "Best Places on Earth", blurb: "No theme. The best all-rounders.", weights: { economy: 1, military: 1, tourism: 1, culture: 1, landscape: 1, cuisine: 1 } },
];

// Flags and books are judged on a lens, like films and shows. The flag lenses follow the usual rules of flag design:
// keep it simple, make it mean something, make it distinctive.
export const FLAG_MISSIONS: Scenario[] = [
  { id: "design-award", title: "Design Award", blurb: "Simple, distinctive and full of meaning.", weights: { simplicity: 3, uniqueness: 2.5, symbolism: 1.5, recognition: 1 } },
  { id: "most-meaningful", title: "Most Meaningful", blurb: "Every colour and shape tells a story.", weights: { symbolism: 3, uniqueness: 1.5, recognition: 1 } },
  { id: "most-colourful", title: "Most Colourful", blurb: "Bright, busy and beautiful.", weights: { colors: 3, uniqueness: 1.5, symbolism: 1 } },
  { id: "instantly-known", title: "Instantly Recognised", blurb: "Anyone could name it in a second.", weights: { recognition: 3, simplicity: 1.5, uniqueness: 1.5 } },
  { id: "one-of-a-kind", title: "One of a Kind", blurb: "Nothing else looks like it.", weights: { uniqueness: 3, symbolism: 1.5, colors: 1 } },
  { id: "all-around-flags", title: "Best Flags Overall", blurb: "No lens. The best design.", weights: { colors: 1, symbolism: 1, simplicity: 1, recognition: 1, uniqueness: 1 } },
];

export const BOOK_MISSIONS: Scenario[] = [
  { id: "book-club", title: "Book Club Pick", blurb: "Something to talk about for hours.", weights: { characters: 3, prose: 2, plot: 2, legacy: 1.5, worldbuilding: 1, pageturner: 1 } },
  { id: "beach-read", title: "Beach Read", blurb: "Impossible to put down.", weights: { pageturner: 3, plot: 2.5, characters: 1.5, worldbuilding: 1, prose: 0.5, legacy: 0.5 } },
  { id: "literature-prize", title: "Literature Prize", blurb: "Beautiful writing that lasts.", weights: { prose: 3, legacy: 2.5, characters: 2, plot: 1, worldbuilding: 1, pageturner: 0.5 } },
  { id: "escape-reality", title: "Escape Reality", blurb: "Worlds you could live in.", weights: { worldbuilding: 3, plot: 2, pageturner: 1.5, characters: 1.5, prose: 1, legacy: 0.5 } },
  { id: "desert-island", title: "Desert Island Shelf", blurb: "The books you'd read forever.", weights: { legacy: 2.5, characters: 2, prose: 2, plot: 2, worldbuilding: 1.5, pageturner: 1 } },
  { id: "all-around-books", title: "Greatest Bookshelf", blurb: "No lens. Pure greatness.", weights: { plot: 1, prose: 1, characters: 1, worldbuilding: 1, legacy: 1, pageturner: 1 } },
];

export const MUSIC_MISSIONS: Scenario[] = [
  { id: "headline-festival", title: "Headline a Festival", blurb: "Hits and a show nobody forgets.", weights: { stage: 3, hits: 2.5, vocals: 1.5, legacy: 1, songwriting: 1, longevity: 0.5 } },
  { id: "road-trip", title: "Road Trip Playlist", blurb: "Every song a singalong.", weights: { hits: 3, vocals: 2, songwriting: 1.5, stage: 0.5, legacy: 1, longevity: 1 } },
  { id: "record-label", title: "Start a Record Label", blurb: "Songwriters who last decades.", weights: { songwriting: 3, longevity: 2.5, hits: 2, legacy: 1.5, vocals: 1, stage: 0.5 } },
  { id: "vocal-showdown", title: "Vocal Showdown", blurb: "Only the voice matters.", weights: { vocals: 3, stage: 1.5, hits: 1, songwriting: 0.5, legacy: 1, longevity: 0.5 } },
  { id: "hall-of-fame", title: "Hall of Fame", blurb: "Who changed music forever?", weights: { legacy: 3, songwriting: 2, longevity: 2, hits: 1.5, stage: 1, vocals: 1 } },
  { id: "all-around-music", title: "Greatest Lineup", blurb: "No theme. Pure talent.", weights: { vocals: 1, songwriting: 1, hits: 1, stage: 1, legacy: 1, longevity: 1 } },
];

const BY_FAMILY: Record<string, Scenario[]> = {
  characters: SCENARIOS, pokemon: POKEMON_MISSIONS, basketball: BASKETBALL_MISSIONS, football: FOOTBALL_MISSIONS, films: FILM_MISSIONS, shows: SHOW_MISSIONS,
  food: FOOD_MISSIONS, countries: COUNTRY_MISSIONS, flags: FLAG_MISSIONS, books: BOOK_MISSIONS, music: MUSIC_MISSIONS, history: HISTORY_MISSIONS,
  mythology: MYTHOLOGY_MISSIONS, animals: ANIMAL_MISSIONS, celebrities: CELEBRITY_MISSIONS,
};

/** Missions that suit a topic: the ones written for its stat family. */
export function missionsFor(poolId: string): Scenario[] {
  return BY_FAMILY[FAMILY_OF[poolId] ?? "characters"] ?? SCENARIOS;
}

export const missionById = (poolId: string, id: string) => missionsFor(poolId).find((m) => m.id === id) ?? missionsFor(poolId)[0]!;

export function customMission(poolId: string, title: string, blurb: string): Scenario {
  const base = missionsFor(poolId).at(-1)!;
  return { id: "custom", title: title.trim() || "Custom mission", blurb: blurb.trim(), weights: base.weights };
}

/** Single-stat ranking categories for Blind Rank. */
export function metricsFor(poolId: string): Scenario[] {
  return (catalogMeta(poolId)?.statKeys ?? []).map((k) => ({
    id: `metric-${k}`,
    title: `Rank by: ${statBest(k, poolId)}`,
    blurb: `Who ranks highest for ${statLabel(k, poolId)}?`,
    weights: { [k]: 1 },
  }));
}
