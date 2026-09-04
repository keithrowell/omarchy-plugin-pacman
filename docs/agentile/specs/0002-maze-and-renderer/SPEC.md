---
title: Maze data model, board renderer and PixelStage (arcade/smooth toggle)
slug: maze-and-renderer
status: ready
depends_on: [app-shell]
type: feature
route: background
business_value: high
technical_certainty: high
created: 2026-09-04
outcome: the full maze renders in theme colours as big pixels (arcade) and crisp vectors (smooth) from one drawing path, and every pellet is reachable
claimed_by:
label:
claimed_at:
---

# Maze data model, board renderer and PixelStage (arcade/smooth toggle)

## Problem / why now

The maze is the board every other rule plays on, and its rendering is where the
"old-school arcade look, coloured by the theme" outcome is won or lost. Keith
wants the original big-pixel look by default and a smooth style as a toggle.
ADR-0002 fixes how: one vector renderer in native 224×248 units, and a
`PixelStage` that either upscales a low-res layer with hard edges or draws at
full resolution. Getting that stage right here means sprites slot in later
without rework.

## Acceptance criteria

- [ ] `lib/maze.mjs` exports the level as an ASCII map (28 columns × 31 rows, classic proportions, **original layout** in the Namco style: symmetric left/right, a central ghost house with a door, two side tunnels, four power pellets in the corners) and `parseMaze(text)` → `{ width, height, tiles, pellets, powerPellets, house, spawn, tunnels }`. Tile kinds: wall, pellet, power, empty, door, tunnel.
- [ ] Tests: dimensions, left/right symmetry of walls, pellet count in a documented range (200–260), exactly 4 power pellets, ghost house door present, and a BFS proving every pellet is reachable from the player spawn.
- [ ] Wall rendering derives each wall tile's shape from its neighbours (auto-tiling) so the map text stays simple: corners, straights, T-joins, and the house outline.
- [ ] `app/PixelStage.qml`: an `Item` with `nativeWidth`/`nativeHeight` (224×248) and `mode ∈ { "arcade", "smooth" }`, holding one child scene. **arcade**: `layer.enabled`, `layer.textureSize` = native size, `layer.smooth: false`, scale = `floor(min(w/224, h/248))` (min 1), centred and letterboxed on `Theme.background`. **smooth**: layer off, fractional fit-to-window scale, anti-aliased. Contains no game knowledge (candidate for extraction as a library, see inbox).
- [ ] `app/render/Board.js`: draws the maze on the `Canvas` in native units with smooth vector primitives — walls as 1-px double-line strokes in `Theme.blue` with rounded corners derived from auto-tiling (corners, straights, T-joins, house outline), house door in `Theme.magenta`, pellets as 2×2 squares in `Theme.foreground`, power pellets as 8-px discs blinking at 200 ms. In arcade mode the layer turns this into the original big-pixel look; in smooth mode the same code draws crisp at full resolution.
- [ ] Key `g` toggles the mode at runtime; the choice persists in `~/.local/state/pacman/settings.json`.
- [ ] Pixel-correctness check: a `grabToImage` debug command (`PACMAN_DEBUG=1`, key `F12`) saves the stage to `~/.local/state/pacman/frame.png` so the look can be reviewed from a screenshot; in arcade mode every rendered pixel block is an integer multiple of the scale.
- [ ] All colours come from `Theme`; a theme switch recolours the maze on the next frame.
- [ ] Steady 60 fps on the spike machine with the full maze drawn each frame (measured with the existing `FrameAnimation` counter, logged in debug mode `PACMAN_DEBUG=1`).

## Scope boundary

**In scope:** maze data, parser, tests, the board renderer, `PixelStage` with both modes, mode toggle and persistence, scale/letterbox maths.

**Out of scope:** player and ghost sprites, movement, sound, HUD text beyond the placeholder title, multiple mazes.

## Edge cases and failure paths

- Window smaller than 224×248 → scale 1 and clipping rather than a crash.
- Non-integer DPI scaling from the compositor: `PixelStage` sizes the texture in native units and scales in device pixels so blocks stay square; game code never sees DPI.
- Map text with a stray character → `parseMaze` throws with row/column; tests cover it.
- Settings file missing or malformed → default `arcade`, rewrite on next toggle.

## Affected areas

`lib/maze.mjs`, `lib/maze-data.mjs` (the map text), `tests/maze.test.mjs`, `app/PixelStage.qml`, `app/render/Board.js`, `lib/scale.mjs` (pure fit/scale maths, tested), `app/Main.qml` (canvas paint dispatch, `g` key), `lib/settings.mjs` + `app/Settings.qml` (read/write settings.json via `FileView`).

## Open questions

None. Auto-tiling of walls is the only fiddly part; if it balloons, fall back to explicit corner glyphs in the map text and note it in `plan.md`.

## Verification

- `node --test tests/` green (maze parse, reachability, scale maths).
- Manual: `bin/pacman` shows the maze; `g` flips modes; resizing keeps pixel blocks integer-sized in arcade mode; theme switch recolours; `F12` frame capture reviewed.
