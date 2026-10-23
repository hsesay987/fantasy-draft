# Draft Formats + New Flow — Plan Addendum

Builds on `2026-10-13-toppic-redesign.md`. Online play deferred to the next round (engines are pure + serializable so the server can reuse them).

**Formats (all in `app/topicDraft/formats/`, pure + JSON-serializable state, injected `now`/seeded rng):**
snake (existing engine), auction, loadout (multi-slot budget vs a boss/mission), position (random hand -> role slots, editable roles), blind (reveal-and-rank), spin (pick 1 of N random options, reroll). Toggle: mystery mission (hidden until verdict).

**Pools:** superheroes (pure heroes), villains, heroes-villains (plain mixed pool, no rules), anime, videogames, pokemon, disney, movies, history; loadout pools: weapons, gadgets, allies, vehicles, traps. Each catalog has meta (stat keys, missions).

**Flow:** Home = format tiles -> `/play/[format]` (one-screen setup: pool chips, players, mission, presets, collapsible customize, big Start, Resume banner) -> `/play/[format]/game` (persisted in localStorage, resumable) -> verdict + copy-share + rematch. Old `/topic/*` redirects.

**Judge:** `/judge` accepts optional per-team `baseline` (client-computed deterministic score) and item `role` label.

**Tasks:** A core(types/rng/catalogs/missions/scorer) · B engines+tests · C judge generalisation · D UI (hub, setup, shell, six game views, persistence) · E redirects/cleanup · F verify (tests, build, browser).

## Round 3 addendum — online play, pictures, roll animation, auction turns
- `app/topicDraft/core.ts`: one `applyAction(setup, state, action, now)` for all six formats, used by the browser (`useLocalGame`) and the server.
- `scripts/sync-shared.mjs` copies the pure rules into `backend/src/shared` (guarded by `app/shared.sync.test.ts`; run `npm run sync:shared` after changing `app/topicDraft` or `app/play/{types,judging}.ts`).
- Online rooms: `backend/src/services/playRooms.ts` (in-memory, token seats, server clock/timers, bots for players who leave) + `/play-rooms` routes + `/room/[code]` UI. No DB writes, no accounts.
- Auction: opening bid rotates per lot; "I'm out" ends a lot immediately when every other player has passed.
- Pictures: `app/lib/characterImages.ts` (PokeAPI, AniList, akabab hero DB, Wikipedia for history); `NEXT_PUBLIC_CHARACTER_IMAGES=off` disables them.
