// Facts for comic characters from English Wikipedia's own categories: a reliable first-appearance year ("Comics
// characters introduced in 1963") and traits editors have filed the character under. Only the vetted categories below are used.
import type { Entity } from "./commonThreadTopics";

type Fetch = <T = any>(url: string, init?: RequestInit) => Promise<T>;

/** kind -> label -> Wikipedia categories that mean it. */
const TRAITS: Record<string, Record<string, string[]>> = {
  power: {
    "Uses magic": ["Fictional characters who use magic"],
    "Has fire or heat powers": ["Fictional characters with fire or heat abilities"],
    "Has ice or cold powers": ["Fictional characters with ice or cold abilities"],
    "Has electric or magnetic powers": ["Fictional characters with electric or magnetic abilities"],
    "Has air or wind powers": ["Fictional characters with air or wind abilities"],
    "Can manipulate light": ["Fictional characters who can manipulate light"],
    "Has X-ray vision": ["Fictional characters with X-ray vision"],
    "Can turn invisible": ["Fictional characters who can turn invisible"],
    "Can turn intangible": ["Fictional characters who can turn intangible"],
    "Can change size": ["Fictional characters who can change size"],
    "Can travel between dimensions": ["Fictional characters with dimensional travel abilities"],
    "Can manipulate time": ["Fictional characters who can manipulate time"],
    "Has precognition": ["Fictional characters with precognition"],
    "Has telepathy": ["DC Comics telepaths", "Marvel Comics telepaths"],
    "Has telekinesis": ["DC Comics telekinetics", "Marvel Comics telekinetics"],
    "Can shapeshift": ["DC Comics shapeshifters", "Marvel Comics shapeshifters"],
    "Can teleport": ["DC Comics characters who can teleport", "Marvel Comics characters who can teleport"],
    "Can control minds": ["Fictional mind controllers"],
  },



};

const BAD_PAGE = /disambiguation|surname-holder|^Lists? of/i;
const lookup = new Map<string, [string, string]>();
for (const [kind, labels] of Object.entries(TRAITS)) for (const [label, cats] of Object.entries(labels)) for (const c of cats) lookup.set(c, [kind, label]);

/** Adds first-appearance decade, creator and trait facts from Wikipedia categories; returns the entities whose page is a real article. */
export async function addCategoryFacts(ents: Entity[], fetchJson: Fetch): Promise<Entity[]> {
  const out: Entity[] = [];
  const titleOf = (e: Entity) => e.q ?? e.name;
  for (let i = 0; i < ents.length; i += 40) {
    const part = ents.slice(i, i + 40);
    const d = await fetchJson<any>(
      `https://en.wikipedia.org/w/api.php?action=query&redirects=1&prop=categories&clshow=!hidden&cllimit=max&format=json&titles=${encodeURIComponent(part.map(titleOf).join("|"))}`
    );
    const to = new Map<string, string>();
    for (const n of [...(d.query?.normalized ?? []), ...(d.query?.redirects ?? [])]) to.set(n.from, n.to);
    const cats = new Map<string, string[]>();
    for (const p of Object.values<any>(d.query?.pages ?? {})) cats.set(p.title, (p.categories ?? []).map((c: any) => String(c.title).replace(/^Category:/, "")));
    for (const e of part) {
      let t = titleOf(e);
      for (let k = 0; k < 3 && to.has(t); k++) t = to.get(t)!;
      const list = cats.get(t) ?? [];
      if (list.some((c) => BAD_PAGE.test(c))) continue;
      const put = (kind: string, label: string) => (e.facts[kind] ??= new Set()).add(label);
      // A page filed under several "introduced in" years (versions of one name) has no clean first appearance: skip it.
      const years = new Set(list.map((c) => c.match(/^Comics characters introduced in (\d{4})$/)?.[1]).filter(Boolean) as string[]);
      if (years.size === 1) { const yr = [...years][0]!; put("firstApp", `First appeared in the ${Math.floor(Number(yr) / 10) * 10}s`); }
      for (const c of list) {
        const hit = lookup.get(c);
        if (hit) put(hit[0], hit[1]);
        const by = c.match(/^Characters created by (.+)$/)?.[1];
        if (by) put("creator", `Created by ${by.replace(/\s*\([^)]*\)$/, "")}`);
      }
      out.push(e);
    }
    await new Promise((r) => setTimeout(r, 1300));
  }
  return out;
}
