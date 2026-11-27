import { describe, expect, it, vi } from "vitest";

const story = { title: "Siege", setting: "Fog", beats: [{ label: "Opening", text: "x" }], why: "won" };
const writeStory = vi.fn(async () => story);
vi.mock("./story.service", () => ({ writeStory: (...a: unknown[]) => (writeStory as any)(...a) }));

import { act, createRoom, joinRoom, snapshot, startRoom } from "./playRooms";
import { DEFAULT_OPTS } from "../shared/play/types";
import { currentTurn } from "../shared/topicDraft/core";

const base = { format: "snake", pool: "superheroes", mission: { id: "m", title: "Best Squad", blurb: "", weights: { power: 1 } }, opts: { ...DEFAULT_OPTS, teamSize: 2, timerSeconds: null } };
function play() {
  const c = createRoom(base, "Ann") as any;
  const tokens: Record<string, string> = { Ann: c.seat.token, Bob: (joinRoom(c.room.code, "Bob") as any).seat.token };
  const r = c.room;
  startRoom(r, tokens.Ann!);
  for (let i = 0; i < 50 && r.status === "playing"; i++) act(r, tokens[currentTurn(r.setup, r.state!)!]!, { type: "auto" });
  return { r, tokens };
}
const settle = () => new Promise((res) => setTimeout(res, 50));

describe("draft story in rooms", () => {
  it("is written after the verdict and sent to everyone, given the verdict and the teams", async () => {
    const { r, tokens } = play();
    expect(snapshot(r, tokens.Ann!).story).toBeNull();
    await settle();
    const snap = snapshot(r, tokens.Bob!);
    expect(snap.verdict).toBeTruthy();
    expect(snap.story).toEqual(story);
    const arg = (writeStory.mock.calls.at(-1) as unknown as [any])[0];
    expect(arg.verdict.winner).toBe(snap.verdict!.winner);
    expect(arg.teams).toHaveLength(2);
  });

  it("a result without a story still shows", async () => {
    writeStory.mockResolvedValueOnce(null as any);
    const { r, tokens } = play();
    await settle();
    expect(snapshot(r, tokens.Ann!).verdict).toBeTruthy();
    expect(snapshot(r, tokens.Ann!).story).toBeNull();
  });
});
