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
const corsOrigin = process.env.CORS_ORIGIN || "*";

app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(","),
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

// 🔹 Create HTTP server + Socket.IO
const server = http.createServer(app);
initSocket(server, corsOrigin);

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
