import { describe, expect, it, vi } from "vitest";
import { chainSameLlm, createDodgeJudge, gatewaySameLlm, memorySameCache, type SameLlm } from "./dodgeJudge.service";

type Input = Parameters<SameLlm["same"]>[0];
const llmOf = (reply: (input: Input) => unknown): SameLlm & { calls: Input[] } => {
  const calls: Input[] = [];
  return { calls, async same(input) { calls.push(input); return reply(input); } };
};
const pair = (a: string, b: string, category = "Pizza toppings") => ({ category, a, b });
const yes = (input: Input) => ({ results: input.items.map((x) => ({ i: x.i, same: true })) });

describe("createDodgeJudge", () => {
  it("batches every pair into one call and answers in input order", async () => {
    const llm = llmOf((input) => ({ results: input.items.map((x) => ({ i: x.i, same: x.b !== "ham" })) }));
    const out = await createDodgeJudge({ llm, cache: memorySameCache() }).judge([pair("pepperoni", "peperoni"), pair("pepperoni", "ham"), pair("Pepperoni", "peperoni")]);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.items).toHaveLength(2); // the repeated pair is asked once
    expect(out.map((v) => [v.same, v.source])).toEqual([[true, "ai"], [false, "ai"], [true, "ai"]]);
  });

  it("caches verdicts either way round", async () => {
    const llm = llmOf(yes);
    const j = createDodgeJudge({ llm, cache: memorySameCache() });
    await j.judge([pair("Coke", "Diet Coke", "Fizzy drinks")]);
    const [v] = await j.judge([pair("diet coke", "coke", "Fizzy drinks")]);
    expect(v!.source).toBe("cache");
    expect(llm.calls).toHaveLength(1);
  });

  it("says not the same when there is no model", async () => {
    const [v] = await createDodgeJudge({ llm: null, cache: memorySameCache() }).judge([pair("pepperoni", "peperoni")]);
    expect(v).toEqual({ same: false, source: "fallback" });
  });

  it("falls back when the model throws, times out or replies badly", async () => {
    for (const llm of [
      llmOf(() => { throw new Error("down"); }),
      llmOf(() => new Promise(() => {})),
      llmOf(() => ({ results: [{ i: 9, same: true }] })),
      llmOf(() => ({ results: [{ i: 0, same: "yes" }] })),
    ]) {
      const cache = memorySameCache();
      const [v] = await createDodgeJudge({ llm, cache, timeoutMs: 20 }).judge([pair("pepperoni", "peperoni")]);
      expect(v).toEqual({ same: false, source: "fallback" });
      expect(await cache.get("Pizza toppings", "pepperoni", "peperoni")).toBeNull();
    }
  });

  it("stops calling the model once the day's budget is spent", async () => {
    const llm = llmOf(yes);
    const j = createDodgeJudge({ llm, cache: memorySameCache(), dailyCalls: 1, now: () => Date.UTC(2026, 10, 25) });
    await j.judge([pair("pepperoni", "peperoni")]);
    const [v] = await j.judge([pair("mushroom", "mushrom")]);
    expect(v!.source).toBe("fallback");
    expect(llm.calls).toHaveLength(1);
  });

  it("never sends more than the answer length", async () => {
    const llm = llmOf(yes);
    await createDodgeJudge({ llm, cache: memorySameCache() }).judge([pair("x".repeat(200), "y")]);
    expect(llm.calls[0]!.items[0]!.a.length).toBeLessThanOrEqual(40);
  });
});

describe("memorySameCache", () => {
  it("drops the least recently used verdict, counting reads", async () => {
    const c = memorySameCache(2);
    await c.set("Fruit", "apple", "apples", true);
    await c.set("Fruit", "pear", "pears", true);
    expect(await c.get("Fruit", "apple", "apples")).toBe(true); // apple is now the freshest
    await c.set("Fruit", "kiwi", "kiwis", true);
    expect(await c.get("Fruit", "apple", "apples")).toBe(true);
    expect(await c.get("Fruit", "pear", "pears")).toBeNull();
  });
});

describe("chainSameLlm", () => {
  it("cuts a hung first adapter off in time for the next one to answer", async () => {
    const signals: AbortSignal[] = [];
    const hung: SameLlm = { same: (_input, signal) => { if (signal) signals.push(signal); return new Promise(() => {}); } };
    const chain = chainSameLlm([hung, llmOf(yes)], { perMs: 30, totalMs: 80 })!;
    const t0 = Date.now();
    const reply = await chain.same({ items: [{ i: 0, category: "Fruit", a: "apple", b: "aple" }] });
    expect(reply).toEqual({ results: [{ i: 0, same: true }] });
    expect(Date.now() - t0).toBeLessThan(70);
    expect(signals[0]!.aborted).toBe(true); // the hung call is told to stop, so it makes no more paid calls
  });
  it("gives up once the whole chain is out of time", async () => {
    const hung: SameLlm = { same: () => new Promise(() => {}) };
    const chain = chainSameLlm([hung, hung], { perMs: 20, totalMs: 40 })!;
    await expect(chain.same({ items: [] })).rejects.toThrow();
  });
  it("leaves the whole judge time for the last adapter by default, under the room's judge time", async () => {
    const { CHAIN_TOTAL_MS, CHAIN_PER_MS } = await import("./dodgeJudge.service");
    const { JUDGE_MS } = await import("../shared/topicDraft/dodge/rules");
    expect(CHAIN_TOTAL_MS).toBeGreaterThanOrEqual(2 * CHAIN_PER_MS);
    expect(CHAIN_TOTAL_MS + 500).toBeLessThan(JUDGE_MS);
  });
});

describe("gatewaySameLlm", () => {
  it("is null without a gateway and posts to the first one that answers", async () => {
    expect(gatewaySameLlm({})).toBeNull();
    const doFetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"results":[{"i":0,"same":true}]}' } }] }) })) as unknown as typeof fetch;
    const llm = gatewaySameLlm({ JUDGE_BASE_URL: "https://gw.example/v1/" }, doFetch)!;
    expect(await llm.same({ items: [{ i: 0, category: "c", a: "x", b: "y" }] })).toEqual({ results: [{ i: 0, same: true }] });
    expect((doFetch as any).mock.calls[0][0]).toBe("https://gw.example/v1/chat/completions");
  });
});
