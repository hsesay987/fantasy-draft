import { Request, Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import * as CartoonService from "../services/cartoon.service";

export async function listShows(req: Request, res: Response) {
  try {
    const { q, channel, category, ageRating, yearFrom, yearTo, limit, offset } =
      req.query;

    const shows = await CartoonService.listShows({
      q: typeof q === "string" ? q : undefined,
      channel: typeof channel === "string" ? channel : null,
      category: typeof category === "string" ? category : null,
      ageRating: typeof ageRating === "string" ? ageRating : null,
      yearFrom: yearFrom ? Number(yearFrom) : null,
      yearTo: yearTo ? Number(yearTo) : null,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    res.json(shows);
  } catch (e: any) {
    console.error(e);
    res
      .status(400)
      .json({ error: e.message || "Failed to list cartoon shows" });
  }
}

export async function listCharacters(req: Request, res: Response) {
  try {
    const {
      q,
      showId,
      gender,
      isSuperhero,
      ageRating,
      channel,
      fitTopPicEligible,
      limit,
      offset,
    } = req.query;

    const characters = await CartoonService.listCharacters({
      q: typeof q === "string" ? q : undefined,
      showId: typeof showId === "string" ? showId : undefined,
      gender: typeof gender === "string" ? gender : null,
      isSuperhero:
        typeof isSuperhero === "string"
          ? isSuperhero === "true"
          : undefined,
      ageRating: typeof ageRating === "string" ? ageRating : null,
      channel: typeof channel === "string" ? channel : null,
      fitTopPicEligible:
        typeof fitTopPicEligible === "string"
          ? fitTopPicEligible !== "false"
          : true,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    res.json(characters);
  } catch (e: any) {
    console.error(e);
    res
      .status(400)
      .json({ error: e.message || "Failed to list cartoon characters" });
  }
}

export async function reportCharacter(req: AuthedRequest, res: Response) {
  try {
    const id = req.params.id;
    const { message } = req.body || {};
    const report = await CartoonService.reportCharacter(
      id,
      typeof message === "string" ? message : undefined,
      req.userId || null
    );
    res.json(report);
  } catch (e: any) {
    console.error(e);
    res
      .status(400)
      .json({ error: e.message || "Failed to report cartoon character" });
  }
}

export async function setCharacterEligibility(
  req: AuthedRequest,
  res: Response
) {
  try {
    const eligible =
      typeof req.body?.fitTopPicEligible === "boolean"
        ? req.body.fitTopPicEligible
        : true;
    const updated = await CartoonService.updateCharacterEligibility(
      req.params.id,
      eligible
    );
    res.json(updated);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({
      error: e.message || "Failed to update character eligibility",
    });
  }
}

export async function removeCharacter(req: AuthedRequest, res: Response) {
  try {
    const removed = await CartoonService.deleteCharacter(req.params.id);
    res.json(removed);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({
      error: e.message || "Failed to delete character",
    });
  }
}

export async function removeShow(req: AuthedRequest, res: Response) {
  try {
    const removed = await CartoonService.deleteShow(req.params.id);
    res.json(removed);
  } catch (e: any) {
    console.error(e);
    res
      .status(400)
      .json({ error: e.message || "Failed to delete cartoon show" });
  }
}
