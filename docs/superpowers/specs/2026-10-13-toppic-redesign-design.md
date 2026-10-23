# TopPic Redesign — Design Spec

Date: 2026-10-13 · Branch: `toppic-redesign`

## 1. Goal
Rebrand the whole app as **TopPic** (pun: "top pick" + "topics"). Full visual redesign, smoother
mechanics, more fun draft games (incl. a highly customizable superhero draft), synthesized sound,
and an AI backend that judges results.

Scope (user-confirmed): whole app as TopPic. Shared components reskin the NBA/NFL/cartoon rooms;
their logic is NOT rewritten.

## 2. Design system
Source of truth: `design-system/toppic/MASTER.md` (generated with ui-ux-pro-max).
- Dark arcade-editorial. Tokens in `app/globals.css` (`@theme`): primary `#7C3AED`, secondary `#A78BFA`,
  accent `#F43F5E`, bg `#0F0F23`, card `#1E1C35`, muted `#27273B`, fg `#E2E8F0`, border `#4C1D95`.
- Fonts: Russo One (display) + Chakra Petch (body) via `next/font/google`.
- Motion: `motion` package. Card flips, spring timer ring, layout animations, staggered lists.
  `prefers-reduced-motion` respected everywhere. Durations 150-450ms, exit faster than enter.
- Icons: lucide-react only (no emoji icons). Touch targets >=44px. Mobile-first (375/768/1024/1440).
- Shared components in `app/components/ui/`: Button, Card, Chip, Modal, GameTile, TimerRing, Toast.
- App shell: top bar (logo, nav, sound toggle, user menu) + bottom nav on mobile.

## 3. Sound
`app/lib/sound.ts` + `SoundProvider`. Web Audio synthesized SFX, no asset files: click, pick, steal,
tick, reveal, win, error. Optional ambient loop. Mute + volume in localStorage (try/catch). Audio
unlocked on first user gesture. `navigator.vibrate` for key confirmations only.

## 4. Draft hub
New home lists game tiles. Core pitch: **scenario drafts** — each draft has a mission; AI judges who
built the best team for it.
Full: Superheroes. Catalog-based (3-4): Villains, Anime, Video-game characters, Pokemon.
"Coming soon" tiles: Disney/Pixar, Movie icons, Music artists, Historical figures, Foods, Countries.
Existing NBA/NFL/cartoon drafts remain, reskinned.

## 5. Generic Topic Draft engine
Data-driven: `app/topicDraft/catalogs/*.json` (items, attributes, tags, universe) + config schema
(`teamSize`, `order` snake|linear, `timerSeconds`, `bans`, `filters`, `roles`, `scenario`, `rules`).
One room page `app/topic/[game]/[id]` renders any catalog. Pure reducer in `app/topicDraft/engine.ts`
(unit-tested): turn order, picks, bans, role/rule validation, auto-pick on timeout.
Modes: solo vs AI drafter, pass-and-play (phase 1); online via existing Room + socket (phase 2).

## 6. Superhero draft
- Pool ~150 heroes: power, intellect, speed, durability, combat, teamwork (0-100), universe, archetype.
  Stats are curated estimates, not licensed data.
- Filters: Marvel, DC, indie, anti-heroes, villains.
- Rules: team size 3-9, roles (leader/tank/brain/support/…), snake|linear, pick timer, bans,
  no-duplicate-universe, power cap.
- Scenario: presets (Stop an Alien Invasion, Heist, Zombie Apocalypse, …) or custom text.
- Custom heroes: player-added, AI-validated and stat-ranked (sanitized, treated as data).
- Presets saved/shared via existing `DraftStyle`.

## 7. AI judge (backend)
`backend/src/services/judge.service.ts`, route `POST /judge` (auth, rate-limited).
Hybrid: deterministic baseline score per team (stats + role fit + synergy) -> Claude
(`JUDGE_MODEL`, default `claude-sonnet-5-5`, via `ANTHROPIC_API_KEY`) returns validated JSON:
`{winner, teams:[{score, breakdown, highlights, roast}], summary}`. Zod-style validation; on missing
key/failure fall back to baseline + templated commentary. Prompt-injection safe: user text passed
as quoted data, never instructions. Verdicts stored in Prisma `JudgeResult`.
Also wired into TopPic party game `judge` scoring mode.

## 8. TopPic party game
New UI, deal/play animations, superhero pool added, `judge` mode uses the AI service, sounds.

## 9. Testing
Unit tests (vitest) for engine reducer, deterministic scorer, judge JSON validation (mock AI client).
Verify with `next build`, `tsc`, and browser walkthrough of hub -> superhero draft -> judge.

## 10. Build order
1 Design system, sound, shell. 2 Hub + engine + Superheroes. 3 AI judge. 4 TopPic party restyle.
5 Extra catalogs + reskin legacy rooms.

## 11. Requirements / caveats
`ANTHROPIC_API_KEY` in `backend/.env` for live judging (fallback works without). Hero stats curated by hand.
