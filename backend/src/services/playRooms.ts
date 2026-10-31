// Online rooms for the TopPic draft formats. Rooms live in memory (no database writes, no accounts):
// players join with a room code and get a private seat token. The server owns the game state and
// runs the exact same engines as the browser (backend/src/shared is generated from the web app).
import crypto from "crypto";
import { getIo } from "../socket";
import { trackServer } from "../lib/monitoring";
import { judge, type Verdict } from "./judge.service";
import type { QuizData } from "../shared/topicDraft/trivia/types";
import { applyAction, autoAction, buildTeams, currentTurn, initGame, isDone, QUICK_FORMATS, timeoutAction, type Action, type GameState } from "../shared/topicDraft/core";
import { CATALOG_META, getCatalog } from "../shared/topicDraft/catalogs";
import type { GameSetup, FormatId } from "../shared/play/types";
import { DEFAULT_OPTS } from "../shared/play/types";
import * as A from "../shared/topicDraft/formats/auction";
import * as B from "../shared/topicDraft/formats/blind";
import * as P from "../shared/topicDraft/formats/position";
import type { Item } from "../shared/topicDraft/types";

export const FORMAT_IDS: FormatId[] = ["snake", "spin", "auction", "loadout", "position", "blind", "keep", "feud", "jeopardy"];
const MAX_SEATS = 6;
const MAX_ROOMS = 500;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const AFK_TURN_MS = 120_000;

type Seat = { name: string; token: string; left: boolean };
type Room = {
  code: string;
  setup: GameSetup;
  seats: Seat[];
  status: "lobby" | "playing" | "done";
  state: GameState | null;
  turnMarker: string;
  turnStartedAt: number;
  verdict: Verdict | null;
  version: number;
  createdAt: number;
  touchedAt: number;
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
  if (!isLoadout && poolSize < MAX_SEATS * 2) return null;

  return { id: "", format, pool, players: [], aiPlayers: [], mission, mystery: !!input.mystery, loadout, roles: format === "position" ? roles : [], opts, seed: 0 };
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

export function createRoom(input: unknown, hostName: string, quiz?: QuizData): { room: Room; seat: Seat } | { error: string } {
  const setup = sanitizeSetup(input);
  if (!setup) return { error: "Invalid game setup" };
  const name = clean(hostName, 20);
  if (!name) return { error: "Enter a name" };
  if (rooms.size >= MAX_ROOMS) return { error: "Server is busy, try again soon" };
  const seat: Seat = { name, token: crypto.randomBytes(16).toString("hex"), left: false };
  const room: Room = { code: code(), setup: { ...setup, id: `room-${Date.now()}`, players: [name], ...(quiz ? { quiz } : {}) }, seats: [seat], status: "lobby", state: null, turnMarker: "", turnStartedAt: 0, verdict: null, version: 1, createdAt: Date.now(), touchedAt: Date.now() };
  rooms.set(room.code, room);
  trackServer("room_created_server", { format: setup.format, pool: setup.pool }, room.code);
  return { room, seat };
}

export function joinRoom(c: string, name: string): { room: Room; seat: Seat } | { error: string } {
  const room = getRoom(c);
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "That game already started" };
  const n = clean(name, 20);
  if (!n) return { error: "Enter a name" };
  if (room.seats.length >= MAX_SEATS) return { error: "Room is full" };
  if (room.seats.some((s) => s.name.toLowerCase() === n.toLowerCase())) return { error: "That name is taken" };
  const seat: Seat = { name: n, token: crypto.randomBytes(16).toString("hex"), left: false };
  room.seats.push(seat);
  room.setup.players = room.seats.map((s) => s.name);
  bump(room);
  return { room, seat };
}

export const seatFor = (room: Room, token: unknown) => room.seats.find((s) => typeof token === "string" && s.token === token);

export function startRoom(room: Room, token: unknown): { ok: true } | { error: string } {
  const seat = seatFor(room, token);
  if (!seat || seat !== room.seats[0]) return { error: "Only the host can start" };
  if (room.status !== "lobby") return { error: "Already started" };
  if (room.seats.length < 2) return { error: "Need at least 2 players" };
  room.setup = { ...room.setup, players: room.seats.map((s) => s.name), seed: (Math.random() * 2 ** 31) | 0 };
  room.state = initGame(room.setup, Date.now());
  room.status = "playing";
  trackServer("room_started", { format: room.setup.format, pool: room.setup.pool, seats: room.seats.length }, room.code);
  room.turnMarker = turnMarker(room.setup, room.state);
  room.turnStartedAt = Date.now();
  bump(room);
  return { ok: true };
}

