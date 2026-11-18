import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { entriesOf } from "./source";
import "./lists";

// Room screens ship to every phone in the room, so NPAT's accepted answers must never be in their bundles. This walks
// the import graph from the room entry points and fails if it reaches the category lists.
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

const isLists = (f: string) => f === "app/topicDraft/npat/lists.ts" || f.startsWith("app/topicDraft/npat/data/");

const views = fs.readdirSync(path.join(ROOT, "app/play/views"))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => `app/play/views/${f}`);
const ENTRIES = ["app/room/[code]/page.tsx", "app/play/GameScreen.tsx", "app/play/screenInfo.ts", "app/topicDraft/core.ts", "app/topicDraft/party/pools.ts", "app/topicDraft/party/tournament.ts", "app/play/types.ts", ...views];

describe("room bundles", () => {
  const files = reached(ENTRIES);

  it("walks a real graph", () => {
    expect(files.has("app/topicDraft/core.ts")).toBe(true);
    expect(files.has("app/topicDraft/formats/pecking.ts")).toBe(true);
  });

  it("wires core.ts and pools.ts to the NPAT engine and meta, not the lists", () => {
    for (const e of ["app/topicDraft/core.ts", "app/topicDraft/party/pools.ts"]) {
      const r = reached([e]);
      expect(r.has("app/topicDraft/npat/categories.ts")).toBe(true);
      expect([...r].filter(isLists)).toEqual([]);
    }
    expect(reached(["app/topicDraft/core.ts"]).has("app/topicDraft/formats/npat.ts")).toBe(true);
  });

  it("would catch a file that does import the lists", () => {
    const control = reached(["app/topicDraft/npat/lists.ts"]);
    expect([...control].some(isLists)).toBe(true);
    expect([...control].some((f) => f.startsWith("app/topicDraft/npat/data/"))).toBe(true);
  });

  it("never reach NPAT's category lists", () => {
    expect([...files].filter(isLists)).toEqual([]);
  });
});

describe("entriesOf", () => {
  it("serves the lists once lists.ts is loaded", () => {
    expect(entriesOf("animal").length).toBeGreaterThan(100);
  });
});
