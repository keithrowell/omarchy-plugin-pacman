# Plan — Four ghosts with classic behaviour, lives and level progression

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

The rules below are transcribed from the Pac-Man Dossier (Jamey Pittman),
which is the reference the spec names. Cite it in a header comment of each
table module. Where our board differs from the original (260 pellets, our own
layout) the rule still uses the original numbers.

## Files to touch

| File | Why |
|---|---|
| `lib/rng.mjs` | `seed(n) → rngState`, `nextRandom(rngState) → { value, state }` (mulberry32; value in [0,1)), `randomInt(rngState, n)`. Pure; the RNG state lives in the game state. |
| `lib/modes.mjs` | Scatter/chase schedule per level, frightened duration and flash count per level, `modeAt(level, seconds)`, `frightenedFor(level)`. |
| `lib/speeds.mjs` | Extend with ghost speeds: `ghostSpeed(level)`, `ghostFrightenedSpeed(level)`, `tunnelSpeed(level)`, `elroySpeed(level, stage)`, `playerFrightenedSpeed(level)`, `elroyThresholds(level)`. |
| `lib/maze-data.mjs` | `NO_UP_TILES = [{x:12,y:11},{x:15,y:11},{x:12,y:23},{x:15,y:23}]` and `SCATTER_TARGETS` (Blinky `{x:25,y:-3}`, Pinky `{x:2,y:-3}`, Inky `{x:27,y:31}`, Clyde `{x:0,y:31}`). |
| `lib/ghosts.mjs` | Ghost entities, targeting, direction choice, house/leaving/eaten movement, `stepGhost`. |
| `lib/game.mjs` | Ghost integration: modes, frightened, collisions, chain scoring, death, lives, extra life, level clear and advance, house release counters, Elroy, phases. |
| `lib/player.mjs` | No rule change; expose `resetPlayer(maze)` (same as create) for respawn. |
| `tests/rng.test.mjs`, `tests/modes.test.mjs`, `tests/ghosts.test.mjs`, `tests/game.test.mjs` (extend), `tests/speeds.test.mjs` (extend) | The gate. |
| `app/render/Sprites.js` | `drawGhost(ctx, ghost, palette, frame, flashing)`, `drawDeath(ctx, player, step, palette)`. |
| `app/render/Board.js` | `drawBackdrop` takes an optional `flash` flag that swaps the wall colour to `palette.flash` (`Theme.foreground`). |
| `app/render/Hud.js` | Level indicator bottom-right; lives from state. |
| `app/Main.qml` | Palette keys for the four ghosts, frightened, eyes, flash; repaint the backdrop when the flash flag flips; log new events in debug. |

## Approach

### Entities

```
ghost = { name: "blinky"|"pinky"|"inky"|"clyde",
          x, y,            // maze px, lane-centred like the player
          dir,             // "up"|"down"|"left"|"right"
          state: "house"|"leaving"|"normal"|"frightened"|"eaten",
          dotCounter: 0,   // personal pellet counter while in the house
          reverse: false } // pending forced reversal, consumed at next centre
```

`createGhosts(maze)`: Blinky at the tile above the door (`(13.5, 11)` → px
`(112, 92)`) facing left, state `normal`; Pinky at the house centre `(112, 116)`
facing down, Inky at `(96, 116)` facing up, Clyde at `(128, 116)` facing up,
all state `house`. House interior px centre from `maze.house` (cols 10–17,
rows 12–16 → interior rows 13–15, centre row 14 → y = 116). Compute from
`maze.house`, do not hard-code the numbers; the spawn tests pin them.

### Movement (all states)

Ghosts move along lane centres in maze px at `speed × 8 px/s`. To honour the
spec's "never skip a decision", advance in sub-steps: move to the next tile
centre along `dir`, run the decision there, continue with the remaining
distance, at most `ceil(move / 4) + 1` iterations. Speed for the tick:

- `normal` in `scatter`/`chase`: `ghostSpeed(level)`, or Elroy speed for Blinky
  when `pelletsLeft ≤ threshold` (stage 1) / `≤ threshold / 2` (stage 2) and
  Clyde has left the house (Dossier: Elroy is suspended while Clyde is in the
  house after a life is lost — implement that too).
