// src/routes/draft.route.ts
import { Router } from "express";
import * as DraftController from "../controllers/draft.controller";

const router = Router();

router.get("/", DraftController.listDrafts);
router.post("/", DraftController.createDraft);
router.get("/:id", DraftController.getDraft);
router.patch("/:id", DraftController.updatePick);
router.get("/:id/score", DraftController.scoreDraft);
router.delete("/:id/picks/:slot", DraftController.undoPick);
router.post("/:id/vote", DraftController.voteDraft);

export default router;
// import { Router } from "express";
// import * as DraftController from "../controllers/draft.controller";

// const router = Router();

// // GET /drafts
// router.get("/", DraftController.listDrafts);

// // POST /drafts
// router.post("/", DraftController.createDraft);

// // GET /drafts/:id
// router.get("/:id", DraftController.getDraft);

// // PATCH /drafts/:id (add/replace pick)
// router.patch("/:id", DraftController.updatePick);

// // GET /drafts/:id/score
// router.get("/:id/score", DraftController.scoreDraft);

// // POST /drafts/:id/vote
// router.post("/:id/vote", DraftController.voteDraft);

// export default router;
