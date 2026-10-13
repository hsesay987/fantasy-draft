import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error plain JS module
import { build } from "../scripts/sync-shared.mjs";

describe("backend shared copy", () => {
  it("matches the web app (run `npm run sync:shared` if this fails)", () => {
    const expected = build() as Record<string, string>;
    const root = path.resolve(__dirname, "../backend/src/shared");
    for (const [rel, content] of Object.entries(expected)) {
      const file = path.join(root, rel);
      expect(fs.existsSync(file), `${rel} missing`).toBe(true);
      expect(fs.readFileSync(file, "utf8"), `${rel} is stale`).toBe(content);
    }
    const onDisk = (function walk(d: string, rel = ""): string[] {
      return fs.readdirSync(path.join(d, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d, path.join(rel, e.name)) : [path.join(rel, e.name)]));
    })(root);
    expect(onDisk.sort()).toEqual(Object.keys(expected).sort());
  });
});
