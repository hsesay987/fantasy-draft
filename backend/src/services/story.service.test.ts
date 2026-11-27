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
const long = (t: string) => `${t} The crowd surges to its feet as the fog thickens over the pier and every light on the cranes starts to flicker in the wind.`;
const good = {
  title: "Siege at Midnight Harbor",
  setting: "Fog over the docks. Whoever holds the lighthouse at dawn takes the harbor.",
  beats: [
    { label: "Opening Bell", text: long("Goku opens with an Instant Transmission feint and a Kamehameha that splits the pier, but Thanos simply walks through the blast.") },
    { label: "First Blood", text: long("Spider-Man webs the crane hooks and swings Michael Jordan in for a mid-air slam, and Ann's side reels.") },
    { label: "The Scare", text: long("Thanos closes his fist on the gauntlet and Lelouch's plan looks finished, the harbor shaking under the Rival AI push.") },
    { label: "Turning Point", text: long("Lelouch uses Geass on the fleet's captain and the ships turn on their own side in the fog, intellect 98 doing the work.") },
    { label: "Final Blow", text: long("Saitama strolls up the gangway, says 'OK', and one Serious Punch clears the bay of Rival AI's last hope.") },
  ],
  why: "Ann won on brains: Intellect 90 to 78, with Lelouch's Geass flipping the fight.",
};
const llm = (reply: unknown) => ({ complete: vi.fn(async () => (typeof reply === "string" ? reply : JSON.stringify(reply))) });

beforeEach(() => { _resetStoryBudget(); delete process.env.STORY_DAILY_CALLS; });

describe("draft story", () => {
  it("accepts a story that names real picks and the winner", () => {
    expect(validateStory(good, input)).toMatchObject({ title: "Siege at Midnight Harbor", beats: expect.any(Array) });
  });
  it("rejects too few beats, a why without the winner, or beats that name no real picks", () => {
    expect(validateStory({ ...good, beats: good.beats.slice(0, 4) }, input)).toBeNull();
    expect(validateStory({ ...good, beats: good.beats.map((b) => ({ ...b, text: b.text.slice(0, 100) })) }, input)).toBeNull(); // too thin
    expect(validateStory({ ...good, why: "Rival AI was robbed." }, input)).toBeNull();
    expect(validateStory({ ...good, beats: good.beats.map((b) => ({ ...b, text: "Someone does something." })) }, input)).toBeNull();
  });
  it("counts a pick by its name without the bracket, or a distinctive last name", () => {
    const beats = good.beats.map((b) => ({ ...b, text: b.text.replace("Michael Jordan", "Jordan") }));
    expect(validateStory({ ...good, beats }, input)).not.toBeNull();
  });
  it("needs both teams in the story and most of the picks", () => {
    const oneSided = good.beats.map((b) => ({ ...b, text: long("Goku, Lelouch and Saitama run the show against nobody in particular.") }));
    expect(validateStory({ ...good, beats: oneSided }, input)).toBeNull();
  });
  it("asks for signature moves, duels and a scare, with each pick's details", () => {
    const rich: StoryInput = { ...input, teams: [{ player: "Ann", items: [{ name: "Goku", archetype: "Saiyan", universe: "Dragon Ball", stats: { power: 99, speed: 95, intellect: 40 } }] }, input.teams[1]!] };
    const { system, user } = storyPrompt(rich, { setting: "a volcano", condition: "fog", twist: "an ambush" }, []);
    expect(system).toMatch(/signature moves/);
    expect(system).toMatch(/head-to-head/);
    expect(system).toMatch(/near win or a scare/);
    expect(user).toContain("Goku (Saiyan, Dragon Ball) - power 99, speed 95, intellect 40");
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
