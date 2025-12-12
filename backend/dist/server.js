"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/server.ts
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_1 = require("./socket");
const draft_route_1 = __importDefault(require("./routes/draft.route"));
const player_route_1 = __importDefault(require("./routes/player.route"));
const auth_route_1 = __importDefault(require("./routes/auth.route"));
const room_route_1 = __importDefault(require("./routes/room.route"));
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 4000;
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use((0, cors_1.default)({
    origin: corsOrigin === "*" ? true : corsOrigin.split(","),
}));
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
});
app.use(auth_1.authOptional);
app.use("/auth", auth_route_1.default);
app.use("/drafts", draft_route_1.default);
app.use("/players", player_route_1.default);
app.use("/rooms", room_route_1.default);
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
});
// 🔹 Create HTTP server + Socket.IO
const server = http_1.default.createServer(app);
(0, socket_1.initSocket)(server, corsOrigin);
server.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map