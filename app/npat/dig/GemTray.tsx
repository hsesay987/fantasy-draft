"use client";

import { GEMS } from "../../topicDraft/npat/rules";
import type { DigAnswer } from "../../topicDraft/formats/npatDig";
import GemIcon from "./GemIcon";

/** One slot per category: the gem found (with its points) or "No gem, 0"; empty slots show the category number. */
export default function GemTray({ results, total = 5 }: { results: DigAnswer[]; total?: number }) {
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="Gems found">
      {Array.from({ length: total }, (_, i) => {
        const r = results[i];
        return (
          <div key={i} role="listitem" className="flex min-w-24 items-center gap-1.5 rounded-lg border border-current/20 px-2 py-1 text-xs text-current/70">
            {!r ? `Category ${i + 1}` : r.tier ? (
              <>
                <GemIcon tier={r.tier} />
                <span className="text-current">{GEMS[r.tier].name}</span> {r.points}
              </>
            ) : <span className="text-current/50">No gem, 0</span>}
          </div>
        );
      })}
    </div>
  );
}
