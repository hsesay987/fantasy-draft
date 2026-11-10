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
import { applyAction, autoAction, buildTeams, currentTurn, initGame, isDone, QUICK_FORMATS, timeoutAction, type Action, type GameState } from "../shared/topicDraft/core";
import { CATALOG_META, getCatalog } from "../shared/topicDraft/catalogs";
import type { GameSetup, FormatId } from "../shared/play/types";
import { DEFAULT_OPTS, PARTY_FORMATS } from "../shared/play/types";
import * as A from "../shared/topicDraft/formats/auction";
import * as B from "../shared/topicDraft/formats/blind";
import * as P from "../shared/topicDraft/formats/position";
import * as IM from "../shared/topicDraft/formats/imposter";
import * as V from "../shared/topicDraft/formats/vote";
import * as IS from "../shared/topicDraft/formats/insync";
import * as PT from "../shared/topicDraft/formats/partytrivia";
import * as MF from "../shared/topicDraft/formats/mafia";
import * as VP from "../shared/topicDraft/formats/vowelplay";
import "../shared/topicDraft/party/vowelWords"; // loads the word list the Vowel Play engine deals from
import { VOWEL_TOPICS } from "../shared/topicDraft/party/vowelTopics";
import { TRIVIA_POOLS } from "../shared/topicDraft/trivia";
import { deckOf } from "../shared/topicDraft/party/decks";
import { insyncDeckOf } from "../shared/topicDraft/party/insyncDecks";
import { mixTitle, poolIdsFor, poolTitleFor } from "../shared/topicDraft/party/pools";
import { addGame, awardsFor, standings, type Awards, type Tournament } from "../shared/topicDraft/party/tournament";
import { GROUP_CALL } from "../shared/topicDraft/party/drinks";
import type { Item } from "../shared/topicDraft/types";

export const FORMAT_IDS: FormatId[] = ["snake", "spin", "auction", "loadout", "position", "blind", "keep", "feud", "jeopardy", "imposter", "vote", "insync", "partytrivia", "mafia", "vowelplay", "vowelparty"];
/** Party games take a bigger group; drafts and trivia stay at six. */
const MAX_SEATS = 12;
const DRAFT_SEATS = 6;
/** Fewest players each game starts with; anything not listed needs 2. */
export const MIN_PLAYERS: Partial<Record<FormatId, number>> = { imposter: 3, vote: 3, mafia: MF.MIN_PLAYERS };
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
  /** Vowel Play: recent guess times per seat name, for the rate limit. Lives and dies with the room. */
  guessAt?: Map<string, number[]>;
  /** A tournament across games in this room. Stays visible once done, until a new one starts or the room closes. */
  tournament?: Tournament;
  /** Which tournament this is, so a late judge verdict never lands in a later one. */
  tournamentSeq?: number;
  /** Set when the host ends it early: nothing finishing later changes the totals. */
  tournamentEnded?: boolean;
};

const rooms = new Map<string, Room>();

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, max);
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
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
  };
  if (!isLoadout && poolSize < DRAFT_SEATS * 2) return null;

  return { id: "", format, pool, players: [], aiPlayers: [], mission, mystery: !!input.mystery, loadout, roles: format === "position" ? roles : [], opts, seed: 0 };
}

