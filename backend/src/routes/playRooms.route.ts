import { moderate, userText } from "../lib/moderation";
import { Router } from "express";
import { act, createRoom, getRoom, joinRoom, leaveRoom, seatFor, snapshot, startRoom } from "../services/playRooms";

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

router.post("/", async (req, res) => {
  if (limited(req.ip ?? "anon")) return res.status(429).json({ error: "Slow down — try again in a minute" });
  const mod = await moderate([...userText(req.body?.setup), req.body?.name]);
  if (!mod.ok) return res.status(400).json({ error: mod.reason });
  const r = createRoom(req.body?.setup, req.body?.name);
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

router.post("/:code/start", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
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
