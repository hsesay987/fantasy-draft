import { describe, expect, it } from "vitest";
import { init } from "../formats/vowelplay";

const o = { players: ["A", "B"], topic: "superheroes", mode: "first" as const, answer: "type" as const, count: 5, seed: 1, now: 0 };

describe("the engine's word source", () => {
  it("won't deal words until the word list is loaded, and does once it is", async () => {
    expect(() => init(o)).toThrow(/word list not loaded/);
    await import("./vowelWords");
    expect(init(o).words).toHaveLength(5);
  });
});
