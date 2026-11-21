import { describe, expect, it } from "vitest";
import * as C from "./customGames.service";
import type { CustomStore, Row } from "./customGames.service";

/** The store's contract, in memory. */
function memory(): CustomStore & { rows: Row[] } {
  const rows: Row[] = [];
  const votes = new Map<string, number>(), reports = new Set<string>();
  let n = 0;
  const find = (id: string) => rows.find((r) => r.id === id)!;
  return {
    rows,
    create: async (d) => { const r: Row = { ...d, id: `g${++n}`, authorName: "Ann", status: "draft", visibility: "public", plays: 0, likes: 0, dislikes: 0, reports: 0, updatedAt: new Date(n), publishedAt: null }; rows.push(r); return r; },
    update: async (id, patch) => Object.assign(find(id), patch, { updatedAt: new Date(++n) }),
    byId: async (id) => rows.find((r) => r.id === id) ?? null,
    bySlug: async (slug) => rows.find((r) => r.slug === slug) ?? null,
    byAuthor: async (a) => rows.filter((r) => r.authorId === a),
    countByAuthor: async (a) => rows.filter((r) => r.authorId === a && r.status !== "removed").length,
    list: async ({ kind, sort, q, skip, take, hideReportedAt }) =>
      rows.filter((r) => r.status === "published" && r.visibility === "public" && r.reports < hideReportedAt && (!kind || r.kind === kind) && (!q || r.title.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (sort === "new" ? b.publishedAt!.getTime() - a.publishedAt!.getTime() : sort === "top" ? b.likes - a.likes : b.plays - a.plays)).slice(skip, skip + take),
    addPlay: async (id) => { find(id).plays++; },
    rate: async (id, voter, value) => {
      votes.set(`${id}|${voter}`, value);
      const mine = [...votes].filter(([k]) => k.startsWith(`${id}|`)).map(([, v]) => v);
      return Object.assign(find(id), { likes: mine.filter((v) => v === 1).length, dislikes: mine.filter((v) => v === -1).length });
    },
    report: async (id, reporter) => { const k = `${id}|${reporter}`; if (reports.has(k)) return false; reports.add(k); find(id).reports++; return true; },
    reported: async (min) => rows.filter((r) => r.reports >= min),
  };
}

const hotair = (title = "Family answers") => ({ kind: "hotair", title, description: "", content: { surveys: Array.from({ length: 5 }, (_, s) => ({ q: `Name something ${s}`, answers: ["Alpha", "Bravo", "Charlie"] })) } });
const clean = async () => ({ ok: true });
const must = <T extends { ok: boolean }>(r: T) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const voter = (n: number) => `voter-${String(n).padStart(6, "0")}`;

async function published(store: CustomStore, author = "u1", title?: string) {
  const g = must(await C.save(store, author, hotair(title))).game;
  must(await C.publish(store, clean, author, g.id, "public"));
  return g;
}

describe("writing a custom game", () => {
  it("saves an unfinished draft and says what is still wrong with it", async () => {
    const store = memory();
    const r = must(await C.save(store, "u1", { kind: "hotair", title: "Half done", content: { surveys: [{ q: "Only one", answers: ["a"] }] } }));
    expect(r.game.status).toBe("draft");
    expect(r.game.errors?.join()).toMatch(/between 5 and 20/);
    expect(r.game.slug).toMatch(/^[a-z2-9]{8}$/);
  });

  it("will not publish until it is valid, and not if moderation objects", async () => {
    const store = memory();
    const half = must(await C.save(store, "u1", { kind: "hotair", title: "Half done", content: { surveys: [] } })).game;
    expect(await C.publish(store, clean, "u1", half.id, "public")).toMatchObject({ ok: false, status: 400 });
    const good = must(await C.save(store, "u1", hotair())).game;
    expect(await C.publish(store, async () => ({ ok: false, reason: "That text isn't allowed." }), "u1", good.id, "public")).toMatchObject({ ok: false, error: "That text isn't allowed." });
    expect(store.rows.every((r) => r.status === "draft")).toBe(true);
  });

  it("only the author can change, publish or delete a game", async () => {
    const store = memory();
    const g = must(await C.save(store, "u1", hotair())).game;
    expect(await C.save(store, "u2", hotair("Hijacked"), g.id)).toMatchObject({ ok: false, status: 404 });
    expect(await C.publish(store, clean, "u2", g.id, "public")).toMatchObject({ ok: false, status: 404 });
    expect(await C.remove(store, "u2", g.id)).toMatchObject({ ok: false, status: 404 });
    expect(store.rows[0]!.title).toBe("Family answers");
    expect((await C.remove(store, "admin", g.id, true)).ok).toBe(true);
  });

  it("a published game cannot be saved into a broken state", async () => {
    const store = memory();
    const g = await published(store);
    expect(await C.save(store, "u1", { kind: "hotair", title: "Broken", content: { surveys: [] } }, g.id)).toMatchObject({ ok: false, status: 400 });
    expect(must(await C.save(store, "u1", hotair("Renamed"), g.id)).game.title).toBe("Renamed");
  });

  it("caps how many games one author keeps, and refuses oversized content", async () => {
    const store = memory();
    for (let i = 0; i < C.MAX_PER_AUTHOR; i++) must(await C.save(store, "u1", hotair(`Game ${i}`)));
    expect(await C.save(store, "u1", hotair("One too many"))).toMatchObject({ ok: false, status: 400 });
    expect(await C.save(store, "u2", { kind: "hotair", title: "Huge", content: { blob: "x".repeat(250_000) } })).toMatchObject({ ok: false, status: 413 });
  });
});

describe("finding and opening games", () => {
  it("lists only public, published games; drafts and unlisted ones stay out", async () => {
    const store = memory();
    await published(store, "u1", "Listed");
    must(await C.save(store, "u1", hotair("Still a draft")));
    const hidden = must(await C.save(store, "u1", hotair("By link only"))).game;
    must(await C.publish(store, clean, "u1", hidden.id, "unlisted"));
    const { games } = await C.browse(store, {});
    expect(games.map((g) => g.title)).toEqual(["Listed"]);
    expect(games[0]).not.toHaveProperty("content");
    expect(must(await C.open(store, hidden.slug)).game.title).toBe("By link only");
  });

  it("a draft opens for its author only, and a removed game for nobody", async () => {
    const store = memory();
    const g = must(await C.save(store, "u1", hotair())).game;
    expect(await C.open(store, g.slug)).toMatchObject({ ok: false, status: 404 });
    expect(await C.open(store, g.slug, "u2")).toMatchObject({ ok: false, status: 404 });
    expect(must(await C.open(store, g.slug, "u1")).game).toMatchObject({ mine: true, id: g.id });
    must(await C.remove(store, "u1", g.id));
    expect(await C.open(store, g.slug, "u1")).toMatchObject({ ok: false, status: 404 });
    expect(await C.mine(store, "u1")).toEqual([]);
  });

  it("filters by kind and search text, sorts, and pages", async () => {
    const store = memory();
    const a = await published(store, "u1", "Pizza night"), b = await published(store, "u1", "Road trip");
    must(await C.played(store, b.slug)); must(await C.played(store, b.slug)); must(await C.played(store, a.slug));
    expect((await C.browse(store, {})).games.map((g) => g.title)).toEqual(["Road trip", "Pizza night"]);
    expect((await C.browse(store, { q: "pizza" })).games.map((g) => g.title)).toEqual(["Pizza night"]);
    expect((await C.browse(store, { kind: "draft" })).games).toEqual([]);
    expect(C.parseList({ sort: "junk", kind: "x", page: "-3", q: "50%_off" })).toEqual({ kind: undefined, sort: "popular", q: "50  off", skip: 0, take: C.PAGE + 1 });
    for (let i = 0; i < C.PAGE; i++) await published(store, `u${i + 5}`, `Filler ${i}`);
    const first = await C.browse(store, {});
    expect(first.games).toHaveLength(C.PAGE);
    expect(first.more).toBe(true);
    expect((await C.browse(store, { page: 1 })).more).toBe(false);
  });
});

describe("playing, rating and reporting", () => {
  it("one voter has one thumb, and can change it", async () => {
    const store = memory();
    const g = await published(store);
    expect(must(await C.rate(store, g.slug, voter(1), 1))).toMatchObject({ likes: 1, dislikes: 0 });
    expect(must(await C.rate(store, g.slug, voter(2), 1))).toMatchObject({ likes: 2, dislikes: 0 });
    expect(must(await C.rate(store, g.slug, voter(1), -1))).toMatchObject({ likes: 1, dislikes: 1 });
    expect(await C.rate(store, g.slug, "x", 1)).toMatchObject({ ok: false, status: 400 });
    expect(await C.rate(store, g.slug, voter(3), 5)).toMatchObject({ ok: false, status: 400 });
  });

  it("drafts cannot be played, rated or reported", async () => {
    const store = memory();
    const g = must(await C.save(store, "u1", hotair())).game;
    expect(await C.played(store, g.slug)).toMatchObject({ ok: false, status: 404 });
    expect(await C.rate(store, g.slug, voter(1), 1)).toMatchObject({ ok: false, status: 404 });
    expect(await C.report(store, g.slug, voter(1), "spam")).toMatchObject({ ok: false, status: 404 });
  });

  it("enough different reporters hide a game from the listings, but one person cannot do it alone", async () => {
    const store = memory();
    const g = await published(store);
    for (let i = 0; i < 9; i++) must(await C.report(store, g.slug, voter(1), "spam"));
    expect((await C.browse(store, {})).games).toHaveLength(1);
    for (let i = 2; i <= C.HIDE_AT_REPORTS; i++) must(await C.report(store, g.slug, voter(i), "offensive"));
    expect((await C.browse(store, {})).games).toHaveLength(0);
    expect(must(await C.open(store, g.slug)).game.title).toBe("Family answers");
    expect(await C.report(store, g.slug, voter(9), "because")).toMatchObject({ ok: false, status: 400 });
  });
});
