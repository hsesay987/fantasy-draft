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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDrafts = listDrafts;
exports.createDraft = createDraft;
exports.getDraft = getDraft;
exports.cancelDraft = cancelDraft;
exports.saveDraft = saveDraft;
exports.updatePick = updatePick;
exports.undoPick = undoPick;
exports.scoreDraft = scoreDraft;
exports.voteDraft = voteDraft;
exports.getDraftSuggestions = getDraftSuggestions;
exports.getMyDrafts = getMyDrafts;
const prisma_1 = __importDefault(require("../lib/prisma"));
const DraftService = __importStar(require("../services/draft.service"));
async function listDrafts(req, res) {
    const drafts = await prisma_1.default.draft.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    return res.json(drafts);
}
async function createDraft(req, res) {
    const ownerId = req.userId ?? null;
    try {
        const draft = await DraftService.createDraft(req.body, ownerId);
        res.status(201).json(draft);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create draft" });
    }
}
async function getDraft(req, res) {
    const draft = await DraftService.getDraft(req.params.id);
    if (!draft)
        return res.status(404).json({ error: "Draft not found" });
    return res.json(draft);
}
async function cancelDraft(req, res) {
    try {
        const result = await DraftService.cancelDraft(req.params.id);
        return res.json(result);
    }
    catch (e) {
        console.error(e);
        return res
            .status(400)
            .json({ error: e.message || "Failed to cancel draft" });
    }
}
async function saveDraft(req, res) {
    try {
        const { savedState, status } = req.body || {};
        const draft = await DraftService.saveDraftState(req.params.id, savedState ?? {}, status);
        return res.json(draft);
    }
    catch (e) {
        console.error(e);
        return res.status(400).json({ error: e.message || "Failed to save draft" });
    }
}
async function updatePick(req, res) {
    const draftId = req.params.id;
    const { slot, playerId, position, teamLandedOn, eraFrom, eraTo } = req.body;
    const userId = req.userId || null;
    try {
        const pick = await DraftService.updatePick(draftId, {
            slot,
            playerId,
            position,
            userId,
            teamOverride: teamLandedOn,
            eraFromOverride: eraFrom,
            eraToOverride: eraTo,
        });
        res.json(pick);
    }
    catch (e) {
        res.status(400).json({ error: e.message || "Pick failed" });
    }
}
async function undoPick(req, res) {
    try {
        const slot = Number(req.params.slot);
        const draft = await DraftService.undoPick(req.params.id, slot);
        return res.json(draft);
    }
    catch (e) {
        console.error(e);
        return res.status(400).json({ error: e.message || "Failed to undo pick" });
    }
}
async function scoreDraft(req, res) {
    try {
        const result = await DraftService.scoreDraft(req.params.id);
        return res.json(result);
    }
    catch (e) {
        console.error(e);
        return res
            .status(400)
            .json({ error: e.message || "Failed to score draft" });
    }
}
async function voteDraft(req, res) {
    try {
        const { value = 1 } = req.body;
        const vote = await DraftService.addVote(req.params.id, Number(value) || 1);
        return res.json(vote);
    }
    catch (e) {
        console.error(e);
        return res.status(400).json({ error: e.message || "Failed to vote" });
    }
}
async function getDraftSuggestions(req, res) {
    try {
        const limit = Number(req.query.limit) || 5;
        const suggestions = await DraftService.getDraftSuggestions(req.params.id, limit);
        return res.json(suggestions);
    }
    catch (e) {
        console.error(e);
        return res
            .status(400)
            .json({ error: e.message || "Failed to get suggestions" });
    }
}
async function getMyDrafts(req, res) {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const drafts = await DraftService.getDraftsByOwner(userId);
    res.json(drafts);
}
//# sourceMappingURL=draft.controller.js.map