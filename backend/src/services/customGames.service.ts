// Custom mode: players write their own version of a game, publish it, and others play, rate and report it.
// The rules for what a game may hold live in the shared module (the browser editor uses the same ones); this
// file adds ownership, publishing, listing and the counters. All storage goes through `CustomStore`, so the
// logic is tested without a database.
import crypto from "crypto";
import { checkCustom, customSummary, customText, type CustomGameData, type CustomKind } from "../shared/topicDraft/custom";
import type { Moderation } from "../lib/moderation";

export type Row = {
  id: string; slug: string; authorId: string; authorName: string | null; kind: string; title: string; description: string; content: unknown;
  status: string; visibility: string; plays: number; likes: number; dislikes: number; reports: number; updatedAt: Date; publishedAt: Date | null;
};
export type Sort = "popular" | "new" | "top";
export type ListQuery = { kind?: CustomKind; sort: Sort; q?: string; skip: number; take: number };

export interface CustomStore {
  create(row: Pick<Row, "slug" | "authorId" | "kind" | "title" | "description" | "content">): Promise<Row>;
  update(id: string, patch: Partial<Pick<Row, "kind" | "title" | "description" | "content" | "status" | "visibility" | "publishedAt">>): Promise<Row>;
  byId(id: string): Promise<Row | null>;
  bySlug(slug: string): Promise<Row | null>;
  byAuthor(authorId: string): Promise<Row[]>;
  countByAuthor(authorId: string): Promise<number>;
  list(q: ListQuery & { hideReportedAt: number }): Promise<Row[]>;
  addPlay(id: string): Promise<void>;
  /** Save one voter's thumb and return the game's new totals. */
  rate(id: string, voter: string, value: 1 | -1): Promise<{ likes: number; dislikes: number }>;
  /** Save one reporter's report; false when they already reported this game. */
  report(id: string, reporter: string, reason: string): Promise<boolean>;
  reported(min: number): Promise<Row[]>;
}

export const MAX_PER_AUTHOR = 40;
/** A game with this many reports drops out of the listings until an admin looks at it. Its link still opens. */
export const HIDE_AT_REPORTS = 5;
export const PAGE = 24;

export type Fail = { ok: false; status: number; error: string; errors?: string[] };
const fail = (status: number, error: string, errors?: string[]): Fail => ({ ok: false, status, error, errors });

/** What everyone may see of a game. `content` only goes out with a single game, never in a list. */
export function card(r: Row) {
  return {
    slug: r.slug, kind: r.kind, title: r.title, description: r.description, author: r.authorName ?? "A player",
    summary: customSummary({ kind: r.kind as CustomKind, content: r.content as never }),
    plays: r.plays, likes: r.likes, dislikes: r.dislikes, status: r.status, visibility: r.visibility,
    updatedAt: r.updatedAt.toISOString(), publishedAt: r.publishedAt?.toISOString() ?? null,
  };
}
export type Card = ReturnType<typeof card>;

