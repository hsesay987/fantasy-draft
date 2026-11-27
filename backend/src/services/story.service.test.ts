import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetStoryBudget, storyPrompt, validateStory, writeStory, type StoryInput } from "./story.service";

const input: StoryInput = {
  scenario: { title: "Best All-Around Squad" },
  teams: [
    { player: "Ann", items: [{ name: "Goku" }, { name: "Lelouch" }, { name: "Saitama" }] },
    { player: "Rival AI", items: [{ name: "Thanos" }, { name: "Spider-Man (Peter Parker)" }, { name: "Michael Jordan" }] },
  ],
  verdict: { winner: "Ann", teams: [{ player: "Ann", score: 88 } as any, { player: "Rival AI", score: 80 } as any], statsTable: [{ key: "intellect", values: { Ann: 90, "Rival AI": 78 } }] },
};
const good = {
  title: "Siege at Midnight Harbor",
  setting: "Fog over the docks.",
  beats: [
    { label: "Opening", text: "Goku charges the pier while Thanos waits." },
    { label: "First clash", text: "Spider-Man webs the cranes; Lelouch sees it coming." },
    { label: "Turning point", text: "Lelouch traps the fleet in the fog." },
    { label: "Final blow", text: "Saitama, one punch." },
  ],
  why: "Ann won on brains: Intellect 90 to 78.",
};
const llm = (reply: unknown) => ({ complete: vi.fn(async () => (typeof reply === "string" ? reply : JSON.stringify(reply))) });

beforeEach(() => { _resetStoryBudget(); delete process.env.STORY_DAILY_CALLS; });

describe("draft story", () => {
  it("accepts a story that names real picks and the winner", () => {
    expect(validateStory(good, input)).toMatchObject({ title: "Siege at Midnight Harbor", beats: expect.any(Array) });
  });
  it("rejects too few beats, a why without the winner, or beats that name no real picks", () => {
    expect(validateStory({ ...good, beats: good.beats.slice(0, 3) }, input)).toBeNull();
    expect(validateStory({ ...good, why: "Rival AI was robbed." }, input)).toBeNull();
    expect(validateStory({ ...good, beats: good.beats.map((b) => ({ ...b, text: "Someone does something." })) }, input)).toBeNull();
  });
  it("counts a pick by its name without the bracket, or a distinctive last name", () => {
    const beats = [{ label: "A", text: "Spider-Man swings in." }, { label: "B", text: "Jordan rises." }, { label: "C", text: "Fog." }, { label: "D", text: "Rain." }];
    expect(validateStory({ ...good, beats }, input)).not.toBeNull();
  });
  it("tells the model the winner, the teams, the seeds and the titles to avoid", () => {
    const { user } = storyPrompt(input, { setting: "a volcano", condition: "fog", twist: "an ambush" }, ["Old Title"]);
    expect(user).toContain("Winner: Ann");
    expect(user).toContain("Saitama");
    expect(user).toContain("a volcano");
    expect(user).toContain("Old Title");
  });
  it("writes a story, and asks the model to avoid titles it already wrote", async () => {
    const c = llm(good);
    expect(await writeStory(input, c, () => 0.3)).toMatchObject({ title: good.title });
    await writeStory(input, c, () => 0.6);
    expect((c.complete.mock.calls[1] as unknown as [string, string])[1]).toContain("Siege at Midnight Harbor");
  });
  it("different random draws give different seeds", () => {
    const a = storyPrompt(input, { setting: "x", condition: "y", twist: "z" }, []).user;
    expect(a).not.toEqual(storyPrompt(input, { setting: "q", condition: "y", twist: "z" }, []).user);
  });
  it("returns null with no AI, on a bad reply, on an error, or once the daily budget is spent", async () => {
    expect(await writeStory(input, null)).toBeNull();
    expect(await writeStory(input, llm("not json"))).toBeNull();
    expect(await writeStory(input, { complete: async () => { throw new Error("down"); } })).toBeNull();
    _resetStoryBudget();
    process.env.STORY_DAILY_CALLS = "1";
    const c = llm(good);
    expect(await writeStory(input, c)).not.toBeNull();
    expect(await writeStory(input, c)).toBeNull();
    expect(c.complete).toHaveBeenCalledTimes(1);
  });
});
