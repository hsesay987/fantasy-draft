import { Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import {
  TopPicPool,
  buildPromptDeck,
  buildResponseCards,
  logCardReport,
  setupTopPicGame,
} from "../services/toppic.service";

function parsePools(raw: any): TopPicPool[] {
  const allowed: TopPicPool[] = ["NBA", "NFL", "CARTOON", "MULTI"];
  if (!raw) return ["NBA", "MULTI"];
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((p) => p.trim().toUpperCase() as TopPicPool)
      .filter((p) => allowed.includes(p));
  }
  if (Array.isArray(raw)) {
    return raw
      .map((p) => (typeof p === "string" ? p.toUpperCase() : p) as TopPicPool)
      .filter((p) => allowed.includes(p));
  }
  return ["NBA", "MULTI"];
}

export async function handlePromptDeck(req: AuthedRequest, res: Response) {
  const pools = parsePools(req.query.pools || req.body?.pools);
  const allowAdult =
    (req.query.allowAdult as string) === "true" || req.body?.allowAdult === true;
  const take = Number(req.query.take ?? req.body?.take) || 500;
  const seed =
    (req.query.seed as string) || (typeof req.body?.seed === "string" ? req.body.seed : "toppic");

  const promptDeck = buildPromptDeck({
    pools: pools.length ? pools : ["NBA", "MULTI"],
    allowAdult,
    seed,
    take,
  });

  return res.json({ promptDeck });
}

export async function handleResponseCards(req: AuthedRequest, res: Response) {
  try {
    const pools = parsePools(req.query.pools || req.body?.pools);
    const allowAdult =
      (req.query.allowAdult as string) === "true" || req.body?.allowAdult === true;
    const seed =
      (req.query.seed as string) ||
      (typeof req.body?.seed === "string" ? req.body.seed : "toppic-responses");

    const responseCards = await buildResponseCards({
      pools: pools.length ? pools : ["NBA", "MULTI"],
      allowAdult,
      seed,
    });

    return res.json({ responseCards });
  } catch (err: any) {
    console.error("Failed to build response cards", err);
    return res.status(500).json({ error: "Failed to build response cards" });
  }
}

export async function handleSetupTopPic(req: AuthedRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const pools = parsePools(req.body?.pools);
    const allowAdult = !!req.body?.allowAdult;
    const take = Number(req.body?.take) || 500;
    const seed =
      typeof req.body?.seed === "string" ? req.body.seed : `toppic-${req.userId}`;

    const setup = await setupTopPicGame({
      pools: pools.length ? pools : ["NBA", "MULTI"],
      allowAdult,
      take,
      seed,
    });

    return res.json(setup);
  } catch (err: any) {
    console.error("Failed to set up TopPic", err);
    return res.status(500).json({ error: "Failed to set up TopPic" });
  }
}

export async function handleReportPrompt(req: AuthedRequest, res: Response) {
  const { promptId, promptText, pool, rating, roomCode, reason } = req.body || {};

  if (!promptId || !promptText || !pool) {
    return res.status(400).json({ error: "promptId, promptText, and pool are required" });
  }

  try {
    await logCardReport({
      promptId,
      promptText: promptText.slice(0, 500),
      pool,
      rating,
      roomCode: roomCode || null,
      reason: typeof reason === "string" ? reason.slice(0, 500) : null,
      userId: req.userId || null,
    });
    return res.status(201).json({ ok: true });
  } catch (err: any) {
    console.error("Failed to log TopPic card report", err);
    return res.status(500).json({ error: "Failed to log report" });
  }
}
