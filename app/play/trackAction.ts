import type { Action } from "../topicDraft/core";
import { track } from "../lib/analytics";
import type { GameSetup } from "./types";

const PICK_TYPES = new Set(["pick", "buy", "assign", "place", "nominate"]);

/**
 * One `pick_made` event per human decision (AI moves and timeouts are tagged, never name players).
 * Feeds pick rate / average draft position per character; see the Stats Method note.
 */
export function trackAction(setup: GameSetup, a: Action, online: boolean) {
  if (!PICK_TYPES.has(a.type) || !("by" in a)) return;
  const ai = setup.aiPlayers.includes(a.by);
  track("pick_made", {
    format: setup.format,
    pool: setup.pool,
    item_id: "itemId" in a ? a.itemId : undefined,
    slot: "slotId" in a ? a.slotId : "roleId" in a ? a.roleId : "rank" in a ? a.rank : undefined,
    source: ai ? "ai" : "player",
    online,
  });
}
