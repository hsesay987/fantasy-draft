import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _rooms, act, createRoom, joinRoom, snapshot, startRoom, tickRooms } from "./playRooms";
import type { DigState } from "../shared/topicDraft/formats/npatDig";
import { DIG_ANSWER_MS, REEL_MS, WRITE_GRACE_MS } from "../shared/topicDraft/npat/rules";

type Made = Extract<ReturnType<typeof createRoom>, { room: unknown }>;
type Room = Made["room"];
const T0 = 1_800_000_000_000;
const dig = { format: "npat", pool: "classic", pools: ["classic", "cat:food"], opts: { npatStyle: "dig" } };

function running(setup: unknown = dig) {
  const made = createRoom(setup, "Ann") as Made;
  const ann = made.seat.token;
  const bob = (joinRoom(made.room.code, "Bob") as Made).seat.token;
  expect(startRoom(made.room, ann)).toEqual({ ok: true });
  return { r: made.room, ann, bob };
}
const state = (r: Room) => r.state as DigState;
const at = (ms: number) => { vi.setSystemTime(T0 + ms); tickRooms(); };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); _rooms.clear(); });

describe("host pause", () => {
  it("only the host can pause and resume, and the snapshot says so", () => {
    const { r, ann, bob } = running();
    expect(act(r, bob, { type: "pause" })).toEqual({ ok: false, error: "Only the host can pause" });
    expect(act(r, ann, { type: "pause" })).toEqual({ ok: true });
    expect((snapshot(r, bob) as { paused: boolean }).paused).toBe(true);
    expect(act(r, bob, { type: "resume" })).toEqual({ ok: false, error: "Only the host can pause" });
    expect(act(r, ann, { type: "resume" })).toEqual({ ok: true });
    expect((snapshot(r, bob) as { paused: boolean }).paused).toBe(false);
  });

  it("stops the clock: a timer does not run out while paused and keeps its time left after", () => {
    const { r, ann } = running();
    at(REEL_MS + 10);
    expect(state(r).phase).toBe("ask");
    const askAt = state(r).phaseAt;
    at(REEL_MS + 5_000);
    act(r, ann, { type: "pause" });
    at(REEL_MS + 5_000 + 10 * 60_000); // ten minutes paused
    expect(state(r).phase).toBe("ask");
    act(r, ann, { type: "resume" });
    const snapNow = (snapshot(r, ann) as { serverNow: number }).serverNow;
    expect(snapNow - askAt).toBe(5_000 - 10); // the game clock picks up where it stopped
    at(REEL_MS + 5_000 + 10 * 60_000 + DIG_ANSWER_MS - 5_000 - 500);
    expect(state(r).phase).toBe("ask"); // still time left
    at(REEL_MS + 5_000 + 10 * 60_000 + DIG_ANSWER_MS + WRITE_GRACE_MS + 500);
    expect(state(r).phase).not.toBe("ask");
  });

  it("refuses moves while paused", () => {
    const { r, ann, bob } = running();
    at(REEL_MS + 10);
    act(r, ann, { type: "pause" });
    expect(act(r, bob, { type: "answer", text: "Ham" })).toEqual({ ok: false, error: "The game is paused" });
  });

  it("is only for party games that are running", () => {
    const made = createRoom(dig, "Ann") as Made;
    expect(act(made.room, made.seat.token, { type: "pause" })).toEqual({ ok: false, error: "Game is not running" });
  });
});
