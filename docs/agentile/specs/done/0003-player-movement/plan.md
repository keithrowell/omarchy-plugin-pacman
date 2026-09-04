# Plan — Player movement, pellet eating and score HUD

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Files to touch

| File | Why |
|---|---|
| `lib/speeds.mjs` | `FULL_SPEED_TILES_PER_S = 75.75 / 8`, `playerSpeed(level)` → tiles/s from the classic level table (L1 0.80, L2–4 0.90, L5–20 1.00, L21+ 0.90), `PELLET_PAUSE_TICKS = 1`, `POWER_PAUSE_TICKS = 3`. |
| `lib/input.mjs` | `DIRS` (`up/down/left/right` → `{dx, dy}` and `opposite`), `keyToDirection(name)` for arrows, `hjkl`, `WASD` (case-insensitive), `pressKey(pressed, name)` / `releaseKey(pressed, name)` → new pressed list (latest press wins), `wantedDirection(pressed)`. |
| `lib/player.mjs` | `createPlayer(maze)` and `stepPlayer(player, board, wantDir, speedTilesPerS, dt)` → `{ player, moved }`: the cornering/buffering/reversal/tunnel rules, nothing about score. |
| `lib/game.mjs` | `createState(maze, opts?)`, `step(state, input, dt)` → `{ state, events }`, `TICK = 1/60`. Owns board tiles (copy-on-eat), score, `pelletsLeft`, `lives` (3, never lost here), `level` (1), pellet pauses, event emission. |
| `lib/scale.mjs` | `NATIVE_HEIGHT` 248 → **288**; add `BOARD_ORIGIN = { x: 0, y: 24 }` (maze rows 3–33 of the 36-row screen, as in the original: 3 HUD rows above, 2 below). Update `tests/scale.test.mjs` expectations (`fitArcade(672, 864, 1)` → k 3, offsets 0/0). |
| `tests/speeds.test.mjs`, `tests/input.test.mjs`, `tests/player.test.mjs`, `tests/game.test.mjs` | The gate. |
| `app/render/Board.js` | Translate by `BOARD_ORIGIN` before drawing; `drawPellets(ctx, board, palette, timeMs)` reads `board.tiles` (the game state's copy) so eaten pellets vanish. `drawBackdrop` unchanged apart from the translate. |
| `app/render/Sprites.js` | `drawPacman(ctx, player, palette)`: 13-px wedge, mouth by distance, facing `dir`, drawn twice across a tunnel edge. |
| `app/render/Hud.js` | `drawHud(ctx, state, palette, font)`: `1UP` + score top-left, `HIGH SCORE` + value top-centre, life icons bottom-left; `drawDebug(ctx, info, palette, font)`. |
| `app/Main.qml` | Fixed-timestep loop, key press/release → `input`, state ownership, dispatch of the three draw calls, debug overlay info. |
| `docs/adr/0002-big-pixels-via-low-res-layer.md` | One dated amendment line under Decision: native stage is 224×288 with the 224×248 maze at y = 24; game coordinates stay maze-relative. |

Do not touch `Theme.qml`, `Settings.qml`, `PixelStage.qml`, `lib/maze*.mjs`, `lib/theme.mjs`.

## Approach

### Coordinates and units

The maze is 28×31 tiles of 8 px. All game-side positions are **maze pixels**:
`x ∈ [0, 224)`, `y ∈ [0, 248)`, a tile's centre is `(tx*8 + 4, ty*8 + 4)`.
`tile = floor(p / 8)`. Renderers translate by `BOARD_ORIGIN` so the HUD rows sit
above and below. `lib/` never sees `BOARD_ORIGIN` except as an exported constant
in `scale.mjs`; game code is unaware of it.

Speeds are tiles/s in `speeds.mjs` and converted to px/s (`× 8`) in `player.mjs`.
At level 1 that is 60.6 px/s, i.e. 1.01 px per 1/60 s tick.

### Player rules (`lib/player.mjs`)

`player = { x, y, dir, wantDir, distance, stopped }`, starting at the spawn tile
centre facing `left` with `wantDir: null`. `stepPlayer(player, board, wantDir, speed, dt)`:

1. `wantDir` (from input) replaces the buffered `player.wantDir` when non-null;
   the buffer persists across ticks until consumed or replaced (spec: a press
   into a wall keeps the buffer).
2. **Reversal**: if `wantDir` is the opposite of `dir`, set `dir = wantDir`
   immediately, clear the buffer.
3. **Turning (cornering)**: if `wantDir` is perpendicular and the tile in
   `wantDir` from the *current* tile is walkable and the player is within
   `CORNER_TOLERANCE = 4` px of the current tile's centre along the movement
   axis, snap to that centre, set `dir = wantDir`, clear the buffer. This is the
   classic pre-turn: the turn is taken at the next tile centre even if pressed
   early, and the snap keeps the player on the lane.
4. **Advance** `speed * dt` px along `dir`, but if the tile ahead in `dir` is
   not walkable, do not move past the current tile centre: clamp to the centre
   and set `stopped = true` (a stopped player still turns the moment a legal
   `wantDir` arrives, since rule 3 runs first).
5. Keep the perpendicular coordinate locked to the lane centre after a turn
   (`snap`), so drift cannot accumulate.
6. **Tunnel wrap**: after advancing, if `x < -4` set `x += 224`; if `x ≥ 228`
   set `x -= 224` (the sprite is 13 px wide; keep the crossing continuous).
   Walkability off-map on a tunnel row is looked up through `tileAt`, which
   already wraps x.
7. `distance += |moved|` for the mouth animation. Return `moved` (px) so
   `game.mjs` can tell a stall from motion.

Walkable for the player: `isWalkable(kind)` from `maze.mjs` (pellet, power,
empty, tunnel). Door and house are walls to the player.

### Game state and loop (`lib/game.mjs`)

```
createState(maze) → {
  board: { width, height, tiles: maze.tiles.slice() },
  maze,                       // immutable reference for spawn/house/tunnels
  player, score: 0, highScore: 0, lives: 3, level: 1,
  pelletsLeft: maze.pellets.length + maze.powerPellets.length,
  pauseTicks: 0, tick: 0, cleared: false
}
step(state, input, dt) → { state, events }
```

- `input = { wantDir }` (`null` when no direction key is held/buffered by the
  caller).
- If `pauseTicks > 0`, decrement and return the state unchanged apart from
  `tick` (the pellet slow-down; the original freezes the player one frame per
  pellet, three per power pellet — that is the "slowing briefly" in the spec).
- Otherwise `stepPlayer`; when the player's tile changes **or** it is at the
  centre of a tile whose kind is `pellet`/`power`, eat it: copy `board.tiles`,
  set the tile to `empty`, `score += 10 | 50`, `pelletsLeft--`,
  `pauseTicks = 1 | 3`, push `{ type: "pellet" }` or `{ type: "power" }`.
  Eat when within 4 px of the tile centre so a fast player cannot skip one.
- When `pelletsLeft` hits 0: `cleared = true`, push `{ type: "level-clear" }`
  once; further steps are no-ops until a later spec handles level advance.
- `step` must be pure: never mutate `state` or `input`; shallow-copy what
  changes. No `Date`, no `Math.random`.
- `dt` is always `TICK`; callers accumulate. Guard: if `dt > 0.05` throw, so a
  caller that forgot to slice time cannot tunnel through walls.

### Input (`lib/input.mjs` + `Main.qml`)

`keyToDirection`: `Up/Down/Left/Right`, `k/j/h/l`, `w/s/a/d` → `up/down/left/right`.
`Main.qml` keeps `property var pressed: []`; `Keys.onPressed` (ignoring
`event.isAutoRepeat`) → `pressKey`, `Keys.onReleased` (ignoring auto-repeat) →
`releaseKey`. Each tick `input.wantDir = wantedDirection(pressed)`; this makes
holding a key keep re-asserting the direction (so a wall-blocked direction is
re-tried at every tile) while the buffer in `player` covers taps.

### Fixed timestep (`Main.qml`)

```
FrameAnimation.onTriggered:
  acc += Math.min(frameTime, 0.25)
  while (acc >= TICK) { r = Game.step(state, input, TICK); state = r.state; events.push(...); acc -= TICK }
  overlay.requestPaint()
```
`state` is a `property var`; reassigning it each tick is fine. Events are
logged in debug mode for now (sound arrives in spec 0005) and `level-clear`
logs once at info level.

### Rendering

- `Board.drawPellets` now takes `state.board`; the backdrop is unchanged.
- `Sprites.drawPacman`: centre `(player.x, player.y)`, radius 6.5, mouth
  opening in three phases by `floor(player.distance / 4) % 4` mapped
  `0,1,2,1` → closed / half / open / half (angles 0°, 35°, 70° half-opening),
  rotated to `dir`; when `stopped` show the half-open pose. If `x < 6.5` also
  draw at `x + 224`; if `x > 217.5` also draw at `x − 224`, clipped to the
  board rect so nothing leaks into the HUD rows.
- `Hud.drawHud`: `ctx.font = "8px " + quoted family`, `textBaseline = "top"`.
  Row 0 (`y = 0`): `1UP` at x = 24, `HIGH SCORE` at x = 72. Row 1 (`y = 8`):
  score right-aligned ending at x = 56 (`ctx.textAlign = "right"`), high score
  right-aligned ending at x = 136. Lives: `state.lives − 1` small Pac-Man wedges
  (radius 5, facing left, mouth half open) at `y = 276`, x from 24 in 16-px
  steps — the original shows the *spare* lives. Colours: `palette.text`
  (`Theme.foreground`) for labels and numbers, `palette.pacman` (`Theme.yellow`)
  for the icons. The window passes `Theme.fontFamily` in; `Hud.js` holds no
  literal family name.
- Debug overlay (`PACMAN_DEBUG=1`): one line at `y = 280`, x = 120 in
  `palette.muted` (`Theme.muted`): `fps tx,ty want:dir`.
- Draw order per frame in the overlay canvas: pellets, Pac-Man, HUD, debug.
  The backdrop is untouched.

### Palette keys

Extend `window.palette()` with `pacman: Theme.yellow`, `text: Theme.foreground`,
`muted: Theme.muted`. Still no literal colours anywhere outside `DEFAULTS`.

## Test strategy

Gate: `node --test tests/*.test.mjs`.

- `speeds.test.mjs`: level 1 → 0.8 × 9.46875 tiles/s; levels 2, 4, 5, 20, 21
  map to the documented fractions; pause tick constants.
- `input.test.mjs`: every arrow/hjkl/WASD name (both cases) maps correctly;
  unknown → null; press A then B → wanted B; release B → wanted A; release
  unknown is a no-op; functions do not mutate their inputs.
- `player.test.mjs` (build a small synthetic maze with `parseMaze` where
  helpful, plus `LEVEL_1`):
  - starts at spawn centre facing left, stopped false;
  - moves left at level-1 speed: after 60 ticks the x delta is 60.6 ± 0.01;
  - never enters a wall: for each level fraction in the table and for 20,000
    ticks of a scripted random-but-seeded direction sequence, assert
    `isWalkable(tileAt(maze, tile))` after every tick and that the
    perpendicular coordinate equals the lane centre whenever moving;
  - pre-turn buffering: press `up` two tiles before a junction where up is
    legal → the turn happens exactly at that junction's centre, not before;
  - press into a wall keeps the buffer and turns at the next legal tile;
  - reversal is immediate mid-tile;
  - wall ahead → clamps to tile centre and `stopped`;
  - tunnel: walking left from `(1, 14)` wraps to `x ≈ 223` and continues; the
    same to the right;
  - `stepPlayer` does not mutate its arguments.
- `game.test.mjs`:
  - `createState` counts 260 pellets (256 + 4);
  - one tick over a pellet emits `{type:"pellet"}`, score 10, tile now empty,
    pelletsLeft 259, next tick is a pause (player x unchanged), original state
    untouched;
  - power pellet → 50 and a 3-tick pause;
  - `dt > 0.05` throws;
  - **autopilot clear**: each time the player is at a tile centre, BFS from the
    current tile to the nearest remaining pellet over walkable tiles (with
    tunnel wrap), feed the first step's direction as `wantDir`, run `step`
    until `pelletsLeft === 0` or 200,000 ticks; assert `level-clear` fired
    exactly once, score = 256×10 + 4×50 = 3,000, `cleared` true, and further
    steps emit nothing. This proves every pellet is eatable through the real
    movement engine, not just reachable by BFS.
- `scale.test.mjs`: update for `NATIVE_HEIGHT = 288`, add `BOARD_ORIGIN`.

Manual (builder reports with evidence): `qs` launch clean; play with arrows
and `hjkl` in both modes; `PACMAN_DEBUG=1` fps stays 60 with the sprite and
HUD drawn; `PACMAN_DEBUG_KEYS` can drive a few moves (add the four directions
to the key script's name table); F12 grabs in arcade mode and copy one into
the spec directory as `frame-play.png` — check with the reviewer's
`measure-arcade.py` idea that the grab stays palette-pure (yellow, foreground,
blue, magenta, background only).

## Risks and unknowns

- **Canvas text with the vendored font.** Qt's Canvas `ctx.font` resolves
  families the application has loaded via `FontLoader`, so `"Press Start 2P"`
  should render; if it silently falls back, HUD text will look wrong in the
  grab. Verify in the F12 grab; if broken, the fallback is a `Text` item
  overlaid in the stage (still in native units, still under the layer).
- **Native height change** touches `PixelStage` only through
  `Scale.NATIVE_HEIGHT`; the arcade-purity measurement from spec 0002 must
  still hold (`k` stays 6 at 1600×1000 since 1000×1.6/288 = 5.55 → 5; note
  `k` drops to 5 in the tiled default). Re-measure.
- **Cornering feel** is subjective; the tolerance (4 px) is a constant the
  next spec can tune. Keep it exported from `player.mjs`.
- **Eating at tile centre vs. tile entry**: eating when within 4 px of the
  centre means a reversal right after passing a centre cannot re-eat (the tile
  is already empty). Fine.
- **Autopilot test runtime**: 200k ticks of pure JS is well under a second.

## ADR

Amend ADR-0002 (one line, dated): the native stage is 224×288 — the 224×248
maze plus the original's three HUD rows above and two below — and game
coordinates remain maze-relative. No new ADR.

## As built (recorded at ship)

- Full clear scores 2,760 (256×10 + 4×50); the 3,000 above was an arithmetic slip.
- Buffering rules live in one exported `bufferWant(player, wantDir)` in
  `player.mjs`, used by both `stepPlayer` and the pause branch in `game.mjs`.
  The reviewer found the pause path clobbering a tapped pre-turn while a
  direction key was held; every pellet is a pause tick, so it always bit.
- Asking for the current direction is a no-op on the buffer, so "hold left,
  tap up" keeps the up pre-turn.
- `Main.qml` keeps a pending press so a sub-frame tap still reaches the game.
- Events carry `tile` (`{ type: "pellet", tile: {x, y} }`), a superset of the
  spec's contract.
- Debug line at x = 64 so it does not clip.
- `Board.drawBoard` was removed; the backdrop and pellet overlay are the API.
