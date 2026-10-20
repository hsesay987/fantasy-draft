import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultClient } from "./judge.service";

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["JUDGE_BASE_URL", "JUDGE_API_KEY", "ANTHROPIC_API_KEY", "JUDGE_GATEWAY_MODEL", "JUDGE_BASE_URL_2", "JUDGE_API_KEY_2", "JUDGE_GATEWAY_MODEL_2", "JUDGE_EXTRA_BODY"]) delete process.env[k];
});

describe("judge model chain", () => {
  it("is null with no providers (deterministic judge takes over)", () => {
    expect(defaultClient()).toBeNull();
  });
  it("calls an OpenAI-compatible gateway", async () => {
    process.env.JUDGE_BASE_URL = "http://localhost:20128/v1/";
    process.env.JUDGE_API_KEY = "k";
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ model: "m", choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }) }));
    vi.stubGlobal("fetch", f);
    const out = await defaultClient()!.complete("sys", "user");
    expect(out).toBe("hi");
    const [url, init] = f.mock.calls[0] as unknown as [string, any];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer k");
  });
  it("throws a gateway error so the caller can fall back", async () => {
    process.env.JUDGE_BASE_URL = "http://x/v1";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(defaultClient()!.complete("s", "u")).rejects.toThrow("gateway 503");
  });
  it("falls through to the second gateway when the first fails", async () => {
    process.env.JUDGE_BASE_URL = "http://one/v1";
    process.env.JUDGE_BASE_URL_2 = "http://two/v1";
    process.env.JUDGE_GATEWAY_MODEL_2 = "m2";
    const f = vi.fn(async (url: string) =>
      url.startsWith("http://one") ? ({ ok: false, status: 429 } as any) : ({ ok: true, json: async () => ({ choices: [{ message: { content: "from two" } }] }) } as any)
    );
    vi.stubGlobal("fetch", f);
    expect(await defaultClient()!.complete("s", "u")).toBe("from two");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("merges JUDGE_EXTRA_BODY into the request", async () => {
    process.env.JUDGE_BASE_URL = "http://x/v1";
    process.env.JUDGE_EXTRA_BODY = '{"provider":{"order":["Groq"]}}';
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) }));
    vi.stubGlobal("fetch", f);
    await defaultClient()!.complete("s", "u");
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, any])[1].body);
    expect(body.provider).toEqual({ order: ["Groq"] });
    expect(body.messages).toHaveLength(2);
  });
});