/** Party games: Imposter needs a character topic, vote games need a card deck, In-Sync a pair deck. Mafia has one fixed pool. */
function sanitizeParty(format: FormatId, input: any): GameSetup | null {
  const o = input.opts ?? {};
  const valid = poolIdsFor(format);
  // One id is checked the way it always was; several are each checked that way, de-duplicated, and capped by what the format has.
  const asked: unknown[] = format !== "mafia" && Array.isArray(input.pools) && input.pools.length ? input.pools : [input.pool];
  if (asked.length > Math.max(1, valid.length)) return null;
  const pools = [...new Set(asked.map((p) => clean(p, 30)))];
  if (format === "mafia") {
    if (clean(input.pool, 30) !== "mafia") return null;
    pools.splice(0, pools.length, "mafia");
  } else if (pools.some((p) => !valid.includes(p))) return null;
  const pool = pools[0]!;
  const teamed = format === "partytrivia" || format === "vowelparty" || format === "vote" || format === "imposter"; // the others have no teams
  const teams = teamed ? num(o.teams, 0, 4, 0) : 0;
  const teamMap: Record<string, number> = {};
  if (teams > 0 && o.teamMap && typeof o.teamMap === "object") {
    for (const [k, v] of Object.entries(o.teamMap).slice(0, MAX_SEATS)) {
      const name = clean(k, 20), t = Math.floor(Number(v));
      if (name && Number.isInteger(t) && t >= 0 && t < teams) teamMap[name] = t;
    }
  }
  const mixed = mixTitle(pools.map((p) => poolTitleFor(format, p)));
  const title = format === "vowelplay" ? `Vowel Play: ${mixed}` : format === "vowelparty" ? `Vowel Party: ${mixed}` : format === "mafia" ? "Mafia" : format === "imposter" ? `Imposter: ${mixed}` : format === "insync" ? `In-Sync: ${mixed}` : format === "partytrivia" ? `Party Trivia: ${mixed}` : mixed;
  const vowel = format === "vowelplay" || format === "vowelparty";
  const wanted = o.teamSize == null || o.teamSize === "" ? 15 : Number(o.teamSize);
  const opts = {
    ...DEFAULT_OPTS,
    timerSeconds: null,
    teamSize: format === "vowelplay" ? ([10, 15, 20].reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a), 15)) : format === "vowelparty" ? 10 : format === "imposter" ? num(o.teamSize, 1, 3, 2) : format === "partytrivia" ? ([10, 15, 20].reduce((a, b) => (Math.abs(b - Number(o.teamSize)) < Math.abs(a - Number(o.teamSize)) ? b : a))) : num(o.teamSize, 3, 15, 8),
    ending: (o.ending === "vote" ? "vote" : "guess") as "guess" | "vote",
    avoid: (Array.isArray(o.avoid) ? o.avoid : []).slice(0, 200).map((x: any) => clean(x, 40)),
    drinking: format === "vowelplay" ? false : o.drinking === true,
    showVotes: o.showVotes !== false,
    teams,
    teamMap,
    vowelMode: (format === "vowelplay" && o.vowelMode === "duel" ? "duel" : "first") as "first" | "duel",
    vowelAnswer: (format === "vowelparty" || o.vowelAnswer === "type" ? "type" : "voice") as "voice" | "type",
  };
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

/** The host starts a tournament: 2 to 8 games, lobby only. Replaces a finished or earlier one. */
export function startTournament(room: Room, token: unknown, plan: unknown): { ok: true } | { error: string } {
  refreshScreen(room);
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  if (room.status !== "lobby") return { error: "Start a tournament from the lobby" };
  if (!Array.isArray(plan) || plan.length < 2 || plan.length > 8 || !plan.every((f) => typeof f === "string" && FORMAT_IDS.includes(f as FormatId))) return { error: "Pick 2 to 8 games" };
  room.tournament = { plan: plan as FormatId[], index: 0, games: [], totals: {}, done: false };
  room.tournamentSeq = (room.tournamentSeq ?? 0) + 1;
  room.tournamentEnded = false;
  bump(room);
  return { ok: true };
}

