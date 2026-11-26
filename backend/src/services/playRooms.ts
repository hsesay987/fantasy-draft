// Online rooms for the TopPic draft formats. Rooms live in memory (no database writes, no accounts):
// players join with a room code and get a private seat token. The server owns the game state and
// runs the exact same engines as the browser (backend/src/shared is generated from the web app).
// A room outlives its games: after one ends everyone goes back to the lobby, and the host can pick
// another game (or the same one again) without anyone having to rejoin.
import crypto from "crypto";
import { getIo } from "../socket";
import { trackServer } from "../lib/monitoring";
import { judge, type Verdict } from "./judge.service";
import type { QuizData } from "../shared/topicDraft/trivia/types";
import { applyAction, autoAction, buildTeams, currentTurn, initGame, isDone, npatIsDig, npatIsQuestion, npatPicked, QUICK_FORMATS, suggestion, timeoutAction, type Action, type GameState } from "../shared/topicDraft/core";
import { CATALOG_META, getCatalog } from "../shared/topicDraft/catalogs";
import type { GameSetup, FormatId } from "../shared/play/types";
import { DEFAULT_OPTS, PARTY_FORMATS } from "../shared/play/types";
import * as A from "../shared/topicDraft/formats/auction";
import * as B from "../shared/topicDraft/formats/blind";
import * as P from "../shared/topicDraft/formats/position";
import { vetoCount, vetoOn } from "../shared/topicDraft/veto";
import * as IM from "../shared/topicDraft/formats/imposter";
import * as V from "../shared/topicDraft/formats/vote";
import * as IS from "../shared/topicDraft/formats/insync";
import * as PT from "../shared/topicDraft/formats/partytrivia";
import * as MF from "../shared/topicDraft/formats/mafia";
import * as VP from "../shared/topicDraft/formats/vowelplay";
import * as PK from "../shared/topicDraft/formats/pecking";
import * as SL from "../shared/topicDraft/formats/sayless";
import * as NP from "../shared/topicDraft/formats/npat";
import * as DIG from "../shared/topicDraft/formats/npatDig";
import * as DG from "../shared/topicDraft/formats/dodge";
import { ANSWER_MAX as DODGE_ANSWER_MAX } from "../shared/topicDraft/dodge/rules";
import * as NQ from "../shared/topicDraft/formats/npatQuestion";
import { QUESTIONS_POOL } from "../shared/topicDraft/npat/questions";
import "../shared/topicDraft/party/vowelWords"; // loads the word list the Vowel Play engine deals from
import "../shared/topicDraft/pecking/lists"; // loads the ranked lists the Pecking Order engine deals from
import "../shared/topicDraft/sayless/words"; // loads the words the Say Less engine deals from
import "../shared/topicDraft/npat/lists"; // loads the answer lists the NPAT engine checks and draws letters from
import { NPAT_CATEGORIES } from "../shared/topicDraft/npat/categories";
import { ANSWER_MAX as NPAT_ANSWER_MAX, digCountOk, QUESTION_DEFAULT_ROUNDS, QUESTION_MAX_ROUNDS, QUESTION_MIN_ROUNDS } from "../shared/topicDraft/npat/rules";
import { lettersAvailable } from "../shared/topicDraft/npat/source";
import type { NpatHistoryStore } from "./npatHistory.service";
import { VOWEL_TOPICS } from "../shared/topicDraft/party/vowelTopics";
import { TRIVIA_POOLS } from "../shared/topicDraft/trivia";
import { deckOf } from "../shared/topicDraft/party/decks";
import { insyncDeckOf } from "../shared/topicDraft/party/insyncDecks";
import { mixTitle, poolIdsFor, poolTitleFor } from "../shared/topicDraft/party/pools";
import { addGame, awardsFor, standings, type Awards, type Tournament } from "../shared/topicDraft/party/tournament";
import { GROUP_CALL } from "../shared/topicDraft/party/drinks";
import { teamsFor } from "../shared/topicDraft/party/teams";
import type { Item } from "../shared/topicDraft/types";

export const FORMAT_IDS: FormatId[] = ["snake", "spin", "auction", "loadout", "position", "blind", "keep", "feud", "jeopardy", "imposter", "vote", "insync", "partytrivia", "mafia", "vowelplay", "vowelparty", "pecking", "sayless", "npat", "dodge"];
/** Party games take a bigger group; drafts and trivia stay at six. */
const MAX_SEATS = 12;
const DRAFT_SEATS = 6;
/** Fewest players each game starts with; anything not listed needs 2. */
export const MIN_PLAYERS: Partial<Record<FormatId, number>> = { imposter: 3, mafia: MF.MIN_PLAYERS, dodge: 3 };
/** An empty room (no game picked yet) takes the bigger party group; picking a draft caps it at six. */
const seatCap = (format: FormatId | undefined) => (!format || PARTY_FORMATS.has(format) ? MAX_SEATS : DRAFT_SEATS);
const MAX_ROOMS = 500;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const AFK_TURN_MS = 120_000;
/** A seat not heard from for this long doesn't hold the crown. Every phone polls every 2 seconds. */
const HOST_AWAY_MS = 45_000;
/** Longer in the lobby: a host who leaves the browser to text the code around must still have the room when they get back. */
const HOST_AWAY_LOBBY_MS = 5 * 60_000;

/** `lastSeen` stays on the server: nothing in a snapshot changes because a phone polled. */
type Seat = { name: string; token: string; left: boolean; lastSeen: number; /** The host's seat when it runs the night from a screen: keeps host controls, never plays. */ screen?: boolean };
/** An NBA, NFL or Cartoon stat draft room the host opened for this group (those rooms need accounts). */
type StatLink = { code: string; league: "NBA" | "NFL" | "CARTOON" };
type Room = {
  code: string;
  /** The game picked for the next (or current) round; null until the host picks one. */
  setup: GameSetup | null;
  seats: Seat[];
  status: "lobby" | "playing" | "done";
  state: GameState | null;
  turnMarker: string;
  turnStartedAt: number;
  /** Party games: when the host paused the game (wall clock), unset while it runs. */
  pausedAt?: number;
  /** Party games: total time this game has spent paused, in ms. The game's clock runs this far behind the wall. */
  pausedMs?: number;
  verdict: Verdict | null;
  version: number;
  createdAt: number;
  touchedAt: number;
  /** Games finished in this room, newest last. */
  played: { format: FormatId; pool: string; title?: string; winner: string | null }[];
  /** Trivia already asked in this room, so the next board is different. */
  seen: string[];
  /** False once the current trivia board has been played, so a rematch gets new questions. */
  freshQuiz: boolean;
  statLink: StatLink | null;
  /** Vowel Play and Say Less: recent guess times per seat name, for the rate limit. Lives and dies with the room. */
  guessAt?: Map<string, number[]>;
  /** Say Less: recent clue times per seat name, kept apart from guesses so one never uses up the other. */
  clueAt?: Map<string, number[]>;
  /** NPAT: recent answer times per seat name, for its own rate limit. */
  answerAt?: Map<string, number[]>;
  /** NPAT dig: the judge phase (game and category) the judge was last asked about, so it is asked once per phase. */
  judgeKey?: string;
  /** NPAT question style: when this room asked the judge, for its own hourly cap (see QUESTION_JUDGE_PER_HOUR). */
  questionJudgeAt?: number[];
  /** NPAT dig: when this room's judge calls started, in the current hour, so one room cannot run up the model bill. */
  judgeAt?: number[];
  /** Dodge: verdicts that came back while the game was paused, applied on resume if the room is still judging that round. */
  dodgeHeld?: { key: string; verdicts: { player: string; same: boolean }[] };
  /** A tournament across games in this room. Stays visible once done, until a new one starts or the room closes. */
  tournament?: Tournament;
  /** Which tournament this is, so a late judge verdict never lands in a later one. */
  tournamentSeq?: number;
  /** Set when the host ends it early: nothing finishing later changes the totals. */
  tournamentEnded?: boolean;
};

const rooms = new Map<string, Room>();

/** Where finished NPAT games count their answers. The server sets the real store at start; tests pass a fake; null records nothing. */
let npatHistory: NpatHistoryStore | null = null;
export function setNpatHistory(h: NpatHistoryStore | null) {
  npatHistory = h;
}

/** What the room asks about dig answers not on the lists: verdicts in input order. The server sets the real one at start. */
export type NpatRoomJudge = { judge(items: { category: string; letter: string; text: string }[]): Promise<{ ok: boolean; niche: number; reason?: string }[]> };
/** Null asks nothing: every unknown waits for the engine's own timeout (accepted unchecked). */
let npatJudge: NpatRoomJudge | null = null;
export function setNpatJudge(j: NpatRoomJudge | null) {
  npatJudge = j;
}

/** What the room asks about Dodge's close calls: one verdict per pair, in input order. The server sets the real one at start. */
export type DodgeRoomJudge = { judge(items: { category: string; a: string; b: string }[]): Promise<{ same: boolean; source?: string }[]> };
/** Null asks nothing: close calls wait for the engine's own timeout and count as dodges. */
let dodgeJudge: DodgeRoomJudge | null = null;
export function setDodgeJudge(j: DodgeRoomJudge | null) {
  dodgeJudge = j;
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, max);
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
/** An integer clamped to lo..hi; anything that is not a number (null, "", text, objects) is `d`. */
const intIn = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const weights = (w: any, keys?: string[]) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(w ?? {}).slice(0, 12)) {
    const key = clean(k, 24);
    if (key && (!keys || keys.includes(key))) out[key] = Math.min(10, Math.max(0, Number(v) || 0));
  }
  return out;
};

