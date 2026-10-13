import type { GameState } from "../topicDraft/core";
import type { Action } from "../topicDraft/core";
import type { Verdict } from "./judging";
import type { GameSetup } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type RoomSnapshot = {
  code: string;
  status: "lobby" | "playing" | "done";
  version: number;
  serverNow: number;
  setup: GameSetup;
  seats: { name: string; host: boolean; left: boolean }[];
  me: string | null;
  state: GameState | null;
  verdict: Verdict | null;
};

const seatKey = (code: string) => `toppic:v2:seat:${code.toUpperCase()}`;
export const saveToken = (code: string, token: string) => {
  try {
    localStorage.setItem(seatKey(code), token);
  } catch {
    /* storage unavailable */
  }
};
export const loadToken = (code: string): string | null => {
  try {
    return localStorage.getItem(seatKey(code));
  } catch {
    return null;
  }
};
export const clearToken = (code: string) => {
  try {
    localStorage.removeItem(seatKey(code));
  } catch {
    /* ignore */
  }
};

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(`${API_URL}/play-rooms${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({} as never)) };
  } catch {
    return { ok: false, status: 0, data: { error: "Can't reach the game server" } as never };
  }
}

export const createRoom = (setup: GameSetup, name: string) => call<{ code: string; token: string; snapshot: RoomSnapshot }>("", { method: "POST", body: JSON.stringify({ setup, name }) });
export const joinRoom = (code: string, name: string) => call<{ code: string; token: string; snapshot: RoomSnapshot }>(`/${code.toUpperCase()}/join`, { method: "POST", body: JSON.stringify({ name }) });
export const getRoom = (code: string, token: string | null) => call<RoomSnapshot>(`/${code.toUpperCase()}${token ? `?token=${token}` : ""}`);
export const startRoom = (code: string, token: string) => call<RoomSnapshot>(`/${code.toUpperCase()}/start`, { method: "POST", body: JSON.stringify({ token }) });
export const sendAction = (code: string, token: string, action: Omit<Action, "by"> & { by?: string }) =>
  call<{ ok: boolean; snapshot: RoomSnapshot }>(`/${code.toUpperCase()}/action`, { method: "POST", body: JSON.stringify({ token, action }) });
export const leaveRoom = (code: string, token: string) => call<{ ok: boolean }>(`/${code.toUpperCase()}/leave`, { method: "POST", body: JSON.stringify({ token }) });