export function leaveRoom(room: Room, token: unknown) {
  const seat = seatFor(room, token);
  if (!seat) return;
  if (room.status === "lobby") {
    if (seat === room.seats[0]) {
      rooms.delete(room.code);
      getIo()?.to(`playroom:${room.code}`).emit("playroom:update", { version: -1 });
      return;
    }
    room.seats = room.seats.filter((s) => s !== seat);
    room.setup.players = room.seats.map((s) => s.name);
  } else seat.left = true;
  bump(room);
}

const ACTION_TYPES = new Set(["pick", "reroll", "auto", "bid", "pass", "nominate", "buy", "rollFor", "rerollSlot", "assign", "unassign", "autoAssign", "lock", "place", "choose", "answer"]);

export function act(room: Room, token: unknown, raw: any): { ok: boolean; error?: string } {
  const seat = seatFor(room, token);
  if (!seat) return { ok: false, error: "Not in this room" };
  if (room.status !== "playing" || !room.state) return { ok: false, error: "Game is not running" };
  if (!raw || !ACTION_TYPES.has(raw.type)) return { ok: false, error: "Unknown action" };
  // The seat decides who is acting; clients can't act for someone else, set the clock or pick RNG seeds.
  const { seed: _seed, ...rest } = raw;
  const action = { ...rest, by: seat.name } as Action;
  const next = applyAction(room.setup, room.state, action, Date.now());
  if (next === room.state) return { ok: false, error: "Not allowed right now" };
  commit(room, next);
  return { ok: true };
}

function commit(room: Room, next: GameState) {
  room.state = next;
  const marker = turnMarker(room.setup, next);
  if (marker !== room.turnMarker) {
    room.turnMarker = marker;
    room.turnStartedAt = Date.now();
  }
  if (isDone(room.setup, next)) finish(room);
  bump(room);
}

function finish(room: Room) {
  room.status = "done";
  trackServer("room_finished", { format: room.setup.format, pool: room.setup.pool, seats: room.seats.length, duration_s: Math.round((Date.now() - room.createdAt) / 1000), left: room.seats.filter((s) => s.left).length }, room.code);
  const { teams } = buildTeams(room.setup, room.state!);
  const m = room.setup.mission;
  judge({ game: room.setup.format, scenario: { title: m.title, blurb: m.blurb, weights: m.weights }, teams: teams as any })
    .then((v) => {
      room.verdict = v;
      bump(room);
    })
    .catch(() => {
      room.verdict = null;
    });
}

/** What to do for a seat that left (or timed out) so the game never stalls. */
function autoplay(room: Room, name: string): Action | null {
  const s = room.state!;
  const { format } = room.setup;
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
  if (QUICK_FORMATS.has(format)) return currentTurn(room.setup, s) === name ? autoAction(room.setup, s) : null;
  return currentTurn(room.setup, s) === name ? { type: "auto", by: name } : null;
}

/** Called ~2x per second: auction clocks, turn timers, and bots for players who left. */
export function tickRooms(now = Date.now()) {
  for (const [c, room] of rooms) {
    if (now - room.touchedAt > ROOM_TTL_MS) {
      rooms.delete(c);
      continue;
    }
    if (room.status !== "playing" || !room.state) continue;
    let s = room.state;
    const setup = room.setup;

    s = applyAction(setup, s, { type: "tick" }, now);

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
    for (const seat of room.seats.filter((x) => x.left)) {
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
  if (room.status === "done") return s;
  if (room.setup.format === "position") {
    const p = s as P.PositionState;
    return { ...p, hands: Object.fromEntries(Object.entries(p.hands).map(([k, v]) => [k, k === me ? v : v.map(() => "?")])), assign: Object.fromEntries(Object.entries(p.assign).map(([k, v]) => [k, k === me ? v : {}])), unused: [], roll: p.roll ? { ...p.roll, pool: [], offers: Object.fromEntries(Object.entries(p.roll.offers).map(([k, v]) => [k, k === me ? v : {}])) } : undefined };
  }
  if (room.setup.format === "blind") {
    const b = s as B.BlindState;
    return { ...b, ranks: Object.fromEntries(Object.entries(b.ranks).map(([k, v]) => [k, k === me ? v : v.map((x) => (x == null ? null : "?"))])) };
  }
  return s;
}

export function snapshot(room: Room, token: unknown) {
  const seat = seatFor(room, token);
  return {
    code: room.code,
    status: room.status,
    version: room.version,
    serverNow: Date.now(),
    setup: room.setup,
    seats: room.seats.map((s, i) => ({ name: s.name, host: i === 0, left: s.left })),
    me: seat?.name ?? null,
    state: redact(room, seat?.name ?? null),
    verdict: room.status === "done" ? room.verdict : null,
  };
}

export const _rooms = rooms; // tests
