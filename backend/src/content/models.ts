// The two models that write and check content: Grok (xAI) or Groq, and Gemini. Both speak the OpenAI chat format.
//
//   XAI_API_KEY    Grok, at api.x.ai           (XAI_MODEL, default grok-3-mini)
//   GROQ_API_KEY   Groq, at api.groq.com       (GROQ_MODEL, default llama-3.3-70b-versatile)
//   GEMINI_API_KEY Gemini's OpenAI-compatible endpoint (GEMINI_MODEL, default gemini-2.5-flash)
//
// The first two configured become the pair. With fewer than two, the judge gateways (JUDGE_BASE_URL, _2, _3) and
// Anthropic fill in, so the pipeline still runs on whatever the server already has.
import { allClients, type LLM } from "../services/judge.service";

/** Model replies are untrusted JSON: every field is checked before use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type Named = LLM & { name: string };
type Provider = { name: string; base: string; key: string; model: string };

export function providers(env: NodeJS.ProcessEnv = process.env): Provider[] {
  const out: Provider[] = [];
  if (env.XAI_API_KEY) out.push({ name: "grok", base: env.XAI_BASE_URL || "https://api.x.ai/v1", key: env.XAI_API_KEY, model: env.XAI_MODEL || "grok-3-mini" });
  if (env.GROQ_API_KEY) out.push({ name: "groq", base: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1", key: env.GROQ_API_KEY, model: env.GROQ_MODEL || "llama-3.3-70b-versatile" });
  if (env.GEMINI_API_KEY) out.push({ name: "gemini", base: env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai", key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || "gemini-2.5-flash" });
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One OpenAI-compatible chat client. Free tiers rate-limit bursts, so a 429 or 5xx waits and tries again. */
export function client(p: Provider, fetchImpl: typeof fetch = fetch): Named {
  return {
    name: p.name,
    async complete(system, user, onUsage) {
      let last: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetchImpl(`${p.base.replace(/\/+$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
            body: JSON.stringify({ model: p.model, temperature: 0.8, max_tokens: 2500, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
            signal: AbortSignal.timeout(60_000),
          });
          if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`${p.name} ${res.status}`), { retry: true });
          if (!res.ok) throw new Error(`${p.name} ${res.status}`);
          const j: Loose = await res.json();
          onUsage?.({ model: j.model ?? p.model, tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0 });
          return String(j.choices?.[0]?.message?.content ?? "");
        } catch (e) {
          last = e;
          if (!(e as { retry?: boolean }).retry && !(e instanceof Error && /timeout|fetch failed/i.test(e.message))) throw e;
          await sleep(2_000 * 2 ** attempt);
        }
      }
      throw last;
    },
  };
}

export type Pair = { a: Named; b: Named };

/**
 * The judge gateways give up on the first error, which suits a live game. Content runs are long and free tiers limit
 * requests per minute, so here a failed call waits (5, 10, 20, 40 s) and tries again before counting as no answer.
 */
export function patient(m: Named, waits = [5_000, 10_000, 20_000, 40_000]): Named {
  return {
    name: m.name,
    async complete(system, user, onUsage) {
      for (let i = 0; ; i++) {
        try {
          return await m.complete(system, user, onUsage);
        } catch (e) {
          if (i >= waits.length) throw e;
          await sleep(waits[i]!);
        }
      }
    },
  };
}

/** "groq", "gemini", "cloudflare"... from a gateway's address. */
export function providerName(url: string): string {
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  return host.includes("groq") ? "groq" : host.includes("googleapis") ? "gemini" : host.includes("x.ai") ? "grok" : host.includes("cloudflare") ? "cloudflare" : host.includes("openrouter") ? "openrouter" : host.split(".").slice(-2, -1)[0] || "gateway";
}

/** The two models that check each other, or null when fewer than two are configured anywhere. */
export function pair(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Pair | null {
  const named = providers(env).map((p) => client(p, fetchImpl));
  // The judge gateways, named after their provider so the log and each card's `by` say who wrote and checked it.
  const gatewayNames = ["", "_2", "_3"].map((n) => env[`JUDGE_BASE_URL${n}`]).filter(Boolean).map((u) => providerName(u!));
  const extra = allClients().map((c, i) => patient({ name: gatewayNames[i] ?? (i === gatewayNames.length ? "anthropic" : `gateway${i + 1}`), complete: c.complete.bind(c) }));
  const all = [...named, ...extra];
  return all.length >= 2 ? { a: all[0]!, b: all[1]! } : null;
}

/** Who writes and who checks item `i`: the roles swap every item, so each model checks the other's work. */
export const roles = (p: Pair, i: number): { writer: Named; checker: Named } => (i % 2 === 0 ? { writer: p.a, checker: p.b } : { writer: p.b, checker: p.a });
