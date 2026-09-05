# Plan — High-score table with three-letter initials

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Files to touch

| File | Why |
|---|---|
| `lib/highscores.mjs` (new) | The pure table: `qualifies`, `rankOf`, `insert`, `topScore`, `parseHighScores` (with migration), `serialiseHighScores`, `LETTERS`, `TABLE_SIZE`, `EMPTY_INITIALS`, `MAX_HIGH_SCORE`. No Qt, no I/O. |
| `tests/highscores.test.mjs` (new) | Pins migration shapes, tie ordering, the 11th falling off, `qualifies` on empty/full tables and score 0, round trips, purity. |
| `lib/settings.mjs` | **Delete** `parseHighScore`, `serialiseHighScore`, `saneScore`, `MAX_HIGH_SCORE` (they move to `highscores.mjs`); header comment stops mentioning the high score. `parseSettings`/`serialiseSettings` unchanged. |
| `tests/settings.test.mjs` | Drop the five `parseHighScore`/`serialiseHighScore` tests and their imports. Nothing else changes. |
| `lib/flow.mjs` | New screen `initials`; `entry` field; actions `qualify`, `entry-up`, `entry-down`, `entry-next`, `entry-back`; `INITIALS_TIMEOUT_TICKS`; `TITLE_PAGE_TICKS`, `titlePage(flow)`, `initialsOf(entry)`. |
| `tests/flow.test.mjs` | Update the `SCREENS`/`createFlow` shape tests; add the gameover → initials → title transitions, the timeout, the entry actions, the page cycle, purity. |
| `lib/sound-map.mjs`, `tests/sound-map.test.mjs` | `initials` joins `SILENT_SCREENS`; the two screen-enumerating tests include it. |
| `app/Settings.qml` | `highScores` (the table) replaces the single number; `highScore` becomes a read-only binding on the top row; `insertHighScore(row)` and `rankFor(score)` replace `setHighScore`; the `highscore.json` FileView parses the table and defers the migration rewrite with `Qt.callLater`. |
| `app/Main.qml` | Keys on the `initials` screen; the `qualify` action on entering game over; save-once on initials → title and on `q`/Escape; the initials screen and the title page drawn boardless; the two old `Settings.setHighScore` calls removed. |
| `app/render/Screens.js` | `drawTitle` gains `info.page` and `info.table` (roll-call page unchanged, new HIGH SCORES page); new `drawInitials(ctx, info, palette, family)`. |
| `README.md` | Keys table rows for the initials screen; the state-file note describes the table file and its migration; the title-page cycle; the mid-game `q` change (see Approach). |
| `docs/agentile/specs/0002-high-score-table/SPEC.md` | At ship: an "As built" section recording the file shape, that spec 0005's "out of scope: initials entry / high-score table" is superseded, and that inbox item "Defer the corrupt highscore.json rewrite out of onLoaded" is closed by this work. Do not edit `specs/done/0005-*`. |

Not touched: `app/render/Hud.js` (the HUD keeps drawing `state.highScore`, which `Game.createState` seeds from `Settings.highScore` — no layout change, per the scope boundary), `lib/game.mjs`, `lib/input.mjs`, `app/PixelStage.qml`, `lib/attract*.mjs`.

## Approach

