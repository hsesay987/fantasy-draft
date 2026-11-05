import { describe, expect, it } from "vitest";
import { IDLE_LIMIT, MORNING_MS, NIGHT_MS, SKIP_VOTE, TALK_MS, VOTE_MS, dayVote, init, nightAct, quietNight, redactFor, rolesFor, settle, skipTalk, tick, voted, type MafiaState, type Role } from "./mafia";

const T0 = 1_000;
// Distinctive names, so a leak check on the JSON can't pass or fail by accident.
const FIVE = ["Zelda", "Xavier", "Quincy", "Wilma", "Yolanda"];
const NINE = [...FIVE, "Barnaby", "Cordelia", "Dexter", "Evangeline"];

/** A game with known roles: `mafia` and the rest are named, everyone else is a villager. */
function rig(players: string[], cast: { mafia: string[]; doctor?: string; detective?: string }, drinking = false): MafiaState {
  const s = init({ players, seed: 1, now: T0, drinking });
  const roles = Object.fromEntries(players.map((p): [string, Role] => [p, cast.mafia.includes(p) ? "mafia" : p === cast.doctor ? "doctor" : p === cast.detective ? "detective" : "villager"]));
  return { ...s, roles };
}
const firstNightOfFive = (drinking = false) => rig(FIVE, { mafia: ["Zelda"], doctor: "Xavier" }, drinking); // Quincy, Wilma, Yolanda are villagers
/** Past the quiet first night a table of five gets, which has its own tests. */
const five = (drinking = false): MafiaState => ({ ...firstNightOfFive(drinking), night: 2 });
const nine = () => rig(NINE, { mafia: ["Zelda", "Xavier"], doctor: "Quincy", detective: "Wilma" });

/** A whole night: villagers tap "ok", role holders use the given target, and it closes on the timer if anyone sat out. */
function night(s: MafiaState, picks: Record<string, string> = {}, now = T0): MafiaState {
  let out = s;
  for (const p of s.alive) if (out.phase === "night") out = nightAct(out, p, picks[p] ?? "ok", now);
  return out.phase === "night" ? closeNight(out) : out; // a role holder with no pick sits it out
}
const toTalk = (s: MafiaState) => tick({ ...s, phaseAt: 0 }, MORNING_MS);
const toVote = (s: MafiaState) => skipTalk(toTalk(s), s.players[0]!, T0);
function vote(s: MafiaState, votes: Record<string, string>, now = T0): MafiaState {
  let out = s;
  for (const [p, t] of Object.entries(votes)) out = dayVote(out, p, t, now);
  return out;
}
/** Closes the vote on the timer, so a partial set of votes still resolves. */
const closeVote = (s: MafiaState) => tick({ ...s, phaseAt: 0 }, VOTE_MS + 1);
/** Closes the night on the timer. */
const closeNight = (s: MafiaState) => tick({ ...s, phaseAt: 0 }, NIGHT_MS + 1);

describe("the deal", () => {
  it("deals the spec's role table", () => {
    expect(rolesFor(5)).toEqual({ mafia: 1, doctor: 1, detective: 0, villager: 3 });
    expect(rolesFor(6)).toEqual({ mafia: 1, doctor: 1, detective: 0, villager: 4 });
    expect(rolesFor(7)).toEqual({ mafia: 1, doctor: 1, detective: 1, villager: 4 });
    expect(rolesFor(8)).toEqual({ mafia: 1, doctor: 1, detective: 1, villager: 5 });
    expect(rolesFor(9)).toEqual({ mafia: 2, doctor: 1, detective: 1, villager: 5 });
    expect(rolesFor(12)).toEqual({ mafia: 2, doctor: 1, detective: 1, villager: 8 });
  });

  it("deals those counts to the actual players, from the seed alone, and keeps no seed in state", () => {
    const s = init({ players: NINE, seed: 42, now: T0 });
    const count = (r: Role) => Object.values(s.roles).filter((x) => x === r).length;
    expect({ mafia: count("mafia"), doctor: count("doctor"), detective: count("detective"), villager: count("villager") }).toEqual(rolesFor(9));
    expect(init({ players: NINE, seed: 42, now: T0 }).roles).toEqual(s.roles);
    const deals = new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(init({ players: NINE, seed, now: T0 }).roles)));
    expect(deals.size).toBeGreaterThan(1);
    expect(JSON.stringify(s)).not.toMatch(/seed/);
    expect(Object.keys(s.roles)).toEqual(NINE); // key order follows the seats, not the deal
  });

  it("starts on the first night with everyone alive and no drinks unless asked", () => {
    const s = init({ players: FIVE, seed: 3, now: T0 });
    expect(s).toMatchObject({ phase: "night", night: 1, alive: FIVE, phaseAt: T0, done: false, winner: null, morning: null });
    expect(s.drinks).toBeUndefined();
    expect(init({ players: FIVE, seed: 3, now: T0, drinking: true }).drinks).toBeDefined();
  });
});

