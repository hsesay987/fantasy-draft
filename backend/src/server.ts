// backend/src/server.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";

import { initSocket } from "./socket";
import draftRoutes from "./routes/draft.route";
import playerRoutes from "./routes/player.route";
import authRoutes from "./routes/auth.route";
import roomRoutes from "./routes/room.route";
import { authOptional } from "./middleware/auth";

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const corsOrigin = process.env.CORS_ORIGIN || "https://toppicgames.com";

/* ✅ SINGLE CORS CONFIG */
app.use(
  cors({
    origin: corsOrigin.split(","),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use(authOptional);

app.use("/auth", authRoutes);
app.use("/drafts", draftRoutes);
app.use("/players", playerRoutes);
app.use("/rooms", roomRoutes);

app.use(
  (err: any, _req: express.Request, res: express.Response, _next: any) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

/* 🔹 HTTP SERVER (behind Nginx HTTPS) */
const server = http.createServer(app);

/* 🔹 Socket.IO must match CORS */
initSocket(server, corsOrigin);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`API server running on localhost:${PORT}`);
});
