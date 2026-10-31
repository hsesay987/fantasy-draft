// Player ratings for trivia: quality (1-5), difficulty (1 too easy .. 5 too hard) and a "the answer is wrong" flag,
// for whole categories, single clues and Family Feud surveys. Enough bad votes retire an item so it stops being served;
// an admin can bring it back. Votes are anonymous (a random id kept in the player's browser), one per voter and target.

export type Kind = "category" | "clue" | "survey";
export const KINDS: Kind[] = ["category", "clue", "survey"];

export const isAdminVoter = (voter: string) => voter.startsWith("admin:");

export type RatingInput = { kind: Kind; targetId: string; clue: number; voter: string; quality: number | null; difficulty: number | null; wrong: boolean };
export type RatingRow = { kind: Kind; clue: number; voter: string; quality: number | null; difficulty: number | null; wrong: boolean };
export type Summary = { votes: number; quality: number | null; qualityVotes: number; difficulty: number | null; wrongFlags: number };

/** Votes needed before an item can be retired, so one unhappy player cannot remove anything. */
export const MIN_VOTES = 5;
export const RETIRE_BELOW = 2.4;

const int = (v: unknown, lo: number, hi: number): number | null => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);

/** Checks a request body. Returns null when it is not a usable rating. */
export function parseRating(body: any): RatingInput | null {
  const kind = body?.kind as Kind;
  if (!KINDS.includes(kind)) return null;
  const targetId = typeof body?.id === "string" && body.id.length > 0 && body.id.length <= 40 ? body.id : null;
  const voter = typeof body?.voter === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.voter) ? body.voter : null;
  if (!targetId || !voter) return null;
  const clue = kind === "clue" ? int(body?.clue, 0, 7) : -1;
  if (clue === null) return null;
  const quality = int(body?.quality, 1, 5), difficulty = int(body?.difficulty, 1, 5), wrong = body?.wrong === true;
  if (quality === null && difficulty === null && !wrong) return null;
  return { kind, targetId, clue, voter, quality, difficulty, wrong };
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

export function summarize(rows: Pick<RatingRow, "quality" | "difficulty" | "wrong">[]): Summary {
  const q = rows.flatMap((r) => (r.quality == null ? [] : [r.quality]));
  const d = rows.flatMap((r) => (r.difficulty == null ? [] : [r.difficulty]));
  return { votes: rows.length, quality: avg(q), qualityVotes: q.length, difficulty: avg(d), wrongFlags: rows.filter((r) => r.wrong).length };
}

export function shouldRetire(s: Summary): boolean {
  if (s.qualityVotes >= MIN_VOTES && s.quality! < RETIRE_BELOW) return true;
  return s.wrongFlags >= 3 && s.wrongFlags / Math.max(1, s.votes) >= 0.3;
}

/** A category is retired when it, or any one clue in it, meets the rule. */
export function categoryShouldRetire(rows: RatingRow[]): boolean {
  if (shouldRetire(summarize(rows.filter((r) => r.kind === "category")))) return true;
  const byClue = new Map<number, RatingRow[]>();
  for (const r of rows) if (r.kind === "clue") byClue.set(r.clue, [...(byClue.get(r.clue) ?? []), r]);
  return [...byClue.values()].some((g) => shouldRetire(summarize(g)));
}

export interface RatingStore {
  upsert(r: RatingInput): Promise<void>;
  /** Every rating on a category (its own and its clues') or on a survey. */
  forItem(kind: "category" | "survey", id: string): Promise<RatingRow[]>;
  setRetired(kind: "category" | "survey", id: string, retired: boolean): Promise<void>;
  setFlagged?(kind: "category" | "survey", id: string, flagged: boolean): Promise<void>;
}

/** Records a vote and retires the item if the votes now say it should go. */
export async function recordRating(store: RatingStore, r: RatingInput): Promise<{ retired: boolean }> {
  await store.upsert(r);
  const item = r.kind === "survey" ? "survey" : "category";
  // Only player votes count toward automatic retirement; admins act directly.
  const rows = (await store.forItem(item, r.targetId)).filter((x) => !isAdminVoter(x.voter));
  const retire = item === "survey" ? shouldRetire(summarize(rows)) : categoryShouldRetire(rows);
  if (retire) await store.setRetired(item, r.targetId, true);
  return { retired: retire };
}

/**
 * An admin's own rating, saved under their account. Unlike player votes it acts at once: marking the answer wrong
 * retires the item, and the admin's stars and difficulty are shown apart from the players'.
 */
export async function recordAdminRating(store: RatingStore, adminId: string, r: Omit<RatingInput, "voter">): Promise<{ retired: boolean }> {
  await store.upsert({ ...r, voter: `admin:${adminId}` });
  if (r.wrong) {
    await store.setRetired(r.kind === "survey" ? "survey" : "category", r.targetId, true);
    return { retired: true };
  }
  return { retired: false };
}

// Loaded on first use so importing this file (and its tests) never needs a database connection.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = () => require("../lib/prisma").default as typeof import("../lib/prisma").default;