/** The host ends the tournament early: the leaderboard so far is final. */
export function endTournament(room: Room, token: unknown): { ok: true } | { error: string } {
  if (!isHost(room, token)) return { error: "Only the host can do that" };
  if (!room.tournament) return { error: "No tournament running" };
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
  const state = initGame(setup, Date.now());
  if (isDone(setup, state)) return { error: "No questions are available for this topic right now" }; // nothing to play
  if (room.status === "done") resetToLobby(room);
  room.setup = setup;
  room.state = state;
  room.status = "playing";
  room.freshQuiz = false;
  room.guessAt = undefined;
  trackServer("room_started", { format: room.setup.format, pool: room.setup.pool, seats: room.seats.length }, room.code);
  room.turnMarker = turnMarker(room.setup, room.state);
  room.turnStartedAt = Date.now();
  bump(room);
  return { ok: true };
}

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
      const settled = settleParty(room, room.state, Date.now()); // the others may all have answered already
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
const HOST_MOVES_ON = new Set<FormatId>(["vote", "insync", "partytrivia"]);
const VOWEL_GUESS_MAX = 60;
const VOWEL_GUESSES_PER_SECOND = 3;
const ACTION_TYPES = new Set(["buzz", "spoke", "mark", "giveUp", "pick", "reroll", "auto", "bid", "pass", "nominate", "buy", "rollFor", "rerollSlot", "assign", "unassign", "autoAssign", "lock", "place", "choose", "answer", "clue", "accuse", "guess", "vote", "guessVote", "move", "next", "nightAct", "dayVote", "skipTalk"]);

export function act(room: Room, token: unknown, raw: any): { ok: boolean; error?: string } {
  const seat = seatFor(room, token);
  if (!seat) return { ok: false, error: "Not in this room" };
  seat.lastSeen = Date.now();
  if (room.status !== "playing" || !room.state || !room.setup) return { ok: false, error: "Game is not running" };
  if (!raw || !ACTION_TYPES.has(raw.type)) return { ok: false, error: "Unknown action" };
  // Not in the game (the screen host, or a seat that stopped hosting a screen mid-game) means host controls only.
  if (!room.setup.players.includes(seat.name) && !HOST_ACTIONS.includes(raw.type)) return { ok: false, error: "Not allowed right now" };
  if (raw.type === "skipTalk" && !isHost(room, token)) return { ok: false, error: "Only the host can skip the talk" };
  if (raw.type === "next" && (HOST_MOVES_ON.has(room.setup.format) || !room.setup.players.includes(seat.name)) && !isHost(room, token)) return { ok: false, error: "Only the host can move on" };
  // Typed guesses are cheap to flood: about 3 a second per seat, counted whether or not they are right.
  if (raw.type === "guess" && (room.setup.format === "vowelplay" || room.setup.format === "vowelparty")) {
    if (typeof raw.text !== "string" || raw.text.length > VOWEL_GUESS_MAX) return { ok: false, error: "That guess is too long" };
    const log = (room.guessAt ??= new Map());
    const now = Date.now();
    const recent = (log.get(seat.name) ?? []).filter((t) => now - t < 1000);
    if (recent.length >= VOWEL_GUESSES_PER_SECOND) {
      log.set(seat.name, recent);
      return { ok: false, error: "Slow down" };
    }
    log.set(seat.name, [...recent, now]);
  }
  // The seat decides who is acting; clients can't act for someone else, set the clock or pick RNG seeds.
  const { seed: _seed, at: _at, now: _now, ...rest } = raw;
  // The engine only lets players skip Mafia's talk; the screen host is no player, so its skip goes in under the first player's name.
  const by = raw.type === "skipTalk" && !room.setup.players.includes(seat.name) ? room.setup.players[0] ?? seat.name : seat.name;
  const action = { ...rest, by } as Action;
  const applied = applyAction(room.setup, room.state, action, Date.now());
  if (applied === room.state) return { ok: false, error: "Not allowed right now" };
  // Acting again means they are back at the table. Only an action that counted says so: this can change who hosts, and commit's bump tells the room.
  if (seat.left && PARTY_FORMATS.has(room.setup.format)) seat.left = false;
  const next = settleParty(room, applied, Date.now());
  commit(room, next);
  return { ok: true };
}

function commit(room: Room, next: GameState) {
  const setup = room.setup!;
  room.state = next;
  const marker = turnMarker(setup, next);
  if (marker !== room.turnMarker) {
    room.turnMarker = marker;
    room.turnStartedAt = Date.now();
  }
  if (isDone(setup, next)) finish(room);
  bump(room);
}

