// Looks up a thumbnail for a character on Wikipedia (public API, CORS-enabled) and caches it.
// Always optional: callers fall back to an initials avatar when nothing is found.
const CACHE_KEY = "toppic:img:v3";
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

type Pages = Record<string, { title?: string; thumbnail?: { source: string } }>;
const BAD = /logo|wordmark|flag_of|disambig|symbol/i;

async function wikiImage(name: string): Promise<string | null> {
  const get = async (params: string) => {
    const res = await fetch(`${API}?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=320&redirects=1&${params}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const pages = data?.query?.pages ? (Object.values(data.query.pages) as Pages[string][]) : [];
    return pages.find((p) => p.thumbnail?.source && !BAD.test(p.thumbnail.source))?.thumbnail?.source ?? null;
  };
  return (await get(`titles=${encodeURIComponent(name)}`)) ?? (await get(`generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(name)}`));
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function pokeImage(name: string): Promise<string | null> {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug(name)}`);
  if (!res.ok) return null;
  const d = await res.json();
  return d?.sprites?.other?.["official-artwork"]?.front_default ?? d?.sprites?.front_default ?? null;
}

async function aniImage(name: string): Promise<string | null> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: "query($s:String){Page(perPage:1){characters(search:$s,sort:FAVOURITES_DESC){image{large}}}}", variables: { s: name } }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const d = await res.json();
  return d?.data?.Page?.characters?.[0]?.image?.large ?? null;
}

let heroIndex: Promise<Map<string, string>> | null = null;
const norm = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function heroImage(name: string): Promise<string | null> {
  heroIndex ??= fetch("https://akabab.github.io/superhero-api/api/all.json")
    .then((r) => r.json())
    .then((all: { name: string; images?: { sm?: string; md?: string } }[]) => {
      const m = new Map<string, string>();
      for (const h of all) if (!m.has(norm(h.name))) m.set(norm(h.name), h.images?.md ?? h.images?.sm ?? "");
      return m;
    })
    .catch(() => {
      heroIndex = null;
      return new Map<string, string>();
    });
  const idx = await heroIndex;
  return idx.get(norm(name)) || null;
}

/** Flags come straight from flagcdn by ISO code (Wikipedia flag images are filtered out above). */
const flagImage = async (code: string) => (/^[a-z]{2}(-[a-z]{3})?$/.test(code) ? `https://flagcdn.com/w320/${code}.png` : null);

const PROVIDERS: Record<string, (name: string) => Promise<string | null>> = { wiki: wikiImage, poke: pokeImage, anilist: aniImage, hero: heroImage, flag: flagImage };
export const imagesEnabled = () => process.env.NEXT_PUBLIC_CHARACTER_IMAGES !== "off";

/** `query` is "kind:name". Returns an image URL or null. */
export function fetchCharacterImage(query: string): Promise<string | null> {
  if (!imagesEnabled()) return Promise.resolve(null);
  const cache = load();
  if (query in cache) return Promise.resolve(cache[query]!);
  const running = inflight.get(query);
  if (running) return running;
  const i = query.indexOf(":");
  const provider = PROVIDERS[query.slice(0, i)];
  const name = query.slice(i + 1);
  if (!provider) return Promise.resolve(null);
  const p = (async () => {
    await slot();
    try {
      const src = await provider(name);
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
