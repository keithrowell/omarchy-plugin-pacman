# Review — spec 0002 high-score table (2026-09-05)

Reviewed `git diff f0d3731..HEAD` on `spec/0002-high-score-table` (4 commits).
Verdict: **bounce back to build** — the logic, persistence and flow are sound;
two rendering layout defects visible in the builder's own frame grabs block it.

## Gate

`node --test tests/*.test.mjs` in the worktree: `tests 273 / pass 273 / fail 0`.

## Blocking

1. **`app/render/Screens.js` `drawInitials` — the heading is clipped.**
   "ENTER YOUR INITIALS" is drawn at `TITLE_PX` (16 px): 19 glyphs × 16 =
   304 px on a 224 px stage, 40 px lost each side. `frame-initials.png` shows
   "TER YOUR INITIA". The plan set this line at the 8 px font (152 px). Draw
   it at `FONT_PX`, or shorten it if 16 px is wanted.
2. **`app/render/Screens.js` `drawScoreTable` — the column header overprints
   the title.** "HIGH SCORES" at 16 px spans y 56..72; `TABLE_HEAD_Y = 68`
   puts "NO NAME SCORE LEVEL" over its last 4 px (and "PACMAN" at 40..56
   touches it with no gap). Visible in `frame-table.png` and reproduced in the
   reviewer's grab under gruvbox-dark. The plan's y values assume the 8 px
   font for this line; either draw it at 8 px or move the header/rows down
   (rows end at 196 today, so there is room before `PRESS_Y` 232).

The as-built section cites both grabs as evidence; re-take them after the fix.

## Non-blocking

- `app/Main.qml:103` `onTitle` is now unused (its last caller in `quit()`
  was removed). Drop it or use it.
- README key table row "Enter or Space" now describes an Enter-only action on
  the initials screen; fine, but a separate row for the initials keys would
  read clearer.
- Inbox item "Defer the corrupt highscore.json rewrite out of onLoaded" is
  closed by this work per the as-built notes, but `docs/agentile/inbox.md` is
  not touched on the branch — for the ship stage to tick.
- Pre-existing, not this spec: `lib/maze.mjs:107` uses object spread and
  `Array.sort` (untouched by the diff).

## Verified (pass)

- Acceptance criteria: table library (tie below, 11th falls off, 0 never
  qualifies), migration from `{ "highScore": N }`, bare number and corrupt
  text, `Settings.highScore` derived read-only from the top row, `initials`
  screen between gameover and title only for a real qualifying game, entry
  keys, 30 s timeout as flow ticks, title page cycle from `flow.ticks` not
  `idleTicks`, attract never writes, README updated.
- Save exactly once: `entrySaved` reset on entering `initials`, set in
  `saveEntry`; both the initials→title transition (third confirm and timeout,
  via `setFlow`) and `quit()` on initials go through the guard.
- Purity: no Qt imports, Date, Math.random, spread or `sort` in new lib code;
  tables built by folding through `insert`.
- QML: no references to `setHighScore`/`parseHighScore`/`serialiseHighScore`;
  migration rewrite is `Qt.callLater`; Space is a no-op on initials; g/m/F12
  handled above the screen switch; initials keys never touch `pressed`.
- Rendering colours: all from `palette.*` keys; no literals.
- Security: only `$HOME/.local/state/pacman/highscore.json` written; parser
  drops non-record rows, NaN/string/negative scores, bad initials and levels;
  large arrays fold to 10 rows.
- Live (scratch HOME, gruvbox-dark): old-shape file → `Settings: migrating`
  line, no FileView "dropped operation", rewritten as the one-row table;
  corrupt text → `{ "highScores": [] }`; page flips at 5 s with idle ticks
  continuing; real `~/.local/state/pacman/highscore.json` untouched.
- Hygiene: nothing under `specs/done/` or `.claude/` in the diff; all four
  subjects start `Spec 0002:` with the Co-Authored-By trailer.

## Re-review (fb09a22, 2026-09-05)

Verdict: **pass**.

- `drawInitials`: heading at `FONT_PX` (152 px); replaced `frame-initials.png`
  shows the full "ENTER YOUR INITIALS" centred.
- `drawScoreTable`: heading at `FONT_PX`, `TABLE_TITLE_Y/HEAD_Y/Y` = 60/72/84.
  PACMAN ends y 56, heading 60..68, header 72..80, rows 84..200, PRESS ENTER
  232: 4 px gaps, nothing overlapping. Confirmed in the replaced
  `frame-table.png` and in a reviewer grab under gruvbox-dark.
- `onTitle` removed; no reference remains in `app/`.
- README: initials keys in their own row.
- SPEC.md as-built text rewritten to describe the new grabs and records the
  review fix.
- Gate: `node --test tests/*.test.mjs` → tests 273, pass 273, fail 0.
- Live scratch-HOME run after the change: app loads, migration line present,
  no QML errors, no "dropped operation", exit 0, no leaked qs, real
  `~/.local/state/pacman/highscore.json` untouched.
- Fix commit touches only `Screens.js` font/y constants, one Main.qml property,
  README and SPEC.md; save-once, purity and palette-only colours unaffected.