describe("night", () => {
  it("ends when every living player has acted, and everyone must tap", () => {
    const s = five();
    let x = nightAct(s, "Zelda", "Wilma", T0);
    x = nightAct(x, "Xavier", "Quincy", T0);
    x = nightAct(x, "Quincy", "ok", T0);
    x = nightAct(x, "Wilma", "ok", T0);
    expect(x.phase).toBe("night");
    x = nightAct(x, "Yolanda", "ok", T0);
    expect(x.phase).toBe("morning");
    expect(x.morning).toEqual({ died: "Wilma" });
    expect(x.alive).not.toContain("Wilma");
    expect(x.eliminated).toEqual([{ name: "Wilma", role: "villager", by: "night" }]);
  });

  it("a doctor save stops the kill, and the same target can't be saved twice running", () => {
    const saved = night(five(), { Zelda: "Wilma", Xavier: "Wilma" });
    expect(saved.morning).toEqual({ died: null });
    expect(saved.alive).toContain("Wilma");
    expect(saved.lastSave).toBe("Wilma");
    const next = closeVote(toVote(saved));
    expect(next.phase).toBe("night");
    expect(nightAct(next, "Xavier", "Wilma", T0)).toBe(next);
    expect(nightAct(next, "Xavier", "Quincy", T0)).not.toBe(next);
  });

  it("a doctor who sat a night out may save the same player again, and may save themselves", () => {
    let s = night(five(), { Zelda: "Wilma", Xavier: "Wilma" });
    s = closeVote(toVote(s));
    s = closeNight(s);
    expect(s.lastSave).toBeNull();
    s = closeVote(toVote(s));
    expect(nightAct(s, "Xavier", "Wilma", T0)).not.toBe(s);
    expect(nightAct(s, "Xavier", "Xavier", T0).actions.save).toBe("Xavier");
  });

  it("the most recent mafia choice wins when two mafia differ", () => {
    let s = nine();
    s = nightAct(s, "Zelda", "Barnaby", T0);
    s = nightAct(s, "Xavier", "Cordelia", T0);
    expect(s.actions.kill).toBe("Cordelia");
    s = closeNight(s);
    expect(s.morning).toEqual({ died: "Cordelia" });
  });

  it("the detective learns only their own check result", () => {
    let s = nine();
    s = nightAct(s, "Wilma", "Zelda", T0);
    expect(s.checks.Wilma).toEqual([{ target: "Zelda", mafia: true }]);
    s = closeNight(s);
    s = closeVote(toVote(s));
    s = nightAct(s, "Wilma", "Barnaby", T0);
    expect(s.checks.Wilma).toEqual([{ target: "Zelda", mafia: true }, { target: "Barnaby", mafia: false }]);
    expect(redactFor(s, "Wilma").checks).toEqual({ Wilma: s.checks.Wilma });
    for (const p of NINE.filter((n) => n !== "Wilma")) expect(redactFor(s, p).checks).toEqual({});
  });

  it("copes with a seat named like an object built-in", () => {
    const names = ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "Barnaby", "Cordelia"];
    let s = rig(names, { mafia: ["toString"], doctor: "__proto__", detective: "constructor" });
    s = nightAct(s, "constructor", "toString", T0);
    expect(redactFor(s, "constructor").checks).toEqual({ constructor: [{ target: "toString", mafia: true }] });
    expect(redactFor(s, "valueOf").checks).toEqual({});
    s = night(s, { toString: "Barnaby" });
    s = skipTalk(toTalk(s), "valueOf", T0);
    s = dayVote(s, "valueOf", "skip", T0);
    expect(redactFor(s, "valueOf").votes).toEqual({ valueOf: "skip" });
    expect(redactFor(s, "hasOwnProperty").votes).toEqual({});
    expect(dayVote(s, "valueOf", "skip", T0)).toBe(s);
  });

  it("rejects dead players, dead targets, wrong-role actions and repeats", () => {
    const s = nine();
    expect(nightAct(s, "Nobody", "ok", T0)).toBe(s);
    expect(nightAct(s, "Barnaby", "Zelda", T0)).toBe(s); // a villager only taps
    expect(nightAct(s, "Zelda", "ok", T0)).toBe(s); // a mafia must name someone
    expect(nightAct(s, "Quincy", "ok", T0)).toBe(s);
    expect(nightAct(s, "Wilma", "ok", T0)).toBe(s);
    expect(nightAct(s, "Zelda", "Xavier", T0)).toBe(s); // not your own partner
    expect(nightAct(s, "Zelda", "Zelda", T0)).toBe(s);
    expect(nightAct(s, "Wilma", "Wilma", T0)).toBe(s); // nothing to learn from checking yourself
    expect(nightAct(s, "Zelda", "Stranger", T0)).toBe(s);
    expect(nightAct(s, "Quincy", "constructor", T0)).toBe(s);
    expect(nightAct(s, "Zelda", 7 as unknown as string, T0)).toBe(s);

    const once = nightAct(s, "Zelda", "Barnaby", T0);
    expect(nightAct(once, "Zelda", "Cordelia", T0)).toBe(once); // repeat
    expect(nightAct(s, "Zelda", "Barnaby", T0 + NIGHT_MS + 1)).toBe(s); // too late

    const dawn = closeNight(once);
    const later = closeVote(toVote(dawn));
    expect(nightAct(dawn, "Cordelia", "ok", T0)).toBe(dawn); // not night
    expect(nightAct(later, "Barnaby", "ok", T0)).toBe(later); // dead player
    expect(nightAct(later, "Zelda", "Barnaby", T0)).toBe(later); // dead target
    expect(nightAct(later, "Quincy", "Barnaby", T0)).toBe(later);
    const day = toVote(dawn);
    expect(dayVote(day, "Barnaby", "skip", T0)).toBe(day); // the dead don't vote
  });

  it("a timed-out night skips the missing action, and the game never stalls", () => {
    const s = five();
    expect(tick(s, T0 + NIGHT_MS)).toBe(s); // exactly on the clock still counts as open
    const x = tick(nightAct(s, "Xavier", "Quincy", T0), T0 + NIGHT_MS + 1);
    expect(x.phase).toBe("morning");
    expect(x.morning).toEqual({ died: null });
    expect(x.alive).toEqual(FIVE);
  });

  it("walks night, morning, talk, vote and back with nobody touching a thing", () => {
    let s = five();
    let now = T0;
    const step = (ms: number, want: MafiaState["phase"]) => {
      now += ms;
      s = tick(s, now);
      expect(s.phase).toBe(want);
    };
    step(NIGHT_MS + 1, "morning");
    expect(s.night).toBe(2);
    step(MORNING_MS - 1, "morning");
    step(1, "talk");
    step(TALK_MS - 1, "talk");
    step(1, "vote");
    step(VOTE_MS + 1, "night");
    expect(s.night).toBe(3);
    expect(s.morning).toBeNull();
    expect(s.actions).toEqual({ kill: null, save: null, check: null, done: [] });
  });
});