- Any ghost on a `tunnel` tile or in the wrap band: `tunnelSpeed(level)`.
- `frightened`: `ghostFrightenedSpeed(level)`.
- `eaten` (eyes): `2 × ghostSpeed(level)` capped at 2 tiles per tick worth of
  sub-steps (spec: "returns to the house at speed").
- `house`: bob vertically between `y ± 4` px around the house centre at half
  speed, reversing at the limits; `leaving`: move horizontally to the door
  centre x, then up to the tile above the door, then state `normal` facing
  left (Dossier: ghosts exit facing left).

Decision at a tile centre (`state normal`): candidate directions are the four
minus the reverse of `dir`; drop any whose next tile is not walkable for a
ghost (walkable: pellet, power, empty, tunnel; the door only when `eaten` or
`leaving`); drop `up` at `NO_UP_TILES` unless `frightened`/`eaten`; if the
`reverse` flag is set, take the reverse instead, clear the flag. Choose the
candidate minimising squared Euclidean distance from the *candidate's next
tile* to the target tile; ties by order `up, left, down, right`. If no
candidate remains (dead end, cannot happen on this board) keep `dir`.
`frightened`: pick uniformly at random among the candidates with the state RNG
(Dossier says a random direction is tried first then rotated clockwise until
legal; sampling uniformly among legal moves is equivalent in distribution for
our purposes — note that in a comment).

### Targeting (`target(ghost, state)`)

