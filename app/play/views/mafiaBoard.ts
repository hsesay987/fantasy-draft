// Pure rules behind the Mafia screens, kept apart so they can be tested. Nothing here reads a role a seat wasn't sent.
import { NIGHT_OK, SKIP_VOTE, quietNight, voted, type MafiaView, type Role } from "../../topicDraft/formats/mafia";
import { ROLE_IN_LINE, lineFor } from "../../topicDraft/formats/mafiaCopy";

export type Look = "night" | "dawn" | "day" | "dusk";
export const WORLD_OF = { night: "noirNight", dawn: "noirDawn", day: "noirDay", dusk: "noirDusk" } as const;
export const SCENE_OF: Record<Look, string> = {
  night: "A rain-soaked town at night, with street lamps on and lit windows going dark",
  dawn: "The same wet street at a grey dawn, with the lamps out",
  day: "The town on an overcast day, with rain still falling",
  dusk: "The town at dusk, with windows lighting up and the street lamps back on",
};

/** The town's time of day, from the game alone, so it can never differ between phones. */
export function lookOf(s: Pick<MafiaView, "phase" | "done" | "winner">): Look {
  if (s.done) return s.winner === "mafia" ? "night" : s.winner === "village" ? "day" : "dawn";
  return s.phase === "night" ? "night" : s.phase === "morning" ? "dawn" : s.phase === "talk" ? "day" : "dusk";
}

/** A seat can be named anything, including "constructor". */
const own = <T,>(m: Record<string, T>, k: string): T | undefined => (Object.keys(m).includes(k) ? m[k] : undefined);
export const roleOf = (s: Pick<MafiaView, "roles">, p: string): Role | undefined => own(s.roles, p);
export const voteOf = (s: Pick<MafiaView, "votes">, p: string): string | undefined => own(s.votes, p);

/** What tapping this name sends tonight for this seat, or null if the name can't be picked. Every tile looks the same either way. */
export function nightPick(s: Pick<MafiaView, "roles" | "alive" | "lastSave">, me: string, name: string): string | null {
  const role = roleOf(s, me);
  if (!role || !s.alive.includes(me) || !s.alive.includes(name)) return null;
  if (role === "villager") return NIGHT_OK;
  if (role === "mafia") return roleOf(s, name) === "mafia" ? null : name;
  if (role === "doctor") return name === s.lastSave ? null : name;
  return name === me ? null : name;
}

export const partnersOf = (s: Pick<MafiaView, "roles">, me: string) => Object.keys(s.roles).filter((p) => p !== me && s.roles[p] === "mafia");

export type Tally = { target: string; voters: string[] }[];
/** Votes grouped by who they were for, biggest first, and the skips last. */
export function tallyOf(votes: Record<string, string>): Tally {
  const by = new Map<string, string[]>();
  for (const [p, t] of Object.entries(votes)) by.set(t, [...(by.get(t) ?? []), p]);
  return [...by].map(([target, voters]) => ({ target, voters })).sort((a, b) => Number(a.target === SKIP_VOTE) - Number(b.target === SKIP_VOTE) || b.voters.length - a.voters.length);
}

/** How the last vote went, from the votes themselves: the last elimination might be from an earlier day. */
export function voteResult(s: Pick<MafiaView, "votes" | "eliminated">): { out: string | null; role: Role | null } {
  const out = voted(s.votes);
  const role = out ? s.eliminated.find((e) => e.name === out && e.by === "vote")?.role ?? null : null;
  return { out: role ? out : null, role };
}

const turnOf = (s: Pick<MafiaView, "night" | "startedAt">) => s.night + Math.floor(s.startedAt / 1000);

export const voteLine = (s: Pick<MafiaView, "votes" | "eliminated" | "night" | "startedAt">) => {
  const { out, role } = voteResult(s);
  if (!out || !role) return lineFor("voteNobody", turnOf(s));
  return lineFor(role === "mafia" ? "voteOutMafia" : "voteOutInnocent", turnOf(s), { name: out, role: ROLE_IN_LINE[role] });
};
export const morningLine = (s: Pick<MafiaView, "morning" | "night" | "startedAt">) =>
  s.morning?.died ? lineFor("morningGone", turnOf(s), { name: s.morning.died }) : lineFor("morningQuiet", turnOf(s));
export const nightLine = (s: Pick<MafiaView, "players" | "night" | "startedAt">) => lineFor(quietNight(s) ? "nightQuiet" : "night", turnOf(s));
export const talkLine = (s: Pick<MafiaView, "night" | "startedAt">) => lineFor("talk", turnOf(s));
export const openVoteLine = (s: Pick<MafiaView, "night" | "startedAt">) => lineFor("vote", turnOf(s));
export const endLine = (s: Pick<MafiaView, "winner" | "night" | "startedAt">) => lineFor(s.winner === "village" ? "villageWins" : s.winner === "mafia" ? "mafiaWins" : "nobodyWins", turnOf(s));
export const spectatorLine = (s: Pick<MafiaView, "night" | "startedAt">) => lineFor("spectator", turnOf(s));

/** Was this game's last act a vote, a night, or neither (everyone walked out)? The engine leaves `phase` where it ended. */
export const endedBy = (s: Pick<MafiaView, "phase" | "winner">): "vote" | "night" | null => (!s.winner ? null : s.phase === "vote" ? "vote" : s.phase === "morning" ? "night" : null);

const FATE: Record<"night" | "vote", string> = { night: "Left in the night", vote: "Voted out" };
export const fateOf = (s: Pick<MafiaView, "eliminated">, p: string) => {
  const e = s.eliminated.find((x) => x.name === p);
  return e ? FATE[e.by] : "Still in town";
};
