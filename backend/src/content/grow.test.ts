import { describe, expect, it } from "vitest";
import { agree, growInSync, growVote, rateItems, validateCard } from "./grow";
import { pair, providers, roles, type Named } from "./models";
import { deckOf } from "../shared/topicDraft/party/decks";
import { insyncDeckOf } from "../shared/topicDraft/party/insyncDecks";
import { statDefs } from "../shared/topicDraft/stats";

/** A stand-in model: `write` answers writing prompts, `check` answers reviews. Calls are recorded. */
function fake(name: string, o: { write?: (user: string) => unknown; keep?: (item: string) => boolean; fact?: string; rate?: unknown }): Named & { calls: string[] } {
  const calls: string[] = [];
  return {
    name, calls,
    async complete(system, user) {
      calls.push(system.split("\n")[0]!);
      if (system.startsWith("You review")) return JSON.stringify({ keep: o.keep ? o.keep(user) : true, reason: "ok" });
      if (system.startsWith("You are a TV expert")) return o.fact ?? "unsure";
      if (system.startsWith("You rate")) return JSON.stringify(o.rate);
      return JSON.stringify(o.write?.(user) ?? {});
    },
  };
}
const ok = async () => ({ ok: true });

describe("roles", () => {
  it("swaps writer and checker every item, so each model checks the other", () => {
    const a = fake("grok", {}), b = fake("gemini", {});
    const p = { a, b };
    expect([0, 1, 2, 3].map((i) => `${roles(p, i).writer.name}>${roles(p, i).checker.name}`)).toEqual(["grok>gemini", "gemini>grok", "grok>gemini", "gemini>grok"]);
  });

  it("finds Grok, Groq and Gemini from their keys", () => {
    expect(providers({ XAI_API_KEY: "x", GEMINI_API_KEY: "g" }).map((p) => p.name)).toEqual(["grok", "gemini"]);
    expect(providers({ GROQ_API_KEY: "q", GEMINI_API_KEY: "g" }).map((p) => p.name)).toEqual(["groq", "gemini"]);
    expect(pair({ GEMINI_API_KEY: "g" } as never)).toBeNull(); // one model cannot check itself
  });
});

