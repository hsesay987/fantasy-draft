// Polite fetch for the public data sources (Wikidata, AniList, PokéAPI, Open Trivia DB). Ingest runs offline from a script, never during a game.
const UA = "TopPicTriviaBot/1.0 (https://toppicgames.com; hello@toppicgames.com)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getJson<T = any>(url: string, init: RequestInit = {}, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers as object) } });
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 3000 * (i + 1);
        last = new Error(`${res.status} ${url.slice(0, 80)}`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 80)}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}