/** The top scorer of a trivia game, or null on a tie. */
function triviaWinner(state: GameState): string | null {
  const ranked = Object.entries((state as { points: Record<string, number> }).points ?? {}).sort((a, b) => b[1] - a[1]);
  return ranked[0] && ranked[0][1] !== ranked[1]?.[1] ? ranked[0][0] : null;
}

function finish(room: Room) {
  const setup = room.setup!;
  room.status = "done";
  trackServer("room_finished", { format: setup.format, pool: setup.pool, seats: room.seats.length, duration_s: Math.round((Date.now() - room.createdAt) / 1000), left: room.seats.filter((s) => s.left).length }, room.code);
  const { teams } = buildTeams(setup, room.state!);
  const seated = setup.players.filter((n) => room.seats.some((x) => x.name === n && !x.left && !x.screen));
  const record = { format: setup.format, pool: setup.pool, ...((setup.pools?.length ?? 1) > 1 ? { title: setup.mission.title } : {}), winner: null as string | null }; // a mixed game is named by all its topics
  room.played = [...room.played, record].slice(-30);
  // Party games are scored by their own rules; no AI report.
  if (PARTY_FORMATS.has(setup.format)) {
    const teamed = setup.format === "partytrivia" && !!(room.state as PT.PTState).teams; // a team game has no single winner
    record.winner = setup.format === "insync" || teamed ? null : triviaWinner(room.state!); // In-Sync is co-operative: no winner
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

/** What to do for a seat that left (or timed out) so the game never stalls. */
function autoplay(room: Room, name: string): Action | null {
  const s = room.state!;
  const { format } = room.setup!;
  if (format === "imposter") {
    const x = s as IM.ImposterState;
    if (x.phase === "clue" && IM.turnPlayer(x) === name) return { type: "clue", by: name, text: "" };
    return null; // votes and guesses run out on their own clocks
  }
  if (format === "vote" || format === "insync" || format === "partytrivia" || format === "mafia" || format === "vowelplay" || format === "vowelparty") return null; // every phase ends on its own clock
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
export function tickRooms(now = Date.now()) {
  for (const [c, room] of rooms) {
    if (now - room.touchedAt > ROOM_TTL_MS) {
      rooms.delete(c);
      continue;
    }
    refreshScreen(room, now);
    if (room.status !== "playing" || !room.state || !room.setup) continue;
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

export function snapshot(room: Room, token: unknown) {
  const seat = seatFor(room, token);
  const host = hostSeat(room);
  // Anyone who isn't playing (the screen host) sees what a viewer with no seat sees, so no secret reaches them.
  const playing = !!seat && !seat.screen && (room.status === "lobby" || !!room.setup?.players.includes(seat.name));
  return {
    code: room.code,
    status: room.status,
    version: room.version,
    serverNow: Date.now(),
    // The setup seed rebuilds every shuffle and hidden pick, so a running party game never sends it.
    // Party trivia also carries its question bank (with answers) in setup.quiz, which stays on the server until the game is done.
    // Vowel Play never sends the seed, even when done: with the bundled word lists it rebuilds the names a game ended before playing.
    setup: room.setup && PARTY_FORMATS.has(room.setup.format) && (room.status !== "done" || room.setup.format === "vowelplay" || room.setup.format === "vowelparty") ? withoutQuiz({ ...room.setup, seed: 0 }) : room.setup,
    seats: room.seats.map((s) => ({ name: s.name, host: s === host, left: s.left, screen: !!s.screen })),
    screen: !!seat?.screen,
    me: seat?.name ?? null,
    state: withoutLeftDrinks(room, redact(room, playing ? seat!.name : null)),
    verdict: room.status === "done" ? room.verdict : null,
    played: room.played,
    statLink: room.statLink,
    tournament: room.tournament && { ...room.tournament, standings: standings(room.tournament, playerNames(room, false)) },
  };
}

export const _rooms = rooms; // tests
