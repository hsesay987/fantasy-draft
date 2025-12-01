// src/routes/player.route.ts
import { Router, Request, Response } from "express";
import * as PlayerService from "../services/player.service";

const router = Router();

// GET /players/search
router.get("/search", async (req: Request, res: Response) => {
  try {
    const {
      q,
      position,
      eraFrom,
      eraTo,
      team,
      hallRule,
      multiTeamOnly,
      limit,
      offset,
    } = req.query;

    const input: PlayerService.SearchPlayersInput = {
      q: typeof q === "string" ? q : undefined,
      position: typeof position === "string" ? position : undefined,
      eraFrom: eraFrom ? Number(eraFrom) : undefined,
      eraTo: eraTo ? Number(eraTo) : undefined,
      team: typeof team === "string" ? team : undefined,
      hallRule:
        hallRule === "only" || hallRule === "none" || hallRule === "any"
          ? hallRule
          : undefined,
      multiTeamOnly:
        typeof multiTeamOnly === "string"
          ? multiTeamOnly === "true"
          : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    };

    const players = await PlayerService.searchPlayers(input);
    return res.json(players);
  } catch (e: any) {
    console.error(e);
    return res
      .status(400)
      .json({ error: e.message || "Failed to search players" });
  }
});

export default router;