describe("day", () => {
  it("only the talk phase can be skipped", () => {
    const s = toTalk(night(five()));
    expect(s.phase).toBe("talk");
    expect(skipTalk(s, "Nobody", T0)).toBe(s);
    const v = skipTalk(s, "Quincy", T0 + 5);
    expect(v).toMatchObject({ phase: "vote", phaseAt: T0 + 5, votes: {} });
    expect(skipTalk(v, "Quincy", T0)).toBe(v);
    expect(skipTalk(five(), "Quincy", T0)).toEqual(five());
  });

  it("majority of votes cast eliminates, otherwise nobody", () => {
    const day = toVote(night(five()));
    // 2 of 3 cast is a majority even though two players stayed silent.
    const out = closeVote(vote(day, { Quincy: "Wilma", Xavier: "Wilma", Yolanda: "skip" }));
    expect(out.alive).not.toContain("Wilma");
    expect(out.eliminated).toEqual([{ name: "Wilma", role: "villager", by: "vote" }]);
    // A tie: nobody.
    const tie = closeVote(vote(day, { Quincy: "Wilma", Xavier: "Yolanda" }));
    expect(tie.alive).toEqual(FIVE);
    // Half is not a majority: skips count as votes cast.
    const skips = closeVote(vote(day, { Quincy: "Wilma", Xavier: "Wilma", Yolanda: "skip", Zelda: "skip" }));
    expect(skips.alive).toEqual(FIVE);
    expect(skips.eliminated).toEqual([]);
    // Most votes, but short of a majority.
    const plural = closeVote(vote(day, { Quincy: "Wilma", Xavier: "Wilma", Yolanda: "Quincy", Zelda: "skip", Wilma: "Xavier" }));
    expect(plural.alive).toEqual(FIVE);
    // Nobody votes.
    expect(closeVote(day).alive).toEqual(FIVE);
  });

  it("the vote closes once every living player has voted, and rejects bad votes", () => {
    const day = toVote(night(five(), { Zelda: "Wilma" }));
    expect(day.alive).not.toContain("Wilma");
    expect(dayVote(day, "Wilma", "skip", T0)).toBe(day); // dead voter
    expect(dayVote(day, "Quincy", "Wilma", T0)).toBe(day); // dead target
    expect(dayVote(day, "Quincy", "Stranger", T0)).toBe(day);
    expect(dayVote(day, "Nobody", "skip", T0)).toBe(day);
    expect(dayVote(day, "Quincy", "skip", T0 + VOTE_MS + 1)).toBe(day);
    const once = dayVote(day, "Quincy", "skip", T0);
    expect(dayVote(once, "Quincy", "Xavier", T0)).toBe(once); // repeat
    const all = vote(day, { Zelda: "skip", Xavier: "skip", Quincy: "skip", Yolanda: "skip" });
    expect(all.phase).toBe("night");
    expect(all.night).toBe(3);
    expect(dayVote(all, "Xavier", "skip", T0)).toBe(all); // not the day
  });
});

