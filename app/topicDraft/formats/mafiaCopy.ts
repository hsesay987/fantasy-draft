// The narrator's lines for Mafia. Every phone reads the same one, picked by the turn and never by a role, and they say
// only what the table already knows: who is gone, or that nobody is, and never why.
import type { Role } from "./mafia";

export const ROLE_LABEL: Record<Role, string> = { mafia: "Mafia", doctor: "Doctor", detective: "Detective", villager: "Villager" };
/** A role in a sentence: "was {role}". */
export const ROLE_IN_LINE: Record<Role, string> = { mafia: "Mafia", doctor: "the Doctor", detective: "the Detective", villager: "a Villager" };

/** What each card says when opened. It's the only place that says what a night tap does for you. */
export const ROLE_HOW: Record<Role, string> = {
  mafia: "The name you tap at night is your target. If you and a partner differ, the later tap wins.",
  doctor: "The name you tap at night is safe until morning. It can be you, but not the same name two nights running.",
  detective: "Tap a name at night and this card tells you if they are Mafia.",
  villager: "Your tap at night does nothing, but tap anyway so nobody can tell. By day, find the mafia.",
};

/** Shown on every living phone every night. Word for word the same whatever the card says. */
export const NIGHT_PROMPT = "Everyone taps one name. Your card says what it does.";

export const LINES = {
  night: [
    "The rain comes in sideways and the town draws its curtains.",
    "Lamps hum. Windows go dark, one by one. Everybody is up to something.",
    "Another wet night. Somebody in this town is not asleep.",
    "The last bus has gone. The street belongs to the rain now.",
  ],
  /** The first night at a table of five. */
  nightQuiet: [
    "First night in a small town. Everyone is sizing each other up, so nobody leaves tonight.",
    "A table of five gets one easy night. Nobody leaves town before morning.",
    "Too early for trouble in a town this size. Nobody leaves tonight, but tap all the same.",
  ],
  morningGone: [
    "{name}'s light never came on this morning. The coat is gone, and so are they.",
    "The milk is still on {name}'s step. {name} has left town for good.",
    "Word at the diner: {name} caught the early train and won't be back.",
    "{name}'s stool at the counter stays empty. They are out of the game.",
  ],
  morningQuiet: [
    "Grey skies and a full diner. Everyone made it to breakfast.",
    "The morning paper has only the weather in it. Nobody is missing.",
    "Every light came on this morning. The whole town is still here.",
  ],
  talk: [
    "Two minutes. Somebody at this table is lying through their coffee.",
    "Talk it out. Ask questions. Watch who answers too fast.",
    "Everybody has an alibi and none of them are any good. Get talking.",
  ],
  vote: [
    "Time to point fingers. More than half the votes puts someone on the next bus.",
    "Ballots in the box. It takes more than half to run someone out of town.",
    "Who gets the next bus? It takes more than half the votes, and skips count.",
  ],
  voteOutMafia: [
    "The town put {name} on the last bus. Good call: {name} was {role}.",
    "{name} leaves with one suitcase and a lot of explaining to do. They were {role}.",
    "Hats off. {name} was {role} all along, and now they are some other town's problem.",
  ],
  voteOutInnocent: [
    "The town put {name} on the last bus. Awkward: {name} was {role}.",
    "{name} waves from the bus window. They were {role}, and the town owes them an apology.",
    "{name} is gone, and they were {role}. Somebody at this table is enjoying this.",
  ],
  voteNobody: [
    "No majority. Everyone goes home suspicious and damp.",
    "The ballots don't add up to anyone. The whole town stays, for now.",
    "Nobody on the bus tonight. The table couldn't agree.",
  ],
  villageWins: [
    "The mafia are gone. The sun even thinks about coming out.",
    "The last of the mafia is on the bus. The town can leave its doors unlocked again.",
    "Case closed. The village gets its quiet streets back.",
  ],
  mafiaWins: [
    "The mafia run this town now. They have already changed the parking rules.",
    "Too few left to stop them. The mafia own every umbrella in town.",
    "Nobody left to outvote them. The mafia get the good booth at the diner for life.",
  ],
  nobodyWins: [
    "Everyone wandered off. The rain has the town to itself.",
    "The street emptied out before anyone solved a thing.",
    "No winner tonight. The table got up and left the case unsolved.",
  ],
  /** For players who are out and can see every card. */
  spectator: [
    "You're out, so you can see every card. Keep it to yourself.",
    "From here you can see it all. No hints to the living.",
    "You've left town but you're still at the table. Not a word about what you know.",
  ],
} as const;

export type LineKey = keyof typeof LINES;

/** A line for this turn: the same on every phone, and a different one next turn or next game. */
export function lineFor(key: LineKey, turn: number, vars: { name?: string; role?: string } = {}): string {
  const lines = LINES[key];
  const at = ((Math.floor(turn) % lines.length) + lines.length) % lines.length;
  return lines[at]!.replace(/\{(name|role)\}/g, (_, k: "name" | "role") => vars[k] ?? "");
}
