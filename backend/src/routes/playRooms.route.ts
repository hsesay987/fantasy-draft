import { getFeud, getJeopardy, isTriviaPool } from "../services/trivia.service";
import { moderate, userText } from "../lib/moderation";
import { Router } from "express";
import { newSeed, shuffle } from "../shared/topicDraft/rng";
import { poolsOf } from "../shared/play/types";
import { normalizeClue } from "../shared/topicDraft/party/clueText";
import { sanitizeSetup, act, backToLobby, createRoom, getRoom, isHost, joinRoom, leaveRoom, needsQuiz, seatFor, seenIn, seenSeat, setGame, setScreen, setStatLink, snapshot, startRoom, startTournament, endTournament } from "../services/playRooms";

const router = Router();

// Light per-IP rate limit on room creation.
const created = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now();
  const recent = (created.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return true;
  recent.push(now);
  created.set(ip, recent);
  return false;
};

const partyQuestions = (setup: any) => [10, 15, 20].reduce((a, b) => (Math.abs(b - Number(setup?.opts?.teamSize)) < Math.abs(a - Number(setup?.opts?.teamSize)) ? b : a));

/** Splits `total` as evenly as it can over `n` pools, the first ones getting the extra: 5 over 2 is 3 and 2. */
const split = (total: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));

/** Jeopardy, Feud and party trivia rooms get their questions from the server's trivia bank so every seat sees the same board. */
export async function quizFor(setup: any, seen: string[] = [], seed: number = newSeed()) {
  const fmt = setup?.format, pool = setup?.pool;
  if ((fmt !== "jeopardy" && fmt !== "feud" && fmt !== "partytrivia") || !isTriviaPool(pool)) return undefined;
  try {
    const mine = Array.isArray(setup?.opts?.avoid) ? setup.opts.avoid.filter((x: unknown) => typeof x === "string") : [];
    const avoid = [...seen, ...mine].slice(-400);
    // Party trivia takes four questions per category, plus one spare category, for 10, 15 or 20 questions.
    if (fmt === "partytrivia") {
      const want = Math.ceil(partyQuestions(setup) / 4) + 1;
      const pools = poolsOf(setup).filter((p) => isTriviaPool(p));
      if (pools.length <= 1) return { categories: await getJeopardy(pool, avoid, undefined, undefined, undefined, want) };
      // Several topics: each gives its share, then a topic that failed is made up from the ones that did not.
      const shares = split(want, pools.length);
      const got = await Promise.allSettled(pools.map((p, i) => getJeopardy(p, avoid, undefined, undefined, undefined, shares[i]!)));
      const cats = got.flatMap((g) => (g.status === "fulfilled" ? g.value : [])).filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i);
      const alive = pools.filter((_, i) => got[i]!.status === "fulfilled");
      if (!alive.length) return undefined;
      for (let i = 0; cats.length < want && i < alive.length * 2; i++) {
        const more = await getJeopardy(alive[i % alive.length]!, [...avoid, ...cats.map((c) => `cat:${c.name}`)], undefined, undefined, undefined, want - cats.length).catch(() => []);
        cats.push(...more.filter((c) => !cats.some((x) => x.name === c.name)));
      }
      return { categories: shuffle(cats.slice(0, want), seed)[0] };
    }
    return fmt === "jeopardy" ? { categories: await getJeopardy(pool, avoid) } : { surveys: await getFeud(pool, 5, avoid) };
  } catch {
    return undefined; // falls back to the bundled questions
  }
}

/** The setup the way the server will store it (so `pool` is `pools[0]`), or undefined when it is not valid. */
const cleanSetup = (raw: any) => {
  const clean = raw ? sanitizeSetup(raw) ?? undefined : undefined;
  if (!clean) return undefined;
  // Non-party setups are stored without `opts.avoid`, but the client's seen questions must still steer the question bank.
  const avoid = (Array.isArray(raw.opts?.avoid) ? raw.opts.avoid : []).slice(0, 200).map((x: unknown) => String(x ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 40));
  return { ...clean, opts: { ...clean.opts, avoid } };
};

// Create a room, with a game already picked (`setup`) or empty for the host to pick one in the lobby.
router.post("/", async (req, res) => {
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const mod = await moderate([...(req.body?.setup ? userText(req.body.setup) : []), req.body?.name]);
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const quiz = await quizFor(cleanSetup(req.body?.setup));
  const r = createRoom(req.body?.setup ?? null, req.body?.name, quiz);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json({ code: r.room.code, token: r.seat.token, snapshot: snapshot(r.room, r.seat.token) });
});

router.post("/:code/join", (req, res) => {
  const r = joinRoom(req.params.code, req.body?.name);
  if ("error" in r) return res.status(r.error === "Room not found" ? 404 : 400).json({ error: r.error });
  res.json({ code: r.room.code, token: r.seat.token, snapshot: snapshot(r.room, r.seat.token) });
});

router.get("/:code", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  seenSeat(room, req.query.token);
  res.json(snapshot(room, req.query.token));
});

// The host picks the next game for the room.
router.post("/:code/game", async (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!seatFor(room, req.body?.token)) return res.status(403).json({ error: "Not in this room" });
  const mod = await moderate(userText(req.body?.setup));
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const quiz = await quizFor(cleanSetup(req.body?.setup), seenIn(room));
  const r = setGame(room, req.body?.token, req.body?.setup, quiz);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

// After a game, the host brings everyone back to the lobby.
router.post("/:code/lobby", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const r = backToLobby(room, req.body?.token);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

// The host points the group at an NBA, NFL or Cartoon stat draft room.
router.post("/:code/stat-link", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const r = setStatLink(room, req.body?.token, req.body?.link ?? null);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

// The host switches between playing and running the night from a screen.
router.post("/:code/screen", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const r = setScreen(room, req.body?.token, req.body?.on);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

router.post("/:code/tournament", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const r = startTournament(room, req.body?.token, req.body?.plan);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

router.post("/:code/tournament/end", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const r = endTournament(room, req.body?.token);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

router.post("/:code/start", async (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  const quiz = needsQuiz(room) && isHost(room, req.body?.token) ? await quizFor(room.setup, seenIn(room)) : undefined;
  const r = startRoom(room, req.body?.token, quiz);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

router.post("/:code/action", async (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!seatFor(room, req.body?.token)) return res.status(403).json({ error: "Not in this room" });
  // Clues are free text that everyone sees: check exactly what the engine would store.
  if (req.body?.action?.type === "clue") {
    const text = req.body.action.text;
    if (typeof text !== "string") return res.status(400).json({ ok: false, error: "Invalid clue" });
    const mod = await moderate([normalizeClue(text)]);
    if (!mod.ok) return res.status(400).json({ ok: false, error: mod.reason });
  }
  const r = act(room, req.body?.token, req.body?.action);
  res.status(r.ok ? 200 : 409).json({ ...r, snapshot: snapshot(room, req.body?.token) });
});

router.post("/:code/leave", (req, res) => {
  const room = getRoom(req.params.code);
  if (room) leaveRoom(room, req.body?.token);
  res.json({ ok: true });
});

export default router;
