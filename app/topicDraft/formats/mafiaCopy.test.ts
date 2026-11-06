import { describe, expect, it } from "vitest";
import { LINES, NIGHT_PROMPT, QUIET_NIGHT_NOTE, ROLE_HOW, ROLE_IN_LINE, ROLE_LABEL, lineFor, type LineKey } from "./mafiaCopy";

const KEYS = Object.keys(LINES) as LineKey[];

describe("Mafia narrator", () => {
  it("has at least 3 different lines for every phase and outcome", () => {
    for (const k of ["night", "nightQuiet", "morningGone", "morningQuiet", "talk", "vote", "voteOutMafia", "voteOutInnocent", "voteNobody", "villageWins", "mafiaWins", "nobodyWins", "spectator"] as LineKey[]) {
      expect(LINES[k].length, k).toBeGreaterThanOrEqual(3);
      expect(new Set(LINES[k]).size, k).toBe(LINES[k].length);
    }
  });

  it("stays light: no gore in any line", () => {
    const all = [...KEYS.flatMap((k) => [...LINES[k]]), ...Object.values(ROLE_HOW), NIGHT_PROMPT].join(" ");
    expect(all).not.toMatch(/\b(blood\w*|bleed\w*|gore|guts?|corpses?|bod(y|ies)|murder\w*|stab\w*|shot|shoot\w*|guns?|knife|knives|kill\w*|dead|dies?|died|death|strangl\w*|choke\w*)\b/i);
  });

  it("a morning says who is gone or that nobody is, and never why", () => {
    const morning = [...LINES.morningGone, ...LINES.morningQuiet].join(" ");
    expect(morning).not.toMatch(/doctor|detective|mafia|sav(e|ed|es)\b|protect|rescue|luck|close call|\bmiss(ed)?\b|target|attempt|tried|failed|\bsafe/i);
    for (const l of LINES.morningGone) expect(l).toContain("{name}");
    for (const l of LINES.morningQuiet) expect(l).not.toContain("{name}");
    for (const l of LINES.morningGone) expect(l, "a night's role stays hidden").not.toContain("{role}");
  });

  it("names no role at night, and the prompt is one line for everyone", () => {
    expect([...LINES.night, ...LINES.nightQuiet, NIGHT_PROMPT].join(" ")).not.toMatch(/doctor|detective|villager|mafia/i);
  });

  it("a vote-out line gives the name and the role; no-majority names nobody", () => {
    for (const k of ["voteOutMafia", "voteOutInnocent"] as const) for (const l of LINES[k]) { expect(l).toContain("{name}"); expect(l).toContain("{role}"); }
    for (const l of LINES.voteNobody) expect(l).not.toMatch(/\{/);
  });

  it("lineFor fills the name and role, is stable, and walks through the lines", () => {
    expect(lineFor("voteOutInnocent", 0, { name: "Ann", role: ROLE_IN_LINE.doctor })).toBe("The town put Ann on the last bus. Awkward: Ann was the Doctor.");
    expect(lineFor("night", 5)).toBe(lineFor("night", 5));
    expect(new Set([0, 1, 2].map((t) => lineFor("talk", t))).size).toBe(3);
    expect(lineFor("talk", -1)).toBe(LINES.talk[2]);
    expect(lineFor("morningGone", 1, { name: "$& {role}" })).toContain("$& {role}"); // a name is only ever a name
  });

  it("each card explains the names it can't pick, as a wrong tap says nothing on screen", () => {
    expect(ROLE_HOW.mafia).toMatch(/not yourself or a partner/i);
    expect(ROLE_HOW.doctor).toMatch(/not the same name two nights running/i);
    expect(ROLE_HOW.detective).toMatch(/anyone but yourself/i);
    expect(QUIET_NIGHT_NOTE).toMatch(/nobody leaves tonight/i);
  });

  it("has a label, a phrase and a how-to for every role", () => {
    for (const m of [ROLE_LABEL, ROLE_IN_LINE, ROLE_HOW]) expect(Object.keys(m).sort()).toEqual(["detective", "doctor", "mafia", "villager"]);
  });
});
