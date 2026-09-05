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

- [ ] `lib/fruit.mjs` (tested, pure): the classic table by level — cherry 100
      (level 1), strawberry 300 (2), orange 500 (3–4), apple 700 (5–6), melon 1000
      (7–8), galaxian 2000 (9–10), bell 3000 (11–12), key 5000 (13+) — with
      `fruitForLevel(level)` and `fruitRow(level)` (the last seven levels' fruit,
      newest on the right, as the arcade shows it).
- [ ] Spawn rule in `lib/game.mjs`: the level's fruit appears at the tile
      directly below the ghost-house door (the original's fruit spot) when the
      70th and again the 170th pellet of the level is eaten; it stays for a
      deterministic 9 s (540 ticks at 60 Hz) or until eaten. A spawn never
      happens twice for the same pellet count, and a level-clear or death
      removes a showing fruit. State carries `fruit: { kind, ticksLeft } | null`.
- [ ] Eating: Pac-Man's tile equals the fruit tile → score adds the fruit's
      points, event `{ type: "fruit-eaten", kind, score }`, the fruit is replaced
      by its point value drawn at the same spot for 2 s (120 ticks) in
      `Theme.cyan`, then cleared. Spawn emits `{ type: "fruit" , kind }`.
- [ ] Bitmaps: `lib/fruit-sprites.mjs` holds eight hand-pixelled 12×12 (max
      14×14) bitmaps as strings of palette letters, one letter per pixel, each
      sprite declaring which `Theme` role each letter maps to (for example
      cherry `r` → `red`, stem `n` → `brown`, leaf `g` → `green`; galaxian
      `y`/`b`/`r` → `yellow`/`blue`/`red`; bell `y` → `yellow` with `f` →
      `foreground` for the clapper; key `c` → `cyan`). No colour literal
      anywhere. A test asserts every bitmap is rectangular, uses only declared
      letters, and every declared role exists in `THEME_KEYS`.
- [ ] Rendering in `app/render/Sprites.js`: `drawBitmap(ctx, bitmap, x, y, palette)`
      paints 1×1 native rects (crisp under the arcade upscale). The board draws
      the live fruit or its point value; the bottom HUD draws `fruitRow(level)`
      bottom-right, 16-px slots, **replacing the LEVEL n text** (the original
      cabinet has no level text). The debug overlay still prints the level.
- [ ] Sound: a short chiptune `fruit.wav` added to `tools/gen_sounds.py`,
      `lib/sound-map.mjs` (plays on `fruit-eaten`; muted rules as for other
      one-shots) and the generated-sounds test. Sound state and asset list stay
      in sync.
- [ ] Attract demo: fruit spawns from the pellet count so the demo stays
      deterministic; the demo may eat fruit, which only changes the score. The
      attract script and its maze checksum are unaffected; `tests/attract.test.mjs`
      still passes without regeneration (or is regenerated in the same change
      if the score trace is part of it).
- [ ] README gains a line on fruit and points; the frame-grab check for
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
