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
// src/routes/draft.route.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const DraftController = __importStar(require("../controllers/draft.controller"));
const draftService = __importStar(require("../services/draft.service"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
router.get("/", DraftController.listDrafts);
router.get("/:id", DraftController.getDraft);
router.post("/", DraftController.createDraft);
router.get("/my", auth_1.authRequired, DraftController.getMyDrafts);
router.patch("/:id", auth_1.authRequired, DraftController.updatePick);
router.post("/:id/save", auth_1.authRequired, async (req, res) => {
    try {
        const draftId = req.params.id;
        const userId = req.userId;
        const draft = await prisma_1.default.draft.findUnique({ where: { id: draftId } });
        if (!draft)
            return res.status(404).json({ error: "Draft not found" });
        if (draft.ownerId && draft.ownerId !== userId) {
            return res
                .status(403)
                .json({ error: "Only the owner can save this draft" });
        }
        // If draft has no owner but user is logged in, claim ownership
        if (!draft.ownerId) {
            await prisma_1.default.draft.update({
                where: { id: draftId },
                data: { ownerId: userId },
            });
        }
        const updated = await draftService.saveDraftState(draftId, req.body.savedState || {}, req.body.status || "saved");
        res.json(updated);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to save draft" });
    }
});
router.get("/:id/suggestions", DraftController.getDraftSuggestions);
router.get("/:id/score", DraftController.scoreDraft);
router.delete("/:id/picks/:slot", DraftController.undoPick);
router.delete("/:id", DraftController.cancelDraft);
router.post("/:id/vote", DraftController.voteDraft);
exports.default = router;
//# sourceMappingURL=draft.route.js.map