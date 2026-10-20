// Text moderation for player-written content (mission text, custom characters, boss names) using Jev (TypeSafe).
// Disabled without JEV_API_KEY. Fails open on network errors so a moderation outage never blocks play,
// and always applies a small local blocklist first.
const URL = process.env.JEV_URL || "https://api.typesafe.ai/v1/systemone";
const THRESHOLD = Number(process.env.JEV_THRESHOLD || 0.6);

const QUESTIONS = {
  hate: { type: "noul", instructions: "The text contains hate speech, slurs, or demeaning content about a protected group." },
  sexual: { type: "noul", instructions: "The text is sexually explicit." },
  threat: { type: "noul", instructions: "The text threatens, harasses, or encourages violence or self-harm against a real person." },
} as const;

const BLOCK = /\b(n[i1]gg(er|a)s?|f[a4]gg?ots?|k[i1]kes?|ch[i1]nks?|retards?)\b/i;

export type Moderation = { ok: boolean; reason?: string };

export async function moderate(texts: unknown[]): Promise<Moderation> {
  const joined = texts.filter((t) => typeof t === "string" && t.trim()).join("\n").slice(0, 2000);
  if (!joined) return { ok: true };
  if (BLOCK.test(joined)) return { ok: false, reason: "That text isn't allowed." };
  const key = process.env.JEV_API_KEY;
  if (!key) return { ok: true };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ state: joined, model: process.env.JEV_MODEL || "jev-latest", questions: QUESTIONS }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { ok: true };
    const j: any = await res.json();
    const answers = j.answers ?? j;
    for (const k of Object.keys(QUESTIONS)) {
      const p = Number(answers?.[k]?.noul ?? answers?.[k]);
      if (Number.isFinite(p) && p >= THRESHOLD) return { ok: false, reason: "That text isn't allowed." };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/** Everything a player can type into a game that other people (or the judge) will read. */
export function userText(setup: any): string[] {
  const o = setup?.opts ?? {};
  return [
    setup?.mission?.title,
    setup?.mission?.blurb,
    setup?.loadout?.boss?.name,
    setup?.loadout?.title,
    ...(Array.isArray(o.customItems) ? o.customItems.flatMap((i: any) => [i?.name, i?.universe, i?.archetype]) : []),
    ...(Array.isArray(setup?.roles) ? setup.roles.map((r: any) => r?.label) : []),
  ];
}