describe("winning", () => {
  it("village wins with no mafia left; mafia win at parity", () => {
    const caught = closeVote(vote(toVote(night(five())), { Xavier: "Zelda", Quincy: "Zelda", Wilma: "Zelda" }));
    expect(caught).toMatchObject({ done: true, winner: "village" });
    expect(caught.points).toEqual({ Zelda: 0, Xavier: 1, Quincy: 1, Wilma: 1, Yolanda: 1 });

    let s = night(five(), { Zelda: "Wilma" }); // 4 alive
    s = closeVote(vote(toVote(s), { Zelda: "Quincy", Xavier: "Quincy", Yolanda: "Quincy" })); // 3 alive, not parity yet
    expect(s).toMatchObject({ done: false, phase: "night", night: 3 });
    s = night(s, { Zelda: "Yolanda", Xavier: "Xavier" }); // 2 alive: 1 mafia, 1 other
    expect(s).toMatchObject({ done: true, winner: "mafia" });
    expect(s.morning).toEqual({ died: "Yolanda" });
    expect(s.points).toEqual({ Zelda: 1, Xavier: 0, Quincy: 0, Wilma: 0, Yolanda: 0 });
  });

  it("two mafia need two others left, and both must go for the village", () => {
    let s = nine();
    s = { ...s, alive: ["Zelda", "Xavier", "Barnaby", "Cordelia", "Dexter"] };
    s = tick({ ...nightAct(s, "Zelda", "Barnaby", T0), phaseAt: 0 }, NIGHT_MS + 1); // 2 mafia, 2 others
    expect(s).toMatchObject({ done: true, winner: "mafia" });

    let v = { ...nine(), alive: ["Zelda", "Xavier", "Barnaby", "Cordelia", "Dexter", "Evangeline"] };
    v = closeVote(vote(toVote(closeNight(v)), { Barnaby: "Zelda", Cordelia: "Zelda", Dexter: "Zelda", Evangeline: "Zelda" }));
    expect(v).toMatchObject({ done: false, winner: null }); // one mafia down, one still out there
    v = closeVote(vote(toVote(closeNight(v)), { Barnaby: "Xavier", Cordelia: "Xavier", Dexter: "Xavier", Evangeline: "Xavier" }));
    expect(v).toMatchObject({ done: true, winner: "village" });
  });

  it("a 5-player game can't end before the second night's kill, or with the mafia ahead before the second vote", () => {
    // 1 mafia: a quiet first night and a bad vote leave 4 alive, and the next kill leaves 3, which is not parity.
    let s = night(firstNightOfFive(), { Zelda: "Wilma" });
    expect(s).toMatchObject({ alive: FIVE, done: false, winner: null });
    s = closeVote(vote(toVote(s), { Zelda: "Xavier", Quincy: "Xavier", Yolanda: "Xavier" }));
    expect(s).toMatchObject({ phase: "night", night: 2, done: false, winner: null });
    expect(s.alive).toHaveLength(4);
    s = night(s, { Zelda: "Wilma" });
    expect(s).toMatchObject({ phase: "morning", done: false, winner: null });
    expect(s.alive).toHaveLength(3);
  });
});

