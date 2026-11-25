// Dodge's setup defaults, so the host's last choice survives reopening the setup screen.
import { LAPS } from "../topicDraft/dodge/rules";
import type { GameSetup } from "./types";

/** The laps setup opens on: the room's last Dodge game's, else one. */
export function startLaps(last: Pick<GameSetup, "format" | "opts"> | null | undefined): number {
  const n = last?.format === "dodge" ? last.opts.dodgeLaps : undefined;
  return n !== undefined && (LAPS as readonly number[]).includes(n) ? n : 1;
}
