import { describe, expect, it } from "vitest"
import { GUESS_MAX, JUDGE_MS, REVEAL_MS, SPEAK_MS, WORD_MS, checkClue, clueScore, guardLoss, matchesGuess, normText, turnBudget } from "./rules"

describe("constants", () => {
  it("has the agreed timings", () => {
    expect([WORD_MS, SPEAK_MS, JUDGE_MS, REVEAL_MS, GUESS_MAX]).toEqual([60_000, 5_000, 6_000, 4_000, 60])
  })
})

describe("scoring", () => {
  it("clueScore = max(1, par + 2 - clues)", () => {
    expect(clueScore(3, 2)).toBe(3)
    expect(clueScore(3, 5)).toBe(1)
    expect(clueScore(2, 10)).toBe(1)
  })
  it("turnBudget = sum of pars + 5", () => {
    expect(turnBudget([2, 3, 4])).toBe(14)
    expect(turnBudget([])).toBe(5)
  })
  it("turnBudget takes a host-set extra: slack 0 is exactly the pars", () => {
    expect(turnBudget([2, 3, 4], 0)).toBe(9)
    expect(turnBudget([2, 3, 4], 12)).toBe(21)
  })
  it("guardLoss = max(0, clues - par)", () => {
    expect(guardLoss(3, 5)).toBe(2)
    expect(guardLoss(3, 1)).toBe(0)
  })
})

describe("normText", () => {
  it("drops case, accents, punctuation, spaces and a leading the", () => {
    expect(normText("The Café-Bar!")).toBe("cafebar")
    expect(normText("Theater")).toBe("theater")
  })
})

describe("checkClue", () => {
  const reason = (w: string, t: unknown) => {
    const r = checkClue(w, t)
    return r.ok ? "ok" : `${r.reason}:${r.secret}`
  }
  it("accepts a fine clue and returns the normalised text", () => {
    expect(checkClue("Cat", "  Whiskers ")).toEqual({ ok: true, clue: "Whiskers" })
  })
  it("empty / non-string", () => {
    expect(reason("Cat", "")).toBe("empty:false")
    expect(reason("Cat", "   ")).toBe("empty:false")
    expect(reason("Cat", 5)).toBe("empty:false")
    expect(reason("Cat", null)).toBe("empty:false")
    expect(reason("Cat", undefined)).toBe("empty:false")
  })
  it("spaces: two words refused", () => {
    expect(reason("Dog", "big cat")).toBe("spaces:false")
  })
  it("contains the whole word is secret", () => {
    expect(reason("banana", "Bananas")).toBe("contains:true")
    expect(reason("Café", "cafe")).toBe("contains:true")
    expect(reason("Spider-Man", "spiderman")).toBe("contains:true")
  })
  it("contains a part of a multi-word answer is not secret", () => {
    expect(reason("Spider-Man", "spider")).toBe("contains:false")
    expect(reason("Spider-Man", "MAN")).toBe("contains:false")
    expect(reason("ice cream", "cream")).toBe("contains:false")
  })
  it("ignores parts under 3 letters", () => {
    expect(reason("Mr Bean", "mr")).toBe("ok")
    expect(reason("Mr Bean", "beans")).toBe("contains:false")
  })
  it("contained: clue inside word needs 4+ letters", () => {
    expect(reason("cat", "ca")).toBe("ok")
    expect(reason("concatenate", "cat")).toBe("ok")
    expect(reason("Pineapple", "apple")).toBe("contained:false")
  })
  it("plural both ways", () => {
    expect(reason("berry", "berries")).toBe("plural:false")
    expect(reason("Berries", "berry")).toBe("plural:false")
    expect(reason("box", "boxes")).toBe("contains:true")
    expect(reason("Dogs", "dog")).toBe("plural:false")
  })
})

describe("matchesGuess", () => {
  const w = { name: "The Beatles", also: ["Fab Four", "Café"] }
  it("matches name, aliases, accents, leading the, case", () => {
    expect(matchesGuess(w, "beatles")).toBe(true)
    expect(matchesGuess(w, "THE BEATLES")).toBe(true)
    expect(matchesGuess(w, "fab four")).toBe(true)
    expect(matchesGuess(w, "cafe")).toBe(true)
  })
  it("rejects substrings, empties and non-strings", () => {
    expect(matchesGuess(w, "beat")).toBe(false)
    expect(matchesGuess(w, "the beatles band")).toBe(false)
    expect(matchesGuess(w, "")).toBe(false)
    expect(matchesGuess(w, 4)).toBe(false)
    expect(matchesGuess({ name: "Cat" }, "cat")).toBe(true)
  })
  it("caps guess length", () => {
    expect(matchesGuess({ name: "a".repeat(70) }, "a".repeat(70))).toBe(false)
  })
})
