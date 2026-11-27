# Draft story: a play-by-play under every draft result

Approved by the owner on 2026-11-27 ("approved, go ahead").

## Why
Draft results are numbers and a short summary. The owner wants each result to read like a match: a scenario built
from the mission and the teams, a play-by-play of what happens, and why the winner wins. Every story must be unique.

## Goals
- Every draft result (snake, spin, auction, loadout, position, blind, keep; local and online rooms) gets a story.
- 4-6 beats that name real picks, then one line on why the winner won, tied to the deciding stats.
- Never the same story twice: random story seeds (setting, conditions, twist) plus the real picks, and recent titles avoided.

## Non-goals
- The story never changes the winner or the scores: the decision model (or AI judge) still decides those.
- No story for party games or trivia.

## Anti-goals
- A slower result: the result shows at once and the story fades in.
- A broken result when the AI is down or the daily budget is spent: the story is simply left out.

## Approaches
1. **Separate AI story after the result (chosen).** One extra AI call, story only, with the verdict as input.
2. The AI judges and narrates in one call: slower, costs more, can disagree with the stats.
3. Templates without AI: free but repeats.

## Design
- Server: `writeStory(input, client, rand)` in `backend/src/services/story.service.ts`. Uses the existing judge gateway
  chain (`defaultClient()`), its own daily cap (env `STORY_DAILY_CALLS`, default 1000), and a list of the last 30 titles
  to avoid. Output JSON `{ title, setting, beats: [{ label, text }], why }`. Validation: 4-6 beats, each under 240
  characters, at least 2 distinct real pick names across the beats, `why` names the winner; otherwise null.
- `POST /judge/story` for local games (same rate limit and moderation as `/judge`); 204 when there is no story.
- Rooms: after `room.verdict` is set, the server writes the story into `room.story`; the snapshot sends `story`.
- Web: `StoryCard` in the results screen under the winner banner and above the analysis. Beats appear one by one
  (all at once with reduced motion). "Writing the story…" while waiting; hidden on failure.
- Share text gets the story title and the `why` line.
