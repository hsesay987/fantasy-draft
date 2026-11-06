import { describe, expect, it } from "vitest";
import { NIGHT_OK, SKIP_VOTE, init, redactFor, type MafiaState, type MafiaView, type Role } from "../../topicDraft/formats/mafia";
import { endLine, endedBy, fateOf, nightStatus, publicRole, lookOf, morningLine, nightLine, nightPick, partnersOf, roleOf, tallyOf, voteLine, voteOf, voteResult } from "./mafiaBoard";

const SIX = ["Ann", "Bob", "Cy", "Di", "Ed", "constructor"];
const rig = (over: Partial<MafiaState> = {}): MafiaState => {
  const roles = Object.fromEntries(([["Ann", "mafia"], ["Bob", "mafia"], ["Cy", "doctor"], ["Di", "detective"], ["Ed", "villager"], ["constructor", "villager"]] as [string, Role][]));
  return { ...init({ players: SIX, seed: 1, now: 5_000 }), roles, ...over };
};
const seen = (me: string, over: Partial<MafiaState> = {}): MafiaView => redactFor(rig(over), me);

describe("the night board", () => {
  it("a villager's every tap is the harmless one, including their own name", () => {
    for (const p of SIX) expect(nightPick(seen("Ed"), "Ed", p)).toBe(NIGHT_OK);
  });

  it("mafia can pick anyone but their own side", () => {
    const v = seen("Ann");
    expect(nightPick(v, "Ann", "Ann")).toBeNull();
    expect(nightPick(v, "Ann", "Bob")).toBeNull();
    expect(nightPick(v, "Ann", "Cy")).toBe("Cy");
    expect(nightPick(v, "Ann", "constructor")).toBe("constructor");
    expect(partnersOf(v, "Ann")).toEqual(["Bob"]);
    expect(partnersOf(seen("Ed"), "Ed")).toEqual([]);
  });

  it("the doctor can pick themselves, but not last night's name", () => {
    const v = seen("Cy", { lastSave: "Ed" });
    expect(nightPick(v, "Cy", "Cy")).toBe("Cy");
    expect(nightPick(v, "Cy", "Ed")).toBeNull();
    expect(nightPick(v, "Cy", "Di")).toBe("Di");
  });

  it("the detective can pick anyone but themselves", () => {
    expect(nightPick(seen("Di"), "Di", "Di")).toBeNull();
    expect(nightPick(seen("Di"), "Di", "Ann")).toBe("Ann");
  });

  it("nobody out of town can act or be picked, and nor can a watcher with no card", () => {
    const alive = SIX.filter((p) => p !== "Ed");
    expect(nightPick(seen("Ann", { alive }), "Ann", "Ed")).toBeNull();
    expect(nightPick(seen("Ed", { alive }), "Ed", "Ann")).toBeNull();
    expect(nightPick(seen("Stranger"), "Stranger", "Ann")).toBeNull();
    expect(roleOf(seen("Ann"), "constructor")).toBeUndefined();
    expect(voteOf({ votes: {} }, "constructor")).toBeUndefined();
  });
});

describe("a tap that can't count", () => {
  const invalid: [string, MafiaView, string][] = [
    ["mafia on a partner", seen("Ann"), "Bob"],
    ["mafia on themselves", seen("Ann"), "Ann"],
    ["doctor repeating a save", seen("Cy", { lastSave: "Ed" }), "Ed"],
    ["detective on themselves", seen("Di"), "Di"],
  ];
  const me = { "mafia on a partner": "Ann", "mafia on themselves": "Ann", "doctor repeating a save": "Cy", "detective on themselves": "Di" } as Record<string, string>;

  it("gives back a bare null, the same for every role: no words the screen could show", () => {
    for (const [why, view, name] of invalid) expect(nightPick(view, me[why]!, name), why).toBeNull();
  });

  it("leaves the status line as every role sees it: the line reads the count and the clock, never a role or a name", () => {
    expect(nightStatus({ locked: false, outOfTime: false, acted: 2, alive: 6 })).toBe("2 of 6 tapped");
    expect(nightStatus({ locked: true, outOfTime: false, acted: 3, alive: 6 })).toBe("Locked in. 3 of 6 tapped");
    expect(nightStatus({ locked: false, outOfTime: true, acted: 3, alive: 6 })).toBe("Time! 3 of 6 tapped");
    expect(nightStatus.length, "takes one object of public facts").toBe(1);
  });
});

describe("roles in the town list", () => {
  it("shows a vote-out's role, and never a night's, even to a dead viewer who was sent it", () => {
    expect(publicRole({ role: "doctor", by: "vote" })).toBe("doctor");
    expect(publicRole({ role: "doctor", by: "night" })).toBeNull();
    expect(publicRole({ role: null, by: "night" })).toBeNull();
  });
});