- Scatter: `SCATTER_TARGETS[name]`.
- Chase:
  - Blinky: the player tile.
  - Pinky: 4 tiles ahead of the player in `player.dir`; **when the player faces
    up, also 4 tiles left** (the original's overflow bug, reproduced on purpose).
  - Inky: `two = 2 tiles ahead of the player` (with the same up-left quirk),
    then `target = two + (two − blinkyTile)`.
  - Clyde: player tile if the Euclidean distance from Clyde's tile to the
    player tile is ≥ 8, otherwise his scatter corner.
- Eaten: the tile above the door `(13, 11)`; once at the door x, drop into the
  house to the centre, then state `leaving`, `dotCounter` irrelevant.
- Targets may lie off the board; only distances are computed from them.

### Modes (`lib/modes.mjs`)

Scatter/chase schedule in seconds, from level start, indefinite chase last:

| Level | Phases |
|---|---|
| 1 | S7 C20 S7 C20 S5 C20 S5 C∞ |
| 2–4 | S7 C20 S7 C20 S5 C1033 S1/60 C∞ |
| 5+ | S5 C20 S5 C20 S5 C1037 S1/60 C∞ |

`modeAt(level, seconds) → "scatter" | "chase"`; the clock pauses while
frightened (Dossier). Track `state.modeClock` in ticks, `state.mode`, and on a
mode flip set `reverse = true` on every ghost in `normal` state.

Frightened duration (seconds) and number of flashes by level:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s | 6 | 5 | 4 | 3 | 2 | 5 | 2 | 2 | 1 | 5 | 2 | 1 | 1 | 3 | 1 | 1 | 0 | 1 | 0 |
| flashes | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 5 | 5 | 3 | 3 | 5 | 3 | 3 | 0 | 3 | 0 |

A duration of 0 (levels 17, 19+) means the power pellet only reverses the
ghosts and awards 50; no frightened state, no divide by zero. "Flashing for
the last two seconds" in the spec = the flash count above at ~0.25 s per
flash pair; drive the renderer with `state.frightTicks` remaining and
`flashes`, exposing `ghostFlashing(state)` for the renderer.

### Speeds (`lib/speeds.mjs`), fractions of 75.75 px/s

| Level | Pac | Pac fright | Ghost | Ghost fright | Tunnel | Elroy 1 | Elroy 2 |
|---|---|---|---|---|---|---|---|
| 1 | 0.80 | 0.90 | 0.75 | 0.50 | 0.40 | 0.80 | 0.85 |
| 2–4 | 0.90 | 0.95 | 0.85 | 0.55 | 0.45 | 0.90 | 0.95 |
| 5–20 | 1.00 | 1.00 | 0.95 | 0.60 | 0.50 | 1.00 | 1.05 |
| 21+ | 0.90 | — | 0.95 | — | 0.50 | 1.00 | 1.05 |

Elroy stage-1 thresholds (pellets left): L1 20, L2 30, L3–5 40, L6–8 50,
L9–11 60, L12–14 80, L15–18 100, L19+ 120; stage 2 at half. The player moves at
`playerFrightenedSpeed` while any ghost is frightened.

### House release

Personal dot limits: level 1 — Pinky 0, Inky 30, Clyde 60; level 2 — Pinky 0,
Inky 0, Clyde 50; level 3+ — all 0. Each pellet eaten increments the counter of
the first ghost still in the house in order Pinky, Inky, Clyde; a ghost leaves
when its counter reaches its limit (Pinky therefore leaves at once). After a
life is lost the global counter takes over: it counts pellets from zero and
releases Pinky at 7, Inky at 17, Clyde at 32 (the original then disables the
global counter when Clyde is in the house at 32; do that). Also: if no pellet
is eaten for 4 s (levels 1–4) or 3 s (5+), release the next ghost in order and
reset that timer. Blinky never enters this logic except when returning eaten.

### Frightened, eating and scoring

On `power`: every `normal` ghost → `frightened` with `reverse = true`; ghosts in
the house stay put but are flagged so they leave `normal` (spec edge case);
`frightTicks = duration × 60`; `chain = 0`. Eating a ghost (collision while it
is `frightened`): `chain++`, score `200 × 2^(chain−1)`, event
`{ type: "ghost-eaten", chain, ghost: name }`, ghost → `eaten`, and
`freezeTicks = 60` during which nothing moves (original pauses ~1 s showing the
score; the renderer may draw the score text at the ghost). A new power pellet
resets `chain` to 0; the timer restarts. When `frightTicks` reaches 0 all
`frightened` ghosts → `normal` (no reversal).

### Collision, death, lives, game over

After moving player and ghosts each tick, check every ghost: collision if the
ghost's tile equals the player's tile **or** the tiles swapped this tick
(compare before/after tiles). `frightened` → eaten as above; `eaten` → nothing;
otherwise `phase = "dying"`, `phaseTicks = 0`, event `{ type: "death" }`. While
`dying`, `phaseTicks++` for 90 ticks (12 animation steps × 6 ticks + burst),
nothing else moves; then `lives −= 1`; if `lives === 0` → `phase = "game-over"`,
event `{ type: "game-over" }`, and `step` becomes a no-op until a later spec
resets (expose `resetGame(state)` returning a fresh level-1 state with the high
score carried). Otherwise reset the player and ghosts, `phase = "ready"` for 60
ticks (event `{ type: "ready" }`), set the global dot counter active, then
`phase = "playing"`. Extra life: when `score` crosses 10,000 the first time,
`lives += 1`, event `{ type: "extra-life" }`.

### Level clear

On the last pellet: `phase = "level-clear"`, `phaseTicks` counts 120 ticks
(walls flash `blue`/`foreground` four times: the renderer computes
`flash = floor(phaseTicks / 15) % 2 === 1` for ticks 0–119); ghosts hidden;
then `level += 1`, board tiles reset from `maze`, player and ghosts reset, mode
clock reset, personal dot counters reset (not global), `phase = "ready"` 60
ticks, `events` `{ type: "level-start", level }`. The `cleared` flag from spec
0003 becomes `phase === "level-clear"`; keep `cleared` as a derived boolean for
compatibility with the existing test, or update that test — either is fine.

### Phases summary

`state.phase ∈ { "ready", "playing", "dying", "level-clear", "game-over" }`,
`state.phaseTicks`, `state.freezeTicks`. `createState` starts in `ready` (60
ticks, event `ready` emitted on entering `playing`... keep it simple: `ready`
counts down then `playing`; the title screen is spec 0006). The existing tests
that step immediately from `createState` need `opts.skipReady` or must expect
the 60-tick ready pause — choose `createState(maze, { ready: false })` for
tests and default `ready: true` for the app.

### RNG

`state.rng` (an integer). `createState(maze, { seed })`, default seed 1. Every
random draw threads `state.rng` through `nextRandom`. The determinism test
runs the same scripted inputs twice from the same seed and compares the full
event log and the final state with `deepStrictEqual`.

### Rendering (`Sprites.js`, `Board.js`, `Hud.js`, `Main.qml`)

- `drawGhost(ctx, ghost, palette, frame, flashing)`: 14-px body — a semicircle
  dome on top of a rectangle, hem of three scallops alternating between two
  frames every 8 ticks (`frame = floor(tick / 8) % 2`); eyes as two 4×5
  ellipses in `palette.eyeWhite` (`Theme.bright_foreground`) with 2×2 pupils in
  `palette.pupil` (`Theme.blue`) offset 1 px toward `dir`; `frightened`: body
  `palette.frightened` (`Theme.blue`), face in `palette.frightenedFace`
  (`Theme.foreground`) as two dots and a zigzag mouth; when `flashing`, swap
  body to `Theme.foreground` and face to `Theme.blue` every 15 ticks; `eaten`:
  eyes only. Body colours per ghost from `palette.ghosts[name]`:
  `Theme.red`, `Theme.magenta`, `Theme.cyan`, `Theme.orange`. Drawn on both
  sides of a tunnel edge like Pac-Man.
- `drawDeath(ctx, player, phaseTicks, palette)`: for ticks 0–71 the wedge's
  mouth opens from 70° to 360° in 12 steps (6 ticks each), facing up as in the
  original; ticks 72–89 draw a burst of 8 small `Theme.yellow` dots on a ring
  of radius growing 2 → 8 px. Not drawn after.
- Level flash: `Main.qml` binds a `flash` property from `state` and calls
  `backdrop.requestPaint()` when it changes; `Board.drawBackdrop(ctx, maze,
  palette, flash)` strokes walls in `palette.flash` when `flash`.
- HUD: `LEVEL n` right-aligned at x = 216, y = 280, `Theme.foreground`; lives
  icons from `state.lives − 1`; during `game-over` the text `GAME OVER` centred
  at y = 136 in `Theme.red` (the full screen flow is spec 0006; this is the
  minimum so a playtest is not confusing). During `ready`, `READY!` centred at
  y = 136 in `Theme.yellow`.
- Ghost-eaten score text: while `freezeTicks > 0` draw the chain score at the
  eaten ghost's position in `Theme.cyan`.
- Order: pellets, ghosts (eaten last so eyes overlay), Pac-Man or death anim,
  HUD, debug. Debug line adds `mode`, `phase`, `fright`.

## Test strategy

Gate: `node --test tests/*.test.mjs`. New and extended suites:

- `rng.test.mjs`: same seed → same sequence; different seeds differ; values in
  [0,1); `randomInt` bounds; state is not mutated.
- `modes.test.mjs`: `modeAt` for L1 at 0, 6.99, 7, 26.99, 27, 54, 59, 84, 1e6;
  L2 and L5 boundaries including the 1/60 s scatter; frightened table spot
  checks for 1, 5, 9, 17, 18, 19, 40 and flashes; `frightenedFor(21)` is 0.
- `speeds.test.mjs`: the full table above for levels 1, 2, 4, 5, 20, 21;
  Elroy thresholds for 1, 2, 3, 6, 9, 12, 15, 19, 40.
- `ghosts.test.mjs` (hand-placed ghosts on `LEVEL_1`):
  - spawn positions and states;
  - targeting: Blinky = player tile; Pinky ahead 4 for each direction and the
    up-left quirk; Inky vector doubling with a worked example; Clyde flips at
    distance 8 (7.9 → corner, 8.0 → player);
  - decision: minimum distance wins; tie-break order up, left, down, right on
    a constructed tie; never reverses; `reverse` flag forces a reversal and
    clears; no-up at each `NO_UP_TILES` entry, but allowed when frightened;
  - speeds: tunnel tile → tunnel speed; frightened → fright speed; eaten →
    2× and reaches the house within N ticks from the far corner;
  - a ghost at 3 tiles/tick (forced absurd speed) still turns at every tile
    centre (decisions not skipped);
  - house bob and leaving path: exits at the tile above the door facing left;
  - frightened random walk is reproducible with the seed.
- `game.test.mjs` additions:
  - mode flips at the schedule times and reverse every normal ghost;
  - power pellet → all normal ghosts frightened + reversed, `frightTicks` per
    level, house ghosts not frightened; L19 power pellet → reverse only;
  - chain: place four frightened ghosts on the player's path, eat them, expect
    200/400/800/1600, four `ghost-eaten` events with chain 1–4, score sum; a
    second power pellet resets the chain;
  - eaten ghost returns and re-emerges `normal`;
  - collision same tile → `death`; swap-tiles case → `death`; eaten ghost →
    no death;
  - death → after 90 ticks lives 2, positions reset, `ready`; three deaths →
    `game-over` and step is a no-op;
  - extra life once at 10,000;
  - house release: L1 Pinky at once, Inky after 30 pellets, Clyde after 60;
    global counter after a death (7/17/32); 4 s no-pellet timer releases;
  - Elroy: Blinky speed rises at 20 and 10 pellets left on L1, suspended while
    Clyde is home after a death;
  - level clear → flash phase → level 2, board reset, `playerSpeed(2)` in use,
    `level-start` event; frightened timer expiring with a ghost in the house
    leaves it `house` then `normal`;
  - **determinism**: seed 7, a 3,000-tick scripted input sequence, run twice →
    identical event logs and `deepStrictEqual` final states;
  - L21 full autopilot for 2,000 ticks does not throw (no fright, no NaN).
  - Keep the spec-0003 autopilot clear test passing by making the autopilot
    ignore ghosts with `{ ghosts: false }` option in `createState` (tests only)
    **or** by placing all ghosts in `eaten`/house state — prefer the option, it
    is explicit.

Manual (builder reports with evidence): launch clean; `PACMAN_DEBUG` fps 60
with four ghosts; scripted keys show ghosts chasing (tile logs), a death, and
the score/lives changing; F12 grab in arcade mode with ghosts visible copied
to the spec directory as `frame-ghosts.png`, palette-pure (now including red,
magenta, cyan, orange, bright_foreground).

## Risks and unknowns

- **Volume of rules.** Build bottom-up in this order and commit each: rng →
  modes/speeds tables → ghosts (targeting, decision, movement) → game
  integration (modes, fright, chain) → collisions/death/lives → house release
  and Elroy → level clear → sprites → Main.qml. Each step has its tests.
- **Sub-stepping cost.** Four ghosts × ≤3 sub-steps × 60 Hz is trivial.
- **Our board vs. the original**: our house is 8 wide with the door at cols
  13–14 (door centre x = 112, same as the original); the row above the house
  (11) is open all the way across the middle, and the no-up tiles were chosen
  at the same columns as the original. If a ghost ever has no legal move, the
  test "decisions never empty" will catch it.
- **Frightened ghosts inside the house**: they are never frightened, only
  flagged; verify the edge case in tests.
- **Performance of Canvas with 4 ghosts**: ~100 more path ops per frame; the
  backdrop split from spec 0002 keeps this cheap.
- **Death animation facing**: the original rotates the wedge to face up; keep
  it simple and do the same.
- **Existing tests** in `game.test.mjs` assume no ghosts and no ready phase;
  use the `createState` options rather than weakening the tests.

## ADR

None. The rules are the original's, and the architecture decisions (pure
`step`, single renderer) are already recorded.

## As built (recorded at ship)

- Extra ghost state `entering` for the eyes' scripted drop through the door.
- House ghosts are left untouched by a power pellet and emerge `normal`
  (satisfies the spec edge case; the arcade turns them blue — fidelity stub).
- Flash cadence is 12-tick halves so five flashes fill the last two seconds.
- READY! / GAME OVER sit on the empty moat row (maze y 136, stage y 160).
- Global dot counter deactivates at level start; Elroy Blinky chases during
  scatter; eyes ignore the tunnel slowdown; the tunnel zone is the whole open
  run to each edge on the tunnel row.
- Debug key script: a numeric entry now replaces the gap before the next key.
- Extra events beyond the spec: `mode`, `ghost-exit`, `level-start`, `ready`,
  `extra-life`; `ghost-eaten` carries `score` and `ghost`.
- The no-up tiles at (12,11) and (15,11) sit under wall on this maze, so the
  rule is vacuous there; the real row-11 up-junctions are at cols 9 and 18.
- `frame-ghosts.png` was grabbed under the decorative-stitch theme.
