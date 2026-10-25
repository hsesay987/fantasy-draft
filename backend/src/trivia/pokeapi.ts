// Pokémon facts from PokéAPI (https://pokeapi.co): type, debut generation, colour and evolutions for every species.
import { getJson } from "./http";
import type { Entity, Spec, Template } from "./model";

const BASE = "https://pokeapi.co/api/v2";
const GEN: Record<string, string> = { i: "Gen 1", ii: "Gen 2", iii: "Gen 3", iv: "Gen 4", v: "Gen 5", vi: "Gen 6", vii: "Gen 7", viii: "Gen 8", ix: "Gen 9" };
const title = (s: string) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); } }));
  return out;
}

export async function fetchPokemon(count = 1025): Promise<Entity[]> {
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const rows = await pool(ids, 6, async (id) => {
    const [sp, mon] = await Promise.all([getJson<any>(`${BASE}/pokemon-species/${id}`), getJson<any>(`${BASE}/pokemon/${id}`)]);
    return { id, sp, mon };
  });
  const nameOf = new Map(rows.map((r) => [r.sp.name as string, title(r.sp.name)]));
  const into = new Map<string, string[]>();
  for (const r of rows) if (r.sp.evolves_from_species) into.set(r.sp.evolves_from_species.name, [...(into.get(r.sp.evolves_from_species.name) ?? []), r.sp.name]);
  return rows.map(({ id, sp, mon }) => {
    const gen = GEN[String(sp.generation?.name ?? "").replace("generation-", "")];
    const kids = into.get(sp.name) ?? [];
    return {
      id: `pokemon:${id}`,
      label: nameOf.get(sp.name) ?? title(sp.name),
      pop: 2000 - id, // lower dex numbers are the older, better-known Pokémon
      facts: {
        type: (mon.types as any[]).map((t) => title(t.type.name)),
        generation: gen ? [gen] : [],
        color: sp.color ? [title(sp.color.name)] : [],
        evolvesFrom: sp.evolves_from_species ? [nameOf.get(sp.evolves_from_species.name) ?? title(sp.evolves_from_species.name)] : [],
        evolvesInto: kids.length === 1 ? [nameOf.get(kids[0]!) ?? title(kids[0]!)] : [],
      },
    };
  });
}

const first = (e: Entity, f: string) => e.facts[f]?.[0] ?? null;
const t = (x: Template) => x;

export const POKEMON_SPEC: Spec = {
  pool: "pokemon",
  templates: [
    t({ fact: "type", ask: (e) => `What type is ${e.label}?`, group: (e) => (e.facts.type!.length === 1 ? first(e, "generation") : null), name: (g) => `Pokémon Types: ${g}` }),
    t({ fact: "generation", ask: (e) => `In which generation did ${e.label} debut?`, group: (e) => first(e, "color"), name: (g) => `Debuts: ${g} Pokémon` }),
    t({ fact: "evolvesFrom", ask: (e) => `Which Pokémon evolves into ${e.label}?`, group: (e) => first(e, "generation"), name: (g) => `Evolves From: ${g}` }),
    t({ fact: "evolvesInto", ask: (e) => `What does ${e.label} evolve into?`, group: (e) => first(e, "generation"), name: (g) => `Evolutions: ${g}` }),
  ],
  surveys: [],
};
