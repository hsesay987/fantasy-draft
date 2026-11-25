import { describe, expect, it } from "vitest";
import * as FD from "./feud";
import type { Survey } from "../trivia/types";

const survey = { id: "s1", q: "Name a Dragon Ball character", answers: ["Goku", "Vegeta", "Krillin", "Piccolo", "Bulma"], decoys: ["Naruto"] } as Survey;
const s0 = FD.init({ players: ["A", "B"], surveys: [survey], rounds: 1, seed: 1 });

describe("feud spelling help", () => {
  it("still takes the typos it always took, like krillion", () => {
    expect(FD.matchAnswer("krillion", s0.rounds[0]!.board)).toBe("Krillin");
    expect(FD.nearMiss(s0, "A", "krillion")).toBe(null);
  });

  it("refuses a near miss with no strike and no lost turn, and suggests the answer", () => {
    expect(FD.nearMiss(s0, "A", "guku")).toBe("Goku");
    const s = FD.choose(s0, "A", "guku");
    const r = s.rounds[0]!;
    expect(r.strikes).toBe(0);
    expect(r.wrong).toEqual([]);
    expect(FD.turnPlayer(s)).toBe("A");
    expect(r.hinted).toEqual(["A"]);
  });

  it("then takes the suggestion as a normal answer", () => {
    const s = FD.choose(FD.choose(s0, "A", "guku"), "A", "Goku");
    expect(s.rounds[0]!.found.Goku).toBe("A");
  });

  it("gives each player one suggestion a round: a second near miss is an ordinary strike", () => {
    const s = FD.choose(s0, "A", "guku");
    expect(FD.nearMiss(s, "A", "guku")).toBe(null);
    const s2 = FD.choose(s, "A", "blma");
    expect(s2.rounds[0]!.strikes).toBe(1);
    expect(s2.rounds[0]!.wrong).toEqual(["blma"]);
    expect(FD.nearMiss(s2, "B", "blma")).toBe("Bulma"); // B has had no help yet
  });

  it("ignores answers already found, other players' turns and far-off text", () => {
    expect(FD.nearMiss(s0, "B", "guku")).toBe(null);
    expect(FD.nearMiss(s0, "A", "frieza")).toBe(null);
    const found = FD.choose(s0, "A", "Goku");
    expect(FD.nearMiss(found, "B", "guku")).toBe(null);
  });
});
