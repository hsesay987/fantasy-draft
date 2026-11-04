import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../services/trivia.service", () => ({ getFeud: vi.fn(), getJeopardy: vi.fn(), isTriviaPool: () => false }));

import router from "./playRooms.route";

const BLOCKED = "retard"; // on the local blocklist, so these tests need no moderation service
let server: Server;
let base = "";

beforeAll(async () => {
  vi.stubEnv("JEV_API_KEY", "");
  const app = express();
  app.use(express.json());
  app.use("/play-rooms", router);
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/play-rooms`;
});
afterAll(() => {
  vi.unstubAllEnvs();
  server.close();
});

const post = async (path: string, body: unknown) => {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as any };
};

/** A running game, plus whoever must give the next clue. */
async function game(setup: unknown) {
  const made = await post("", { setup, name: "Ann" });
  const code = made.data.code as string;
  const toks: Record<string, string> = { Ann: made.data.token };
  for (const name of ["Bob", "Cy"]) toks[name] = (await post(`/${code}/join`, { name })).data.token;
  const started = await post(`/${code}/start`, { token: toks.Ann });
  expect(started.status).toBe(200);
  const s = started.data.state;
  const speaker: string = s.order ? s.order[0] : s.players[s.giverAt];
  return { code, token: toks[speaker]!, speaker };
}

const GAMES = [
  { label: "In-Sync", setup: { format: "insync", pool: "friends", opts: {} }, stored: (s: any) => s.clue },
  { label: "Imposter", setup: { format: "imposter", pool: "superheroes", opts: { teamSize: 1 } }, stored: (s: any) => s.clues[0]?.text },
];

describe.each(GAMES)("clue moderation: $label", ({ setup, stored }) => {
  let g: Awaited<ReturnType<typeof game>>;
  const clue = (text: unknown) => post(`/${g.code}/action`, { token: g.token, action: { type: "clue", by: g.speaker, text } });
  beforeAll(async () => { g = await game(setup); }); // one room: refused clues change nothing, and room creation is rate limited

  it.each([
    ["spaces", " ".repeat(40)],
    ["newlines", "\n".repeat(60)],
    ["tabs and non-breaking spaces", "\t ".repeat(30)],
  ])("rejects a blocked word pushed past the cap with %s", async (_name, pad) => {
    const r = await clue(pad + BLOCKED);
    expect(r.status).toBe(400);
    expect(r.data.ok).toBe(false);
  });

  it("rejects a blocked word that only appears once inner whitespace collapses", async () => {
    const r = await clue(`a${" ".repeat(50)}${BLOCKED}`);
    expect(r.status).toBe(400);
  });

  it.each([
    ["an array", [BLOCKED]],
    ["an object", { toString: BLOCKED }],
    ["a number", 7],
    ["null", null],
  ])("refuses %s as clue text, without changing the game", async (_name, text) => {
    const r = await clue(text);
    expect(r.status).toBe(400);
    const after = await fetch(`${base}/${g.code}?token=${g.token}`).then((x) => x.json() as Promise<any>);
    expect(after.state.phase).toBe("clue");
    expect(stored(after.state) || "").toBe("");
  });

  it("passes a normal clue and stores it tidied", async () => {
    const r = await clue("  a   quiet\nclue  ");
    expect(r.status).toBe(200);
    expect(stored(r.data.snapshot.state)).toBe("a quiet clue");
  });
});
