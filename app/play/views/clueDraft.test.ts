import { describe, expect, it } from "vitest";
import { clueDraft, clueToSend } from "./clueDraft";

/** Types `keys` one at a time, the way a keyboard does. */
const type = (keys: string) => {
  let value = "";
  let warn = false;
  for (const k of keys) ({ value, warn } = clueDraft(value, value + k));
  return { value, warn };
};

describe("clueDraft", () => {
  it("keeps a typed space, then refuses the second word without joining", () => {
    expect(clueDraft("", "a")).toEqual({ value: "a", warn: false });
    expect(clueDraft("a", "a ")).toEqual({ value: "a ", warn: false });
    expect(clueDraft("a ", "a b")).toEqual({ value: "a", warn: true });
    expect(type("a b")).toEqual({ value: "a", warn: true });
  });

  it("allows a lone trailing or leading space and trims it on send", () => {
    expect(type("a ")).toEqual({ value: "a ", warn: false });
    expect(clueToSend("a ")).toBe("a");
    expect(clueDraft("", " a")).toEqual({ value: " a", warn: false });
    expect(clueToSend(" a")).toBe("a");
  });

  it("keeps the first word of pasted text and warns", () => {
    expect(clueDraft("", "two words")).toEqual({ value: "two", warn: true });
    expect(clueDraft("", "  two   words here ")).toEqual({ value: "two", warn: true });
  });

  it("refuses a space typed inside a word without cutting the word", () => {
    expect(clueDraft("camera", "cam era")).toEqual({ value: "camera", warn: true });
  });

  it("handles an empty field and one of only spaces", () => {
    expect(clueDraft("a", "")).toEqual({ value: "", warn: false });
    expect(clueDraft("", "   ")).toEqual({ value: "   ", warn: false });
    expect(clueToSend("   ")).toBe("");
  });
});