describe("the quiet first night at a table of five", () => {
  it("everyone still taps and it closes the same way, but nobody dies and no save is remembered", () => {
    const s = night(firstNightOfFive(), { Zelda: "Wilma", Xavier: "Quincy" });
    expect(s).toMatchObject({ phase: "morning", alive: FIVE, morning: { died: null }, lastSave: null, eliminated: [], done: false });
    expect(s.actions).toEqual({ kill: null, save: null, check: null, done: [] });
  });

  it("gives no drink card, and the doctor may pick the same name on night 2", () => {
    const s = night(firstNightOfFive(true), { Zelda: "Wilma", Xavier: "Quincy" });
    expect(s.drinks!.calls).toEqual([]);
    const day = vote(toVote(s), Object.fromEntries(FIVE.map((p) => [p, SKIP_VOTE])));
    expect(day).toMatchObject({ phase: "night", night: 2 });
    expect(nightAct(day, "Xavier", "Quincy", T0).actions.done).toEqual(["Xavier"]);
  });

  it("gives the village two votes before the mafia can win, and the second night counts", () => {
    let s = night(firstNightOfFive(), { Zelda: "Wilma", Xavier: "Quincy" });
    s = vote(toVote(s), { Zelda: "Yolanda", Xavier: "Yolanda", Quincy: "Yolanda", Wilma: "Yolanda", Yolanda: SKIP_VOTE });
    expect(s).toMatchObject({ done: false, night: 2, alive: ["Zelda", "Xavier", "Quincy", "Wilma"] });
    s = night(s, { Zelda: "Wilma", Xavier: "Quincy" });
    expect(s).toMatchObject({ morning: { died: "Wilma" }, done: false, alive: ["Zelda", "Xavier", "Quincy"] });
    expect(vote(toVote(s), { Zelda: "Quincy", Xavier: "Quincy", Quincy: SKIP_VOTE })).toMatchObject({ done: true, winner: "mafia" });
  });

  it("applies to five seats only: six and up can lose someone on the first night", () => {
    expect(quietNight({ players: FIVE, night: 1 })).toBe(true);
    expect(quietNight({ players: FIVE, night: 2 })).toBe(false);
    expect(quietNight({ players: [...FIVE, "Barnaby"], night: 1 })).toBe(false);
    const six = rig([...FIVE, "Barnaby"], { mafia: ["Zelda"], doctor: "Xavier" });
    expect(night(six, { Zelda: "Wilma", Xavier: "Quincy" }).morning).toEqual({ died: "Wilma" });
  });

  it("a table that started with six and lost a seat is not a table of five", () => {
    const six = rig([...FIVE, "Barnaby"], { mafia: ["Zelda"], doctor: "Xavier" });
    const lostOne: MafiaState = { ...six, alive: FIVE };
    expect(quietNight(lostOne)).toBe(false);
  });
});

describe("the public record", () => {
  it("names who the vote put out, or nobody, so a screen need not guess from the last elimination", () => {
    expect(voted({ A: "B", B: "B", C: "B", D: SKIP_VOTE })).toBe("B");
    expect(voted({ A: "B", B: "C" })).toBeNull();
    expect(voted({ A: SKIP_VOTE, B: SKIP_VOTE })).toBeNull();
    expect(voted({})).toBeNull();
  });

  it("keeps the game's start, which is public and stays put through every phase", () => {
    const s = firstNightOfFive();
    expect(s.startedAt).toBe(T0);
    expect(redactFor(night(s, { Zelda: "Wilma", Xavier: "Quincy" }, T0 + 5), "Quincy").startedAt).toBe(T0);
  });
});

describe("players who leave", () => {
  it("closes the night once everyone still here has acted, without waiting for someone who left", () => {
    let s = five();
    for (const p of ["Xavier", "Quincy", "Wilma", "Yolanda"]) s = nightAct(s, p, p === "Xavier" ? "Quincy" : "ok", T0);
    expect(s.phase).toBe("night");
    expect(settle(s, [], T0)).toBe(s);
    const x = settle(s, ["Zelda"], T0 + 9);
    expect(x).toMatchObject({ phase: "morning", phaseAt: T0 + 9, morning: { died: null } });
  });

  it("closes the vote the same way, and leaves other phases to their clocks", () => {
    let s = toVote(night(five()));
    for (const p of ["Xavier", "Quincy", "Wilma"]) s = dayVote(s, p, "skip", T0);
    expect(settle(s, ["Yolanda"], T0)).toBe(s);
    expect(settle(s, ["Yolanda", "Zelda"], T0).phase).toBe("night");
    const talk = toTalk(night(five()));
    expect(settle(talk, ["Yolanda"], T0)).toBe(talk);
  });

  it("a mafia player who left still counts as alive: the village must still vote them out, and can", () => {
    let s = five();
    for (const p of ["Xavier", "Quincy", "Wilma", "Yolanda"]) s = nightAct(s, p, p === "Xavier" ? "Xavier" : "ok", T0);
    s = settle(s, ["Zelda"], T0);
    expect(s).toMatchObject({ done: false, winner: null });
    expect(s.alive).toContain("Zelda");
    s = toVote(s);
    for (const p of ["Xavier", "Quincy", "Wilma", "Yolanda"]) s = dayVote(s, p, "Zelda", T0);
    s = settle(s, ["Zelda"], T0);
    expect(s).toMatchObject({ done: true, winner: "village" });
  });

  it("a mafia player who left still counts towards parity", () => {
    let s = night(five(), { Zelda: "Wilma" });
    s = closeVote(vote(toVote(s), { Xavier: "Quincy", Yolanda: "Quincy" }));
    expect(s.alive).toEqual(["Zelda", "Xavier", "Yolanda"]);
    s = settle(closeNight(s), ["Zelda"], T0); // no kill while they're gone: 1 against 2 is not parity
    expect(s.done).toBe(false);
    s = closeVote(vote(toVote(s), { Xavier: "Yolanda", Yolanda: "Yolanda" }));
    expect(s).toMatchObject({ done: true, winner: "mafia" });
  });

  it("ends with no winner when nobody alive is still at the table, in any phase", () => {
    const gone = FIVE.slice(1);
    for (const s of [five(), night(five()), toTalk(night(five())), toVote(night(five()))]) {
      const x = settle(s, FIVE, T0);
      expect(x).toMatchObject({ done: true, winner: null });
      expect(Object.values(x.points).every((n) => n === 0)).toBe(true);
    }
    const dead = night(five(), { Zelda: "Wilma" }); // Wilma is out and still watching
    expect(settle(dead, FIVE.filter((p) => p !== "Wilma"), T0)).toMatchObject({ done: true, winner: null });
    expect(settle(five(), gone, T0).done).toBe(false);
  });

  it("ends with no winner when a whole table goes quiet, so a room can't loop for ever", () => {
    let s = five();
    let now = T0;
    let closes = 0;
    for (let guard = 0; guard < 100 && !s.done; guard++) {
      now += TALK_MS + NIGHT_MS;
      const was = s.phase;
      s = tick(s, now);
      if (was === "night" || was === "vote") closes++;
    }
    expect(s).toMatchObject({ done: true, winner: null });
    expect(closes).toBe(IDLE_LIMIT);
  });

  it("a single tap or vote keeps the game alive", () => {
    let s = five();
    let now = T0;
    for (let guard = 0; guard < 40; guard++) {
      if (s.phase === "night") s = nightAct(s, "Quincy", "ok", now);
      now += TALK_MS + NIGHT_MS;
      s = tick(s, now);
    }
    expect(s.done).toBe(false);
  });
});

