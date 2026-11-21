import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createNpatRouter, type DisputeRow } from "./npat.route";
import { createNpatDailyCap } from "../services/daily.service";
import { createNpatHistory } from "../services/npatHistory.service";
import { createNpatJudge, memoryVerdictCache } from "../services/npatJudge.service";

let server: Server;
let base = "";
const disputes: DisputeRow[] = [];
const history = createNpatHistory({ async all() { return [{ category: "animal", answer: "zebra", count: 1 }, { category: "animal", answer: "cat", count: 3 }, { category: "animal", answer: "zebu", count: 3 }, { category: "animal", answer: "dog", count: 50 }]; }, async increment() {} });
const judge = createNpatJudge({ llm: null, cache: memoryVerdictCache() });

beforeAll(async () => {
  await history.load();
  const app = express();
  app.use(express.json());
  app.use("/npat", createNpatRouter({ judge, history, disputes: { async add(d) { disputes.push(d); } }, judgeCap: createNpatDailyCap(2), disputeCap: createNpatDailyCap(2) }));
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/npat`;
});
afterAll(() => { server.close(); });

const post = async (path: string, body: unknown) => {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
};

describe("npat routes", () => {
  it("POST /judge returns one verdict per answer", async () => {
    const r = await post("/judge", { category: "animal", letter: "Z", answers: ["zebu"] });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text).verdicts).toEqual([{ ok: true, niche: 0, reason: "unchecked", source: "fallback" }]);
  });

  it("POST /judge rejects bad bodies", async () => {
    expect((await post("/judge", { category: "nope", letter: "Z", answers: ["a"] })).status).toBe(400);
    expect((await post("/judge", { category: "animal", letter: "ZZ", answers: ["a"] })).status).toBe(400);
    expect((await post("/judge", { category: "animal", letter: "Z", answers: new Array(6).fill("z") })).status).toBe(400);
    expect((await post("/judge", { category: "animal", letter: "Z", answers: [1] })).status).toBe(400);
  });

  it("POST /judge answers 429 once the daily cap of lookups is spent", async () => {
    const r = await post("/judge", { category: "animal", letter: "Z", answers: ["zebu", "zorse", "zonkey"] });
    expect(r.status).toBe(429);
  });

  it("POST /dispute stores a trimmed reason and answers 204, then 429 over the cap", async () => {
    const body = { category: "animal", letter: "Z", answer: "zebu", typed: "Zebu", tier: "rare", reason: "x".repeat(500) };
    const ok = await post("/dispute", body);
    expect(ok.status).toBe(204);
    expect(disputes[0]!.reason).toHaveLength(200);
    expect(disputes[0]!.answer).toBe("zebu");
    expect(disputes[0]!.ipHash).toMatch(/^[0-9a-f]{16,}$/);
    expect(JSON.stringify(disputes[0])).not.toContain("127.0.0.1");
    expect((await post("/dispute", body)).status).toBe(204);
    expect((await post("/dispute", body)).status).toBe(429);
  });

  it("POST /dispute rejects an unknown category", async () => {
    expect((await post("/dispute", { category: "nope", letter: "Z", answer: "a", reason: "r" })).status).toBe(400);
  });

  it("GET /stats gives each answer's share of the plays for that letter only (other letters' answers do not dilute it)", async () => {
    const res = await fetch(`${base}/stats?category=animal&letter=Z&answers=Zebra,Zebu,Unseen`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ answer: "Zebra", share: 25 }, { answer: "Zebu", share: 75 }, { answer: "Unseen", share: 0 }]);
  });

  it("GET /stats rejects a bad category", async () => {
    expect((await fetch(`${base}/stats?category=nope&letter=Z&answers=a`)).status).toBe(400);
  });
  it("GET /stats needs a letter", async () => {
    expect((await fetch(`${base}/stats?category=animal&answers=Zebra`)).status).toBe(400);
  });
});
