import { describe, expect, it } from "vitest";
import data from "./vowelWordList.json";
import { VOWEL_TOPICS, vowelTopicTitle } from "./vowelTopics";

describe("vowel topics (names-free)", () => {
  it("lists exactly the word list's topics, in order, with the same titles", () => expect(VOWEL_TOPICS).toEqual(data.topics));
  it("holds no names from the word list", () => {
    const text = JSON.stringify(VOWEL_TOPICS);
    for (const n of Object.values(data.words as Record<string, string[]>).flat().slice(0, 300)) expect(text).not.toContain(`"${n}"`);
  });
  it("titles a topic, falling back to the id", () => {
    expect(vowelTopicTitle(VOWEL_TOPICS[0]!.id)).toBe(VOWEL_TOPICS[0]!.title);
    expect(vowelTopicTitle("nope")).toBe("nope");
  });
});