describe("what each seat sees", () => {
  const seen = (s: MafiaState, me: string | null) => JSON.stringify(redactFor(s, me));

  it("redacts roles: villager sees only self; mafia see partner; dead players see all", () => {
    const s = nine();
    expect(redactFor(s, "Barnaby").roles).toEqual({ Barnaby: "villager" });
    expect(redactFor(s, "Quincy").roles).toEqual({ Quincy: "doctor" });
    expect(redactFor(s, "Wilma").roles).toEqual({ Wilma: "detective" });
    expect(redactFor(s, "Zelda").roles).toEqual({ Zelda: "mafia", Xavier: "mafia" });
    expect(redactFor(s, "Xavier").roles).toEqual({ Xavier: "mafia", Zelda: "mafia" });
    expect(redactFor(s, null).roles).toEqual({});
    expect(redactFor(s, "Nobody").roles).toEqual({});
    const killed = night(s, { Zelda: "Barnaby", Xavier: "Barnaby", Quincy: "Cordelia", Wilma: "Dexter" });
    expect(redactFor(killed, "Barnaby").roles).toEqual(s.roles);
    expect(redactFor(killed, "Cordelia").roles).toEqual({ Cordelia: "villager" });
  });

  it("a mafia player who dies still sees all; their living partner keeps seeing them", () => {
    let s = nine();
    s = closeVote(vote(toVote(closeNight(s)), { Barnaby: "Zelda", Cordelia: "Zelda", Dexter: "Zelda" }));
    expect(s.alive).not.toContain("Zelda");
    expect(redactFor(s, "Zelda").roles).toEqual(s.roles);
    expect(redactFor(s, "Xavier").roles).toEqual({ Xavier: "mafia", Zelda: "mafia" });
  });

  it("never exposes night choices in another seat's snapshot", () => {
    // Quincy the doctor saves Evangeline, the mafia pick Dexter, Wilma the detective checks Cordelia.
    let s = nine();
    s = nightAct(s, "Zelda", "Dexter", T0);
    s = nightAct(s, "Quincy", "Evangeline", T0);
    s = nightAct(s, "Wilma", "Cordelia", T0);
    const blank = { kill: null, save: null, check: null };

    const villager = redactFor(s, "Barnaby");
    expect(villager.actions).toEqual({ ...blank, done: [] });
    expect(villager.actedCount).toBe(3);
    const asVillager = nightAct(s, "Barnaby", "ok", T0);
    expect(redactFor(asVillager, "Barnaby").actions.done).toEqual(["Barnaby"]);
    expect(redactFor(asVillager, "Barnaby").actedCount).toBe(4);

    // Each role sees only its own field, and "done" never names anyone outside the viewer's own side.
    expect(redactFor(s, "Quincy").actions).toEqual({ ...blank, save: "Evangeline", done: ["Quincy"] });
    expect(redactFor(s, "Wilma").actions).toEqual({ ...blank, check: "Cordelia", done: ["Wilma"] });
    expect(redactFor(s, "Zelda").actions).toEqual({ ...blank, kill: "Dexter", done: ["Zelda"] });
    expect(redactFor(s, "Xavier").actions).toEqual({ ...blank, kill: "Dexter", done: ["Zelda"] }); // sees a partner's choice, and that it was theirs
    expect(redactFor(s, null).actions).toEqual({ ...blank, done: [] });

    // No distinctive name reached anyone who shouldn't have it, beyond the public player and alive lists.
    const chosen = (me: string | null) => { const v = redactFor(s, me); return JSON.stringify({ a: v.actions, c: v.checks, l: v.lastSave, m: v.morning, r: v.roles }); };
    for (const name of ["Dexter", "Evangeline", "Cordelia"]) expect(chosen("Barnaby")).not.toContain(name);
    expect(chosen("Quincy")).not.toContain("Dexter");
    expect(chosen("Quincy")).not.toContain("Cordelia");
    expect(chosen("Zelda")).not.toContain("Evangeline");
    expect(chosen("Zelda")).not.toContain("Cordelia");
    expect(chosen("Wilma")).not.toContain("Dexter");
    expect(chosen("Wilma")).not.toContain("Evangeline");
    // The raw done list carries who acted in what order, which must not survive redaction for a villager.
    expect(seen(s, "Barnaby")).not.toMatch(/"done":\[[^\]]/);
  });

  it("dead players see roles but not tonight's choices, others' checks, votes in progress or the last save", () => {
    let s = night(nine(), { Zelda: "Barnaby", Xavier: "Barnaby", Quincy: "Cordelia", Wilma: "Dexter" });
    expect(s.alive).not.toContain("Barnaby");
    s = toVote(s);
    s = dayVote(s, "Cordelia", "Dexter", T0);
    let ghost = redactFor(s, "Barnaby");
    expect(ghost.votes).toEqual({});
    expect(ghost.voteCount).toBe(1);
    s = closeVote(s);
    s = nightAct(s, "Zelda", "Evangeline", T0);
    s = nightAct(s, "Wilma", "Zelda", T0);
    ghost = redactFor(s, "Barnaby");
    expect(ghost.actions).toEqual({ kill: null, save: null, check: null, done: [] });
    expect(ghost.checks).toEqual({});
    expect(ghost.lastSave).toBeNull();
    expect(ghost.actedCount).toBe(2);
    expect(ghost.roles).toEqual(s.roles);
  });

  it("a dead mafia player no longer sees the partner's choice", () => {
    let s = nine();
    s = closeVote(vote(toVote(closeNight(s)), { Barnaby: "Zelda", Cordelia: "Zelda", Dexter: "Zelda" }));
    s = nightAct(s, "Xavier", "Dexter", T0);
    expect(redactFor(s, "Zelda").actions.kill).toBeNull();
    expect(redactFor(s, "Zelda").actions.done).toEqual([]);
  });

  it("only the doctor sees the last save, and a morning never says a save happened", () => {
    const s = night(five(), { Zelda: "Wilma", Xavier: "Wilma" });
    expect(redactFor(s, "Xavier").lastSave).toBe("Wilma");
    for (const p of ["Zelda", "Quincy", "Wilma", "Yolanda"]) expect(redactFor(s, p).lastSave).toBeNull();
    expect(redactFor(s, "Quincy").morning).toEqual({ died: null });
    const quiet = closeNight(five()); // no kill at all reads exactly the same
    expect(redactFor(quiet, "Quincy").morning).toEqual(redactFor(s, "Quincy").morning);
    expect(seen(s, "Quincy")).not.toContain('"save":"');
    expect(seen(s, "Zelda")).not.toContain('"lastSave":"');
  });

  it("votes stay secret during the vote and open up once it closes", () => {
    let s = toVote(night(five()));
    s = dayVote(s, "Quincy", "Wilma", T0);
    s = dayVote(s, "Xavier", "Yolanda", T0);
    const mine = redactFor(s, "Quincy");
    expect(mine.votes).toEqual({ Quincy: "Wilma" });
    expect(mine.voteCount).toBe(2);
    const other = redactFor(s, "Zelda"); // mafia get no special view of the vote
    expect(other.votes).toEqual({});
    expect(other.voteCount).toBe(2);
    expect(redactFor(s, null).votes).toEqual({});
    const after = closeVote(s);
    expect(after.phase).toBe("night");
    expect(redactFor(after, "Zelda").votes).toEqual({ Quincy: "Wilma", Xavier: "Yolanda" });
  });

  it("a vote-out's role is revealed to all; a night kill's role only to the dead and at the end", () => {
    let s = night(five(), { Zelda: "Xavier" }); // the doctor dies in the night
    expect(s.eliminated[0]).toEqual({ name: "Xavier", role: "doctor", by: "night" });
    for (const p of ["Zelda", "Quincy", "Wilma", "Yolanda"]) expect(redactFor(s, p).eliminated).toEqual([{ name: "Xavier", role: null, by: "night" }]);
    expect(redactFor(s, "Xavier").eliminated).toEqual([{ name: "Xavier", role: "doctor", by: "night" }]);
    expect(seen(s, "Quincy")).not.toContain("doctor");
    s = closeVote(vote(toVote(s), { Zelda: "Wilma", Quincy: "Wilma", Yolanda: "Wilma" }));
    const v = redactFor(s, "Quincy").eliminated;
    expect(v).toEqual([{ name: "Xavier", role: null, by: "night" }, { name: "Wilma", role: "villager", by: "vote" }]);
  });

  it("a living seat's whole view has no other role or seed, in every phase, for every role", () => {
    const base = nine();
    const atNight = nightAct(nightAct(base, "Zelda", "Barnaby", T0), "Quincy", "Evangeline", T0);
    const dawn = closeNight(atNight);
    const talk = toTalk(dawn);
    const voting = dayVote(skipTalk(talk, "Quincy", T0), "Cordelia", "Dexter", T0);
    for (const s of [base, atNight, dawn, talk, voting]) {
      for (const me of NINE.filter((p) => s.alive.includes(p))) {
        const json = seen(s, me);
        expect(json).not.toMatch(/seed/);
        const mine = s.roles[me];
        for (const r of ["mafia", "doctor", "detective"]) if (r !== mine) expect(json).not.toContain(`"${r}"`);
      }
    }
  });

  it("everything opens once the game is done", () => {
    const s = closeVote(vote(toVote(night(five(), { Zelda: "Wilma" })), { Xavier: "Zelda", Quincy: "Zelda", Yolanda: "Zelda" }));
    expect(s.done).toBe(true);
    const v = redactFor(s, "Quincy");
    expect(v.roles).toEqual(s.roles);
    expect(v.eliminated).toEqual(s.eliminated);
    expect(v.votes).toEqual(s.votes);
    expect(v.checks).toEqual(s.checks);
  });
});

