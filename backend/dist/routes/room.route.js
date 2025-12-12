"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/room.route.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../lib/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const socket_1 = require("../socket");
const router = (0, express_1.Router)();
// helper to generate a 6-char code
function generateRoomCode() {
    return crypto_1.default.randomBytes(3).toString("hex").toUpperCase(); // "A1B2C3"
}
// CREATE ROOM
router.post("/", auth_1.authRequired, async (req, res) => {
    try {
        const { gameType = "DRAFT", isPublic = false, name } = req.body;
        const userId = req.userId; // <— host is always the authed user
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        // guard against stale/invalid tokens pointing to non-existent users
        const host = await prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!host)
            return res.status(401).json({ error: "User not found" });
        const code = generateRoomCode();
        const room = await prisma_1.default.room.create({
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
    }
    catch (e) {
        console.error("Error creating room:", e);
        return res.status(500).json({ error: "Failed to create room" });
    }
});
// GET ROOM BY CODE
router.get("/:code", auth_1.authRequired, async (req, res) => {
    try {
        const { code } = req.params;
        const room = await prisma_1.default.room.findUnique({
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
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to fetch room" });
    }
});
// JOIN ROOM
router.post("/:code/join", auth_1.authRequired, async (req, res) => {
    try {
        const { code } = req.params;
        const userId = req.userId;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        // avoid FK errors if token references a deleted user
        const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(401).json({ error: "User not found" });
        const room = await prisma_1.default.room.findUnique({
            where: { code },
            include: {
                participants: { include: { user: true } },
            },
        });
        if (!room) {
            return res.status(404).json({ error: "Room not found" });
        }
        // already in room? just return
        const alreadyInRoom = room.participants.some((p) => p.userId === userId);
        if (alreadyInRoom)
            return res.json(room);
        await prisma_1.default.roomParticipant.create({
            data: {
                roomId: room.id,
                userId,
                isHost: userId === room.hostId,
            },
        });
        const updated = await prisma_1.default.room.findUnique({
            where: { id: room.id },
            include: { participants: { include: { user: true } } },
        });
        return res.json(updated);
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to join room" });
    }
});
// KICK
router.post("/:code/kick", auth_1.authRequired, async (req, res) => {
    try {
        const { code } = req.params;
        const { userIdToKick } = req.body;
        const requesterId = req.userId;
        const room = await prisma_1.default.room.findUnique({
            where: { code },
            include: { participants: true },
        });
        if (!room)
            return res.status(404).json({ error: "Room not found" });
        if (room.hostId !== requesterId) {
            return res.status(403).json({ error: "Only host can kick" });
        }
        await prisma_1.default.roomParticipant.deleteMany({
            where: { roomId: room.id, userId: userIdToKick },
        });
        const updated = await prisma_1.default.room.findUnique({
            where: { id: room.id },
            include: { participants: { include: { user: true } } },
        });
        return res.json(updated);
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to kick player" });
    }
});
// 🔹 CANCEL ROOM (host only)
router.delete("/:code", auth_1.authRequired, async (req, res) => {
    try {
        const userId = req.userId;
        const code = req.params.code;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const room = await prisma_1.default.room.findUnique({
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
        await prisma_1.default.roomParticipant.deleteMany({
            where: { roomId: room.id },
        });
        await prisma_1.default.room.delete({
            where: { id: room.id },
        });
        // notify anyone connected to this lobby
        const io = (0, socket_1.getIo)();
        if (io) {
            io.to(`room:${code}`).emit("room:cancelled", { code });
        }
        return res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to cancel room" });
    }
});
exports.default = router;
//# sourceMappingURL=room.route.js.map