"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/player.route.ts
const express_1 = require("express");
const PlayerService = __importStar(require("../services/player.service"));
const router = (0, express_1.Router)();
// GET /players/search
router.get("/search", async (req, res) => {
    try {
        const { q, position, eraFrom, eraTo, team, hallRule, multiTeamOnly, limit, offset, } = req.query;
        const input = {
            q: typeof q === "string" ? q : undefined,
            position: typeof position === "string" ? position : undefined,
            eraFrom: eraFrom ? Number(eraFrom) : undefined,
            eraTo: eraTo ? Number(eraTo) : undefined,
            team: typeof team === "string" ? team : undefined,
            hallRule: hallRule === "only" || hallRule === "none" || hallRule === "any"
                ? hallRule
                : undefined,
            multiTeamOnly: typeof multiTeamOnly === "string"
                ? multiTeamOnly === "true"
                : undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined,
        };
        const players = await PlayerService.searchPlayers(input);
        return res.json(players);
    }
    catch (e) {
        console.error(e);
        return res
            .status(400)
            .json({ error: e.message || "Failed to search players" });
    }
});
exports.default = router;
//# sourceMappingURL=player.route.js.map