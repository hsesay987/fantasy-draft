import { describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { act, createRoom, joinRoom, leaveRoom, snapshot, startRoom, tickRooms } from "./playRooms";
import type { PeckState } from "../shared/topicDraft/formats/pecking";

const LIST = "films-boxoffice";
const peck = (opts: any = {}) => ({ format: "pecking", pool: LIST, opts: { teamSize: 6, ...opts } });
const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed"];

function running(names: string[], setup: any) {
  const made = createRoom(setup, names[0]!) as any;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
  expect(startRoom(made.room, toks[names[0]!])).toEqual({ ok: true });
  return { r: made.room, toks };
}
const state = (r: any) => r.state as PeckState;
const asked = (r: any) => state(r).questions[state(r).round]!;
function answer(r: any, tok: string, good: boolean) {
  const q = asked(r);
  if (q.kind === "rank") return act(r, tok, { type: "answer", rank: good ? q.answer.span[0] : q.answer.span[0] > q.size / 2 ? 1 : q.size });
  const far = q.pool!.filter((p) => !state(r).taken.includes(p.name)).sort((a, b) => Math.abs(b.span[0] - q.at!) - Math.abs(a.span[0] - q.at!))[0]!.name;
  const exact = q.answer.names.find((n) => !state(r).taken.includes(n)) ?? far;
  return act(r, tok, { type: "pick", name: good ? exact : far });
}
const outNames = (r: any) => (r.out ?? []).map((o: any) => o.name);
/** One round: everyone still in answers (`worst` badly, the rest exactly), then the host moves on. */
function round(r: any, toks: Record<string, string>, worst: string) {
  for (const n of Object.keys(toks)) if (!outNames(r).includes(n) && state(r).phase === "question") answer(r, toks[n]!, n !== worst);
  act(r, toks.Ann!, { type: "next" });
}

describe("elimination in a room", () => {
  it("is off unless the host turns it on", () => {
    const { r, toks } = running(NAMES, peck());
    round(r, toks, "Di");
    expect(outNames(r)).toEqual([]);
  });

  it("sends the lowest total out when the next round starts; their moves are refused and nobody waits for them", () => {
    const { r, toks } = running(NAMES, peck({ elimination: true }));
    round(r, toks, "Di");
    expect(r.out).toEqual([{ name: "Di", round: 1, place: 5 }]);
    expect(snapshot(r, toks.Bo!).out).toEqual([{ name: "Di", round: 1, place: 5 }]);
    expect(answer(r, toks.Di!, true)).toEqual({ ok: false, error: "You're out of this game" });
    for (const n of ["Ann", "Bo", "Cy", "Ed"]) answer(r, toks[n]!, true);
    tickRooms();
    expect(state(r).phase).toBe("reveal"); // closed without Di
  });

  it("never goes below 2 players, and the last round sends nobody out", () => {
    const { r, toks } = running(NAMES, peck({ elimination: true }));
    const order = ["Di", "Cy", "Bo", "Ed", "Ann"];
    for (let i = 0; i < 20 && r.status === "playing"; i++) {
      const left = NAMES.filter((n) => !outNames(r).includes(n));
      round(r, toks, order.find((n) => left.includes(n))!);
      tickRooms();
    }
    expect(r.status).toBe("done");
    expect(outNames(r).length).toBeLessThanOrEqual(3);
    expect(NAMES.filter((n) => !outNames(r).includes(n)).length).toBeGreaterThanOrEqual(2);
    expect(r.out.map((o: any) => o.place)).toEqual([5, 4, 3].slice(0, r.out.length));
  });

  it("an out host still moves the game on", () => {
    const { r, toks } = running(NAMES, peck({ elimination: true }));
    round(r, toks, "Ann");
    expect(outNames(r)).toEqual(["Ann"]);
    for (const n of ["Bo", "Cy", "Di", "Ed"]) answer(r, toks[n]!, true);
    tickRooms();
    expect(act(r, toks.Ann!, { type: "next" })).toMatchObject({ ok: true });
  });

  it("never with teams, and a rematch starts everyone back in", () => {
    const teamed = running(NAMES, peck({ elimination: true, teams: 2 }));
    round(teamed.r, teamed.toks, "Di");
    expect(outNames(teamed.r)).toEqual([]);
    const { r, toks } = running(NAMES, peck({ elimination: true }));
    round(r, toks, "Di");
    expect(outNames(r)).toEqual(["Di"]);
    leaveRoom(r, toks.Di!);
    expect(outNames(r)).toEqual(["Di"]); // leaving after going out changes nothing
  });
});

import { setGame, startTournament } from "./playRooms";
import { standings } from "../shared/topicDraft/party/tournament";

/** Plays a whole Pecking Order game: `worst` answers badly every round, everyone else exactly. */
function playGame(r: any, toks: Record<string, string>, worst: string) {
  for (let i = 0; i < 30 && r.status === "playing"; i++) {
    for (const n of Object.keys(toks)) if (r.setup.players.includes(n) && state(r).phase === "question") answer(r, toks[n]!, n !== worst);
    act(r, toks.Ann!, { type: "next" });
    tickRooms();
  }
  expect(r.status).toBe("done");
}
function lobbyRoom(names: string[]) {
  const made = createRoom(peck(), names[0]!) as any;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
  return { r: made.room, toks };
}

describe("tournament cut", () => {
  it("cuts the lowest total after each game; cut players watch and aren't dealt in", () => {
    const { r, toks } = lobbyRoom(["Ann", "Bo", "Cy", "Di"]);
    expect(startTournament(r, toks.Ann!, ["pecking", "pecking", "pecking"], 1)).toEqual({ ok: true });
    startRoom(r, toks.Ann!);
    playGame(r, toks, "Di");
    expect(r.tournament.out).toEqual([{ name: "Di", after: 1 }]);
    setGame(r, toks.Ann!, peck());
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(r.setup.players).not.toContain("Di");
    expect(act(r, toks.Di!, { type: "next" }).ok).toBe(false);
    const rows = standings(r.tournament, ["Ann", "Bo", "Cy", "Di"]);
    expect(rows[rows.length - 1]).toMatchObject({ name: "Di", cut: 1, rank: 4 });
  });

  it("is off by default, and never cuts below 2 finalists", () => {
    const off = lobbyRoom(["Ann", "Bo", "Cy"]);
    startTournament(off.r, off.toks.Ann!, ["pecking", "pecking"]);
    startRoom(off.r, off.toks.Ann!);
    playGame(off.r, off.toks, "Cy");
    expect(off.r.tournament.out).toBeUndefined();
    const { r, toks } = lobbyRoom(["Ann", "Bo", "Cy"]);
    startTournament(r, toks.Ann!, ["pecking", "pecking", "pecking"], 2);
    startRoom(r, toks.Ann!);
    playGame(r, toks, "Cy");
    expect(r.tournament.out.map((o: any) => o.name)).toEqual(["Cy"]); // 2 asked, but 2 must stay
  });
});