describe("drinking", () => {
  it("drinking: killed 1 sip, voted out an innocent 1 sip, final group toast", () => {
    let s = night(five(true), { Zelda: "Wilma" });
    expect(s.drinks!.calls).toEqual([{ to: "Wilma", sips: 1, reason: expect.any(String) }]);
    expect(s.drinks!.totals.Wilma).toBe(1);

    s = closeVote(vote(toVote(s), { Zelda: "Quincy", Xavier: "Quincy", Yolanda: "skip" }));
    expect(s.drinks!.calls.map((c) => [c.to, c.sips])).toEqual([["Zelda", 1], ["Xavier", 1]]);

    s = night(s, { Zelda: "Yolanda", Xavier: "Xavier" });
    expect(s.winner).toBe("mafia");
    expect(s.drinks!.calls.map((c) => [c.to, c.sips])).toEqual([["Yolanda", 1], ["all", 1]]);
    expect(s.drinks!.totals).toEqual({ Zelda: 2, Xavier: 2, Quincy: 1, Wilma: 2, Yolanda: 2 });
  });

  it("voting out the mafia costs nobody, a save costs nobody, and old cards don't linger", () => {
    const saved = night(five(true), { Zelda: "Wilma", Xavier: "Wilma" });
    expect(saved.drinks!.calls).toEqual([]);
    expect(saved.drinks!.seq).toBe(1); // a quiet night and a saved one look the same
    expect(closeNight(five(true)).drinks!.seq).toBe(1);
    const killed = night(five(true), { Zelda: "Wilma" });
    const next = closeVote(toVote(killed));
    expect(next.drinks!.calls).toEqual([]);
    const caught = closeVote(vote(toVote(night(five(true))), { Xavier: "Zelda", Quincy: "Zelda", Wilma: "Zelda" }));
    expect(caught.drinks!.calls.map((c) => [c.to, c.sips])).toEqual([["all", 1]]);
  });

  it("a quiet table's ending still gets its toast, and no game goes past the caps", () => {
    const left = settle(five(true), FIVE, T0);
    expect(left.drinks!.calls.map((c) => c.to)).toEqual(["all"]);
    let s = five(true);
    s = { ...s, drinks: { ...s.drinks!, totals: { ...s.drinks!.totals, Wilma: 10 } } };
    s = night(s, { Zelda: "Wilma" });
    expect(s.drinks!.totals.Wilma).toBe(10);
    expect(s.drinks!.calls).toEqual([]);
  });
});
