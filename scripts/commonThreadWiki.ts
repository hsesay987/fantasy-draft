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
    "Is a telepath": ["DC Comics telepaths", "Marvel Comics telepaths"],
    "Has telekinesis": ["DC Comics telekinetics", "Marvel Comics telekinetics"],
    "Can shapeshift": ["DC Comics shapeshifters", "Marvel Comics shapeshifters"],
    "Can teleport": ["DC Comics characters who can teleport", "Marvel Comics characters who can teleport"],
    "Can control minds": ["Fictional mind controllers"],
  },
  role: {
    "Is a martial artist": ["Marvel Comics martial artists", "DC Comics martial artists"],
    "Is a scientist": ["Marvel Comics scientists", "DC Comics scientists"],
    "Is a mad scientist": ["Fictional mad scientists"],
    "Is military personnel": ["Marvel Comics military personnel", "DC Comics military personnel"],
    "Is a dictator": ["Fictional dictators"],
    "Is a crime boss": ["Fictional crime bosses"],
    "Is a gangster": ["Fictional gangsters"],
    "Is a terrorist": ["Fictional terrorists"],
    "Is a henchman": ["Fictional henchmen"],
    "Is a mercenary": ["Fictional mercenaries in comics"],
    "Is an inventor": ["Fictional inventors in comics"],
    "Is an engineer": ["Fictional engineers"],
    "Is a warlord": ["Fictional warlords"],
    "Is a general": ["Fictional generals"],
    "Is a king": ["Fictional kings"],
    "Is a business executive": ["Fictional business executives", "Marvel Comics businesspeople", "DC Comics businesspeople"],
    "Is an assassin": ["Fictional assassins in comics"],
    "Is a serial killer": ["Fictional serial killers"],
    "Is a mass murderer": ["Fictional mass murderers"],
    "Is a hypnotist": ["Fictional hypnotists"],
    "Is an archer": ["Fictional archers"],
    "Is a swordfighter": ["Fictional swordfighters in comics"],
    "Is a gunfighter": ["Fictional gunfighters"],
    "Is a reporter": ["Fictional reporters and correspondents"],
    "Is an aviator": ["Fictional aviators"],
    "Is a World War II veteran": ["Fictional World War II veterans"],
    "Is a time traveler": ["Time travelers"],
    "Is a vigilante": ["Vigilante characters in comics"],
    "Is a detective": ["Superhero detectives"],
    "Is a sidekick": ["DC Comics sidekicks"],
    "Is an empath": ["Fictional empaths"],
  },
  nature: {
    "Is a cyborg": ["Marvel Comics cyborgs", "Cyborg supervillains"],
    "Is a robot": ["Marvel Comics robots", "Robot supervillains", "Robot superheroes", "Fictional androids"],
    "Is an artificial intelligence": ["Fictional artificial intelligences"],
    "Is immortal": ["Marvel Comics immortals", "DC Comics immortals"],
    "Is a demon": ["Marvel Comics demons", "Fictional demons"],
    "Is a deity": ["DC Comics deities"],
    "Is a Kryptonian": ["Kryptonians"],
    "Is a monster": ["Fictional monsters"],
    "Is an alien": [
      "DC Comics extraterrestrial supervillains", "Marvel Comics extraterrestrial supervillains", "DC Comics extraterrestrial characters",
      "Marvel Comics extraterrestrial characters", "DC Comics extraterrestrial superheroes", "Marvel Comics extraterrestrial superheroes",
    ],
    "Is a mutant": ["Marvel Comics mutants"],
    "Is an orphan": ["Marvel Comics orphans", "DC Comics orphans"],
    "Has a twin": ["Twin characters in comics"],
  },
  franchise: {
    "Is a James Bond villain": ["James Bond villains"],
    "Was in the Suicide Squad": ["Suicide Squad members"],
    "Is a Hydra agent": ["Hydra (comics) agents"],
    "Is a Spider-Man character": ["Spider-Man characters"],
    "Is a Superman character": ["Superman characters"],
    "Is a Batman character": ["Batman characters"],
    "Is a Justice League character": ["Justice League characters"],
    "Is an Avengers character": ["Avengers (comics) characters"],
    "Was an X-Men member": ["X-Men members"],
    "Is a Legion of Super-Heroes member": ["Legion of Super-Heroes members"],
    "Is a Green Lantern Corps officer": ["Green Lantern Corps officers"],
    "Is a Golden Age character": ["Golden Age superheroes", "Golden Age supervillains"],
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
