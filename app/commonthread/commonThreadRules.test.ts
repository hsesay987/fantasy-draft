import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assemble, givesAway, nameInLabel, orderClues, pickWrong, repeatedAcrossWorks, usable, type RawCategory } from "../../scripts/commonThreadRules";
import { PINPOINT_TOPICS } from "../pinpoint/topics";
import type { ThreadTopic } from "./types";
import { MEMBERSHIPS } from "../../scripts/commonThreadMemberships";
import { BANNED_LABELS, BANNED_PATTERNS, MUST_NOT, ORG_ALLOW, isBannedLabel } from "../../scripts/commonThreadBans";

/** A category of `n` members named `${label}-m0..`, fame rising with the index. */
const cat = (label: string, n: number, kind = "k", prefix = label): RawCategory => ({
  label,
  kind,
  members: Array.from({ length: n }, (_, i) => ({ name: `${prefix}-m${i}`, fame: 10 + i * 3 })),
});

describe("Common Thread rules", () => {
  it("rejects small and catch-all categories", () => {
    expect(usable(cat("x", 5), 200)).toBe(false);
    expect(usable(cat("x", 60), 200)).toBe(false);
    expect(usable(cat("x", 10), 200)).toBe(true);
    expect(usable(cat("x", 6), 200)).toBe(true);
    expect(usable(cat("x", 50), 200)).toBe(true);
  });

  it("orders clues from least to most famous, ending on the most famous", () => {
    const c = cat("x", 30);
    const shuffled = { ...c, members: [...c.members].reverse() };
    const clues = orderClues(shuffled);
    expect(clues).toHaveLength(6);
    expect(clues[5]!.name).toBe("x-m29");
    const fame = (n: string) => c.members.find((m) => m.name === n)!.fame;
    const f = clues.map((x) => fame(x.name));
    expect(f).toEqual([...f].sort((a, b) => a - b));
    expect(fame(clues[0]!.name)).toBeLessThan(fame(clues[5]!.name));
    expect(new Set(clues.map((x) => x.name)).size).toBe(6);
    // spread, not just the top six
    expect(fame(clues[0]!.name)).toBeLessThan(fame("x-m10"));
  });

  it("keeps the image lookup on a clue", () => {
    const c = cat("x", 8);
    c.members[7]!.q = "Some Page";
    expect(orderClues(c)[5]).toEqual({ name: "x-m7", q: "Some Page" });
    expect(orderClues(c)[4]).toEqual({ name: "x-m6" });
  });

  it("picks 7 wrong labels, none containing a clue, across more than one kind", () => {
    const target = cat("target", 12, "director");
    const clueNames = new Set(orderClues(target).map((c) => c.name));
    const others: RawCategory[] = [
      ...Array.from({ length: 6 }, (_, i) => cat(`dir${i}`, 8, "director")),
      ...Array.from({ length: 6 }, (_, i) => cat(`gen${i}`, 8, "genre")),
      ...Array.from({ length: 4 }, (_, i) => cat(`dec${i}`, 8, "decade")),
    ];
    // two decoys that DO hold a clue
    const bad1 = { ...cat("bad1", 8, "genre"), members: [{ name: [...clueNames][2]!, fame: 1 }, ...cat("bad1", 7).members] };
    const bad2 = { ...cat("bad2", 8, "decade"), members: [{ name: [...clueNames][5]!, fame: 1 }, ...cat("bad2", 7).members] };
    const wrong = pickWrong(target, [...others, bad1, bad2], 7);
    expect(wrong).toHaveLength(7);
    expect(new Set(wrong).size).toBe(7);
    expect(wrong).not.toContain("bad1");
    expect(wrong).not.toContain("bad2");
    expect(wrong).not.toContain("target");
    const kinds = new Set([...others, bad1, bad2].filter((o) => wrong.includes(o.label)).map((o) => o.kind));
    expect(kinds.size).toBeGreaterThan(1);
    for (const w of wrong) {
      const o = others.find((x) => x.label === w)!;
      for (const m of o.members) expect(clueNames.has(m.name)).toBe(false);
    }
  });

  it("is repeatable for a seed and varies across seeds", () => {
    const target = cat("target", 12, "a");
    const others = Array.from({ length: 30 }, (_, i) => cat(`o${i}`, 8, `k${i % 3}`));
    expect(pickWrong(target, others, 5)).toEqual(pickWrong(target, others, 5));
    expect(pickWrong(target, others, 5)).not.toEqual(pickWrong(target, others, 6));
  });

  it("returns fewer than 7 when the topic cannot supply them", () => {
    const target = cat("target", 12, "a");
    expect(pickWrong(target, [cat("o1", 8, "b"), cat("o2", 8, "c")], 1)).toHaveLength(2);
  });

  it("keeps daily and practice separate, and a label never appears in both", () => {
    const cats: RawCategory[] = [];
    // distinct members per category so that no clue fits another category
    for (let i = 0; i < 120; i++) cats.push(cat(`Cat ${i}`, 8, `kind${i % 4}`, `c${i}`));
    const t = assemble("films", cats, 3);
    expect(t.pool).toBe("films");
    expect(t.daily.length).toBeGreaterThan(40);
    expect(t.practice.length).toBeGreaterThan(10);
    const d = new Set(t.daily.map((c) => c.label));
    for (const c of t.practice) expect(d.has(c.label)).toBe(false);
    expect(new Set([...t.daily, ...t.practice].map((c) => c.label)).size).toBe(t.daily.length + t.practice.length);
    for (const c of [...t.daily, ...t.practice]) {
      expect(c.clues).toHaveLength(6);
      expect(c.wrong).toHaveLength(7);
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("drops unusable categories and categories with too few wrong options", () => {
    const cats = [cat("Big", 400, "a"), cat("Tiny", 3, "a"), cat("Lonely", 8, "a")];
    const t = assemble("films", cats, 1);
    expect([...t.daily, ...t.practice]).toHaveLength(0);
  });

  it("finds a clue name inside a label by whole words, ignoring case", () => {
    expect(nameInLabel("Italy", "Born in Italy")).toBe(true);
    expect(nameInLabel("italy", "In ITALY")).toBe(true);
    expect(nameInLabel("Batman", "Appears in Batman: Hush")).toBe(true);
    expect(nameInLabel("Man", "Directed by Batman")).toBe(false);
    expect(nameInLabel("Ali", "Played for Alicante")).toBe(false);
    expect(nameInLabel("Café", "Born in Café Society")).toBe(true);
  });

  it("catches adjectives and stems of a country name, not only the name", () => {
    expect(givesAway("Australia", "Uses the Australian dollar", true)).toBe(true);
    expect(givesAway("Russia", "Has Russian as an official language", true)).toBe(true);
    expect(givesAway("France", "Has French as an official language", true)).toBe(true);
    expect(givesAway("Netherlands", "Has Dutch as an official language", true)).toBe(true);
    expect(givesAway("Germany", "Has German as an official language", true)).toBe(true);
    expect(givesAway("United States", "Uses the United States dollar", true)).toBe(true);
    expect(givesAway("Japan", "Directed by Someone", true)).toBe(false);
    expect(givesAway("Canada", "Uses the Australian dollar", true)).toBe(false);
    expect(givesAway("Mali", "Has Malay as an official language", true)).toBe(false);
  });

  it("catches a place name from an \"In <place>\" label inside a longer clue name", () => {
    expect(givesAway("Federated States of Micronesia", "In Micronesia")).toBe(true);
    expect(givesAway("People's Republic of China", "In China")).toBe(true);
    expect(givesAway("New York City", "In New York")).toBe(true);
    expect(givesAway("Lake Ontario", "In Ontario")).toBe(true);
    expect(givesAway("South Africa", "In Africa")).toBe(true);
    expect(givesAway("lake ontario", "IN ONTARIO")).toBe(true);
    expect(givesAway("Mont Blanc", "In the Alps")).toBe(false);
    // Whole words only, and stop words do not count.
    expect(givesAway("Chinatown", "In China")).toBe(false);
    expect(givesAway("New Orleans", "In New York")).toBe(false);
    expect(givesAway("The Gambia", "In the Philippines")).toBe(false);
    // A direction or a generic word of a place name names nothing by itself.
    expect(givesAway("South Georgia", "In South America")).toBe(false);
    expect(givesAway("United Arab Emirates", "In the United Kingdom")).toBe(false);
    // Not a place label.
    expect(givesAway("Lake Ontario", "Borders Ontario")).toBe(false);
    expect(givesAway("Panama Canal Zone", "In the UTC−05:00 time zone")).toBe(false);
  });

  it("treats the named pair Central African Republic and In Middle Africa as a give-away", () => {
    expect(givesAway("Central African Republic", "In Middle Africa", true)).toBe(true);
    expect(givesAway("Chad", "In Middle Africa", true)).toBe(false);
    expect(givesAway("Mauritius", "Has English as an official language", true)).toBe(true);
    expect(givesAway("Jamaica", "Has English as an official language", true)).toBe(false);
  });

  it("counts a series fact only for an item listed in two works of that series", () => {
    const rows = [
      { item: "McQueen", v: "Cars", w: "Cars 1" }, { item: "McQueen", v: "Cars", w: "Cars 2" },
      { item: "Buzz", v: "Cars", w: "Cars 1" }, { item: "Buzz", v: "Cars", w: "Cars 1" },
      { item: "Buzz", v: "Toy Story", w: "Toy Story 1" }, { item: "Buzz", v: "Toy Story", w: "Toy Story 2" },
    ];
    const kept = repeatedAcrossWorks(rows, 2).map((r) => `${r.item}/${r.v}`);
    expect(new Set(kept)).toEqual(new Set(["McQueen/Cars", "Buzz/Toy Story"]));
    expect(repeatedAcrossWorks(rows, 3)).toEqual([]);
  });

  it("never uses a clue that contains the place of an \"In <place>\" label", () => {
    const c = cat("In Ontario", 12, "k", "x");
    c.members.push({ name: "Lake Ontario", fame: 9999 });
    expect(orderClues(c).map((x) => x.name)).not.toContain("Lake Ontario");
  });

  it("never uses a country whose adjective is in the label as a clue", () => {
    const c = { ...cat("Uses the Australian dollar", 12), country: true };
    c.members.push({ name: "Australia", fame: 9999 });
    expect(orderClues(c).map((x) => x.name)).not.toContain("Australia");
  });

  it("never uses a member whose name is in the label as a clue", () => {
    const c = cat("Appears in Zed", 12);
    c.members.push({ name: "Zed", fame: 9999 });
    const clues = orderClues(c);
    expect(clues.map((x) => x.name)).not.toContain("Zed");
    expect(clues[5]!.name).toBe("Appears in Zed-m11");
  });

  it("is unusable when too few members are left once give-aways are removed", () => {
    const c = cat("Numbers", 8);
    c.members = c.members.slice(0, 6).map((m, i) => ({ ...m, name: i < 2 ? "Numbers" : m.name }));
    expect(usable(c, 200)).toBe(false);
  });

  it("skips banned names, keeping least-to-most-famous order", () => {
    const c = cat("x", 20);
    const clues = orderClues(c, new Set(["x-m19", "x-m18"]));
    expect(clues[5]!.name).toBe("x-m17");
    const fame = (n: string) => c.members.find((m) => m.name === n)!.fame;
    const f = clues.map((q) => fame(q.name));
    expect(f).toEqual([...f].sort((a, b) => a - b));
  });

  it("does not offer the same overlapping kind as a wrong option", () => {
    const target = cat("target", 12, "cast");
    const others = [...Array.from({ length: 10 }, (_, i) => cat(`cast${i}`, 8, "cast")), ...Array.from({ length: 10 }, (_, i) => cat(`dec${i}`, 8, "decade")), ...Array.from({ length: 10 }, (_, i) => cat(`cty${i}`, 8, "country"))];
    const wrong = pickWrong(target, others, 3);
    expect(wrong).toHaveLength(7);
    expect(wrong.some((w) => w.startsWith("cast"))).toBe(false);
  });

  it("never offers an answer-only kind as a wrong option", () => {
    const target = cat("target", 12, "cast");
    const others = [...Array.from({ length: 10 }, (_, i) => ({ ...cat(`ing${i}`, 8, "ingredient"), answerOnly: true })), ...Array.from({ length: 10 }, (_, i) => cat(`dec${i}`, 8, "decade")), ...Array.from({ length: 10 }, (_, i) => cat(`cty${i}`, 8, "country"))];
    const wrong = pickWrong(target, others, 3);
    expect(wrong).toHaveLength(7);
    expect(wrong.some((w) => w.startsWith("ing"))).toBe(false);
  });

  it("takes about three wrong options from an exclusive kind, and still mixes kinds", () => {
    const target = { ...cat("target", 12, "decade"), exclusive: true };
    const others = [...Array.from({ length: 10 }, (_, i) => ({ ...cat(`dec${i}`, 8, "decade"), exclusive: true })), ...Array.from({ length: 10 }, (_, i) => cat(`cty${i}`, 8, "country")), ...Array.from({ length: 10 }, (_, i) => cat(`gen${i}`, 8, "genre"))];
    const wrong = pickWrong(target, others, 5);
    expect(wrong).toHaveLength(7);
    expect(wrong.filter((w) => w.startsWith("dec"))).toHaveLength(3);
    expect(new Set(wrong.map((w) => w.slice(0, 3))).size).toBeGreaterThan(1);
  });

  it("rejects a category that shares 4 or more clues with one already kept", () => {
    const shared = Array.from({ length: 6 }, (_, i) => ({ name: `s${i}`, fame: 100 + i }));
    const a: RawCategory = { label: "Alpha", kind: "k1", members: shared };
    // sixteen members with the shared ones at the spots the clue spread picks, so Jaccard is low but all 6 clues match
    const bMembers = Array.from({ length: 16 }, (_, pos) => ({ name: pos % 3 === 0 ? `s${pos / 3}` : `e${pos}`, fame: pos * 10 }));
    const b: RawCategory = { label: "Beta", kind: "k2", members: bMembers };
    const filler: RawCategory[] = [];
    for (let i = 0; i < 40; i++) filler.push(cat(`Filler ${i}`, 8, `kind${i % 5}`, `f${i}`));
    const t = assemble("films", [a, b, ...filler], 1);
    const labels = [...t.daily, ...t.practice].map((c) => c.label);
    expect(labels.filter((l) => l === "Alpha" || l === "Beta")).toHaveLength(1);
  });

  it("rejects a category whose members overlap a kept one at Jaccard 0.6 or more", () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ name: `m${i}`, fame: 10 * (i + 1) }));
    const a: RawCategory = { label: "Alpha", kind: "k1", members: base };
    // 9 of 10 shared (Jaccard 9/11), but clues differ because of different fame order
    const b: RawCategory = { label: "Beta", kind: "k2", members: base.slice(0, 9).map((m, i) => ({ ...m, fame: 1000 - i })) };
    const filler: RawCategory[] = [];
    for (let i = 0; i < 40; i++) filler.push(cat(`Filler ${i}`, 8, `kind${i % 5}`, `f${i}`));
    const t = assemble("films", [a, b, ...filler], 2);
    const labels = [...t.daily, ...t.practice].map((c) => c.label);
    expect(labels.filter((l) => l === "Alpha" || l === "Beta").length).toBeLessThanOrEqual(1);
  });

  it("caps how often one name closes a category", () => {
    const star = { name: "Star", fame: 100000 };
    const cats: RawCategory[] = [];
    for (let i = 0; i < 60; i++) cats.push({ label: `Cat ${i}`, kind: `kind${i % 6}`, members: [star, ...cat(`c${i}`, 9, "k", `c${i}`).members] });
    const t = assemble("films", cats, 4);
    const all = [...t.daily, ...t.practice];
    expect(all.filter((c) => c.clues[5]!.name === "Star").length).toBeLessThanOrEqual(6);
    for (const c of all) expect(c.clues).toHaveLength(6);
  });

  it("keeps 50 dailies and 15 practice when 65 categories exist", () => {
    const cats: RawCategory[] = [];
    for (let i = 0; i < 66; i++) cats.push(cat(`Cat ${i}`, 8, `kind${i % 6}`, `c${i}`));
    const t = assemble("films", cats, 5);
    expect(t.daily.length + t.practice.length).toBe(66);
    expect(t.daily.length).toBeGreaterThanOrEqual(50);
    expect(t.practice.length).toBeGreaterThanOrEqual(15);
  });

  it("is deterministic for a seed", () => {
    const cats: RawCategory[] = [];
    for (let i = 0; i < 100; i++) cats.push(cat(`Cat ${i}`, 8, `kind${i % 5}`, `c${i}`));
    expect(assemble("films", cats, 9)).toEqual(assemble("films", cats, 9));
  });
});