/** Validate and clamp a client-supplied setup. Players are filled in when the host starts. */
export function sanitizeSetup(input: any): GameSetup | null {
  if (!input || typeof input !== "object") return null;
  const format = input.format as FormatId;
  if (!FORMAT_IDS.includes(format)) return null;
  if (PARTY_FORMATS.has(format)) return sanitizeParty(format, input);
  const isLoadout = format === "loadout";
  const pool = isLoadout ? "loadout" : clean(input.pool, 30);
  const meta = CATALOG_META.find((m) => m.id === pool);
  if (!isLoadout && (!meta || meta.kind !== "character")) return null;

  const o = input.opts ?? {};
  const keys = meta?.statKeys ?? [];
  const custom: Item[] = (Array.isArray(o.customItems) ? o.customItems : []).slice(0, 10).flatMap((c: any, i: number) => {
    const name = clean(c?.name, 40);
    if (!name || !keys.length) return [];
    const stats = Object.fromEntries(keys.map((k) => [k, num(c?.stats?.[k], 10, 100, 60)]));
    if (Object.values(stats).reduce((a, b) => a + b, 0) > keys.length * 60) return [];
    return [{ id: `custom-${i}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, universe: clean(c?.universe, 24) || "Custom", archetype: "Custom", stats, tags: [], custom: true }];
  });

  let loadout: GameSetup["loadout"] = null;
  if (isLoadout) {
    const m = input.loadout;
    const itemPools = CATALOG_META.filter((x) => x.kind === "item");
    const slots = (Array.isArray(m?.slots) ? m.slots : []).slice(0, 7).flatMap((s: any, i: number) => {
      const pm = itemPools.find((x) => x.id === s?.pool);
      if (!pm) return [];
      const priceStat = pm.statKeys.includes(s?.priceStat) ? s.priceStat : pm.statKeys[0]!;
      return [{ id: clean(s?.id, 24) || `slot-${i}`, label: clean(s?.label, 24) || "Slot", pool: pm.id, priceStat, scoreWeights: weights(s?.scoreWeights, pm.statKeys) }];
    });
    if (slots.length < 2 || new Set(slots.map((s: any) => s.id)).size !== slots.length) return null;
    loadout = {
      id: clean(m?.id, 30) || "custom", title: clean(m?.title, 80) || "Loadout", blurb: clean(m?.blurb, 200),
      budget: num(m?.budget, 8, 80, 30), slots,
      boss: { name: clean(m?.boss?.name, 40) || "The Boss", blurb: clean(m?.boss?.blurb, 120), weaknesses: (Array.isArray(m?.boss?.weaknesses) ? m.boss.weaknesses : []).slice(0, 14).map((w: any) => clean(w, 24)).filter(Boolean) },
    };
  }

  const roles = (Array.isArray(input.roles) ? input.roles : []).slice(0, 8).map((r: any, i: number) => ({ id: clean(r?.id, 24) || `role-${i}`, label: clean(r?.label, 24) || "Role", weights: weights(r?.weights, keys) }));
  if (format === "position" && (roles.length < 2 || new Set(roles.map((r: any) => r.id)).size !== roles.length)) return null;

  const mission = isLoadout && loadout
    ? { id: loadout.id, title: loadout.title, blurb: loadout.blurb, weights: { power: 1 } }
    : { id: clean(input.mission?.id, 40) || "custom", title: clean(input.mission?.title, 80) || "Draft", blurb: clean(input.mission?.blurb, 200), weights: weights(input.mission?.weights, keys) };
  if (!isLoadout && !Object.keys(mission.weights).length) return null;

  const poolSize = getCatalog(pool).length + custom.length;
  const opts = {
    ...DEFAULT_OPTS,
    teamSize: num(o.teamSize, 2, 9, 5),
    order: (o.order === "linear" ? "linear" : "snake") as "linear" | "snake",
    timerSeconds: o.timerSeconds == null ? null : num(o.timerSeconds, 5, 120, 30),
    useRoles: !!o.useRoles, noDupUniverse: !!o.noDupUniverse,
    powerCap: o.powerCap == null ? null : num(o.powerCap, 100, 900, 400),
    bans: (Array.isArray(o.bans) ? o.bans : []).slice(0, 20).map((b: any) => clean(b, 60)),
    universes: (Array.isArray(o.universes) ? o.universes : []).slice(0, 12).map((u: any) => clean(u, 24)),
    customItems: custom,
    roll: !!o.roll, battle: !!o.battle, options: num(o.options, 2, 6, 3), rerolls: num(o.rerolls, 0, 4, 1),
    budget: num(o.budget, 10, 100, 20), lotSeconds: num(o.lotSeconds, 5, 30, 15),
    handExtra: num(o.handExtra, 0, 4, 2), rankSize: num(o.rankSize, 4, 10, 6),
    ...(vetoOn(format, o.veto) ? { veto: vetoCount(o.veto) } : {}),
  };
  if (!isLoadout && poolSize < DRAFT_SEATS * 2) return null;

  return { id: "", format, pool, players: [], aiPlayers: [], mission, mystery: !!input.mystery, loadout, roles: format === "position" ? roles : [], opts, seed: 0 };
}

/** A party game's topics, checked the way its setup checks them: de-duplicated, each a known id, no more than the format has. `null` when not valid. */
function partyPools(format: FormatId, asked: unknown[]): string[] | null {
  // NPAT also takes single categories as `cat:<id>`, mixed in with the sets.
  const valid = format === "npat" ? [...poolIdsFor(format), ...NPAT_CATEGORIES.map((c) => `cat:${c.id}`)] : poolIdsFor(format);
  if (!asked.length || asked.length > Math.max(1, valid.length)) return null;
  const pools = [...new Set(asked.map((p) => clean(p, 30)))];
  return pools.every((p) => valid.includes(p)) ? pools : null;
}

/** A draft's topic, checked the way its setup checks it: a character catalog with enough to draft from. */
const draftPoolOk = (pool: string) => CATALOG_META.some((m) => m.id === pool && m.kind === "character") && getCatalog(pool).length >= DRAFT_SEATS * 2;

/** The allowed value closest to what was asked (ties go to the smaller one), or `d` when nothing usable was asked. */
const nearest = (allowed: number[], asked: unknown, d: number) => {
  const n = asked == null || asked === "" ? NaN : Number(asked);
  return Number.isFinite(n) ? allowed.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)) : d;
};

/** Party games: Imposter needs a character topic, vote games need a card deck, In-Sync a pair deck. Mafia has one fixed pool. */
function sanitizeParty(format: FormatId, input: any): GameSetup | null {
  const o = input.opts ?? {};
  // One id is checked the way it always was; several are each checked that way, de-duplicated, and capped by what the format has.
  const asked: unknown[] = format !== "mafia" && Array.isArray(input.pools) && input.pools.length ? input.pools : [input.pool];
  let pools: string[];
  if (format === "mafia") {
    if (clean(input.pool, 30) !== "mafia") return null;
    pools = ["mafia"];
  } else {
    const ok = partyPools(format, asked);
    if (!ok) return null;
    // NPAT question style plays from the question bank, whatever topics came with it.
    pools = format === "npat" && o.npatStyle === "question" ? [QUESTIONS_POOL] : ok;
  }
  const pool = pools[0]!;
  const teamed = format === "partytrivia" || format === "vowelparty" || format === "vote" || format === "imposter" || format === "pecking" || format === "sayless" || format === "npat"; // the others have no teams
  const teams = teamed ? num(o.teams, 0, 4, 0) : 0;
  const teamMap: Record<string, number> = {};
  if (teams > 0 && o.teamMap && typeof o.teamMap === "object") {
    for (const [k, v] of Object.entries(o.teamMap).slice(0, MAX_SEATS)) {
      const name = clean(k, 20), t = Math.floor(Number(v));
      if (name && Number.isInteger(t) && t >= 0 && t < teams) teamMap[name] = t;
    }
  }
  const mixed = mixTitle(pools.map((p) => poolTitleFor(format, p)));
  const title = format === "vowelplay" ? `Vowel Play: ${mixed}` : format === "vowelparty" ? `Vowel Party: ${mixed}` : format === "mafia" ? "Mafia" : format === "imposter" ? `Imposter: ${mixed}` : format === "insync" ? `In-Sync: ${mixed}` : format === "partytrivia" ? `Party Trivia: ${mixed}` : format === "pecking" ? `Pecking Order: ${mixed}` : format === "sayless" ? `Say Less: ${mixed}` : format === "npat" ? `NPAT: ${mixed}` : format === "dodge" ? `Dodge: ${mixed}` : mixed;
  const vowel = format === "vowelplay" || format === "vowelparty";
  const wanted = o.teamSize == null || o.teamSize === "" ? 15 : Number(o.teamSize);
  const opts = {
    ...DEFAULT_OPTS,
    timerSeconds: null,
    teamSize: format === "pecking" ? nearest([4, 6, 8, 10], o.teamSize, 6) : format === "vowelplay" ? ([10, 15, 20].reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a), 15)) : format === "vowelparty" ? 10 : format === "imposter" ? num(o.teamSize, 1, 3, 2) : format === "partytrivia" ? ([10, 15, 20].reduce((a, b) => (Math.abs(b - Number(o.teamSize)) < Math.abs(a - Number(o.teamSize)) ? b : a))) : num(o.teamSize, 3, 15, 8),
    ending: (o.ending === "vote" ? "vote" : "guess") as "guess" | "vote",
    ...(format === "imposter" ? { imposterGets: (o.imposterGets === "decoy" || o.imposterGets === "nothing" ? o.imposterGets : "hint") as "hint" | "decoy" | "nothing" } : {}),
    avoid: (Array.isArray(o.avoid) ? o.avoid : []).slice(0, 200).map((x: any) => clean(x, 40)),
    drinking: format === "vowelplay" ? false : o.drinking === true,
    showVotes: o.showVotes !== false,
    teams,
    teamMap,
    vowelMode: (format === "vowelplay" && o.vowelMode === "duel" ? "duel" : "first") as "first" | "duel",
    // Buzz mode is in-person: only Party Trivia, Vowel Party and Say Less have it, every other format plays on phones.
    answer: ((format === "partytrivia" || format === "vowelparty" || format === "sayless") && o.answer === "buzz" ? "buzz" : "phones") as "phones" | "buzz",
    ...(format === "sayless" ? { saylessRounds: intIn(o.saylessRounds, 1, 10, 2), saylessWords: intIn(o.saylessWords, 2, 8, 3), saylessSlack: intIn(o.saylessSlack, 0, 15, 5), saylessGuard: o.saylessGuard === true } : {}),
    ...(format === "npat" ? {
      npatRounds: o.npatStyle === "question" ? intIn(o.npatRounds, QUESTION_MIN_ROUNDS, QUESTION_MAX_ROUNDS, QUESTION_DEFAULT_ROUNDS) : intIn(o.npatRounds, 1, 8, 3),
      npatSeconds: [45, 60, 90].includes(o.npatSeconds) ? (o.npatSeconds as number) : 60, npatHard: o.npatHard === true, npatStop: o.npatStop === true,
      ...(o.npatStyle === "dig" || o.npatStyle === "sheet" || o.npatStyle === "question" ? { npatStyle: o.npatStyle as "dig" | "sheet" | "question" } : {}),
    } : {}),
    ...(format === "dodge" ? { dodgeLaps: intIn(o.dodgeLaps, 1, 3, 1) } : {}),
    ...(format === "pecking" ? { peckMode: (o.peckMode === "rank" || o.peckMode === "name" ? o.peckMode : "mixed") as PK.PeckMode } : {}),
    vowelAnswer: (format === "vowelparty" ? (o.answer === "buzz" ? "voice" : "type") : o.vowelAnswer === "type" ? "type" : "voice") as "voice" | "type",
  };
  // A dig plays 5 to 10 categories, and they need a letter in common.
  if (format === "npat" && opts.npatStyle === "dig") {
    const cats = npatPicked(pools);
    if (!digCountOk(cats.length) || !lettersAvailable(cats, false).length) return null;
  }
  return { id: "", format, pool, pools, players: [], aiPlayers: [], mission: { id: "party", title, blurb: "", weights: { fun: 1 } }, mystery: false, loadout: null, roles: [], opts, seed: 0 };
}

const code = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  do c = Array.from(crypto.randomBytes(5), (b) => A[b % A.length]).join("");
  while (rooms.has(c));
  return c;
};

const emit = (r: Room) => getIo()?.to(`playroom:${r.code}`).emit("playroom:update", { version: r.version });
const bump = (r: Room) => {
  r.version++;
  r.touchedAt = Date.now();
  emit(r);
};

function turnMarker(setup: GameSetup, s: GameState): string {
  const t = currentTurn(setup, s) ?? "-";
  const n = (s as { turn?: number }).turn ?? (s as any).draft?.turn ?? (s as any).spin?.draft?.turn ?? 0;
  const x = s as { round?: number; resolved?: number; active?: number | null };
  return `${t}:${n}:${x.round ?? ""}:${x.resolved ?? ""}:${x.active ?? ""}`;
}

export function getRoom(c: string): Room | undefined {
  return rooms.get(String(c).toUpperCase());
}

/** A room can be opened with a game already picked, or empty so the host picks one in the lobby. */
export function createRoom(input: unknown, hostName: string, quiz?: QuizData): { room: Room; seat: Seat } | { error: string } {
  const setup = input == null ? null : sanitizeSetup(input);
  if (input != null && !setup) return { error: "Invalid game setup" };
  const name = clean(hostName, 20);
  if (!name) return { error: "Enter a name" };
  if (rooms.size >= MAX_ROOMS) return { error: "Server is busy, try again soon" };
  const seat: Seat = { name, token: crypto.randomBytes(16).toString("hex"), left: false, lastSeen: Date.now() };
  const room: Room = {
    code: code(), setup: setup && { ...setup, id: `room-${Date.now()}`, players: [name], ...(quiz ? { quiz } : {}) }, seats: [seat], status: "lobby", state: null,
    turnMarker: "", turnStartedAt: 0, verdict: null, version: 1, createdAt: Date.now(), touchedAt: Date.now(), played: [], seen: [], freshQuiz: !!quiz, statLink: null,
  };
  rooms.set(room.code, room);
  trackServer("room_created_server", { format: setup?.format ?? "none", pool: setup?.pool ?? "none" }, room.code);
  return { room, seat };
}

/**
 * The host is the first seat still at the table whose phone we have heard from lately, or failing that the first seat
 * still at the table. Never stored, so it follows anyone who leaves or goes quiet, and returns when they are back.
 */
/** Names of the seats that play: everyone but the screen host. */
const playerNames = (room: Room, includeLeft = true) => room.seats.filter((s) => !s.screen && (includeLeft || !s.left)).map((s) => s.name);

/** The only actions a screen seat may send: the host controls. */
export const HOST_ACTIONS = ["next", "skipTalk"];

const hostSeat = (room: Room, now = Date.now()) => {
  const away = room.status === "lobby" ? HOST_AWAY_LOBBY_MS : HOST_AWAY_MS;
  return room.seats.find((s) => !s.left && now - s.lastSeen <= away) ?? room.seats.find((s) => !s.left);
};

/** A phone with this token is awake. Changes nothing a client watches: no new version, and `touchedAt` is for real changes. */
export function seenSeat(room: Room, token: unknown, now = Date.now()) {
  const seat = seatFor(room, token);
  if (seat) seat.lastSeen = now;
}

export const isHost = (room: Room, token: unknown) => {
  const seat = seatFor(room, token);
  return !!seat && seat === hostSeat(room);
};

/**
 * A screen flag only lives on the seat that hosts: when the crown moves to someone else who is awake while the screen is
 * too, the flag goes and that seat plays from the next game. A screen that went quiet (a TV asleep) keeps its flag, so
 * it wakes as the screen again rather than as a player.
 */
function refreshScreen(room: Room, now = Date.now()) {
  const host = hostSeat(room, now);
  const away = room.status === "lobby" ? HOST_AWAY_LOBBY_MS : HOST_AWAY_MS;
  let changed = false;
  for (const s of room.seats) if (s.screen && s !== host && (s.left || now - s.lastSeen <= away)) { s.screen = false; changed = true; }
  if (changed && room.status !== "playing" && room.setup) room.setup = { ...room.setup, players: playerNames(room) };
  if (changed) bump(room);
}

/** The host switches between playing and running the night from a screen. Lobby only; the flag lives on one seat. */
export function setScreen(room: Room, token: unknown, on: unknown): { ok: true } | { error: string } {
  refreshScreen(room);
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  if (room.status !== "lobby") return { error: "Switch this in the lobby" };
  if (typeof on !== "boolean") return { error: "Invalid choice" };
  const seat = seatFor(room, token)!;
  for (const s of room.seats) s.screen = false;
  if (on) seat.screen = true;
  if (room.setup) room.setup = { ...room.setup, players: playerNames(room) };
  bump(room);
  return { ok: true };
}

/** Back to the lobby: forget the last game's board and drop anyone who left during it. */
function resetToLobby(room: Room) {
  room.status = "lobby";
  room.pausedAt = undefined;
  room.pausedMs = 0;
  room.state = null;
  room.verdict = null;
  room.seats = room.seats.filter((s) => !s.left);
  if (room.setup) room.setup = { ...room.setup, players: playerNames(room) };
}

/** The host picks the next game (any time except mid-game). Trivia boards come in as `quiz`. */
export function setGame(room: Room, token: unknown, input: unknown, quiz?: QuizData): { ok: true } | { error: string } {
  refreshScreen(room);
  if (!isHost(room, token)) return { error: "Only the host can pick the game" };
  if (room.status === "playing") return { error: "Finish this game first" };
  const setup = sanitizeSetup(input);
  if (!setup) return { error: "Invalid game setup" };
  resetToLobby(room);
  room.setup = { ...setup, id: `room-${Date.now()}`, players: playerNames(room), ...(quiz ? { quiz } : {}) };
  room.freshQuiz = !!quiz;
  room.statLink = null;
  bump(room);
  return { ok: true };
}

/**
 * One planned game: a format id (older clients), or `{ format, pools? }` with the topics picked for it.
 * Topics are checked as that game's setup checks them. Mafia and games without topics never take any.
 */
function planSlot(entry: unknown): { format: FormatId; pools: string[] | null } | { error: string } {
  const e = typeof entry === "string" ? { format: entry } : entry;
  if (!e || typeof e !== "object") return { error: "isn't a game" };
  const { format, pools } = e as { format?: unknown; pools?: unknown };
  if (typeof format !== "string" || !FORMAT_IDS.includes(format as FormatId)) return { error: "isn't a game we know" };
  const f = format as FormatId;
  if (pools == null) return { format: f, pools: null };
  if (!Array.isArray(pools)) return { error: "has topics that aren't a list" };
  if (!pools.length) return { error: "needs at least one topic, or none to pick it when it starts" };
  if (f === "mafia" || f === "loadout") return { error: "has no topics to pick" };
  if (PARTY_FORMATS.has(f)) {
    const ok = partyPools(f, pools);
    return ok ? { format: f, pools: ok } : { error: "has a topic that game doesn't have" };
  }
  const ids = [...new Set(pools.map((p) => clean(p, 30)))];
  if (ids.length > 1) return { error: "is a draft, which plays from one topic" };
  return ids.every(draftPoolOk) ? { format: f, pools: ids } : { error: "has a topic that game doesn't have" };
}

/** The host starts a tournament: 2 to 8 games, lobby only. Replaces a finished or earlier one. */
export function startTournament(room: Room, token: unknown, plan: unknown): { ok: true } | { error: string } {
  refreshScreen(room);
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  if (room.status !== "lobby") return { error: "Start a tournament from the lobby" };
  if (!Array.isArray(plan) || plan.length < 2 || plan.length > 8) return { error: "Pick 2 to 8 games" };
  const slots: { format: FormatId; pools: string[] | null }[] = [];
  for (const [i, entry] of plan.entries()) {
    const slot = planSlot(entry);
    if ("error" in slot) return { error: `Game ${i + 1} ${slot.error}` };
    slots.push(slot);
  }
  room.tournament = { plan: slots.map((s) => s.format), topics: slots.map((s) => s.pools), index: 0, games: [], totals: {}, done: false };
  room.tournamentSeq = (room.tournamentSeq ?? 0) + 1;
  room.tournamentEnded = false;
  bump(room);
  return { ok: true };
}

/** The host ends the tournament early: the leaderboard so far is final. */
export function endTournament(room: Room, token: unknown): { ok: true } | { error: string } {
  refreshScreen(room);
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  if (!room.tournament) return { error: "No tournament running" };
  if (room.tournament.done) return { ok: true }; // already over: a draft verdict still pending must still count
  room.tournament = { ...room.tournament, done: true };
  room.tournamentEnded = true;
  bump(room);
  return { ok: true };
}

/** Records a finished game in the tournament and returns a way to credit its draft verdict later. */
function recordTournamentGame(room: Room, awards: Awards | null): number | null {
  const t = room.tournament;
  const setup = room.setup!;
  if (!t || t.done) return null;
  room.tournament = addGame(t, setup.format, setup.mission.title, awards);
  return room.tournament.games.length - 1;
}

/** A draft's verdict arrived: credit it to the game that produced it, unless that tournament was replaced or ended early. */
function creditTournamentGame(room: Room, seq: number | undefined, idx: number, awards: Awards | null) {
  const t = room.tournament;
  if (!t || room.tournamentSeq !== seq || room.tournamentEnded || !t.games[idx] || t.games[idx]!.awards) return;
  const totals = { ...t.totals };
  for (const [p, n] of Object.entries(awards ?? {})) totals[p] = (totals[p] ?? 0) + n;
  const games = t.games.map((g, i) => (i === idx ? { ...g, awards } : g));
  room.tournament = { ...t, games, totals };
  bump(room);
}

/** After a game: everyone returns to the lobby, keeping the room, the seats and the last game picked. */
export function backToLobby(room: Room, token: unknown): { ok: true } | { error: string } {
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  if (room.status !== "done") return { error: "The game is still running" };
  resetToLobby(room);
  bump(room);
  return { ok: true };
}

/** Point the group at an NBA, NFL or Cartoon stat draft room the host opened (null clears it). */
export function setStatLink(room: Room, token: unknown, link: unknown): { ok: true } | { error: string } {
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  const l = link as Partial<StatLink> | null;
  if (l == null) room.statLink = null;
  else {
    const c = clean(l.code, 12).toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(c) || !["NBA", "NFL", "CARTOON"].includes(String(l.league))) return { error: "Invalid room" };
    room.statLink = { code: c, league: l.league as StatLink["league"] };
  }
  bump(room);
  return { ok: true };
}

/** A trivia game whose board was already played needs new questions before it starts again. */
export const needsQuiz = (room: Room) => !!room.setup && (room.setup.format === "jeopardy" || room.setup.format === "feud" || room.setup.format === "partytrivia") && !room.freshQuiz;
/** Trivia already asked in this room (to avoid repeats on the next board). */
export const seenIn = (room: Room) => room.seen;

export function joinRoom(c: string, name: string): { room: Room; seat: Seat } | { error: string } {
  const room = getRoom(c);
  if (!room) return { error: "Room not found" };
  refreshScreen(room);
  if (room.status === "playing") return { error: "A game is running. You can join when it ends." };
  const n = clean(name, 20);
  if (!n) return { error: "Enter a name" };
  // Seats that walked out of the last game go when this join sends the room back to the lobby: their places and names are free.
  const seated = room.seats.filter((s) => !s.left);
  if (seated.filter((s) => !s.screen).length >= seatCap(room.setup?.format)) return { error: `Room is full (${seatCap(room.setup?.format)} players for this game)` };
  if (seated.some((s) => s.name.toLowerCase() === n.toLowerCase())) return { error: "That name is taken" };
  const seat: Seat = { name: n, token: crypto.randomBytes(16).toString("hex"), left: false, lastSeen: Date.now() };
  room.seats.push(seat);
  if (room.status === "done") resetToLobby(room); // a newcomer after a game: everyone heads back to the lobby
  if (room.setup) room.setup.players = playerNames(room);
  bump(room);
  return { room, seat };
}

export const seatFor = (room: Room, token: unknown) => room.seats.find((s) => typeof token === "string" && s.token === token);

/** `quiz` is a new bank for this game. It joins the room only if the game really starts, so a refusal can't send it out with the results. */
export function startRoom(room: Room, token: unknown, quiz?: QuizData): { ok: true } | { error: string } {
  refreshScreen(room);
  if (!isHost(room, token)) return { error: "Only the host can start" };
  if (room.status === "playing") return { error: "Already started" };
  if (!room.setup) return { error: "Pick a game first" };
  // Every refusal comes before the room changes, so a refused Play again leaves the results on screen to show why.
  const here = playerNames(room, false);
  const min = MIN_PLAYERS[room.setup.format] ?? 2;
  if (here.length < min) return { error: `Need at least ${min} players` };
  if (here.length > seatCap(room.setup.format)) return { error: `This game takes up to ${seatCap(room.setup.format)} players` };
  // A seat with this exact name couldn't be told apart from the vote for nobody, so could never be voted out.
  if (room.setup.format === "mafia" && here.includes(MF.SKIP_VOTE)) return { error: `Mafia can't have a player named "${MF.SKIP_VOTE}". Rejoin with another name.` };
  // Same with sip cards on: a card to this seat would read as the call to the whole table.
  if (room.setup.opts.drinking && PARTY_FORMATS.has(room.setup.format) && here.includes(GROUP_CALL)) return { error: `Drinking mode can't have a player named "${GROUP_CALL}". Rejoin with another name.` };
  if (room.setup.format === "vowelplay" && room.setup.opts.vowelMode === "duel" && here.length !== 2) return { error: "Head to head takes exactly 2 players" };
  const setup = { ...room.setup, ...(quiz ? { quiz } : {}), players: here, seed: (Math.random() * 2 ** 31) | 0 };
  // The screen host is no player: it can't sit in a team map, so a stale entry for its name goes.
  if (setup.opts.teamMap) setup.opts = { ...setup.opts, teamMap: Object.fromEntries(Object.entries(setup.opts.teamMap).filter(([n]) => here.includes(n))) };
  if (setup.format === "vote" || setup.format === "insync") setup.opts = { ...setup.opts, avoid: room.seen.slice(-200) }; // new cards on a rematch
  // A rematch prefers names this room has not played yet.
  if (setup.format === "vowelplay" || setup.format === "vowelparty") setup.opts = { ...setup.opts, avoid: room.seen.filter((x) => x.startsWith("vp:")).map((x) => x.slice(3)) };
  if (setup.format === "pecking") setup.opts = { ...setup.opts, avoid: room.seen.filter((x) => x.startsWith("pk:")) };
  if (setup.format === "sayless") setup.opts = { ...setup.opts, avoid: room.seen.filter((x) => x.startsWith("sl:")) }; // the engine skips these words
  if (setup.format === "npat") setup.opts = { ...setup.opts, avoid: room.seen.filter((x) => x.startsWith("np:") || x.startsWith("nq:")) }; // letters and questions already played go last
  if (setup.format === "dodge") setup.opts = { ...setup.opts, avoid: room.seen.filter((x) => x.startsWith("dg:")) }; // categories already played go last
  room.pausedAt = undefined;
  room.pausedMs = 0;
  const state = initGame(setup, Date.now());
  if (isDone(setup, state)) return { error: "No questions are available for this topic right now" }; // nothing to play
  if (room.status === "done") resetToLobby(room);
  room.setup = setup;
  room.state = state;
  room.status = "playing";
  room.freshQuiz = false;
  room.guessAt = undefined;
  room.clueAt = undefined;
  room.answerAt = undefined;
  trackServer("room_started", { format: room.setup.format, pool: room.setup.pool, seats: room.seats.length }, room.code);
  room.turnMarker = turnMarker(room.setup, room.state);
  room.turnStartedAt = gameNow(room);
  bump(room);
  return { ok: true };
}

/**
 * The game's clock: the wall clock minus the time spent paused, standing still while paused. Every engine call and the
 * snapshot's `serverNow` use it, so each timer and countdown picks up after a pause with the time it had left.
 */
export const gameNow = (room: Room, wall = Date.now()): number => (room.pausedAt ?? wall) - (room.pausedMs ?? 0);

/** Leaving between games frees the seat (the next player in line becomes host); mid-game a bot takes over. */
/** Party games close a phase once every seat still present has acted. Only a real leave counts: a locked phone keeps its turn. */
function settleParty(room: Room, s: GameState, now: number): GameState {
  const gone = room.seats.filter((x) => x.left && !x.screen).map((x) => x.name);
  switch (room.setup?.format) {
    case "partytrivia": return PT.settle(s as PT.PTState, gone, now);
    case "mafia": return MF.settle(s as MF.MafiaState, gone, now);
    case "vote": return V.settle(s as V.VoteState, gone, now);
    case "insync": return IS.settle(s as IS.InSyncState, gone, now);
    case "imposter": return IM.settle(s as IM.ImposterState, gone, now);
    case "vowelplay":
    case "vowelparty": return VP.settle(s as VP.VPState, gone, now);
    case "pecking": return PK.settle(s as PK.PeckState, gone, now);
    case "sayless": return SL.settle(s as SL.SLState, gone, now);
    case "dodge": return DG.settle(s as DG.DodgeState, gone, now);
    case "npat": return npatIsDig(room.setup) ? DIG.settle(s as DIG.DigState, gone, now) : NP.settle(s as NP.NPState, gone, now);
    default: return s;
  }
}

export function leaveRoom(room: Room, token: unknown) {
  const seat = seatFor(room, token);
  if (!seat) return;
  refreshScreen(room);
  if (room.status === "playing") {
    seat.left = true;
    if (room.setup && PARTY_FORMATS.has(room.setup.format) && room.state) {
      const settled = settleParty(room, room.state, gameNow(room)); // the others may all have answered already
      if (settled !== room.state && room.seats.some((s) => !s.left)) commit(room, settled);
    }
  } else {
    room.seats = room.seats.filter((s) => s !== seat);
    if (room.setup) room.setup.players = playerNames(room);
  }
  // A screen left alone with a running game has nobody to show it to: close the room as if it were empty.
  if (room.seats.every((s) => s.left || (room.status === "playing" && s.screen))) {
    rooms.delete(room.code);
    getIo()?.to(`playroom:${room.code}`).emit("playroom:update", { version: -1 });
    return;
  }
  bump(room);
}

/** A reveal is the point of these games, so one eager tap can't clear it for the whole table. */
const HOST_MOVES_ON = new Set<FormatId>(["vote", "insync", "partytrivia", "pecking", "npat", "dodge"]);
const PECK_NAME_MAX = 60;
const VOWEL_GUESS_MAX = 60;
const VOWEL_GUESSES_PER_SECOND = 3;
/** Say Less clues: the engine trims a clue to 40 characters, but nothing longer than this reaches it. */
const SAY_CLUE_MAX = 60;
/** NPAT answers save as they are typed, so they come faster than guesses: 10 a second per seat. */
const NPAT_ANSWERS_PER_SECOND = 10;
/** What the describer's phone says when the engine refuses a clue, by the engine's reason. */
const SAY_REFUSED: Record<string, string> = { empty: "Type a clue", spaces: "One word only", contains: "That gives it away", contained: "That gives it away", plural: "That gives it away" };

/** True when this seat already sent `limit` (3 unless said) in the last second; otherwise counts this one. */
function tooFast(log: Map<string, number[]>, name: string, limit = VOWEL_GUESSES_PER_SECOND): boolean {
  const now = Date.now();
  const recent = (log.get(name) ?? []).filter((t) => now - t < 1000);
  if (recent.length >= limit) {
    log.set(name, recent);
    return true;
  }
  log.set(name, [...recent, now]);
  return false;
}
const ACTION_TYPES = new Set(["veto", "buzz", "spoke", "mark", "giveUp", "pick", "reroll", "auto", "bid", "pass", "nominate", "buy", "rollFor", "rerollSlot", "assign", "unassign", "autoAssign", "lock", "place", "choose", "answer", "clue", "accuse", "guess", "vote", "guessVote", "move", "next", "nightAct", "dayVote", "skipTalk", "finish"]);

export function act(room: Room, token: unknown, raw: any): { ok: boolean; error?: string; suggest?: string } {
  const seat = seatFor(room, token);
  if (!seat) return { ok: false, error: "Not in this room" };
  seat.lastSeen = Date.now();
  if (room.status !== "playing" || !room.state || !room.setup) return { ok: false, error: "Game is not running" };
  if (raw && (raw.type === "pause" || raw.type === "resume")) return setPaused(room, token, raw.type === "pause");
  if (room.pausedAt) return { ok: false, error: "The game is paused" };
  if (!raw || !ACTION_TYPES.has(raw.type)) return { ok: false, error: "Unknown action" };
  // Not in the game (the screen host, or a seat that stopped hosting a screen mid-game) means host controls only.
  if (!room.setup.players.includes(seat.name) && !HOST_ACTIONS.includes(raw.type)) return { ok: false, error: "Not allowed right now" };
  if (raw.type === "skipTalk" && !isHost(room, token)) return { ok: false, error: "Only the host can skip the talk" };
  if (raw.type === "next" && (HOST_MOVES_ON.has(room.setup.format) || !room.setup.players.includes(seat.name)) && !isHost(room, token)) return { ok: false, error: "Only the host can move on" };
  // Typed guesses are cheap to flood: about 3 a second per seat, counted whether or not they are right.
  const format = room.setup.format;
  // Imposter: the guess is typed now, so cap its length (spelling help compares it with every name in the topic).
  if (raw.type === "guess" && format === "imposter" && (typeof raw.name !== "string" || raw.name.length > 60)) return { ok: false, error: "That guess is too long" };
  if (raw.type === "guess" && (format === "vowelplay" || format === "vowelparty" || format === "sayless")) {
    if (typeof raw.text !== "string" || raw.text.length > VOWEL_GUESS_MAX) return { ok: false, error: "That guess is too long" };
    if (tooFast((room.guessAt ??= new Map()), seat.name)) return { ok: false, error: "Slow down" };
  }
  // Say Less clues: same limit, on their own log. A refused clue counts too.
  if (raw.type === "clue" && format === "sayless") {
    if (typeof raw.text !== "string") return { ok: false, error: "Type a clue" };
    if (raw.text.length > SAY_CLUE_MAX) return { ok: false, error: "That clue is too long" };
    if (tooFast((room.clueAt ??= new Map()), seat.name)) return { ok: false, error: "Slow down" };
  }
  if (raw.type === "mark" && format === "sayless" && raw.verdict !== "right" && raw.verdict !== "wrong") return { ok: false, error: "Not allowed right now" };
  // Pecking Order: the engine refuses bad answers too, but nothing malformed reaches it.
  if (room.setup.format === "pecking") {
    if (raw.type === "answer" && typeof raw.rank !== "number") return { ok: false, error: "Not allowed right now" };
    if (raw.type === "pick" && typeof raw.name !== "string") return { ok: false, error: "Not allowed right now" };
    if (raw.type === "pick" && raw.name.length > PECK_NAME_MAX) return { ok: false, error: "That name is too long" };
  }
  // NPAT: answers are checked here so the reason reaches the phone, then rate limited. A refused one counts too.
  if (format === "npat" && npatIsDig(room.setup)) {
    if (raw.type === "answer") {
      if (typeof raw.text !== "string") return { ok: false, error: "Type an answer" };
      if (raw.text.length > NPAT_ANSWER_MAX) return { ok: false, error: "That answer is too long" };
      if (tooFast((room.answerAt ??= new Map()), seat.name, NPAT_ANSWERS_PER_SECOND)) return { ok: false, error: "Slow down" };
    }
  } else if (format === "npat") {
    if (raw.type === "answer") {
      const cats = (room.state as NP.NPState).categories.length;
      if (!Number.isInteger(raw.cat) || raw.cat < 0 || raw.cat >= cats) return { ok: false, error: "No such category" };
      if (typeof raw.text !== "string") return { ok: false, error: "Type an answer" };
      if (raw.text.length > NPAT_ANSWER_MAX) return { ok: false, error: "That answer is too long" };
      if (tooFast((room.answerAt ??= new Map()), seat.name, NPAT_ANSWERS_PER_SECOND)) return { ok: false, error: "Slow down" };
    }
    if (raw.type === "vote" && typeof raw.ok !== "boolean") return { ok: false, error: "Vote yes or no" };
  }
  // Dodge: the same checks as a dig's answers, on the same log.
  if (format === "dodge" && raw.type === "answer") {
    if (typeof raw.text !== "string") return { ok: false, error: "Type an answer" };
    if (raw.text.length > DODGE_ANSWER_MAX) return { ok: false, error: "That answer is too long" };
    if (tooFast((room.answerAt ??= new Map()), seat.name, NPAT_ANSWERS_PER_SECOND)) return { ok: false, error: "Slow down" };
  }
  // The seat decides who is acting; clients can't act for someone else, set the clock or pick RNG seeds.
  const { seed: _seed, at: _at, now: _now, ...rest } = raw;
  // The engine only lets players skip Mafia's talk; the screen host is no player, so its skip goes in under the first player's name.
  // A dig's host skip from the screen goes in the same way (the dig's `next` doesn't care who sends it).
  const asFirst = raw.type === "skipTalk" || (raw.type === "next" && (npatIsDig(room.setup) || format === "dodge"));
  const by = asFirst && !room.setup.players.includes(seat.name) ? room.setup.players[0] ?? seat.name : seat.name;
  const action = { ...rest, by } as Action;
  const now = gameNow(room);
  // Spelling help: the engine refuses a near miss at no cost and notes it, and the suggestion goes back in this reply only
  // (Say Less and Vowel Play hide the word from guessers, so it is never in a snapshot).
  const suggest = suggestion(room.setup, room.state, action, now);
  const applied = applyAction(room.setup, room.state, action, now);
  if (applied === room.state) return { ok: false, error: "Not allowed right now" };
  if (suggest) {
    commit(room, settleParty(room, applied, now));
    return { ok: false, error: `Did you mean ${suggest}?`, suggest };
  }
  // Say Less refuses a clue with a new state (its reason, maybe a sip) so the describer's phone can say why: keep it, but it's still a no.
  if (format === "sayless" && raw.type === "clue") {
    const before = room.state as SL.SLState, after = applied as SL.SLState;
    if (after.refused && after.refused.seq !== before.refused?.seq && after.phase === before.phase && after.clues === before.clues) {
      commit(room, settleParty(room, applied, gameNow(room)));
      return { ok: false, error: SAY_REFUSED[after.refused.reason] ?? "Not allowed right now" };
    }
  }
  // Acting again means they are back at the table. Only an action that counted says so: this can change who hosts, and commit's bump tells the room.
  if (seat.left && PARTY_FORMATS.has(room.setup.format)) seat.left = false;
  const next = settleParty(room, applied, gameNow(room));
  commit(room, next);
  return { ok: true };
}

/** The host pauses or resumes a running party game. While paused, the game's clock stands still and nobody can act. */
export function setPaused(room: Room, token: unknown, on: boolean): { ok: boolean; error?: string } {
  if (room.status !== "playing" || !room.state || !room.setup) return { ok: false, error: "Game is not running" };
  if (!PARTY_FORMATS.has(room.setup.format)) return { ok: false, error: "Only party games can pause" };
  if (!isHost(room, token)) return { ok: false, error: "Only the host can pause" };
  const wall = Date.now();
  if (on === !!room.pausedAt) return { ok: true };
  if (on) room.pausedAt = wall;
  else {
    room.pausedMs = (room.pausedMs ?? 0) + (wall - room.pausedAt!);
    room.pausedAt = undefined;
    const held = room.dodgeHeld;
    room.dodgeHeld = undefined;
    if (held) landDodge(room, held.key, held.verdicts);
    askNpatJudge(room); // a verdict dropped while paused is asked for again
  }
  bump(room);
  return { ok: true };
}

function commit(room: Room, next: GameState) {
  const setup = room.setup!;
  room.state = next;
  const marker = turnMarker(setup, next);
  if (marker !== room.turnMarker) {
    room.turnMarker = marker;
    room.turnStartedAt = gameNow(room);
  }
  if (isDone(setup, next)) finish(room);
  else {
    askNpatJudge(room);
    askDodgeJudge(room);
  }
  bump(room);
}

/** Judge calls one room may make per hour. */
const ROOM_JUDGE_PER_HOUR = 60;
/**
 * Question style asks the judge every round (it has no lists to fall back on), so it keeps its own, larger budget:
 * a round is at least reel + answer + verdict (about 26 s), so back-to-back games make at most about 138 calls an hour.
 */
export const QUESTION_JUDGE_PER_HOUR = 150;

const judgeKeyOf = (s: DIG.DigState) => `${s.startedAt}:${s.seed}:${s.cat}`;

/**
 * NPAT dig: the first time a room is in a category's judge phase, ask the judge once about that category's unknown
 * answers. Its verdicts land only if the room is still judging that same category of the same game; anything later is
 * dropped. A judge that never answers is no problem: the engine's tick ends the phase at JUDGE_MS with its fallback.
 */
function askNpatJudge(room: Room) {
  const j = npatJudge;
  if (!j || room.status !== "playing" || !room.setup || !npatIsDig(room.setup)) return;
  const s = room.state as DIG.DigState;
  if (s.phase !== "judge" || s.done) return;
  const key = judgeKeyOf(s);
  if (room.judgeKey === key) return;
  room.judgeKey = key;
  const pending = DIG.pendingUnknowns(s);
  if (!pending.length) return;
  const nowMs = Date.now();
  const question = npatIsQuestion(room.setup);
  const recent = ((question ? room.questionJudgeAt : room.judgeAt) ?? []).filter((t) => nowMs - t < 3_600_000);
  if (question) room.questionJudgeAt = recent;
  else room.judgeAt = recent;
  if (recent.length >= (question ? QUESTION_JUDGE_PER_HOUR : ROOM_JUDGE_PER_HOUR)) return; // over the room's cap: the tick's fallback decides
  recent.push(nowMs);
  let call: Promise<unknown>;
  try {
    call = Promise.resolve(j.judge(pending.map(({ category, letter, text }) => ({ category, letter, text }))));
  } catch (e) {
    console.error("NPAT room judge failed", e);
    return;
  }
  call.then((v) => {
    const cur = room.state as DIG.DigState | null;
    if (rooms.get(room.code) !== room || room.status !== "playing" || !room.setup || !npatIsDig(room.setup) || !cur || cur.phase !== "judge" || judgeKeyOf(cur) !== key) return;
    if (!Array.isArray(v)) return; // a bad shape: the tick's fallback decides
    const verdicts = pending.flatMap((u, i) => {
      const x = v[i] as { ok?: unknown; niche?: unknown; reason?: unknown } | undefined;
      if (!x || typeof x.ok !== "boolean") return [];
      return [{ player: u.player, ok: x.ok, niche: Number(x.niche) || 0, ...(typeof x.reason === "string" ? { reason: x.reason } : {}) }];
    });
    // Paused: drop the verdict but forget the ask, so resuming asks again (the phase's clock stood still meanwhile).
    if (room.pausedAt) { if (room.judgeKey === key) room.judgeKey = undefined; return; }
    const now = gameNow(room);
    const next = DIG.judged(cur, verdicts, now);
    if (next !== cur) commit(room, settleParty(room, next, now));
  }).catch((e) => console.error("NPAT room judge failed", e));
}

const dodgeKeyOf = (s: DG.DodgeState) => `dodge:${s.startedAt}:${s.round}`;

/**
 * Dodge: apply the judge's verdicts (possibly none) to the round `key`, if the room is still judging it, and end the
 * judge phase there and then: nothing more is coming, so anything unchecked stays an exact-match-only call.
 */
function landDodge(room: Room, key: string, verdicts: { player: string; same: boolean }[]) {
  const cur = room.state as DG.DodgeState | null;
  if (rooms.get(room.code) !== room || room.status !== "playing" || room.setup?.format !== "dodge" || !cur || cur.phase !== "judge" || cur.done || dodgeKeyOf(cur) !== key) return;
  if (room.pausedAt) { room.dodgeHeld = { key, verdicts }; return; } // paused: they land on resume
  const now = gameNow(room);
  const judged = DG.judged(cur, verdicts, now);
  const next = judged.phase === "judge" ? DG.next(judged, now) : judged;
  if (next !== cur) commit(room, settleParty(room, next, now));
}

/**
 * Dodge: the first time a room is judging a round's close calls, ask the judge once. Verdicts land only if the room is
 * still judging that same round of the same game. With no judge, over the room's hourly cap, or on a failed call, the
 * phase ends at once and only exact matches count; a judge that never answers is cut off by the engine's tick at JUDGE_MS.
 */
function askDodgeJudge(room: Room) {
  if (room.status !== "playing" || room.setup?.format !== "dodge") return;
  const s = room.state as DG.DodgeState;
  if (s.phase !== "judge" || s.done) return;
  const key = dodgeKeyOf(s);
  if (room.judgeKey === key) return;
  room.judgeKey = key;
  room.dodgeHeld = undefined;
  const pending = DG.pendingPairs(s);
  if (!pending.length) return;
  const j = dodgeJudge;
  const nowMs = Date.now();
  const recent = (room.judgeAt ?? []).filter((t) => nowMs - t < 3_600_000);
  room.judgeAt = recent;
  if (!j || recent.length >= ROOM_JUDGE_PER_HOUR) return landDodge(room, key, []); // no judge, or over the cap
  recent.push(nowMs);
  let call: Promise<unknown>;
  try {
    call = Promise.resolve(j.judge(pending.map((p) => ({ category: p.category, a: p.chosen, b: p.answer }))));
  } catch (e) {
    console.error("Dodge room judge failed", e);
    return landDodge(room, key, []);
  }
  call.then((v) => {
    // A fallback verdict, or a bad shape, means nobody checked: those calls stay pending and the round shows as unchecked.
    const verdicts = Array.isArray(v)
      ? pending.flatMap((p, i) => {
          const x = v[i] as { same?: unknown; source?: unknown } | undefined;
          return x && typeof x.same === "boolean" && x.source !== "fallback" ? [{ player: p.player, same: x.same }] : [];
        })
      : [];
    landDodge(room, key, verdicts);
  }, (e) => {
    console.error("Dodge room judge failed", e);
    landDodge(room, key, []);
  }).catch((e) => console.error("Dodge room judge failed", e));
}

/** The top scorer of a trivia game, or null on a tie. */
function triviaWinner(state: GameState): string | null {
  const ranked = Object.entries((state as { points: Record<string, number> }).points ?? {}).sort((a, b) => b[1] - a[1]);
  return ranked[0] && ranked[0][1] !== ranked[1]?.[1] ? ranked[0][0] : null;
}

function finish(room: Room) {
  const setup = room.setup!;
  room.status = "done";
  if (room.pausedAt) { room.pausedMs = (room.pausedMs ?? 0) + (Date.now() - room.pausedAt); room.pausedAt = undefined; }
  trackServer("room_finished", { format: setup.format, pool: setup.pool, seats: room.seats.length, duration_s: Math.round((Date.now() - room.createdAt) / 1000), left: room.seats.filter((s) => s.left).length }, room.code);
  const { teams } = buildTeams(setup, room.state!);
  const seated = setup.players.filter((n) => room.seats.some((x) => x.name === n && !x.left && !x.screen));
  const record = { format: setup.format, pool: setup.pool, ...((setup.pools?.length ?? 1) > 1 ? { title: setup.mission.title } : {}), winner: null as string | null }; // a mixed game is named by all its topics
  room.played = [...room.played, record].slice(-30);
  // Party games are scored by their own rules; no AI report.
  if (PARTY_FORMATS.has(setup.format)) {
    const teamed = setup.format === "partytrivia" && !!(room.state as PT.PTState).teams; // a team game has no single winner
    record.winner = (setup.format === "insync" && !(room.state as IS.InSyncState).points) || teamed ? null : triviaWinner(room.state!); // co-operative In-Sync (older games): no winner
    if (setup.format === "mafia") {
      const side = (room.state as MF.MafiaState).winner; // a side wins, not a player; a game everyone walked out of has no winner
      record.winner = side === "village" ? "Village" : side === "mafia" ? "Mafia" : null;
    }
    if (setup.format === "vowelplay" || setup.format === "vowelparty") {
      const vs = room.state as VP.VPState;
      const won = VP.winners(vs);
      record.winner = won.length === 1 ? won[0]! : null;
      // Only names that were played: a game that ended early leaves the rest to deal next time.
      room.seen = [...room.seen, ...vs.history.map((h) => `vp:${h.name}`)].slice(-400);
    }
    if (setup.format === "pecking") {
      record.winner = teamsFor(setup, setup.players) ? null : triviaWinner(room.state!); // a team game has no single winner
      room.seen = [...room.seen, ...PK.seenKeys(room.state as PK.PeckState)].slice(-400);
    }
    if (setup.format === "sayless") {
      const ss = room.state as SL.SLState;
      record.winner = ss.teams ? null : triviaWinner(ss); // the engine decides whether teams played; a team game has no single winner
      room.seen = [...room.seen, ...SL.seenKeys(ss)].slice(-400); // only words that were shown
    }
    if (setup.format === "npat" && npatIsDig(setup)) {
      const ds = room.state as DIG.DigState;
      const won = DIG.winners(ds);
      record.winner = !ds.teams && won.length === 1 ? won[0]! : null; // a team game, or a tie, has no single winner
      // Question style has no lists, so its answers feed neither the tiers nor the review queue.
      const question = npatIsQuestion(setup);
      room.seen = [...room.seen, ...(question ? NQ.seenKeys(ds) : DIG.seenKeys(ds))].slice(-400);
      if (!question) recordDigHistory(room, ds);
    } else if (setup.format === "npat") {
      const ns = room.state as NP.NPState;
      const won = NP.winners(ns);
      record.winner = !ns.teams && won.length === 1 ? won[0]! : null; // a team game, or a tie, has no single winner
      room.seen = [...room.seen, ...NP.seenKeys(ns)].slice(-400);
      recordNpatHistory(room, ns);
    }
    if (setup.format === "dodge") {
      const ds = room.state as DG.DodgeState;
      const won = DG.winners(ds);
      record.winner = won.length === 1 ? won[0]! : null;
      room.seen = [...room.seen, ...DG.seenKeys(ds)].slice(-400); // only categories that were played
    }
    recordTournamentGame(room, awardsFor(setup, room.state!, seated));
    if (setup.format === "partytrivia") room.seen = [...room.seen, ...(setup.quiz?.categories ?? []).map((c) => `cat:${c.name}`)].slice(-400);
    if (setup.format === "insync") room.seen = [...room.seen, ...(room.state as IS.InSyncState).pairs.map((q) => q.id)].slice(-400);
    if (setup.format === "vote") room.seen = [...room.seen, ...(room.state as V.VoteState).cards.map((c) => c.id)].slice(-400);
    return;
  }
  // Trivia games show the right answers instead of an AI report.
  if (setup.format === "jeopardy" || setup.format === "feud") {
    record.winner = triviaWinner(room.state!);
    recordTournamentGame(room, awardsFor(setup, room.state!, seated));
    const s = room.state as { cats?: string[]; rounds?: { q: string }[] };
    room.seen = [...room.seen, ...(s.cats ?? []).map((c) => `cat:${c}`), ...(s.rounds ?? []).map((r) => r.q)].slice(-400);
    return;
  }
  const m = setup.mission;
  const state = room.state;
  const seq = room.tournamentSeq;
  const slot = recordTournamentGame(room, null); // credited when the verdict arrives
  judge({ game: setup.format, scenario: { title: m.title, blurb: m.blurb, weights: m.weights }, teams: teams as any })
    .then((v) => {
      record.winner = v?.winner ?? null;
      if (slot !== null) creditTournamentGame(room, seq, slot, awardsFor(setup, state, seated, v));
      if (room.state !== state) return; // the room already moved on to another game
      room.verdict = v;
      bump(room);
    })
    .catch(() => {
      if (slot !== null) creditTournamentGame(room, seq, slot, awardsFor(setup, state, seated));
      room.verdict = null;
    });
}

/**
 * A finished NPAT game counts its answers: each player's list answers by the entry's own name, and accepted unknowns as
 * `review:<category>` rows. The store keeps one count per player, answer and day. A failure is logged and never reaches the room.
 * Seats have no accounts, so a player is known by room and name.
 */
function recordNpatHistory(room: Room, s: NP.NPState) {
  const store = npatHistory;
  if (!store) return;
  const day = new Date().toISOString().slice(0, 10);
  const plays = new Map<string, { category: string; answer: string }[]>(s.players.map((p) => [p, []]));
  for (const r of s.history) for (const p of s.players) (r.answers[p] ?? []).forEach((a, i) => {
    if (a.status === "ok" && a.entry) plays.get(p)!.push({ category: s.categories[i]!, answer: a.entry });
  });
  for (const x of NP.reviewItems(s)) plays.get(x.player)?.push({ category: `review:${x.category}`, answer: x.answer });
  for (const [p, list] of plays) {
    if (!list.length) continue;
    Promise.resolve().then(() => store.record(day, `guest:${room.code}:${p}`, list)).catch((e) => console.error("NPAT history record failed", e));
  }
}

/** A finished dig counts its answers the way the sheet does: list answers by entry name, accepted unknowns as `review:<category>`. */
function recordDigHistory(room: Room, s: DIG.DigState) {
  const store = npatHistory;
  if (!store) return;
  const day = new Date().toISOString().slice(0, 10);
  const plays = new Map<string, { category: string; answer: string }[]>(s.players.map((p) => [p, []]));
  for (const p of s.players) (s.results[p] ?? []).forEach((a, i) => {
    if (a.status === "ok" && a.entry) plays.get(p)!.push({ category: s.categories[i]!, answer: a.entry });
  });
  for (const x of DIG.reviewItems(s)) plays.get(x.player)?.push({ category: `review:${x.category}`, answer: x.answer });
  for (const [p, list] of plays) {
    if (!list.length) continue;
    Promise.resolve().then(() => store.record(day, `guest:${room.code}:${p}`, list)).catch((e) => console.error("NPAT history record failed", e));
  }
}

/** What to do for a seat that left (or timed out) so the game never stalls. */
function autoplay(room: Room, name: string): Action | null {
  const s = room.state!;
  const { format } = room.setup!;
  if (format === "imposter") {
    const x = s as IM.ImposterState;
    if (x.phase === "clue" && IM.turnPlayer(x) === name) return { type: "clue", by: name, text: "" };
    return null; // votes and guesses run out on their own clocks
  }
  if (format === "vote" || format === "insync" || format === "partytrivia" || format === "mafia" || format === "vowelplay" || format === "vowelparty" || format === "pecking" || format === "sayless" || format === "npat" || format === "dodge") return null; // every phase ends on its own clock
  if (format === "auction") {
    const a = s as A.AuctionState;
    if (a.nominate?.offer) return A.nominator(a) === name ? { type: "nominate", by: name, itemId: a.nominate.offer[0]! } : null;
    if (A.slotsLeft(a, name) <= 0 || a.passed[name] || a.bid.by === name) return null;
    if (a.bid.by == null && A.opener(a) !== name) return null;
    return { type: "pass", by: name };
  }
  if (format === "position") {
    const p = s as P.PositionState;
    return p.locked[name] ? null : { type: "autoAssign", by: name };
  }
  if (format === "blind") {
    const b = s as B.BlindState;
    if (B.turnPlayer(b) !== name) return null;
    return { type: "place", by: name, rank: B.freeRanks(b, name)[0]! };
  }
  const setup = room.setup!;
  if (QUICK_FORMATS.has(format)) return currentTurn(setup, s) === name ? autoAction(setup, s) : null;
  return currentTurn(setup, s) === name ? { type: "auto", by: name } : null;
}

/** Called ~2x per second: auction clocks, turn timers, and bots for players who left. */
export function tickRooms(wall = Date.now()) {
  for (const [c, room] of rooms) {
    if (wall - room.touchedAt > ROOM_TTL_MS) {
      rooms.delete(c);
      continue;
    }
    refreshScreen(room, wall);
    if (room.status !== "playing" || !room.state || !room.setup || room.pausedAt) continue;
    const now = gameNow(room, wall);
    let s = room.state;
    const setup = room.setup;

    s = applyAction(setup, s, { type: "tick" }, now);
    s = settleParty(room, s, now);

    const timer = setup.opts.timerSeconds;
    const turnBased = setup.format === "snake" || setup.format === "spin" || setup.format === "loadout";
    const limit = turnBased && timer ? timer * 1000 + 1500 : AFK_TURN_MS;
    if ((turnBased || QUICK_FORMATS.has(setup.format)) && now - room.turnStartedAt > limit) {
      const t = timeoutAction(setup, s) ?? (QUICK_FORMATS.has(setup.format) ? autoplay(room, currentTurn(setup, s) ?? "") : null);
      if (t) {
        s = applyAction(setup, s, t, now);
        if (!QUICK_FORMATS.has(setup.format)) {
          const who = (t as { by: string }).by;
          const seat = room.seats.find((x) => x.name === who);
          if (seat && !timer) seat.left = true; // AFK with no timer: bot takes over
        }
      }
    }
    for (const seat of room.seats.filter((x) => x.left && !x.screen)) {
      const a = autoplay(room, seat.name);
      if (a) {
        s = applyAction(setup, s, a, now);
        if (a.type === "autoAssign") s = applyAction(setup, s, { type: "lock", by: seat.name }, now);
      }
    }
    if (s !== room.state) commit(room, s);
  }
}

let timer: NodeJS.Timeout | null = null;
export function startTicker() {
  if (!timer) timer = setInterval(() => tickRooms(), 500);
}

/** Hide other players' private info until the game is over. */
function redact(room: Room, me: string | null): GameState | null {
  const s = room.state;
  if (!s) return null;
  // Vote games go through their redaction even when done: with Show votes off the final screen must stay secret too.
  if (room.setup?.format === "vote") return V.redactFor(s as V.VoteState, me, room.status === "done");
  if (room.setup?.format === "insync") return IS.redactFor(s as IS.InSyncState, me); // opens up by itself once the game is done
  if (room.setup?.format === "partytrivia") return PT.redactFor(s as PT.PTState, me) as unknown as GameState; // opens up by itself once the game is done
  if (room.setup?.format === "vowelplay" || room.setup?.format === "vowelparty") return VP.redactFor(s as VP.VPState, me) as unknown as GameState; // opens up by itself once the game is done, to the words played
  if (room.setup?.format === "sayless") return SL.redactFor(s as SL.SLState, me) as unknown as GameState; // never the deal or seed; the live word only to its describer
  if (room.setup?.format === "pecking") return PK.redactFor(s as PK.PeckState, me) as unknown as GameState; // never the pool; answers open up once asked
  if (room.setup?.format === "npat" && npatIsDig(room.setup)) return DIG.redactFor(s as DIG.DigState, me) as unknown as GameState; // own typing only while asking; a category's results from its verdict
  if (room.setup?.format === "npat") return NP.redactFor(s as NP.NPState, me) as unknown as GameState; // other players' answers only from their category's reveal
  if (room.setup?.format === "dodge") return DG.redactFor(s as DG.DodgeState, me) as unknown as GameState; // own typing only while answering; no answers until the reveal
  if (room.setup?.format === "mafia") return MF.redactFor(s as MF.MafiaState, me) as unknown as GameState; // same
  if (room.status === "done" || !room.setup) return s;
  if (room.setup.format === "position") {
    const p = s as P.PositionState;
    return { ...p, hands: Object.fromEntries(Object.entries(p.hands).map(([k, v]) => [k, k === me ? v : v.map(() => "?")])), assign: Object.fromEntries(Object.entries(p.assign).map(([k, v]) => [k, k === me ? v : {}])), unused: [], roll: p.roll ? { ...p.roll, pool: [], offers: Object.fromEntries(Object.entries(p.roll.offers).map(([k, v]) => [k, k === me ? v : {}])) } : undefined };
  }
  if (room.setup.format === "imposter") return IM.redactFor(s as IM.ImposterState, me);
  if (room.setup.format === "blind") {
    const b = s as B.BlindState;
    return { ...b, ranks: Object.fromEntries(Object.entries(b.ranks).map(([k, v]) => [k, k === me ? v : v.map((x) => (x == null ? null : "?"))])) };
  }
  return s;
}

/** Sip cards are for people still at the table: drop calls addressed to a seat that left. */
function withoutLeftDrinks(room: Room, state: GameState | null): GameState | null {
  const drinks = state && "drinks" in state ? state.drinks : undefined;
  if (!drinks) return state;
  const left = new Set(room.seats.filter((s) => s.left).map((s) => s.name));
  return { ...state, drinks: { ...drinks, calls: drinks.calls.filter((c) => !left.has(c.to)) } } as GameState;
}

function withoutQuiz(setup: GameSetup): GameSetup {
  if (setup.format !== "partytrivia") return setup;
  const { quiz: _quiz, ...rest } = setup;
  return rest;
}

/** Formats whose setup never sends its seed or avoid list, even when done. */
const keepsAvoid = (f: FormatId) => f === "vowelplay" || f === "vowelparty" || f === "pecking" || f === "sayless" || f === "npat";

export function snapshot(room: Room, token: unknown) {
  const seat = seatFor(room, token);
  const host = hostSeat(room);
  // Anyone who isn't playing (the screen host) sees what a viewer with no seat sees, so no secret reaches them.
  const playing = !!seat && !seat.screen && (room.status === "lobby" || !!room.setup?.players.includes(seat.name));
  return {
    code: room.code,
    status: room.status,
    version: room.version,
    serverNow: gameNow(room),
    paused: !!room.pausedAt,
    // The setup seed rebuilds every shuffle and hidden pick, so a running party game never sends it.
    // Party trivia also carries its question bank (with answers) in setup.quiz, which stays on the server until the game is done.
    // Vowel Play never sends the seed, even when done: with the bundled word lists it rebuilds the names a game ended before playing.
    // Vowel Play's avoid list holds names this room already played, and a rematch deals from it once a topic runs short, so it never leaves the server.
    // Pecking Order is the same: its avoid list holds items this room already asked, which a rematch falls back on.
    // Say Less too: with the bundled decks the seed rebuilds the words a game ended before playing.
    setup: room.setup && PARTY_FORMATS.has(room.setup.format) && (room.status !== "done" || keepsAvoid(room.setup.format))
      ? withoutQuiz({ ...room.setup, seed: 0, ...(keepsAvoid(room.setup.format) ? { opts: { ...room.setup.opts, avoid: [] } } : {}) })
      : room.setup,
    seats: room.seats.map((s) => ({ name: s.name, host: s === host, left: s.left, screen: !!s.screen })),
    screen: !!seat?.screen,
    me: seat?.name ?? null,
    state: withoutLeftDrinks(room, redact(room, playing ? seat!.name : null)),
    verdict: room.status === "done" ? room.verdict : null,
    played: room.played,
    statLink: room.statLink,
    tournament: room.tournament && { ...room.tournament, standings: standings(room.tournament, playerNames(room, false)).filter((r) => !room.seats.some((x) => x.screen && x.name === r.name)) },
  };
}

export const _rooms = rooms; // tests
