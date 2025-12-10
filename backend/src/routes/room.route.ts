import { Router } from "express";
import { authRequired, AuthedRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import crypto from "crypto";

const router = Router();

// helper to generate a 6-char code
function generateRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. "A1B2C3"
}

// Create room (online game)
router.post("/", authRequired, async (req: AuthedRequest, res) => {
  const { gameType = "DRAFT", isPublic = false, name } = req.body;
  const userId = req.userId!;

  const code = generateRoomCode();

  const room = await prisma.room.create({
    data: {
      code,
      name,
      isPublic,
      gameType,
      hostId: userId,
      participants: {
        create: {
          userId,
          isHost: true,
        },
      },
    },
    include: { participants: { include: { user: true } } },
  });

  res.status(201).json(room);
});

// Get room by code
router.get("/:code", authRequired, async (req: AuthedRequest, res) => {
  const { code } = req.params;
  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      participants: { include: { user: true } },
    },
  });
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(room);
});

// Join room by code
router.post("/:code/join", authRequired, async (req: AuthedRequest, res) => {
  const { code } = req.params;
  const userId = req.userId!;

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "lobby")
    return res.status(400).json({ error: "Room already started / closed" });

  try {
    await prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        isHost: userId === room.hostId,
      },
    });
  } catch {
    // already in room
  }

  const updated = await prisma.room.findUnique({
    where: { id: room.id },
    include: { participants: { include: { user: true } } },
  });
  res.json(updated);
});

// Kick participant (host only)
router.post("/:code/kick", authRequired, async (req: AuthedRequest, res) => {
  const { code } = req.params;
  const { userIdToKick } = req.body;
  const userId = req.userId!;

  const room = await prisma.room.findUnique({
    where: { code },
    include: { participants: true },
  });
  if (!room) return res.status(404).json({ error: "Room not found" });

  if (room.hostId !== userId)
    return res.status(403).json({ error: "Only host can kick" });

  await prisma.roomParticipant.deleteMany({
    where: { roomId: room.id, userId: userIdToKick },
  });

  const updated = await prisma.room.findUnique({
    where: { id: room.id },
    include: { participants: { include: { user: true } } },
  });

  res.json(updated);
});

export default router;
