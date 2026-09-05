---
title: High-score table with three-letter initials
slug: high-score-table
status: in_progress
depends_on: []
type: feature
route: background
business_value: medium
technical_certainty: high
created: 2026-09-05
outcome: a qualifying game-over lets the player enter three initials, and that row is on the title-screen table after a restart
claimed_by: 206e3dac-9cc9-4058-870a-7309ecbd27b6
label: 
claimed_at: 2026-09-05T11:41:42Z
---

# High-score table with three-letter initials

## Problem / why now

The single persisted high score gives one number and no story. A classic
ten-row table with initials is the arcade payoff for a good round and gives
the title screen a second attract page. v1 is shipped, so this is the first
piece of v2 polish (brief non-goal for v1, now in play).

## Acceptance criteria

- [ ] `lib/highscores.mjs` (tested, pure): a table of up to 10 entries
      `{ initials, score, level }` sorted by score descending; `qualifies(table, score)`,
      `insert(table, entry)` (ties rank the newer entry **below** the existing one;
      the 11th entry falls off), `parseHighScores(text)`, `serialiseHighScores(table)`.
- [ ] Migration: `~/.local/state/pacman/highscore.json` keeps its name. The old
      `{ "highScore": N }` shape (or a bare number) becomes a one-row table with
      initials `---` and level 1, rewritten in the new shape on load. Corrupt or
      missing → empty table. `Settings.highScore` (HUD HIGH SCORE) is the top row's
      score, 0 when the table is empty.
- [ ] Flow: a new screen `initials` between `gameover` and `title`, entered only
      when the finished game's score qualifies and the game was not the attract
      demo. Otherwise game over returns to the title as today.
- [ ] Initials entry screen (arcade style, drawn in `app/render/Screens.js` in
      native units, all colours from `Theme`): "ENTER YOUR INITIALS", the score
      and rank, three slots with the active slot blinking. Up/down (arrows, `k`/`j`,
      `w`/`s`) cycle A–Z; right or Enter confirms a slot; left steps back to the
      previous slot; the third confirm saves the row. No input for 30 s saves
      whatever is showing (defaults `AAA`). The entry is saved once, never twice.
- [ ] Title screen alternates between the existing roll-call page and a
      "HIGH SCORES" page every 5 s: rank, initials, score, level, ten rows, empty
      rows shown as `---`. Both pages keep PRESS ENTER, the quit bar and the key
      hints. The attract-idle timer runs across both pages unchanged.
- [ ] A row is inserted only from real play; the attract demo never writes to
      the table and never triggers the initials screen.
- [ ] README keys and state-file notes updated; spec 0005's "out of scope" note
      is superseded by this spec.

## Scope boundary

**In scope:** table library and persistence with migration, initials screen and
its input, title-page cycling, HUD top score, tests.

**Out of scope:** per-level or per-theme tables, online or shared scores, a
reset-scores key, sound for the initials screen beyond what exists, changing
the HUD layout.

## Edge cases and failure paths

- Score of 0 never qualifies. An empty table means any positive score qualifies.
- Writing the file fails → warn in the log, keep the in-memory table for the
  session (matches `Settings` today).
- Window loses focus during initials entry → the 30 s timeout keeps running;
  no auto-pause on that screen.
- `q` on the initials screen saves the current letters then quits (so a score
  is never lost to an impatient quit). Escape does the same as `q`.
- Corrupt file rewrite must stay off the `onLoaded` path if that reintroduces
  the FileView "dropped operation" warning (inbox item; do not regress it further).
- Determinism: the flow and table code are pure; the 30 s timeout is ticks in
  the flow, not a QML Timer.

## Affected areas

`lib/highscores.mjs` (new), `lib/settings.mjs` (drop or delegate the single
high-score parse/serialise), `lib/flow.mjs` (`initials` screen, timeout,
title-page cycle), `app/Settings.qml`, `app/Main.qml` (keys for the initials
screen, save on the third confirm, `q`/Escape behaviour), `app/render/Screens.js`
(initials screen, table page), `tests/highscores.test.mjs` (new),
`tests/flow.test.mjs`, `tests/settings.test.mjs`, `README.md`.

## Open questions

None.

## Verification

- `node --test tests/*.test.mjs` green, including migration from the old file
  shape and tie ordering.
- Manual: play to game over with a qualifying score, enter initials, quit,
  relaunch, see the row on the HIGH SCORES title page and the HUD showing that
  score. Let the attract demo run and confirm the table is untouched.
