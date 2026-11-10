import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../services/trivia.service", () => ({ getFeud: vi.fn(), getJeopardy: vi.fn(), isTriviaPool: () => false }));

import router from "./playRooms.route";
import { getRoom } from "../services/playRooms";

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

describe("polling a room", () => {
  const get = (code: string, token?: string) => fetch(`${base}/${code}${token ? `?token=${token}` : ""}`).then((x) => x.json() as Promise<any>);

  it("wakes a sleeping host's crown on a poll with their token, in that very response, without a new version", async () => {
    const made = await post("", { name: "Ann" });
    const code = made.data.code as string;
    const bob = (await post(`/${code}/join`, { name: "Bob" })).data.token as string;
    const room = getRoom(code)!;
    room.seats[0]!.lastSeen = Date.now() - 6 * 60_000; // past the lobby's window
    const asleep = await get(code, bob);
    expect(asleep.seats.find((s: any) => s.host).name).toBe("Bob");
    const noToken = await get(code);
    expect(noToken.seats.find((s: any) => s.host).name).toBe("Bob");
    const back = await get(code, made.data.token);
    expect(back.seats.find((s: any) => s.host).name).toBe("Ann");
    expect(back.version).toBe(asleep.version);
    expect(JSON.stringify(back)).not.toContain("lastSeen");
  });
});

describe("typed Vowel Play guesses over HTTP", () => {
  afterEach(() => vi.useRealTimers());
  const get = (code: string, token?: string) => fetch(`${base}/${code}${token ? `?token=${token}` : ""}`).then((x) => x.json() as Promise<any>);

  async function room(format: "vowelplay" | "vowelparty") {
    const made = await post("", { setup: { format, pool: "superheroes", opts: { vowelAnswer: "type" } }, name: "Ann" });
    const code = made.data.code as string;
    const bob = (await post(`/${code}/join`, { name: "Bob" })).data.token as string;
    expect((await post(`/${code}/start`, { token: made.data.token })).status).toBe(200);
    return { code, ann: made.data.token as string, bob };
  }
  const names = (code: string) => {
    const s = getRoom(code)!.state as any;
    return s.words.slice(s.round).flatMap((w: any) => [w.name, ...w.also]) as string[];
  };

  for (const format of ["vowelplay", "vowelparty"] as const) {
    it(`tells the sender a wrong ${format} guess was refused, and the reply holds no answer for any seat`, async () => {
      const { code, ann, bob } = await room(format);
      const hidden = names(code);
      const wrong = await post(`/${code}/action`, { token: ann, action: { type: "guess", text: "zzzz" } });
      expect(wrong.status).toBe(409);
      expect(wrong.data).toMatchObject({ ok: false, error: "Not allowed right now" });
      for (const json of [JSON.stringify(wrong.data), JSON.stringify(await get(code)), JSON.stringify(await get(code, bob))]) {
        for (const n of hidden) expect(json).not.toContain(n);
      }
    });
  }

  it("says Slow down on a fourth guess within a second, and a right guess is a 200", async () => {
    const { code, ann, bob } = await room("vowelplay");
    // The clock stands still, so the four guesses are in the same second however slow the machine is.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    const tries = [];
    for (let i = 0; i < 4; i++) tries.push(await post(`/${code}/action`, { token: ann, action: { type: "guess", text: "zzzz" } }));
    expect(tries.map((t) => t.data.error)).toEqual(["Not allowed right now", "Not allowed right now", "Not allowed right now", "Slow down"]);
    const right = await post(`/${code}/action`, { token: bob, action: { type: "guess", text: (getRoom(code)!.state as any).words[0].name } });
    vi.useRealTimers();
    expect(right.status).toBe(200);
    expect(right.data.ok).toBe(true);
  });
});

describe("POST /:code/screen", () => {
  it("lets the host switch it on in the lobby, refuses others and bad bodies", async () => {
    const made = await post("", { setup: { format: "vote", pool: "icks", opts: {} }, name: "Ann" });
    const code = made.data.code as string;
    const ann = made.data.token as string;
    const bob = (await post(`/${code}/join`, { name: "Bob" })).data.token as string;
    expect((await post(`/${code}/screen`, { token: bob, on: true })).status).toBe(400);
    expect((await post(`/${code}/screen`, { token: ann, on: "yes" })).status).toBe(400);
    const on = await post(`/${code}/screen`, { token: ann, on: true });
    expect(on.status).toBe(200);
    expect(on.data.screen).toBe(true);
    expect(on.data.seats.map((s: any) => s.screen)).toEqual([true, false]);
    expect(on.data.setup.players).toEqual(["Bob"]);
    expect((await post(`/${code}/screen`, { token: ann, on: false })).data.screen).toBe(false);
    expect((await post(`/NOPE/screen`, { token: ann, on: true })).status).toBe(404);
  });
});

describe("tournament routes", () => {
  it("starts and ends a tournament, host only", async () => {
    const made = await post("", { setup: null, name: "Ann" });
    const code = made.data.code as string;
    const bob = (await post(`/${code}/join`, { name: "Bob" })).data.token;
    expect((await post(`/${code}/tournament`, { token: bob, plan: ["insync", "vote"] })).status).toBe(400);
    expect((await post(`/${code}/tournament`, { token: made.data.token, plan: ["insync"] })).status).toBe(400);
    const ok = await post(`/${code}/tournament`, { token: made.data.token, plan: ["insync", "vote"] });
    expect(ok.status).toBe(200);
    expect(ok.data.tournament).toMatchObject({ index: 0, done: false, standings: [{ name: "Ann" }, { name: "Bob" }] });
    expect((await post(`/${code}/tournament/end`, { token: bob })).status).toBe(400);
    const end = await post(`/${code}/tournament/end`, { token: made.data.token });
    expect(end.data.tournament.done).toBe(true);
    expect((await post(`/nope/tournament/end`, { token: "x" })).status).toBe(404);
  });
});
