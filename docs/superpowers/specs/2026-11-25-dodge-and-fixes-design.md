# Dodge, NPAT question mode, spelling autocorrect and UI fixes

Approved by the owner on 2026-11-25. Four independent pieces of work, each on its own branch.

## 1. Dodge (new party game, working name)

### Why
A quick, loud party round in the same family as Say Less and NPAT: everyone tries to guess what the chosen player will say, and then tries *not* to say it.

### Rules
- **Round:** a category appears, e.g. "Pizza toppings". Everyone, the chosen player included, types one answer within 20 seconds. The chosen player rotates each round.
- **Reveal:** the chosen player's answer flips first. Then everyone else's answers flip, with matches grouped beside it.
- **Matching:** answers match exactly after cleanup (case, spaces, "the/a/an", simple plurals). Pairs that are close but not exact go to the AI judge. If the judge is down or over budget, only exact matches count.
- **Scoring:**
  - The chosen player gets +1 for each player who matched them.
  - Each player who matched loses 1.
  - Each player who dodged (answered, no match) gets +1.
  - A blank answer scores 0 and does not count as a match. If the chosen player is blank, nobody matches and every answerer gets +1.
- **Length:** each player is chosen once by default. The host can pick 1, 2 or 3 laps.
- **Categories:** a new hand-written deck of about 200 categories with obvious top answers ("Things in a fridge", "Breakfast cereals"), grouped into decks such as Food, Pop culture and Everyday. The host picks decks, like Say Less. Tournament slots use the same deck IDs.
- **Room features:** it works with the TV screen, the scoreboard, the drinking option (matchers drink), tournaments and the host pause button (PR #43).
- **Not included:** no solo, no daily, no teams. "Matchers are out" comes later, with elimination mode.

### Constraints
- Engine in `app/topicDraft/formats/dodge.ts`, synced to the backend with `npm run sync:shared`. It follows the existing engine shape: `init`, `act`, `tick`, `settle`, `redactFor`. Other players' answers stay hidden until the reveal.
- The AI judge follows `backend/src/services/npatJudge.service.ts`: batched, cached, with a timeout and an exact-only fallback. The engine waits for judge verdicts the way NPAT Dig does.
- The branch starts from `host-pause`, so pause works for free.
- Pixel UI like the other party games, usable at 375 px wide.

## 2. NPAT question mode

- A new NPAT style next to Classic and Dig. Each round the reel picks a letter and a question appears, e.g. B + "Something you'd bring to a beach". Everyone types one answer that starts with the letter, within 20 seconds.
- The AI judge checks validity, as it does for Dig categories, with the question in place of the category.
- **Scoring is the same as NPAT:** 10 for a unique valid answer, 5 if someone else gave the same answer, 0 if invalid.
- A hand-written bank of about 150 questions.
- It comes to party rooms and tournaments. Solo is included if the Dig solo path makes it cheap.
- The branch starts from `npat-polish` (PR #42).

## 3. Spelling autocorrect

- When a typed answer is not accepted but is close to an acceptable answer (small edit distance after folding), the input is **replaced with the closest acceptable answer**, and a line says "Did you mean Krillin? Press Enter to submit." The player presses Enter to submit it, or edits it. The near-miss itself costs nothing: no strike, no wrong guess, no lost turn.
- The owner chose this knowing it shows the answer.
- **Games:** Hot Air (`feud`), Say Less, Vowel Play, and any other game that checks typed answers against a known list (survey Pinpoint, Common Thread, Top Rung and party trivia). NPAT is excluded, because its answers have no fixed list.
- Online rooms keep answers on the server. There, the server returns the suggestion in the refused action's result, and the client fills the input. Solo games do it locally.
- Thresholds: close means edit distance 1 for answers of 4 to 8 letters, and 2 for 9 letters or more. Answers under 4 letters get no suggestion. Anything Hot Air already accepts as a typo stays accepted.

## 4. UI fixes

- **Vowel Play Give up:** move it out of the typing row to a small "Pass on this one" link under the status line, in both the room view and solo (where it is labelled Skip).
- **Draft card pictures:** pictures load slowly the first time, because they are looked up live on Wikipedia, four at a time. Some never resolve, e.g. Omni-Man on the hero source. The fix:
  - resolve picture URLs ahead of time with a script and store them in the catalogs, keeping the live lookup only as a fallback;
  - fall back from the hero source to Wikipedia;
  - fix wrong or missing pictures across every draft topic.
- **Draft card layout:** the sort row's "Best for mission" pill squashes onto three lines. Check the draft board, the cards and the setup pages at 375 px and on desktop, and fix what breaks.
- **Phone check:** run every game (drafts, trivia, party rooms, daily, solo) at 375×812, and fix overlap, overflow, hidden buttons and tap targets under 44 px.
