import { createHash } from "node:crypto";
import { Router } from "express";
import { captureError } from "../lib/monitoring";
import { createNpatDailyCap, dayKey } from "../services/daily.service";
import "../shared/topicDraft/npat/lists"; // the answer lists the judge checks against and stats are keyed by
import { NPAT_CATEGORIES } from "../shared/topicDraft/npat/categories";
import { ANSWER_MAX, normAnswer } from "../shared/topicDraft/npat/rules";
import { lookup } from "../shared/topicDraft/npat/source";
import { REVIEW_PREFIX, type NpatHistoryStore } from "../services/npatHistory.service";
import type { createNpatJudge } from "../services/npatJudge.service";
import { judge } from "../services/npatJudge.instance";

/** Unknown-answer lookups one IP may ask the model about per UTC day, and disputes it may file. */
export const JUDGE_LOOKUPS_PER_IP = 40;
export const DISPUTES_PER_IP = 10;
const REASON_MAX = 200;
const MAX_ANSWERS = 5;

export type DisputeRow = { category: string; letter: string; answer: string; typed: string; reason: string; tier: string | null; ipHash: string };
export interface DisputeStore {
  add(d: DisputeRow): Promise<void>;
}

type Judge = ReturnType<typeof createNpatJudge>;

const isCategory = (c: unknown): c is string => typeof c === "string" && NPAT_CATEGORIES.some((x) => x.id === c);
const isLetter = (l: unknown): l is string => typeof l === "string" && /^[A-Za-z]$/.test(l);
const ipHash = (ip: string) => createHash("sha256").update(`npat-dispute|${ip}`).digest("hex").slice(0, 32);

export function createNpatRouter(deps: {
  judge: Judge;
  history: NpatHistoryStore | null;
  disputes: DisputeStore;
  judgeCap: ReturnType<typeof createNpatDailyCap>;
  disputeCap: ReturnType<typeof createNpatDailyCap>;
  /** The list entry's name for a typed answer (stats are keyed by it); defaults to the typed text. */
  canonical?: (category: string, text: string) => string;
}) {
  const router = Router();

  /** Verdicts for answers that start with the letter and are not on the lists. */
  router.post("/judge", async (req, res) => {
    const { category, letter, answers } = req.body ?? {};
    if (!isCategory(category) || !isLetter(letter) || !Array.isArray(answers) || answers.length < 1 || answers.length > MAX_ANSWERS || answers.some((a) => typeof a !== "string" || a.length > ANSWER_MAX)) {
      return res.status(400).json({ error: "category, letter and up to 5 answers are required" });
    }
    const day = dayKey();
    const ip = req.ip ?? "anon";
    for (let n = 0; n < answers.length; n++) if (!deps.judgeCap.allow(ip, day)) return res.status(429).json({ error: "Too many lookups today" });
    const verdicts = await deps.judge.judge((answers as string[]).map((text) => ({ category, letter: letter.toUpperCase(), text })));
    // Accepted AI answers join the review queue (the same "review:<category>" rows finished rooms write).
    const accepted = verdicts.flatMap((v, i) => (v.source === "ai" && v.ok ? [{ category: `${REVIEW_PREFIX}${category}`, answer: (answers as string[])[i]!.trim() }] : []));
    if (deps.history && accepted.length) await deps.history.record(day, "npat-judge", accepted).catch((e) => captureError(e, { where: "npat review record" }));
    res.json({ verdicts });
  });

  /** A player says a judged answer was wrong. */
  router.post("/dispute", async (req, res) => {
    const { category, letter, answer, typed, reason, tier } = req.body ?? {};
    if (!isCategory(category) || !isLetter(letter) || typeof answer !== "string" || !normAnswer(answer) || answer.length > ANSWER_MAX || typeof reason !== "string") {
      return res.status(400).json({ error: "category, letter, answer and reason are required" });
    }
    if (!deps.disputeCap.allow(req.ip ?? "anon", dayKey())) return res.status(429).json({ error: "Too many disputes today" });
    try {
      await deps.disputes.add({
        category,
        letter: letter.toUpperCase(),
        answer: normAnswer(answer),
        typed: typeof typed === "string" ? typed.trim().slice(0, ANSWER_MAX) : answer.trim(),
        reason: reason.trim().slice(0, REASON_MAX),
        tier: typeof tier === "string" ? tier.slice(0, 20) : null,
        ipHash: ipHash(req.ip ?? "anon"),
      });
      res.status(204).end();
    } catch (e) {
      captureError(e, { where: "npat dispute" });
      res.status(500).json({ error: "Could not save the dispute" });
    }
  });

  /** "% said": the share of a category's plays that gave each answer. */
  router.get("/stats", (req, res) => {
    const category = req.query.category;
    const raw = typeof req.query.answers === "string" ? req.query.answers.split(",") : [];
    const letter = req.query.letter;
    if (!isLetter(letter)) return res.status(400).json({ error: "letter is required" });
    if (!isCategory(category) || raw.length < 1 || raw.length > MAX_ANSWERS || raw.some((a) => a.length > ANSWER_MAX)) return res.status(400).json({ error: "category and up to 5 answers are required" });
    const plays = deps.history?.playsForLetter(category, letter) ?? 0;
    const canon = deps.canonical ?? ((_c: string, t: string) => t);
    res.json(
      raw.map((answer) => {
        const found = deps.history?.lookup(category, normAnswer(canon(category, answer)));
        return { answer, share: found && plays > 0 ? Math.min(100, Math.round((found.count / plays) * 100)) : 0 };
      })
    );
  });

  return router;
}

let history: NpatHistoryStore | null = null;
/** The NPAT answer counts (the server sets it at start), for "% said" and the review queue. */
export function setNpatRouteHistory(h: NpatHistoryStore | null) {
  history = h;
}

const prismaDisputes: DisputeStore = {
  async add(d) {
    await (await import("../lib/prisma")).default.npatDispute.create({ data: d });
  },
};

export default createNpatRouter({
  judge,
  get history() { return history; },
  disputes: prismaDisputes,
  judgeCap: createNpatDailyCap(JUDGE_LOOKUPS_PER_IP),
  disputeCap: createNpatDailyCap(DISPUTES_PER_IP),
  canonical: (category, text) => lookup(category, text)?.name ?? text,
});