export const prismaRatingStore: RatingStore = {
  async upsert(r) {
    const key = { kind: r.kind, targetId: r.targetId, clue: r.clue, voter: r.voter };
    const data = { quality: r.quality, difficulty: r.difficulty, wrong: r.wrong };
    await db().triviaRating.upsert({ where: { kind_targetId_clue_voter: key }, create: { ...key, ...data }, update: data });
  },
  async forItem(kind, id) {
    const rows = await db().triviaRating.findMany({ where: { targetId: id, kind: kind === "survey" ? "survey" : { in: ["category", "clue"] } } });
    return rows.map((x) => ({ kind: x.kind as Kind, clue: x.clue, voter: x.voter, quality: x.quality, difficulty: x.difficulty, wrong: x.wrong }));
  },
  async setRetired(kind, id, retired) {
    if (kind === "survey") await db().triviaSurvey.update({ where: { id }, data: { retired } });
    else await db().triviaCategory.update({ where: { id }, data: { retired } });
  },
};

export type Mine = { quality: number | null; difficulty: number | null; wrong: boolean } | null;
export type ReviewItem = {
  kind: "category" | "survey"; id: string; pool: string; title: string; source: string; uses: number; retired: boolean; flagged: boolean;
  summary: Summary; mine: Mine; clues?: { index: number; q: string; right: string; wrong: string[]; summary: Summary; mine: Mine }[]; answers?: string[];
};

export type ReviewOpts = {
  pool?: string; kind: "category" | "survey"; sort: "worst" | "best" | "votes";
  /** "active" = in play, "retired", "flagged" = marked by an admin, "all" = everything. */
  status: "active" | "retired" | "flagged" | "all";
  /** Include items nobody has rated yet, so an admin can rate them directly. */
  unrated: boolean; search?: string; limit: number; adminId: string;
};

const mineOf = (rows: { voter: string; quality: number | null; difficulty: number | null; wrong: boolean }[], adminId: string): Mine => {
  const r = rows.find((x) => x.voter === `admin:${adminId}`);
  return r ? { quality: r.quality, difficulty: r.difficulty, wrong: r.wrong } : null;
};

/** Everything an admin needs to decide what to keep: each item with the players' votes and the admin's own, worst first by default. */
export async function reviewItems(opts: ReviewOpts): Promise<ReviewItem[]> {
  const where = {
    ...(opts.pool ? { pool: opts.pool } : {}),
    ...(opts.status === "retired" ? { retired: true } : opts.status === "active" ? { retired: false } : opts.status === "flagged" ? { flagged: true } : {}),
  };
  const items: ReviewItem[] = [];
  const players = (rows: RatingRowWithVoter[]) => rows.filter((r) => !isAdminVoter(r.voter));
  if (opts.kind === "category") {
    const cats = await db().triviaCategory.findMany({ where });
    const ratings = await db().triviaRating.findMany({ where: { kind: { in: ["category", "clue"] }, targetId: { in: cats.map((c) => c.id) } } });
    for (const c of cats) {
      const mine = ratings.filter((r) => r.targetId === c.id);
      const clues = (c.clues as unknown as { q: string; right: string; wrong?: string[] }[]).map((k, index) => {
        const rows = mine.filter((r) => r.kind === "clue" && r.clue === index);
        return { index, q: k.q, right: k.right, wrong: k.wrong ?? [], summary: summarize(players(rows)), mine: mineOf(rows, opts.adminId) };
      });
      const own = mine.filter((r) => r.kind === "category");
      items.push({ kind: "category", id: c.id, pool: c.pool, title: c.name, source: c.source, uses: c.uses, retired: c.retired, flagged: c.flagged, summary: summarize(players(own)), mine: mineOf(own, opts.adminId), clues });
    }
  } else {
    const svs = await db().triviaSurvey.findMany({ where });
    const ratings = await db().triviaRating.findMany({ where: { kind: "survey", targetId: { in: svs.map((s) => s.id) } } });
    for (const sv of svs) {
      const rows = ratings.filter((r) => r.targetId === sv.id);
      items.push({ kind: "survey", id: sv.id, pool: sv.pool, title: sv.q, source: sv.source, uses: sv.uses, retired: sv.retired, flagged: sv.flagged, summary: summarize(players(rows)), mine: mineOf(rows, opts.adminId), answers: sv.answers });
    }
  }
  const q = opts.search?.trim().toLowerCase();
  let list = items.filter((i) => !q || i.title.toLowerCase().includes(q) || i.clues?.some((c) => c.q.toLowerCase().includes(q) || c.right.toLowerCase().includes(q)) || i.answers?.some((a) => a.toLowerCase().includes(q)));
  if (!opts.unrated) list = list.filter((i) => i.summary.votes > 0 || i.mine || i.flagged || i.clues?.some((c) => c.summary.votes > 0 || c.mine));
  const score = (i: ReviewItem) => i.summary.quality ?? 99;
  list.sort((a, b) => (opts.sort === "votes" ? b.summary.votes - a.summary.votes : opts.sort === "best" ? score(b) - score(a) : score(a) - score(b)));
  return list.slice(0, opts.limit);
}

type RatingRowWithVoter = { voter: string; quality: number | null; difficulty: number | null; wrong: boolean };

export const setRetiredById = (kind: "category" | "survey", id: string, retired: boolean) => prismaRatingStore.setRetired(kind, id, retired);
export async function setFlaggedById(kind: "category" | "survey", id: string, flagged: boolean) {
  if (kind === "survey") await db().triviaSurvey.update({ where: { id }, data: { flagged } });
  else await db().triviaCategory.update({ where: { id }, data: { flagged } });
}
