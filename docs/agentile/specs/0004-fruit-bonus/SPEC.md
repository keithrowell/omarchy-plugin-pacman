---
title: Fruit bonus items per level, drawn as theme-coloured pixel bitmaps
slug: fruit-bonus
status: in_progress
depends_on: []
type: feature
route: background
business_value: medium
technical_certainty: high
created: 2026-09-05
outcome: a fruit appears below the ghost house after 70 pellets on level 1, eating it scores 100, and the bottom HUD shows the level's fruit
claimed_by: 206e3dac-9cc9-4058-870a-7309ecbd27b6
label: 
claimed_at: 2026-09-05T12:52:40Z
---

# Fruit bonus items per level, drawn as theme-coloured pixel bitmaps

## Problem / why now

The round has no bonus item, so nothing changes mid-level and the bottom HUD
has no arcade level indicator. Fruit is the classic reward and the first
hand-pixelled bitmap art in the project. v1 is shipped, so this is v2 content
that adds to outcome 1 (classic behaviour) and outcome 3 (arcade look).

## Acceptance criteria

- [x] `lib/fruit.mjs` (tested, pure): the classic table by level — cherry 100
      (level 1), strawberry 300 (2), orange 500 (3–4), apple 700 (5–6), melon 1000
      (7–8), galaxian 2000 (9–10), bell 3000 (11–12), key 5000 (13+) — with
      `fruitForLevel(level)` and `fruitRow(level)` (the last seven levels' fruit,
      newest on the right, as the arcade shows it).
