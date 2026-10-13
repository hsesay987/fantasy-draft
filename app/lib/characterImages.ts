// Looks up a thumbnail for a character on Wikipedia (public API, CORS-enabled) and caches it.
// Always optional: callers fall back to an initials avatar when nothing is found.
const CACHE_KEY = "toppic:img:v1";
const API = "https://en.wikipedia.org/w/api.php";

let memory: Record<string, string | null> | null = null;
const inflight = new Map<string, Promise<string | null>>();
let active = 0;
const waiting: (() => void)[] = [];

function load(): Record<string, string | null> {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    memory = {};
  }
  return memory!;
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
  } catch {
    /* storage unavailable or full */
  }
}

const slot = () =>
  new Promise<void>((resolve) => {
    if (active < 4) {
      active++;
      resolve();
    } else waiting.push(() => (active++, resolve()));
  });
const release = () => {
  active--;
  waiting.shift()?.();
};

export const cachedImage = (query: string): string | null | undefined => load()[query];

export function fetchCharacterImage(query: string): Promise<string | null> {
  const cache = load();
  if (query in cache) return Promise.resolve(cache[query]!);
  const running = inflight.get(query);
  if (running) return running;
  const p = (async () => {
    await slot();
    try {
      const url = `${API}?action=query&format=json&origin=*&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(query)}&prop=pageimages&piprop=thumbnail&pithumbsize=320`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const pages = data?.query?.pages ? Object.values<{ thumbnail?: { source: string } }>(data.query.pages) : [];
      const src = pages[0]?.thumbnail?.source ?? null;
      cache[query] = src;
      persist();
      return src;
    } catch {
      return null; // transient failure: don't cache so we retry next time
    } finally {
      release();
      inflight.delete(query);
    }
  })();
  inflight.set(query, p);
  return p;
}