describe("vote cards", () => {
  const icks = deckOf("icks")!;

  it("keeps the deck's own sides on an Ick card and rejects repeats", () => {
    const seen = new Set<string>();
    const c = validateCard({ prompt: "They microwave fish at work.", a: "whatever", b: "whatever" }, icks, seen);
    expect(c).toMatchObject({ a: "Ick", b: "No ick", prompt: "They microwave fish at work." });
    expect(c!.id).toMatch(/^icks-g[0-9a-f]{8}$/);
    expect(validateCard({ prompt: icks.cards[0]!.prompt }, icks, new Set([icks.cards[0]!.prompt.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()]))).toBeNull();
  });

  it("keeps only what the checker approves, and records who wrote and who checked", async () => {
    const a = fake("grok", { write: () => ({ cards: [{ prompt: "They clap at the cinema." }, { prompt: "They name their car." }, { prompt: "BAD card" }] }), keep: (x) => !x.includes("BAD") });
    const b = fake("gemini", { write: () => ({ cards: [{ prompt: "They tip in exact change." }] }), keep: (x) => !x.includes("BAD") });
    const out = await growVote(icks, 3, { a, b }, ok);
    expect(out.map((c) => c.prompt)).toEqual(["They clap at the cinema.", "They name their car.", "They tip in exact change."]);
    expect(out.map((c) => c.by)).toEqual(["grok>gemini", "grok>gemini", "gemini>grok"]);
    expect(a.calls.some((c) => c.startsWith("You review"))).toBe(true); // grok checked gemini's card
  });

  it("drops a card that fails moderation", async () => {
    const a = fake("a", { write: () => ({ cards: [{ prompt: "They do a thing." }] }) }), b = fake("b", {});
    expect(await growVote(icks, 1, { a, b }, async () => ({ ok: false }), undefined, 1)).toEqual([]);
  });

  it("keeps a Did That Happen card only when the checker, told nothing, reaches the same verdict", async () => {
    const happen = deckOf("happen")!;
    const write = () => ({ cards: [{ prompt: "On Seinfeld, Jerry wears a puffy shirt on TV.", real: true, note: "Seinfeld · 'The Puffy Shirt'" }] });
    const agrees = await growVote(happen, 1, { a: fake("a", { write }), b: fake("b", { fact: "real" }) }, ok, undefined, 1);
    expect(agrees).toHaveLength(1);
    expect(agrees[0]).toMatchObject({ a: "It happened", b: "Made up", answer: "a" });
    const disputes = await growVote(happen, 1, { a: fake("a", { write }), b: fake("b", { fact: "made-up" }) }, ok, undefined, 1);
    expect(disputes).toEqual([]);
  });

  it("rejects a card that pastes its sides into the prompt or makes a side a sentence", () => {
    const wrong = deckOf("wrong")!;
    expect(validateCard({ prompt: "Nina sets the office to 68F. (Nina / The teammates)", a: "Nina", b: "The teammates" }, wrong, new Set())).toBeNull();
    expect(validateCard({ prompt: "Nina sets the office to 68F.", a: "Nina for being far too chilly with everyone", b: "The teammates" }, wrong, new Set())).toBeNull();
    expect(validateCard({ prompt: "Nina sets the office to 68F.", a: "Nina", b: "The teammates" }, wrong, new Set())).not.toBeNull();
  });

  it("Room cards must name someone at the table", () => {
    const room = deckOf("whowins-room")!;
    expect(validateCard({ prompt: "A sing-off", a: "{p1}", b: "A parrot" }, room, new Set())).not.toBeNull();
    expect(validateCard({ prompt: "A sing-off", a: "Beyoncé", b: "A parrot" }, room, new Set())).toBeNull();
    expect(validateCard({ prompt: "A sing-off", a: "{p1}", b: "A parrot" }, deckOf("whowins")!, new Set())).toBeNull();
  });
});

describe("In-Sync pairs", () => {
  it("rejects flipped repeats and keeps approved new pairs", async () => {
    const d = insyncDeckOf("friends")!;
    const [first] = d.pairs;
    const write = () => ({ pairs: [{ left: first!.right, right: first!.left }, { left: "Snack", right: "Feast" }] });
    const out = await growInSync(d, 2, { a: fake("a", { write }), b: fake("b", { write }) }, ok, undefined, 2);
    expect(out.map((x) => `${x.left}/${x.right}`)).toEqual(["Snack/Feast"]);
  });
});

describe("catalog ratings", () => {
  const defs = statDefs("music");
  const c = { name: "Test Band", universe: "Rock", archetype: "Band", tags: [] };
  const stats = (v: number) => Object.fromEntries(defs.map((d) => [d.key, v]));

  it("averages two blind ratings that agree, and sets aside ones that do not", () => {
    expect(agree({ x: 80, y: 60 }, { x: 90, y: 50 })).toEqual({ x: 85, y: 55 });
    expect(agree({ x: 80 }, { x: 50 })).toBeNull();
  });

  it("keeps an entry only when both models think it fits and roughly agree", async () => {
    const run = (ra: unknown, rb: unknown) => rateItems("Music", defs, [], [c], { a: fake("a", { rate: ra }), b: fake("b", { rate: rb }) });
    expect((await run({ fits: true, ...stats(80) }, { fits: true, ...stats(70) }))[0]!.stats).toEqual(stats(75));
    expect(await run({ fits: true, ...stats(80) }, { fits: true, ...stats(40) })).toEqual([]);
    expect(await run({ fits: true, ...stats(80) }, { fits: false, ...stats(80) })).toEqual([]);
    expect(await run({ fits: true, ...stats(180) }, { fits: true, ...stats(80) })).toEqual([]);
  });
});
