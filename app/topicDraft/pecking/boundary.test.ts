import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listFor } from "./source";
import "./lists";

// Room screens ship to every phone in the room, so the answers must never be in their bundles. This walks the
// import graph from the room entry points and fails if it reaches the ranked lists (or Vowel Play's word list).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g;

function reached(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = entries.map((e) => path.join(ROOT, e));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.tsx?$/.test(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(IMPORT)) {
      const r = resolve(f, m[1]!);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return new Set([...seen].map(rel));
}

const views = fs.readdirSync(path.join(ROOT, "app/play/views"))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => `app/play/views/${f}`);
const ENTRIES = ["app/room/[code]/page.tsx", "app/play/GameScreen.tsx", "app/play/screenInfo.ts", "app/topicDraft/core.ts", ...views];

describe("room bundles", () => {
  const files = reached(ENTRIES);

  it("walks a real graph", () => {
    expect(files.has("app/topicDraft/core.ts")).toBe(true);
    expect(files.has("app/topicDraft/formats/pecking.ts")).toBe(true);
  });

  it("never reach Pecking Order's ranked lists", () => {
    const bad = [...files].filter((f) => f === "app/topicDraft/pecking/lists.ts" || f.startsWith("app/topicDraft/pecking/data/"));
    expect(bad).toEqual([]);
  });

  it("never reach Vowel Play's word list", () => {
    const bad = [...files].filter((f) => f === "app/topicDraft/party/vowelWords.ts" || f.endsWith("/vowelWordList.json"));
    expect(bad).toEqual([]);
  });
});

describe("listFor", () => {
  it("serves the lists once lists.ts is loaded", () => {
    const l = listFor("countries-population");
    expect(l?.id).toBe("countries-population");
    expect(l!.items.length).toBeGreaterThan(100);
    expect(listFor("no-such-list")).toBeUndefined();
  });
});