describe("the town's time of day", () => {
  it("follows the phase, then who won", () => {
    expect((["night", "morning", "talk", "vote"] as const).map((phase) => lookOf({ phase, done: false, winner: null }))).toEqual(["night", "dawn", "day", "dusk"]);
    expect(lookOf({ phase: "vote", done: true, winner: "village" })).toBe("day");
    expect(lookOf({ phase: "morning", done: true, winner: "mafia" })).toBe("night");
    expect(lookOf({ phase: "talk", done: true, winner: null })).toBe("dawn");
  });
});

describe("the last vote", () => {
  it("groups votes, biggest first and skips last", () => {
    expect(tallyOf({ A: SKIP_VOTE, B: SKIP_VOTE, C: SKIP_VOTE, D: "Ed", E: "Bob", F: "Bob" })).toEqual([{ target: "Bob", voters: ["E", "F"] }, { target: "Ed", voters: ["D"] }, { target: SKIP_VOTE, voters: ["A", "B", "C"] }]);
    expect(tallyOf({})).toEqual([]);
  });

  it("reads who went out from the votes, not from the last elimination", () => {
    const earlier = [{ name: "Ed", role: "villager" as Role, by: "vote" as const }];
    expect(voteResult({ votes: { A: "Cy", B: SKIP_VOTE }, eliminated: earlier })).toEqual({ out: null, role: null });
    expect(voteResult({ votes: {}, eliminated: earlier })).toEqual({ out: null, role: null });
    expect(voteResult({ votes: { A: "Ed", B: "Ed", C: SKIP_VOTE }, eliminated: earlier })).toEqual({ out: "Ed", role: "villager" });
    expect(voteLine({ votes: { A: "Cy", B: SKIP_VOTE }, eliminated: earlier, night: 3, startedAt: 0 })).not.toContain("Ed");
  });

  it("says the role of who the vote put out, and the side's line", () => {
    const line = voteLine({ votes: { A: "Ann", B: "Ann" }, eliminated: [{ name: "Ann", role: "mafia", by: "vote" }], night: 2, startedAt: 0 });
    expect(line).toContain("Ann");
    expect(line).toContain("Mafia");
    expect(voteLine({ votes: { A: "Cy", B: "Cy" }, eliminated: [{ name: "Cy", role: "doctor", by: "vote" }], night: 2, startedAt: 0 })).toContain("the Doctor");
  });
});

describe("what the narrator says", () => {
  it("every living seat gets the same morning, whatever their card, and a hidden role stays out of it", () => {
    const s = rig({ phase: "morning", morning: { died: "Cy" }, alive: SIX.filter((p) => p !== "Cy"), eliminated: [{ name: "Cy", role: "doctor", by: "night" }] });
    const lines = ["Ann", "Di", "Ed"].map((p) => morningLine(redactFor(s, p)));
    expect(new Set(lines).size).toBe(1);
    expect(lines[0]).toContain("Cy");
    expect(lines[0]).not.toMatch(/doctor/i);
  });

  it("the morning after a quiet night names nobody", () => {
    expect(morningLine({ morning: { died: null }, night: 1, startedAt: 0 })).not.toMatch(/\{name\}/);
  });

  it("the first night at a table of five says it is quiet, and later nights don't", () => {
    const FIVE = SIX.slice(0, 5);
    expect(nightLine({ players: FIVE, night: 1, startedAt: 0 })).toMatch(/nobody leaves/i);
    expect(nightLine({ players: FIVE, night: 2, startedAt: 0 })).not.toMatch(/nobody leaves/i);
    expect(nightLine({ players: SIX, night: 1, startedAt: 0 })).not.toMatch(/nobody leaves/i);
  });

  it("the ending follows the winner, and knows how the game ended", () => {
    expect(endLine({ winner: "village", night: 1, startedAt: 0 })).not.toBe(endLine({ winner: "mafia", night: 1, startedAt: 0 }));
    expect(endLine({ winner: null, night: 1, startedAt: 0 })).toBeTruthy();
    expect(endedBy({ phase: "vote", winner: "village" })).toBe("vote");
    expect(endedBy({ phase: "morning", winner: "mafia" })).toBe("night");
    expect(endedBy({ phase: "talk", winner: null })).toBeNull();
    expect(endedBy({ phase: "vote", winner: null })).toBeNull();
  });

  it("gives everyone a fate for the final list", () => {
    const eliminated = [{ name: "Cy", role: "doctor" as Role, by: "night" as const }, { name: "Ed", role: "villager" as Role, by: "vote" as const }];
    expect(["Cy", "Ed", "Di"].map((p) => fateOf({ eliminated }, p))).toEqual(["Left in the night", "Voted out", "Still in town"]);
  });
});
