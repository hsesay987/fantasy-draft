import { describe, expect, it } from "vitest";
import { MIX_ALL, togglePool } from "./poolToggle";

const all = ["a", "b", "c"];

describe("togglePool", () => {
  it("adds a topic after the others", () => expect(togglePool(["b"], "a", all)).toEqual(["b", "a"]));
  it("removes a selected topic", () => expect(togglePool(["b", "a"], "b", all)).toEqual(["a"]));
  it("refuses to remove the last one", () => expect(togglePool(["b"], "b", all)).toEqual(["b"]));
  it("Mix all selects every id in list order", () => expect(togglePool(["c"], MIX_ALL, all)).toEqual(["a", "b", "c"]));
  it("ignores an id that is not an option", () => expect(togglePool(["a"], "zzz", all)).toEqual(["a"]));
});