Three commits on one branch, tests first in each: (1) `lib/highscores.mjs` + test; (2) `lib/flow.mjs` + `lib/sound-map.mjs` + tests; (3) `Settings.qml`, `Main.qml`, `Screens.js`, README. The gate must be green after each commit. Everything in `lib/` must run under QV4: `Object.assign`, `slice`, `indexOf`, `concat`; **no object spread, no `padStart`, no `Array.prototype.sort` for ordering** (QV4's sort stability is not guaranteed, and the tie rule depends on order — build tables by insertion instead, see below).

### 1. `lib/highscores.mjs`

Exports (exact names):

```js
export const TABLE_SIZE = 10;
export const INITIALS_LENGTH = 3;
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const EMPTY_INITIALS = "---";
export const MAX_HIGH_SCORE = Number.MAX_SAFE_INTEGER;   // moved from settings.mjs

export function topScore(table)            // table[0].score, or 0 for an empty/invalid table
export function qualifies(table, score)    // boolean
export function rankOf(table, score)       // 1-based rank the score would take, 0 when it would not qualify
export function insert(table, entry)       // a new table; the very same object when entry does not qualify
export function parseHighScores(text)      // table (always a fresh array of fresh rows)
export function serialiseHighScores(table) // text
```

- A **row** is `{ initials, score, level }`. Sanitising (one internal `saneRow(value)`): `score` through the old `saneScore` (finite number, floored, clamped to `MAX_HIGH_SCORE`, else 0); `level` a number ≥ 1 floored, else 1; `initials` a string of exactly three characters each in `LETTERS` or `-` after upper-casing, else `EMPTY_INITIALS`. A row whose sane score is 0 is **not a row** (returns `null`) — a score of 0 never sits in the table.
- `qualifies(table, score)`: `saneScore(score) > 0 && (table.length < TABLE_SIZE || score > table[TABLE_SIZE - 1].score)`. Empty table + any positive score → true; 0 → false.
- `rankOf(table, score)`: 0 unless it qualifies; otherwise 1 + the number of existing rows with `row.score >= score` (ties rank the newer entry **below** the existing one). Position `rankOf - 1` is exactly where `insert` puts it — one test asserts that equivalence.
- `insert(table, entry)`: `const row = saneRow(entry)`; if `row === null` or `!qualifies(table, row.score)` return `table` (identity). Else copy the table (`slice()`), `splice(rank - 1, 0, row)`, then `slice(0, TABLE_SIZE)` so the 11th falls off. Never mutates `table` or its rows.
- `parseHighScores(text)`: reuse the `parseJson`/`isRecord` idiom from `settings.mjs` (copy the two small helpers; do not import settings.mjs). Shapes:
  - `{ "highScores": [ ...rows ] }` — canonical. Build the result by folding the rows **in file order** through `insert` starting from `[]` (each `insert` ranks ties below what is already there, so file order among ties is preserved and anything past 10 falls off; rows that fail `saneRow` or do not qualify are dropped silently).
  - `{ "highScore": N }` (spec 0005's shape) or a **bare number** → migration: `saneScore(N) > 0` ? one row `{ initials: "---", score: N, level: 1 }` : `[]`. If an object carries both keys, `highScores` wins.
  - Anything else (empty, non-string, invalid JSON, array, `null`, wrong types) → `[]`.
- `serialiseHighScores(table)`: `JSON.stringify({ highScores: rows }, null, 2) + "\n"` where `rows` is the table re-folded through `insert` (so junk input serialises to a valid table, and the emitted key order is `initials, score, level`). A non-array input serialises as an empty table.

### 2. `lib/flow.mjs`

Screens: `SCREENS` becomes `["title", "ready", "playing", "paused", "dying", "level-clear", "gameover", "initials"]`. `GAME_SCREENS` unchanged, so `shouldStep` is false on `initials` and `syncFlow` leaves it alone with no code change.

Constants: `INITIALS_TIMEOUT_TICKS = 1800` (30 s), `TITLE_PAGE_TICKS = 300` (5 s).

New field in `createFlow`: `entry: null`. While set it is

```js
entry = { score, level, rank, letters: [0, 0, 0], slot: 0 }   // letters are indices into LETTERS
```

`toTitle` and `toReady` set `entry: null`. Add `toInitials(flow)`: `Object.assign({}, flow, { screen: "initials", ticks: 0, idleTicks: 0, quitHoldTicks: 0, resumeTo: null })` — keeps `entry`.

`flowAction(flow, action, payload)` gains a third argument, used by one action:

| Action | Legal when | Effect |
|---|---|---|
| `qualify` | `screen === "gameover"`, `!flow.attract`, `flow.entry === null`, payload has `score > 0`, `rank >= 1` | sets `entry` (`level` defaults to 1 if not a number ≥ 1). Otherwise returns the same object. The `if (flow.attract)` guard at the top of `flowAction` already covers the demo; add the explicit test anyway. |
| `entry-up` | `screen === "initials"` | `letters[slot] = (i + 1) % 26`, `ticks: 0` |
| `entry-down` | `screen === "initials"` | `letters[slot] = (i + 25) % 26`, `ticks: 0` |
| `entry-next` | `screen === "initials"` | `slot < 2` → `slot + 1`, `ticks: 0`; `slot === 2` → `toTitle(flow)` (the third confirm) |
| `entry-back` | `screen === "initials"` | `slot = max(0, slot - 1)`, `ticks: 0` |

`entry` is replaced, never mutated (`Object.assign({}, entry, { letters: entry.letters.slice() })`). Existing actions (`start`, `any-key`, `pause`, `toggle-pause`, `resume`, `quit-hold`) are already illegal on any screen but the ones they name, so they return the same object on `initials` — test it, do not change them.

`flowTick`: on `gameover`, when `next.ticks >= GAME_OVER_TICKS` return `flow.entry !== null ? toInitials(next) : toTitle(next)`. On `initials`, when `next.ticks >= INITIALS_TIMEOUT_TICKS` return `toTitle(next)`. `ticks` on `initials` therefore means "ticks since the last entry action" (each action resets it) — say so in the doc comment, mirroring how `gameover` uses `ticks`. On the title nothing changes: `idleTicks` still drives the demo.

Helpers:
- `initialsOf(entry)` → `"AAA"`-style string from `entry.letters` (`LETTERS.charAt`), `EMPTY_INITIALS` for a null entry. Import `LETTERS`/`EMPTY_INITIALS` from `./highscores.mjs`.
- `titlePage(flow)` → `"roll-call"` when `Math.floor(flow.ticks / TITLE_PAGE_TICKS) % 2 === 0`, else `"high-scores"`. Derived from `ticks`, which counts on every screen and is reset only by a screen change; `any-key` and `quit-hold` touch `idleTicks`, not `ticks`, so a key press neither flips the page nor does the page cycle touch the attract-idle timer. No new state. Every return to the title starts on the roll-call page.

Update the flow's header diagram: `gameover -> title | initials -> title`.

### 3. `lib/sound-map.mjs`

`SILENT_SCREENS` = `["title", "paused", "gameover", "initials"]`. No other change (the game is not stepped on `initials`, so `events` is empty anyway; the entry is belt-and-braces so the test that enumerates silent screens stays truthful).

### 4. `app/Settings.qml`

- `property var highScores: []` — the table, always replaced, never mutated.
- `readonly property int highScore: HighScoresLib.topScore(highScores)` — the HUD HIGH SCORE. (It stays `int`, as today; scores above 2^31 are a pre-existing edge, see Risks.)
- `function rankFor(score) { return HighScoresLib.rankOf(highScores, score); }`
- `function insertHighScore(row)`: `const next = HighScoresLib.insert(highScores, row); if (next === highScores) return false; highScores = next; highScoreFile.setText(HighScoresLib.serialiseHighScores(next)); console.info("Settings: high score " + row.initials + " " + row.score + " level " + row.level + " saved to " + highScorePath); return true;`
- `function rewriteHighScores() { highScoreFile.setText(HighScoresLib.serialiseHighScores(highScores)); }`
- The `highScoreFile` FileView: `onLoaded` parses `text()` into `highScores`; if `raw !== serialiseHighScores(highScores)` it logs `console.warn("Settings: migrating " + highScorePath + " to the table shape")` and calls `Qt.callLater(root.rewriteHighScores)` — the write leaves the `onLoaded` path, which is what the inbox item says silences the FileView "dropped operation" warning (today `setText` is called synchronously inside `onLoaded`, Settings.qml line 77). `onLoadFailed: root.highScores = []` — a missing file is not written until a row is inserted (as today). `onSaveFailed` keeps its warning; the in-memory table stays for the session.
- Remove `setHighScore`. Import `"lib/highscores.mjs" as HighScoresLib`; drop the settings import only if nothing else in the file uses it (it does: `parseSettings`, keep it). Header comment: "the high-score table in highscore.json beside it (a pre-table file with a single score is migrated on load)".

### 5. `app/Main.qml`

- Import `"lib/highscores.mjs" as HighScores` is **not** needed: Main.qml goes through `Settings.rankFor` / `Settings.insertHighScore` and `Flow.initialsOf`.
- `readonly property bool boardless: flow.screen === "title" || flow.screen === "initials"`; `backdrop.visible: !window.boardless`. Keep `onTitle` for the existing uses.
- `property bool entrySaved: false` — the save-once guard.
- In `setFlow(next)` inside the `prev.screen !== next.screen` block, add, in this order:
  1. `if (next.screen === "gameover" && !next.attract)`: `const rank = Settings.rankFor(state.score); if (rank > 0) next = Flow.flowAction(next, "qualify", { score: state.score, level: state.level, rank: rank });` (`state` is the finished game: `advance()` assigns `state = s` before calling `setFlow(f)`). Log the rank in debug mode. The demo never reaches this because of the `!next.attract` guard, and the flow rejects it too.
  2. `if (next.screen === "initials") entrySaved = false;`
  3. `if (prev.screen === "initials" && next.screen === "title") saveEntry(prev.entry);`
- `function saveEntry(entry)`: `if (!entry || entrySaved) return; entrySaved = true; Settings.insertHighScore({ initials: Flow.initialsOf(entry), score: entry.score, level: entry.level });` plus a `console.info` line (always, not only in debug) so the log proves the write.
- `quit()`: `if (flow.screen === "initials") saveEntry(flow.entry); Qt.quit();` — the old `Settings.setHighScore(state.highScore)` line goes. **Behaviour change:** `q` mid-game no longer records anything (a table row is earned by finishing the game and entering initials; spec 0005's "the high score is also saved on q mid-game" note is superseded). Record it in README and the as-built notes.
- `handleEvents`: delete the `Settings.setHighScore(s.highScore)` line (line 294). Keep both `console.info` lines. Level clear no longer persists anything; the row is inserted once at game over.
- `handleKey`, new `case "initials":` before `default`:
  - `Qt.Key_Up`, `Qt.Key_K`, `Qt.Key_W` → `act("entry-up")`
  - `Qt.Key_Down`, `Qt.Key_J`, `Qt.Key_S` → `act("entry-down")`
  - `Qt.Key_Right`, `Qt.Key_L`, `Qt.Key_D`, `Qt.Key_Return`, `Qt.Key_Enter` → `act("entry-next")`
  - `Qt.Key_Left`, `Qt.Key_H`, `Qt.Key_A` → `act("entry-back")`
  - `Qt.Key_Q`, `Qt.Key_Escape` → `quit()`
  - anything else → `return false`. Space is deliberately not a confirm (the spec names Enter); `g`, `m`, F12 are handled above the switch as on every screen.
  These are discrete taps handled on press; the `pressed` list and `pendingPress` are not touched on this screen (the game is not stepped). Auto-repeat is already swallowed in `Keys.onPressed`, so holding Up does not spin the letter — one tap, one letter, arcade style. `handleKeyRelease` is unchanged (`Input.releaseKey` on an empty list is a no-op).
- `loseFocus()`: no code change needed — `act("pause")` is illegal on `initials` and returns the same flow, so the 30 s timeout keeps running unfocused. Add a comment there and a flow test that `pause` on `initials` is identity.
- Overlay `onPaint`: the early-return branch becomes `if (flow.screen === "title" || flow.screen === "initials")`; fill the background, then `Screens.drawTitle(ctx, { highScore: Settings.highScore, table: Settings.highScores, page: Flow.titlePage(flow), blinkOn: window.slowBlinkOn, quitHold: ... }, palette, Theme.fontFamily)` on the title, or `Screens.drawInitials(ctx, { initials: Flow.initialsOf(flow.entry), slot: flow.entry.slot, score: flow.entry.score, rank: flow.entry.rank, level: flow.entry.level, blinkOn: window.blinkOn }, palette, Theme.fontFamily)` on `initials`.
- Debug: the 1 s log line gains `" page " + Flow.titlePage(flow)` on the title and `" entry " + Flow.initialsOf(flow.entry) + "/" + flow.entry.slot` on initials (optional but cheap and makes the unattended runs legible). The header comment's key list gains the initials-screen keys.

### 6. `app/render/Screens.js`

All text is the 8 px font (one glyph per 8 px tile, 28 columns across the 224 px stage) unless noted; every colour comes from the `palette` object Main.qml builds from `Theme` — no new palette keys are needed (`title`, `text`, `muted`, `quit`, `pacman`, `ghosts`, `eyeWhite`, `pupil` already exist).

`drawTitle(ctx, info, palette, family)` — split the body: the shared frame (PACMAN at 16 px, PRESS ENTER, the quit bar, both hint lines) stays in `drawTitle`; the middle is `info.page === "high-scores" ? drawScoreTable(ctx, info.table, palette, family) : drawRollCall(ctx, info.highScore, palette, family)`. The roll-call page is pixel-identical to today (including `HIGH SCORE n` at y 208). Missing `info.page` means roll-call.

`drawScoreTable` layout (native units; constants at the top of the file like the others):

```
TABLE_TITLE_Y = 56     "HIGH SCORES" centred, palette.title
TABLE_HEAD_Y  = 68     header in palette.muted: "NO" right at RANK_RIGHT, "NAME" left at NAME_X,
                       "SCORE" right at SCORE_RIGHT, "LEVEL" right at LEVEL_RIGHT
TABLE_Y       = 80     first row; TABLE_STEP = 12; ten rows end at y 188 (+8 = 196), clear of PRESS_Y 232
RANK_RIGHT = 40, TABLE_NAME_X = 56, SCORE_RIGHT = 152, TABLE_LEVEL_RIGHT = 200
```

Each of the ten rows draws the rank (`i + 1`, right-aligned, `palette.muted`) then, for a real row, initials at `TABLE_NAME_X`, the score right-aligned at `SCORE_RIGHT` (a 7-digit score spans 96..152, clear of the initials ending at 80), the level right-aligned at `TABLE_LEVEL_RIGHT`, all in `palette.text`; for an empty row `---` under NAME and SCORE and `-` under LEVEL in `palette.muted`. Right alignment comes from `ctx.textAlign = "right"`, not string padding. Nothing on this page is wider than 28 glyphs.

`drawInitials(ctx, info, palette, family)` — `info` is `{ initials, slot, score, rank, level, blinkOn }`:

```
ENTRY_TITLE_Y = 40   "ENTER YOUR INITIALS" centred, palette.title (19 glyphs)
ENTRY_SCORE_Y = 96   "SCORE " + score centred, palette.text
ENTRY_RANK_Y  = 112  "RANK " + ordinal(rank) centred, palette.text   (1ST 2ND 3RD 4TH … 10TH; a small local helper)
ENTRY_LEVEL_Y = 128  "LEVEL " + level centred, palette.muted
SLOT_Y = 168, SLOT_X = [88, 112, 136], the letters at TITLE_PX (16 px) with textAlign center
SLOT_BAR_Y = 188, SLOT_BAR_WIDTH = 12, SLOT_BAR_HEIGHT = 2   an underline bar per slot, palette.muted
HINT_Y / HINT2_Y (existing 264 / 276), palette.muted:
   "UP DOWN LETTER  ENTER NEXT"   (26 glyphs)
   "LEFT BACK  Q SAVE AND QUIT"   (26 glyphs)
```

Slots: inactive letters in `palette.text`; the active slot's letter in `palette.title` while `info.blinkOn`, not drawn otherwise (the bar stays, so the cursor position is always visible). No board, no HUD — the screen owns the whole stage like the title does.

Update the header comment of the file (it lists what the module draws).

### Data flow summary

```
game-over event → syncFlow → gameover ─(setFlow: Settings.rankFor > 0 → "qualify")→ entry set
gameover + 180 ticks ─flowTick→ initials (entry) | title (no entry)
initials: entry-up/down/next/back (keys) | 1800 idle ticks → title
initials → title ─(setFlow)→ saveEntry(prev.entry) → Settings.insertHighScore → highscore.json
initials + q/Escape ─(quit)→ saveEntry(flow.entry) → Qt.quit()
title: page = titlePage(flow) from flow.ticks; idleTicks → demo as before
demo: flow.attract → qualify rejected by both Main.qml and the flow; nothing written
```

## Test strategy

Gate: `node --test tests/*.test.mjs` (the only configured gate). Write each test file before the module it covers and watch it fail.

`tests/highscores.test.mjs`:
- constants: `TABLE_SIZE` 10, `INITIALS_LENGTH` 3, `LETTERS` is A–Z, `EMPTY_INITIALS` `---`, `MAX_HIGH_SCORE` is `Number.MAX_SAFE_INTEGER`.
- `parseHighScores` canonical shape round-trips; keeps `initials, score, level`.
- migration: `'{"highScore": 500}'` → `[{ initials: "---", score: 500, level: 1 }]`; `'{\n  "highScore": 12345\n}\n'` (the exact text `serialiseHighScore` used to write) likewise; bare `"12345"` likewise; `'{"highScore": 0}'`, `"0"`, `"-7"` → `[]`; both keys present → `highScores` wins.
- corrupt/missing: `""`, `undefined`, `null`, `"garbage"`, `"{ highScore: 5"`, `"[500]"`, `"null"`, `'{"highScores": "x"}'` → `[]`.
- sanitising rows: score `999.9` → 999, `1e300` → `MAX_HIGH_SCORE`, `"500"` (string) → row dropped, 0 → dropped, negative → dropped; initials `"abc"` → `ABC`, `"AB"`/`"ABCD"`/`"A1B"`/`42` → `---`; level `0`, `-1`, `"3"`, missing → 1, `2.7` → 2.
- ordering on parse: an unsorted file comes back sorted descending; equal scores keep file order; 12 rows → 10.
- `qualifies`: empty + 10 → true; empty + 0 → false; empty + -5 → false; 9 rows + 1 → true; full table: `> last` true, `=== last` false, `< last` false; non-numeric → false.
- `rankOf`: empty + 10 → 1; `[300, 200, 100]` + 250 → 2; + 200 → 3 (tie below); + 300 → 2; + 400 → 1; full table + `=== last` → 0; equals the index `insert` lands on for every case.
- `insert`: into empty; middle; tie goes **below** the existing row and the existing row object stays at its index; full table + higher score → 10 rows, the old 10th gone, the new row present; full table + tie with the 10th → the same object back; non-qualifying → the same object back; never mutates the input table or its rows (`JSON.stringify` before/after); the returned rows are fresh objects.
- `topScore`: `[]` → 0; otherwise the first row's score; junk → 0.
- `serialiseHighScores`: pretty JSON, trailing newline, key order `initials, score, level`, round trip through `parseHighScores`; `undefined`/junk rows → `{ "highScores": [] }`.

`tests/flow.test.mjs` (extend; keep every existing test passing):
- constants: `INITIALS_TIMEOUT_TICKS` 1800, `TITLE_PAGE_TICKS` 300; `SCREENS` gains `"initials"` last; `createFlow` deep-equals the old shape plus `entry: null`.
- `qualify`: on a real gameover with `{ score: 500, level: 2, rank: 3 }` sets `entry = { score: 500, level: 2, rank: 3, letters: [0,0,0], slot: 0 }`; illegal (same object) on title/ready/playing/paused/initials, on a demo gameover, with rank 0, with score 0, and a second time once `entry` is set.
- gameover with `entry` → `initials` on the 180th tick with `ticks` 0 and `entry` intact; without → title (existing test); a demo gameover → title.
- `entry-up`/`entry-down` cycle A→B and A→Z on the active slot only; `entry-next` moves slot 0→1→2; `entry-back` 2→1→0 and stays at 0; every entry action resets `ticks`; `initialsOf` reads `AAA`, then e.g. `BAZ` after the right sequence; entry actions are identity off the initials screen.
- the third `entry-next` returns to the title with `entry: null`, `idleTicks` 0, `attract` false.
- timeout: 1799 ticks stay on initials; the 1800th → title; an action at tick 1799 resets so the 1800th stays.
- `shouldStep` false on `initials`; `pause`, `toggle-pause`, `resume`, `start`, `any-key`, `attract`, `quit-hold` are identity there; `syncFlow` leaves `initials` alone for every phase (extend the existing loops).
- `titlePage`: ticks 0 and 299 → roll-call, 300 and 599 → high-scores, 600 → roll-call (via `flowTick` with attract disabled so the demo does not start); `any-key` at tick 400 keeps the page and zeroes `idleTicks`; `quit-hold` likewise; the page never changes `idleTicks` (idle 599 → the 600th tick still starts the demo on either page).
- purity: extend the existing test with `qualify`, the entry actions and a 1800-tick `flowTick` on an initials flow.

`tests/sound-map.test.mjs`: add `"initials"` to the loop-is-null list and the discard-one-shots list.

`tests/settings.test.mjs`: the high-score tests and imports go; the file must still pass.

Manual verification (builder, with evidence in the PR; reviewer repeats the first two). Use a scratch `HOME` so the shared `~/.local/state/pacman/` is untouched — the worktree guard rejects `HOME=` on a compound Bash line, so put each run in a script under the scratchpad. The scratch home needs `.local/state/omarchy` symlinked to the real one so the theme loads; record the active theme with every grab. Launch only from the worktree path and kill only the pid you started.

1. **Migration.** Write `{ "highScore": 500 }` to `$HOME/.local/state/pacman/highscore.json`, run `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="6000,F12,1000,Escape" bin/pacman`. Expect the log line `Settings: migrating …`, **no** `dropped operation` warning, the F12 grab (taken ~7.5 s in, i.e. on the HIGH SCORES page, which shows from 5 s to 10 s) with rank 1 `---  500  1`, and the file rewritten as `{ "highScores": [ { "initials": "---", "score": 500, "level": 1 } ] }`. Copy the grab to the spec directory as `frame-table.png`.
2. **Qualifying game and entry.** Empty scratch table. `PACMAN_DEBUG_KEYS="Return,2500,Left,150,Left,45000,F12,500,Up,500,Up,500,Return,500,Down,500,Return,500,F12,500,Return,1500,Escape"`: two pellet-eating taps make the score positive, then Pac-Man idles until the ghosts take three lives. The exact time to game over is not scripted; read the log — `Debug: flow gameover -> initials`, then `Debug: key Up on initials`, and the final `Settings: high score CZA 30 level 1 saved` (two Ups take slot 0 A→B→C, Return moves to slot 1, one Down wraps A→Z, Return moves to slot 2, the third Return saves with slot 2 still A). If the keys land on `playing` (game over came later than 45 s) or the entry timed out first, lengthen or shorten the 45000 pause and rerun. Grab `frame-initials.png`. Relaunch with `"6000,F12,1000,Escape"`: the row is on the table page and the HUD/roll-call `HIGH SCORE` shows its score. Confirm exactly one `Settings: high score … saved` line per run.
3. **Timeout.** Same as 2 but with no keys after the long pause: `"Return,2500,Left,150,Left,90000,Escape"`. The log shows `initials -> title` 1800 ticks after `gameover -> initials` and the file holds an `AAA` row.
4. **`q` on the initials screen.** As 2 but `…,Up,500,q`: the row is saved with the current letters and the process exits; one save line.
5. **Attract never writes.** Empty scratch table, `"55000,Escape"` (the demo starts at 10 s, runs 40 s, returns to the title; Escape on the title quits). No `-> initials`, no `Settings: high score` line, no `highscore.json` created. The demo's HUD score is 1860, which would qualify — that is the point of the check.
6. **Focus loss on initials.** Interactive (Keith or the reviewer): reach the initials screen, switch workspace and back; the window title must not say paused and the 30 s timeout still fires.
7. Restore nothing: the scratch home is thrown away. Check the shared `~/.local/state/pacman/highscore.json` was never touched (`stat` before and after).

## Risks and unknowns

- **`state.mode` is the ghost mode** (scatter/chase), `Settings.mode` the graphics mode. Do not add a `mode` or `page` field to the flow; `titlePage` is derived. Nothing here touches `state.mode`.
- **The demo must never write.** Two guards (Main.qml's `!next.attract` before `qualify`, and the flow's `if (flow.attract)` branch) plus the removal of every `setHighScore` call. Test 5 above and the flow tests cover it. `Game.createState(..., { highScore: Settings.highScore })` still seeds the demo's HUD, so the inbox item "Demo HUD climbs the live high score" is unchanged by this spec.
- **Input model.** Play uses the held-keys set (`lib/input.mjs`); the initials screen uses discrete presses and never touches `pressed`/`pendingPress`. Auto-repeat is swallowed, so a held key does not spin letters — acceptable, arcade-like; mention in the as-built notes. The debug key script taps press+release in one frame, which is exactly a discrete press here (no zero-tick-frame drop, because these keys do not go through the tick loop).
- **QV4.** No object spread (settings.mjs already says why), no `padStart`, no reliance on `sort` stability — `parseHighScores` orders by folding through `insert`. Optional chaining is unverified in this Qt; `??` is already used in Main.qml, but keep `lib/` to ES2015 idioms as the existing modules do.
- **FileView "dropped operation".** Today's synchronous `setText` inside `onLoaded` is the suspected cause (inbox). `Qt.callLater` defers it; if the warning still appears in test 1, try `highScoreFile.reload()`-free variants (e.g. a one-shot `Timer` at 0 ms) before merging, and do not leave a synchronous write in the handler. Whether the warning is gone is a merge requirement (the spec says do not regress it further; the inbox item can be ticked only if the log is clean).
- **`Settings.highScore` is an `int`**: a score above 2^31 would wrap in the HUD binding. Pre-existing (`property int highScore` today); scores are five or six digits in practice. Leave it; note it.
- **Text width at 8 px.** 28 glyphs per row; the widest strings here are the two 26-glyph hint lines and a 7-digit score whose right edge at x 152 is clear of the initials at 56–80. The table's ten rows at a 12 px step end at y 196, clear of PRESS ENTER at 232. Check the `frame-table.png` grab for overlap under a theme whose accent differs from cyan (the 0005 notes record that Inky merges with the title colour under decorative-stitch).
- **Timing of the game-over in test 2** is not deterministic across ghost RNG (the real game uses seed 1, so it *is* repeatable run to run — once a pause value works it keeps working; but a maze or ghost change would shift it). The log, not the pause value, is the evidence.
- **Behaviour change: `q` mid-game no longer records the score.** Spec 0005's as-built note said it did. The table needs initials, and a `---` row for every abandoned game would litter the table. Flagged for Keith in the README and as-built notes; if he wants the old behaviour, the alternative is to route a qualifying mid-game `q` through the initials screen instead of quitting at once (a small follow-up, not in this spec).
- **Level clear no longer writes** — the row is inserted once, at game over. A crash mid-game loses the run, as with the inbox item "Save the high score on window close".
- **Determinism.** The flow and the table are pure; the only clock is `flowTick`; the only I/O is in `Settings.qml`; the rank is computed in QML from the loaded table and handed to the flow as data.
- **Two specs are numbered 0002** (`specs/done/0002-maze-and-renderer` and this one). Different slugs; do not confuse them in ship notes.

## ADR

None. No ADR covers persistence or the settings files (ADR-0001 is the process model, ADR-0002 rendering), and a JSON state file gaining a table with a one-shot migration is neither far-reaching nor hard to reverse. Record the file shape and the migration in the README and the spec's "As built" section instead.
