import { getFeud, getJeopardy, isTriviaPool } from "../services/trivia.service";
import { moderate, userText } from "../lib/moderation";
import { Router } from "express";
import { act, backToLobby, createRoom, getRoom, giveQuiz, joinRoom, leaveRoom, needsQuiz, seatFor, seenIn, setGame, setStatLink, snapshot, startRoom } from "../services/playRooms";

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

/** Jeopardy and Feud rooms get their questions from the server's trivia bank so every seat sees the same board. */
async function quizFor(setup: any, seen: string[] = []) {
  const fmt = setup?.format, pool = setup?.pool;
  if ((fmt !== "jeopardy" && fmt !== "feud") || !isTriviaPool(pool)) return undefined;
  try {
    const mine = Array.isArray(setup?.opts?.avoid) ? setup.opts.avoid.filter((x: unknown) => typeof x === "string") : [];
    const avoid = [...seen, ...mine].slice(-400);
    return fmt === "jeopardy" ? { categories: await getJeopardy(pool, avoid) } : { surveys: await getFeud(pool, 5, avoid) };
  } catch {
    return undefined; // falls back to the bundled questions
  }
}

// Create a room, with a game already picked (`setup`) or empty for the host to pick one in the lobby.
router.post("/", async (req, res) => {
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const mod = await moderate([...(req.body?.setup ? userText(req.body.setup) : []), req.body?.name]);
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const quiz = await quizFor(req.body?.setup);
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
  res.json(snapshot(room, req.query.token));
});

// The host picks the next game for the room.
router.post("/:code/game", async (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!seatFor(room, req.body?.token)) return res.status(403).json({ error: "Not in this room" });
  const mod = await moderate(userText(req.body?.setup));
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const quiz = await quizFor(req.body?.setup, seenIn(room));
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

router.post("/:code/start", async (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (needsQuiz(room) && room.seats[0] === seatFor(room, req.body?.token)) {
    const quiz = await quizFor(room.setup, seenIn(room));
    if (quiz) giveQuiz(room, quiz);
  }
  const r = startRoom(room, req.body?.token);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(snapshot(room, req.body?.token));
});

router.post("/:code/action", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (!seatFor(room, req.body?.token)) return res.status(403).json({ error: "Not in this room" });
  const r = act(room, req.body?.token, req.body?.action);
  res.status(r.ok ? 200 : 409).json({ ...r, snapshot: snapshot(room, req.body?.token) });
});

router.post("/:code/leave", (req, res) => {
  const room = getRoom(req.params.code);
  if (room) leaveRoom(room, req.body?.token);
  res.json({ ok: true });
});

export default router;