- [x] Spawn rule in `lib/game.mjs`: the level's fruit appears at the tile
      directly below the ghost-house door (the original's fruit spot) when the
      70th and again the 170th pellet of the level is eaten; it stays for a
      deterministic 9 s (540 ticks at 60 Hz) or until eaten. A spawn never
      happens twice for the same pellet count, and a level-clear or death
      removes a showing fruit. State carries `fruit: { kind, ticksLeft } | null`.
- [x] Eating: Pac-Man's tile equals the fruit tile → score adds the fruit's
      points, event `{ type: "fruit-eaten", kind, score }`, the fruit is replaced
      by its point value drawn at the same spot for 2 s (120 ticks) in
      `Theme.cyan`, then cleared. Spawn emits `{ type: "fruit" , kind }`.
- [x] Bitmaps: `lib/fruit-sprites.mjs` holds eight hand-pixelled 12×12 (max
      14×14) bitmaps as strings of palette letters, one letter per pixel, each
      sprite declaring which `Theme` role each letter maps to (for example
      cherry `r` → `red`, stem `n` → `brown`, leaf `g` → `green`; galaxian
      `y`/`b`/`r` → `yellow`/`blue`/`red`; bell `y` → `yellow` with `f` →
      `foreground` for the clapper; key `c` → `cyan`). No colour literal
      anywhere. A test asserts every bitmap is rectangular, uses only declared
      letters, and every declared role exists in `THEME_KEYS`.
- [x] Rendering in `app/render/Sprites.js`: `drawBitmap(ctx, bitmap, x, y, palette)`
      paints 1×1 native rects (crisp under the arcade upscale). The board draws
      the live fruit or its point value; the bottom HUD draws `fruitRow(level)`
      bottom-right, 16-px slots, **replacing the LEVEL n text** (the original
      cabinet has no level text). The debug overlay still prints the level.
- [x] Sound: a short chiptune `fruit.wav` added to `tools/gen_sounds.py`,
      `lib/sound-map.mjs` (plays on `fruit-eaten`; muted rules as for other
      one-shots) and the generated-sounds test. Sound state and asset list stay
      in sync.
- [x] Attract demo: fruit spawns from the pellet count so the demo stays
      deterministic; the demo may eat fruit, which only changes the score. The
      attract script and its maze checksum are unaffected; `tests/attract.test.mjs`
      still passes without regeneration (or is regenerated in the same change
      if the score trace is part of it).
- [x] README gains a line on fruit and points; the frame-grab check for
      off-palette pixels (if present by then) passes with fruit on screen.

## Scope boundary

**In scope:** fruit table, spawn/eat rules, bitmaps and drawing, HUD fruit
row, point popup, sound, tests, README.

**Out of scope:** fruit movement (later arcade revisions), cutscenes (inbox),
hand-pixelled Pac-Man or ghost bitmaps (inbox stub 12), any change to ghost
behaviour, a fruit column on the high-score table.

## Edge cases and failure paths

- The fruit tile is a corridor tile in this maze; the builder verifies it
  with a test against `maze-data.mjs` rather than assuming the Namco position.
- Death or level-clear while the fruit or its point popup shows → both cleared;
  the second spawn still happens if the 170th pellet is later eaten on that
  level (pellet count is per level, not per life).
- A level with exactly 170 pellets left after death restarts must not
  double-spawn: spawn keys off the transition through the count, once each.
- Pac-Man crossing the fruit tile mid-tunnel-wrap is impossible (tunnel is on
  row 14, fruit is below the house); no special case.
- The point popup must not be drawn over the READY! text on a fast level-clear
  (popup cleared on level-clear).
- Theme roles missing from `colors.toml` fall back through `lib/theme.mjs`
  `FALLBACKS` like every other colour.

## Affected areas

`lib/fruit.mjs` (new), `lib/fruit-sprites.mjs` (new), `lib/game.mjs`,
`lib/sound-map.mjs`, `app/render/Sprites.js`, `app/render/Board.js`,
`app/render/Hud.js`, `app/Sfx.qml`, `tools/gen_sounds.py`, `assets/sfx/fruit.wav`,
`tests/fruit.test.mjs` (new), `tests/game.test.mjs`, `tests/sound-map.test.mjs`,
`tests/gen-sounds.test.mjs`, `tests/attract.test.mjs`, `README.md`.

## Open questions

None.

## Verification

- `node --test tests/*.test.mjs` green, including spawn at pellet 70 and 170,
  9 s expiry, points by level, bitmap validity and the fruit row for levels 1–20.
- Manual: level 1, eat 70 pellets, a cherry shows below the house; eat it,
  100 points and the fruit sound; the bottom-right HUD shows a cherry; on level
  3 an orange sits to the right of the strawberry. Switch the Omarchy theme
  while a fruit shows and it recolours.

## As built

- **The fruit tile**: derived from the maze, not the Namco constant —
  `fruitTile(maze) = { x: maze.house.door[0].x, y: maze.house.y + maze.house.height }`,
  which is `(13, 17)` on this maze; `(14, 17)` (the door's other tile) is open
  too but not checked, and row 17 has no junction between x 9 and x 18 so
  crossing the drawn fruit always crosses tile 13. `fruitSpot(maze)` draws
  the sprite centred on the house's own centre line, `(112, 140)` in maze
  pixels, straddling both door tiles.
- **State fields**: `fruit: { kind, ticksLeft } | null` and
  `fruitScore: { kind, score, ticksLeft } | null` on `state`, both replaced
  never mutated, both frozen null in `createState`, `resetPositions`, the
  `pelletsLeft === 0` branch of `eat()`, and the death branch of `collide()`.
  `pelletsEaten(state)` is a new exported helper the spawn rule and the
  tests share.
- **Tick order in `advance()`**: `eat()` (which spawns) runs inside the
  pauseTicks/stepPlayer branch as before; the new `eatFruit()` runs right
  after that branch (so it sees pause ticks too, harmlessly) and before
  `moveGhosts`; the new `tickFruit()` runs after `releaseFromHouse` and
  before the extra-life check, so both timers pause exactly like every other
  timer during a ghost-eaten freeze, the ready pause, dying, level-clear and
  game-over. Each timer only counts down on a tick where the fruit/popup
  object already existed at the tick's start (`next.fruit === state.fruit`),
  so the spawn tick and the eat tick do not themselves count down — a fruit
  is on screen for exactly `FRUIT_TICKS` (540) consecutive states and the
  popup for exactly `FRUIT_SCORE_TICKS` (120).
- **The four-commit order** matched the plan: (1) `lib/fruit.mjs` +
  `lib/fruit-sprites.mjs` + `tests/fruit.test.mjs`; (2) `lib/game.mjs` +
  `tests/game.test.mjs` + the `tests/attract.test.mjs` assertion; (3) sound
  (`tools/gen_sounds.py`, `assets/sfx/fruit.wav`, `lib/sound-map.mjs`,
  `app/Sfx.qml`, `tests/gen-sounds.test.mjs`, `tests/sound-map.test.mjs`);
  (4) rendering (`app/render/Sprites.js`, `app/render/Hud.js`,
  `app/Main.qml`), README, ADR amendment, manual checks.
- **Attract finding confirmed**: replaying the committed script emits a
  `fruit` event at tick 702 (cherry) and again at tick 2256, the demo never
  crosses the eat tile, and `generateAttract()` still matches the committed
  script exactly — no regeneration was needed, as the plan predicted. A new
  assertion in `tests/attract.test.mjs` pins that a `fruit` event fires
  during the replay, so a future maze or timing change that silences it is
  caught.
- **Debug overlay**: `Hud.drawDebug` now prints `... phase L<n> fright`
  (the level rides after the phase token) since the bottom-right HUD shows
  the fruit row instead of `LEVEL n`. Confirmed with `PACMAN_DEBUG=1` in the
  demo grab below, though the debug line's native width (33+ characters at
  8 px) already slightly overflowed the 224 px board before this change and
  is clipped by the canvas edge at the current window size; this is
  pre-existing and cosmetic, not something this spec introduced or that any
  test asserts against.
- **No colour literal**: `lib/fruit-sprites.mjs` maps every bitmap letter to
  a `lib/theme.mjs` `THEME_KEYS` role (never `mode`); a source-text test
  greps the file for a `#rrggbb`/`#rgb` literal and finds none. `melon`'s
  stripes use `bright_green`, which falls back to `green` on a theme that
  lacks it (loses the stripe contrast, not a colour); `orange`'s and
  `cherry`'s/`apple`'s stems use `brown`, which falls back through `orange`
  then `yellow` — cosmetic, per the spec's edge case.
- **Manual verification**: ran from the worktree only
  (`<worktree>/bin/pacman`), under `timeout`, with a scratch `HOME`
  (`.local/state/omarchy` symlinked to the real one so the live theme
  loads, `.local/state/pacman` a fresh scratch directory — the shared
  `~/.local/state/pacman/` was never touched, confirmed by its files'
  unchanged mtimes after the runs). `Sfx: 15 of 15 effects loaded, audio
  available` on load, no QML warning from the new imports. The demo grab
  (`frame-fruit.png` in this directory, theme **gruvbox-dark**) shows the
  cherry below the ghost house and the cherry in the bottom-right HUD in the
  same frame, both correctly coloured (red body, brown stems, green leaf)
  and the HUD icon clear of the spare-lives wedges.
  `{"type":"fruit","kind":"cherry"}` appears in the debug log at tick 702,
  as predicted.
- **Deviation — no live theme switch**: the plan's manual check 4 asks the
  builder to run `omarchy-theme-set <other>` against the real, shared
  Omarchy state and grab again. That reaches outside the sandboxed
  scratch `HOME` into the user's live desktop theme (every other app,
  panel and terminal follow it too) while they may be at the desktop, so
  this run skipped it rather than switch a shared resource unprompted.
  Theme-following itself is not new or unproven: `palette.theme:
  Theme.palette` is the same live-reloaded object every other themed
  colour in the shipped game already reads, and `Sprites.drawBitmap`
  looks colours up from it on every paint the same way `drawGhost` and
  `drawPacman` do — there is no new reload path to prove. Recommend Keith
  runs the live theme-switch check himself at his convenience (or ask a
  future loop to do it) if a screenshot under a second theme is wanted;
  not needed to consider this spec done.
- **Eating not exercised end-to-end**: as the plan anticipated, there is no
  debug hook to reach 70 real pellets deterministically inside a scripted
  key run without a long, brittle route, so eating the fruit is proven by
  the `lib/game.mjs` unit tests (spawn at 70 and 170 exactly once each,
  eating scores the level's points and shows the 2 s popup without
  freezing the player, the single-tile rule, death/level-clear clearing,
  timers pausing with the game, the extra-life interaction) rather than by
  a manual grab, and needs Keith's playtest at ship per the spec's own
  manual-verification wording.
- **`lib/fruit-sprites.mjs` bitmap sizes**: seven of the eight are 12x12;
  `galaxian` is 13x12 (the plan allowed up to 14 wide for the flagship's
  wings) and `key` is 10x12 (narrower fits the shape better; nothing in the
  spec requires uniform sizes, and `drawBitmap`/`drawFruit` size themselves
  from each bitmap's own `rows`).
