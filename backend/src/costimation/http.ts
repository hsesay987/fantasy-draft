// Polite fetch for Open Prices: identifies the app and backs off when the service asks.
const UA = "TopPicCostimation/1.0 (https://toppicgames.com; hello@toppicgames.com)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getJson<T = any>(url: string, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`${res.status} ${url.slice(0, 80)}`);
        await sleep(Number(res.headers.get("retry-after")) * 1000 || 3000 * (i + 1));
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