const newSlug = () => Array.from(crypto.randomBytes(8), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
const VOTER = /^[A-Za-z0-9_-]{8,64}$/;

/** Create a draft, or save changes to one. An unfinished draft may be saved; it is checked fully on publish. */
export async function save(store: CustomStore, authorId: string, input: any, id?: string): Promise<{ ok: true; game: Card & { id: string; content: unknown; errors?: string[] } } | Fail> {
  const checked = checkCustom(input);
  const problems = checked.ok === false ? checked.errors : null;
  // Keep an author's unfinished work: store what they sent, bounded, and report the problems alongside it.
  const raw = JSON.stringify(input?.content ?? {});
  if (raw.length > 200_000) return fail(413, "That game is too big to save.");
  const data: CustomGameData = checked.ok === true ? checked.data : { kind: input?.kind, title: String(input?.title ?? "").slice(0, 60) || "Untitled", description: String(input?.description ?? "").slice(0, 240), content: JSON.parse(raw) };
  if (!["draft", "summit", "hotair"].includes(data.kind)) return fail(400, "Choose what kind of game this is.");
  let row: Row;
  if (id) {
    const existing = await store.byId(id);
    if (!existing || existing.authorId !== authorId || existing.status === "removed") return fail(404, "Game not found.");
    // A published game must stay valid: nobody should open a link to a broken game.
    if (existing.status === "published" && problems) return fail(400, "Fix these before saving a published game.", problems);
    row = await store.update(id, { kind: data.kind, title: data.title, description: data.description, content: data.content });
  } else {
    if ((await store.countByAuthor(authorId)) >= MAX_PER_AUTHOR) return fail(400, `You can keep up to ${MAX_PER_AUTHOR} custom games. Delete one to make another.`);
    row = await store.create({ slug: newSlug(), authorId, kind: data.kind, title: data.title, description: data.description, content: data.content });
  }
  return { ok: true, game: { ...card(row), id: row.id, content: row.content, ...(problems ? { errors: problems } : {}) } };
}

export async function publish(store: CustomStore, moderate: (t: unknown[]) => Promise<Moderation>, authorId: string, id: string, visibility: unknown): Promise<{ ok: true; game: Card } | Fail> {
  const row = await store.byId(id);
  if (!row || row.authorId !== authorId || row.status === "removed") return fail(404, "Game not found.");
  const checked = checkCustom({ kind: row.kind, title: row.title, description: row.description, content: row.content });
  if (checked.ok === false) return fail(400, "Fix these before publishing.", checked.errors);
  const mod = await moderate(customText(checked.data));
  if (!mod.ok) return fail(400, mod.reason ?? "That text isn't allowed.");
  const out = await store.update(id, { status: "published", visibility: visibility === "unlisted" ? "unlisted" : "public", publishedAt: row.publishedAt ?? new Date(), content: checked.data.content, title: checked.data.title, description: checked.data.description });
  return { ok: true, game: card(out) };
}

export async function unpublish(store: CustomStore, authorId: string, id: string): Promise<{ ok: true; game: Card } | Fail> {
  const row = await store.byId(id);
  if (!row || row.authorId !== authorId || row.status === "removed") return fail(404, "Game not found.");
  return { ok: true, game: card(await store.update(id, { status: "draft" })) };
}

/** The author deletes their game. The row is kept as "removed" so its reports and link history are not lost. */
export async function remove(store: CustomStore, authorId: string, id: string, admin = false): Promise<{ ok: true } | Fail> {
  const row = await store.byId(id);
  if (!row || (!admin && row.authorId !== authorId)) return fail(404, "Game not found.");
  await store.update(id, { status: "removed" });
  return { ok: true };
}

export async function mine(store: CustomStore, authorId: string) {
  return (await store.byAuthor(authorId)).filter((r) => r.status !== "removed").map((r) => ({ ...card(r), id: r.id }));
}

/** One game with its content. Drafts open only for their author; removed games open for nobody. */
export async function open(store: CustomStore, slug: string, viewerId?: string): Promise<{ ok: true; game: Card & { content: unknown; mine: boolean; id?: string } } | Fail> {
  const row = await store.bySlug(String(slug).toLowerCase().slice(0, 16));
  const own = !!row && row.authorId === viewerId;
  if (!row || row.status === "removed" || (row.status !== "published" && !own)) return fail(404, "That game isn't available. It may have been unpublished.");
  return { ok: true, game: { ...card(row), content: row.content, mine: own, ...(own ? { id: row.id } : {}) } };
}

export function parseList(query: Record<string, unknown>): ListQuery {
  const kind = ["draft", "summit", "hotair"].includes(String(query.kind)) ? (String(query.kind) as CustomKind) : undefined;
  const sort: Sort = query.sort === "new" || query.sort === "top" ? query.sort : "popular";
  const q = String(query.q ?? "").replace(/[%_\\]/g, " ").trim().slice(0, 40) || undefined;
  const page = Math.max(0, Math.min(50, Math.floor(Number(query.page) || 0)));
  return { kind, sort, q, skip: page * PAGE, take: PAGE + 1 };
}
export async function browse(store: CustomStore, query: Record<string, unknown>) {
  const rows = await store.list({ ...parseList(query), hideReportedAt: HIDE_AT_REPORTS });
  return { games: rows.slice(0, PAGE).map(card), more: rows.length > PAGE };
}

export async function played(store: CustomStore, slug: string): Promise<{ ok: true } | Fail> {
  const row = await store.bySlug(slug);
  if (!row || row.status !== "published") return fail(404, "Game not found.");
  await store.addPlay(row.id);
  return { ok: true };
}

export async function rate(store: CustomStore, slug: string, voter: unknown, value: unknown): Promise<{ ok: true; likes: number; dislikes: number } | Fail> {
  if (typeof voter !== "string" || !VOTER.test(voter) || (value !== 1 && value !== -1)) return fail(400, "Not a valid rating.");
  const row = await store.bySlug(slug);
  if (!row || row.status !== "published") return fail(404, "Game not found.");
  return { ok: true, ...(await store.rate(row.id, voter, value)) };
}

export const REPORT_REASONS = ["offensive", "wrong", "spam", "copied", "other"] as const;
export async function report(store: CustomStore, slug: string, reporter: unknown, reason: unknown): Promise<{ ok: true } | Fail> {
  if (typeof reporter !== "string" || !VOTER.test(reporter) || !REPORT_REASONS.includes(reason as never)) return fail(400, "Not a valid report.");
  const row = await store.bySlug(slug);
  if (!row || row.status !== "published") return fail(404, "Game not found.");
  await store.report(row.id, reporter, reason as string);
  return { ok: true };
}
