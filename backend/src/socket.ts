// backend/src/socket.ts
import { Server } from "socket.io";
import type http from "http";

let io: Server | null = null;

export function initSocket(server: http.Server, corsOrigin: string) {
  io = new Server(server, {
    cors: {
      // origin: corsOrigin === "*" ? "*" : corsOrigin.split(","),
      origin: corsOrigin.split(","),
      methods: ["GET", "POST", "PATCH", "DELETE"],
    },
  });

  io.on("connection", (socket) => {
    // join a draft room
    socket.on("draft:join", (draftId: string) => {
      socket.join(`draft:${draftId}`);
    });

    // 🔹 NEW: join an online lobby room
    socket.on("room:join", (roomCode: string) => {
      socket.join(`room:${roomCode}`);
    });

    socket.on("disconnect", () => {
      // optional: handle
    });
  });

  return io;
}

export function getIo() {
  return io;
}
