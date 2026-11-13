import { describe, expect, it } from "vitest";
import { PECKING_META } from "../topicDraft/pecking/meta";
import { PARTY_FORMATS } from "./types";
import { defaultTopic, usesPartySetup, startPools, topicOptions, topicTitle } from "./topicOptions";

describe("where a setup starts", () => {
  it("a planned game opens on its slot's topics", () => {
    expect(startPools("imposter", ["villains"], ["superheroes"], true)).toEqual(["villains"]);
    expect(startPools("vowelparty", ["superheroes", "villains"], [], true)).toEqual(["superheroes", "villains"]);
  });

  it("with no slot topics, a tournament game starts on its own default, not the last game's topics", () => {
    expect(startPools("vote", null, ["villains"], true)).toEqual([defaultTopic("vote")]);
    expect(startPools("imposter", null, ["villains"], true)).toEqual(["superheroes"]);
    expect(startPools("vowelparty", undefined, ["villains", "superheroes"], true)).toEqual([defaultTopic("vowelparty")]);
  });

  it("outside a tournament, the room's last mix carries over when it fits this game", () => {
    expect(startPools("vowelparty", null, ["villains", "superheroes"], false)).toEqual(["villains", "superheroes"]);
    expect(startPools("vote", null, ["villains"], false)).toEqual([defaultTopic("vote")]); // not a deck
  });

  it("drops topics the game doesn't have, and a draft takes only the first", () => {
    expect(startPools("imposter", ["nope", "villains", "villains"], [], true)).toEqual(["villains"]);
    expect(startPools("snake", ["villains", "superheroes"], [], true)).toEqual(["villains"]);
    expect(startPools("mafia", ["villains"], [], true)).toEqual(["mafia"]);
  });

  it("a game with no topics at all (Loadout) starts with none, in a tournament or not", () => {
    expect(startPools("loadout", ["villains"], ["superheroes"], true)).toEqual([]);
    expect(startPools("loadout", null, [], true)).toEqual([]);
    expect(startPools("loadout", null, ["superheroes"], false)).toEqual([]);
  });

  it("every game but Mafia and Loadout has topics, and each default is one of them", () => {
    for (const f of ["imposter", "vote", "insync", "partytrivia", "vowelplay", "vowelparty", "snake", "feud"] as const) {
      expect(topicOptions(f).length).toBeGreaterThan(0);
      expect(topicOptions(f).map((o) => o.id)).toContain(defaultTopic(f));
    }
    expect(topicOptions("mafia")).toEqual([]);
    expect(topicOptions("loadout")).toEqual([]);
  });

  it("names a slot's topics", () => {
    expect(topicTitle("imposter", null)).toBeNull();
    expect(topicTitle("vowelparty", ["superheroes", "villains"])).toBe("Superheroes and Villains");
  });

  it("Pecking Order offers every list, with its source and date, and plays from several", () => {
    const opts = topicOptions("pecking");
    expect(opts.map((o) => o.id)).toEqual(PECKING_META.map((m) => m.id));
    expect(opts[0]!.title).toBe(PECKING_META[0]!.title);
    expect(opts[0]!.blurb).toContain(`as of ${PECKING_META[0]!.asOf}`);
    expect(opts[0]!.blurb).toContain(PECKING_META[0]!.source);
    expect(startPools("pecking", ["cities", "rivers"], [], true)).toEqual(["cities", "rivers"]);
    expect(topicTitle("pecking", ["cities", "rivers"])).toBe("Most populous cities and Longest rivers");
  });

  it("every party format, Pecking Order included, is set up on PartySetup, and no draft is", () => {
    for (const f of PARTY_FORMATS) expect(usesPartySetup(f)).toBe(true);
    expect(usesPartySetup("snake")).toBe(false);
    expect(usesPartySetup("menu")).toBe(false);
  });
});