const dir = path.resolve(__dirname, "data");
const load = (pool: string): ThreadTopic => JSON.parse(fs.readFileSync(path.join(dir, `${pool}.json`), "utf8"));

describe("Common Thread data", () => {
  it.each(PINPOINT_TOPICS.map((t) => t.id))("%s has enough good categories", (pool) => {
    const t = load(pool);
    expect(t.pool).toBe(pool);
    expect(t.daily.length).toBeGreaterThanOrEqual(50);
    expect(t.practice.length).toBeGreaterThanOrEqual(15);
    const all = [...t.daily, ...t.practice];
    expect(new Set(all.map((c) => c.label)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.label, c.label).not.toMatch(/\b(\w+) \1\b/i);
      expect(c.clues).toHaveLength(6);
      expect(new Set(c.clues.map((x) => x.name)).size).toBe(6);
      for (const clue of c.clues) expect(c.members).toContain(clue.name);
      expect(c.wrong).toHaveLength(7);
      expect(new Set(c.wrong).size).toBe(7);
      expect(c.wrong).not.toContain(c.label);
      for (const w of c.wrong) {
        const other = all.find((x) => x.label === w)!;
        expect(other).toBeTruthy();
        for (const clue of c.clues) expect(other.members).not.toContain(clue.name);
      }
    }
    // quality guards
    const lastUse = new Map<string, number>();
    for (const c of all) {
      lastUse.set(c.clues[5]!.name, (lastUse.get(c.clues[5]!.name) ?? 0) + 1);
      for (const clue of c.clues) expect(givesAway(clue.name, c.label, pool === "flags" || pool === "geography"), `${c.label} / ${clue.name}`).toBe(false);
      for (const text of [c.label, ...c.clues.map((x) => x.name)]) {
        expect(text, text).not.toMatch(/\s{2}|^\s|\s$/);
        expect(text, text).not.toMatch(/(?<!\d)\d{0,2}0s\b/);
        expect(text, text).not.toMatch(/\b[Aa] (?!uni|use|eu|one|ur|us|ufo)[aeiou]\w/);
      }
    }
    for (const [name, n] of lastUse) expect(n, name).toBeLessThanOrEqual(6);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const shared = all[i]!.clues.filter((x) => all[j]!.clues.some((y) => y.name === x.name)).length;
        expect(shared, `${all[i]!.label} / ${all[j]!.label}`).toBeLessThan(4);
      }
    }
    const dl = new Set(t.daily.map((c) => c.label));
    for (const c of t.practice) expect(dl.has(c.label)).toBe(false);
  });

  it.each(PINPOINT_TOPICS.map((t) => t.id))("%s keeps out hand-banned labels and named false facts", (pool) => {
    const t = load(pool);
    const all = [...t.daily, ...t.practice];
    for (const c of all) {
      expect(isBannedLabel(pool, c.label), c.label).toBe(false);
      for (const p of BANNED_PATTERNS) expect(c.label).not.toMatch(p);
      expect(BANNED_LABELS["*"]).not.toContain(c.label);
      expect(c.label, c.label).not.toMatch(/\p{Extended_Pictographic}/u);
      for (const clue of c.clues) expect(clue.name, clue.name).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    for (const [topic, re, name, scope] of MUST_NOT) {
      if (topic !== pool) continue;
      for (const c of all) {
        if (!re.test(c.label)) continue;
        expect(c.clues.map((x) => x.name), `${c.label} / ${name}`).not.toContain(name);
        if (scope !== "clue") expect(c.members, `${c.label} / ${name}`).not.toContain(name);
      }
    }
  });

  it("flags and geography only name allowlisted organisations, and flag members match the hand lists exactly", () => {
    expect([...ORG_ALLOW].sort()).toEqual(Object.keys(MEMBERSHIPS).sort());
    for (const pool of ["flags", "geography"]) {
      for (const c of [...load(pool).daily, ...load(pool).practice]) {
        if (c.label.startsWith("Member of ")) expect(ORG_ALLOW, c.label).toContain(c.label.slice("Member of ".length));
      }
    }
    for (const c of [...load("flags").daily, ...load("flags").practice]) {
      if (!c.label.startsWith("Member of ")) continue;
      const codes = MEMBERSHIPS[c.label.slice("Member of ".length)]!;
      for (const clue of c.clues) expect(codes, `${c.label} / ${clue.name}`).toContain(clue.q!.toUpperCase());
    }
  });

  it("hand-written memberships have the real sizes", () => {
    const size = (o: string) => MEMBERSHIPS[o]!.length;
    expect(size("European Union")).toBe(27);
    expect(size("G7")).toBe(7);
    expect(size("G20")).toBe(19);
    expect(size("Arab League")).toBe(22);
    expect(size("Caribbean Community")).toBe(15);
    expect(size("Commonwealth of Nations")).toBe(56);
    expect(size("Asia-Pacific Economic Cooperation")).toBe(21);
    expect(size("ASEAN")).toBe(11);
    expect(MEMBERSHIPS["ASEAN"]).not.toContain("AU");
    expect(MEMBERSHIPS["European Union"]).not.toContain("GB");
    for (const codes of Object.values(MEMBERSHIPS)) {
      expect(new Set(codes).size).toBe(codes.length);
      for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("puts no character in both the superheroes and the villains file", () => {
    const names = (pool: string) => new Set([...load(pool).daily, ...load(pool).practice].flatMap((c) => [...c.clues.map((x) => x.name), ...c.members]));
    const heroes = names("superheroes");
    const both = [...names("villains")].filter((n) => heroes.has(n));
    expect(both).toEqual([]);
  });

  it("takes about three wrong options from the same kind on date categories", () => {
    const DATE = /^(.*) in the (\d{3,4}0s|\d+(?:st|nd|rd|th) century)$/;
    const key = (label: string) => { const m = label.match(DATE); return m ? `${m[1]}|${m[2]!.includes("century") ? "c" : "d"}` : null; };
    for (const pool of PINPOINT_TOPICS.map((t) => t.id)) {
      const t = load(pool);
      const all = [...t.daily, ...t.practice];
      for (const c of all) {
        const k = key(c.label);
        if (!k) continue;
        const usable = all.filter((o) => o.label !== c.label && key(o.label) === k && !c.clues.some((x) => o.members.includes(x.name)));
        const same = c.wrong.filter((w) => key(w) === k).length;
        expect(same, `${pool}: ${c.label}`).toBe(Math.min(3, usable.length));
      }
    }
  });

  it("has a file for every topic and nothing extra", () => {
    const ids = PINPOINT_TOPICS.map((t) => t.id).sort();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(files).toEqual(ids);
  });
});
