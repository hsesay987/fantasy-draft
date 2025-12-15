// backend/src/routes/room.route.ts
import { Router } from "express";
import { authRequired, AuthedRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import crypto from "crypto";
import { getIo } from "../socket";

const router = Router();

// helper to generate a 6-char code
function generateRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // "A1B2C3"
}

// CREATE ROOM
router.post("/", authRequired, async (req: AuthedRequest, res) => {
  try {
    const { gameType = "DRAFT", isPublic = false, name } = req.body;
    const userId = req.userId; // <— host is always the authed user
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // guard against stale/invalid tokens pointing to non-existent users
    const host = await prisma.user.findUnique({ where: { id: userId } });
    if (!host) return res.status(401).json({ error: "User not found" });

    const code = generateRoomCode();

    const room = await prisma.room.create({
      data: {
        code,
        hostId: userId,
        gameType,
        isPublic,
        name: name || "Online NBA Draft",
        participants: {
          create: {
            userId,
            isHost: true,
          },
        },
      },
      include: {
        participants: { include: { user: true } },
      },
    });

    return res.json(room);
  } catch (e: any) {
    console.error("Error creating room:", e);
    return res.status(500).json({ error: "Failed to create room" });
  }
});

// GET ROOM BY CODE
router.get("/:code", authRequired, async (req: AuthedRequest, res) => {
  try {
    const { code } = req.params;

    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        participants: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    return res.json(room);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch room" });
  }
});

// JOIN ROOM
router.post("/:code/join", authRequired, async (req: AuthedRequest, res) => {
  try {
    const { code } = req.params;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // avoid FK errors if token references a deleted user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User not found" });

    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        participants: { include: { user: true } },
      },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // already in room? handle in-progress redirect
    const alreadyInRoom = room.participants.some((p) => p.userId === userId);
    if (alreadyInRoom) {
      if (room.status === "in_progress" && room.gameId) {
        return res.json({ ...room, activeDraftId: room.gameId });
      }
      return res.json(room);
    }

    // If a draft is already running, block new joins
    if (room.status === "in_progress" && room.gameId) {
      return res
        .status(409)
        .json({ error: "Draft already in progress", activeDraftId: room.gameId });
    }

    await prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        isHost: userId === room.hostId,
      },
    });

    const updated = await prisma.room.findUnique({
      where: { id: room.id },
      include: { participants: { include: { user: true } } },
    });

    return res.json(updated);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to join room" });
  }
});

// LEAVE ROOM (self-serve, host leaving cancels room)
router.post("/:code/leave", authRequired, async (req: AuthedRequest, res) => {
  try {
    const { code } = req.params;
    const userId = req.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const room = await prisma.room.findUnique({
      where: { code },
      include: { participants: true },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isHost = room.hostId === userId;

    if (isHost) {
      await prisma.roomParticipant.deleteMany({ where: { roomId: room.id } });
      await prisma.room.delete({ where: { id: room.id } });
      const io = getIo();
      if (io) io.to(`room:${code}`).emit("room:cancelled", { code });
      return res.json({ ok: true, cancelled: true });
    }

    await prisma.roomParticipant.deleteMany({
      where: { roomId: room.id, userId },
    });

    const remaining = await prisma.roomParticipant.count({
      where: { roomId: room.id },
    });

    if (remaining <= 1) {
      await prisma.roomParticipant.deleteMany({ where: { roomId: room.id } });
      await prisma.room.delete({ where: { id: room.id } });
      const io = getIo();
      if (io) io.to(`room:${code}`).emit("room:cancelled", { code });
      return res.json({ ok: true, cancelled: true });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to leave room" });
  }
});

// KICK
router.post("/:code/kick", authRequired, async (req: AuthedRequest, res) => {
  try {
    const { code } = req.params;
    const { userIdToKick } = req.body;
    const requesterId = req.userId;

    const room = await prisma.room.findUnique({
      where: { code },
      include: { participants: true },
    });

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.hostId !== requesterId) {
      return res.status(403).json({ error: "Only host can kick" });
    }

    await prisma.roomParticipant.deleteMany({
      where: { roomId: room.id, userId: userIdToKick },
    });

    const updated = await prisma.room.findUnique({
      where: { id: room.id },
      include: { participants: { include: { user: true } } },
    });

    return res.json(updated);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to kick player" });
  }
});

// 🔹 CANCEL ROOM (host only)
router.delete("/:code", authRequired, async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId;
    const code = req.params.code;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const room = await prisma.room.findUnique({
      where: { code },
      include: { participants: true },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    if (room.hostId !== userId) {
      return res
        .status(403)
        .json({ error: "Only the host can cancel this room" });
    }

    // Adjust this to match your actual participant relation name
    await prisma.roomParticipant.deleteMany({
      where: { roomId: room.id },
    });

    await prisma.room.delete({
      where: { id: room.id },
    });

    // notify anyone connected to this lobby
    const io = getIo();
    if (io) {
      io.to(`room:${code}`).emit("room:cancelled", { code });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to cancel room" });
  }
});

export default router;
