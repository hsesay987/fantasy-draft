"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scraping/seedNBAAdvanced.ts
const prisma_1 = __importDefault(require("../lib/prisma"));
const loadAdvanced_1 = require("./loaders/loadAdvanced");
const loadPer36_1 = require("./loaders/loadPer36");
const loadPlayByPlay_1 = require("./loaders/loadPlayByPlay");
const loadAllStar_1 = require("./loaders/loadAllStar");
const loadEndOfSeasonTeams_1 = require("./loaders/loadEndOfSeasonTeams");
const loadAwardsVoting_1 = require("./loaders/loadAwardsVoting");
async function main() {
    console.log("📊 Seeding NBA advanced metrics...");
    await (0, loadAdvanced_1.loadAdvanced)("data/Advanced.csv");
    await (0, loadPer36_1.loadPer36)("data/Per 36 Minutes.csv");
    await (0, loadPlayByPlay_1.loadPlayByPlay)("data/Player Play By Play.csv");
    await (0, loadAllStar_1.loadAllStar)("data/All-Star Selections.csv");
    await (0, loadEndOfSeasonTeams_1.loadEndOfSeasonTeams)("data/End of Season Teams.csv");
    await (0, loadAwardsVoting_1.loadAwardsVoting)("data/Player Award Shares.csv");
    console.log("✅ NBA advanced seed complete");
    await prisma_1.default.$disconnect();
}
main().catch(console.error);
//# sourceMappingURL=seedNBAAdvanced.js.map