// import { Request, Response } from "express";
// import * as PlayerService from "../services/player.service";

// export async function searchPlayers(req: Request, res: Response) {
//   const {
//     q,
//     position,
//     eraFrom,
//     eraTo,
//     team,
//     hallRule,
//     multiTeamOnly,
//     limit,
//     offset,
//   } = req.query;

//   const result = await PlayerService.searchPlayers({
//     q: typeof q === "string" ? q : undefined,
//     position: typeof position === "string" ? position : undefined,
//     eraFrom: eraFrom ? Number(eraFrom) : undefined,
//     eraTo: eraTo ? Number(eraTo) : undefined,
//     team: typeof team === "string" ? team : undefined,
//     hallRule: hallRule === "only" || hallRule === "none" ? hallRule : "any",
//     multiTeamOnly: multiTeamOnly === "true" || multiTeamOnly === "1",
//     limit: limit ? Number(limit) : undefined,
//     offset: offset ? Number(offset) : undefined,
//   });

//   return res.json(result);
// }
