# Plan — Fruit bonus items per level, drawn as theme-coloured pixel bitmaps

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Facts checked during planning

- Maze (`lib/maze-data.mjs`, parsed by `lib/maze.mjs`): the house is
  `{ x: 10, y: 12, width: 8, height: 5 }`, `house.door` is `[(13,12), (14,12)]`
  (two tiles wide, centre x = 112, the same x READY! uses). The row under the
  house is 17, the pellet-free moat: `(13,17)` and `(14,17)` are `empty`,
  `(13,16)`, `(14,16)`, `(13,18)`, `(14,18)` are walls, and row 17 has no
  vertical exits between x 9 and x 18, so anyone crossing the fruit crosses
  both tiles. The tunnel is row 14. 260 pellets (256 + 4 power).
- Per-level pellet counting today: `state.pelletsLeft` (both kinds) against
  `maze.pellets.length + maze.powerPellets.length`; the board is **not** reset
  on death, only in `advanceLevel`. So "pellets eaten this level" =
  `total - pelletsLeft` already survives death and needs no new counter.
- Attract demo (replayed with the committed script, seed 11): the 70th pellet
  is eaten at game tick 702, the 170th at tick 2256; deaths at ticks 1162 and
  1926; the player never enters `(13,17)` or `(14,17)` in 2400 ticks. Fruit
  therefore spawns twice, is never eaten, the score stays 1860 and
  `generateAttract()` is unchanged: **no regeneration**. The demo is also the
  unattended way to see a fruit on screen (see Test strategy).
- Theme roles (`lib/theme.mjs` `THEME_KEYS`): `red yellow orange green cyan
  blue magenta brown foreground bright_*` all exist; `brown` falls back to
  `orange` then `yellow`; `mode` is in `THEME_KEYS` but is not a colour.
  `app/Theme.qml` exposes the resolved role→hex object as `Theme.palette`.
- `Main.qml`'s `palette()` has `eatenScore: Theme.cyan` (ghost points) and no
  role-keyed sub-object yet. The debug overlay (`Hud.drawDebug`) prints
  `fps tile want mode phase fright` — **no level**; the 1 s log line does.
- Sound: `SOUNDS` has 14 names; `tests/gen-sounds.test.mjs` pins the list,
  the header, a per-file length table (`SECONDS`, ±5 % for one-shots), the
  −3 dBFS peak and byte-for-byte regeneration. numpy 2.5.2 is installed.
- Events today: `pellet power level-clear level-start ghost-eaten ghost-exit
  death ready game-over extra-life mode`. Ghost points use `state.lastEaten`
  plus a 60-tick freeze; the arcade does not freeze for fruit and neither do we.
- The off-palette frame-grab check the spec mentions does not exist yet
  (inbox item); eyeballing the grab and recording the theme is the check.

## Files to touch

| File | Why |
|---|---|
| `lib/fruit.mjs` (new) | The pure table and rules: `FRUITS`, `FRUIT_KINDS`, `fruitForLevel`, `fruitRow`, `FRUIT_ROW_LENGTH`, `FRUIT_SPAWN_COUNTS`, `FRUIT_TICKS`, `FRUIT_SCORE_TICKS`, `fruitTile(maze)`, `fruitSpot(maze)`. No Qt. |
| `lib/fruit-sprites.mjs` (new) | `FRUIT_SPRITES`: eight hand-pixelled bitmaps as letter strings with a letter→theme-role map each. Data only. |
| `lib/game.mjs` | State fields `fruit` and `fruitScore`; spawn in `eat`, `eatFruit`, `tickFruit`, clearing on death and level clear; two new events; `pelletsEaten(state)`. |
| `lib/sound-map.mjs` | `"fruit"` joins `SOUNDS`; `EVENT_SOUNDS["fruit-eaten"] = "fruit"`. |
| `tools/gen_sounds.py` | The `fruit` piece. |
| `assets/sfx/fruit.wav` (new) | Generated and committed. |
| `app/Sfx.qml` | `fxFruit` effect and its `effects` entry. |
| `app/render/Sprites.js` | `drawBitmap(ctx, bitmap, x, y, colours)` and `drawFruit(ctx, state, palette)`. |
| `app/render/Hud.js` | The fruit row replaces `LEVEL n`; `drawFruitScore`; `drawDebug` prints the level. |
| `app/Main.qml` | `palette()` gains `theme` and `fruitScore`; draw the fruit and its popup; `debugInfo` gains `level`; header comment. |
| `tests/fruit.test.mjs` (new) | Table, row, tile, bitmaps. |
| `tests/game.test.mjs` (extend) | Spawn/eat/expiry/clear rules. |
| `tests/sound-map.test.mjs`, `tests/gen-sounds.test.mjs` (extend) | The 15th sound. |
| `tests/attract.test.mjs` (extend, one assertion) | The demo emits a `fruit` event (pins the manual-verification recipe). |
| `README.md` | A "Fruit" paragraph and the sound list. |
| `docs/adr/0002-big-pixels-via-low-res-layer.md` | One amendment line at ship (see ADR). |

Not touched: `lib/flow.mjs`, `lib/attract*.mjs`, `lib/attract-script.mjs`,
`tools/gen-attract.mjs`, `lib/ghosts.mjs`, `app/render/Board.js` (the fruit is
a moving-layer sprite, not part of the cached backdrop), `app/render/Screens.js`.

## Approach

Four commits on one branch, tests first in each, the gate green after each:
(1) `lib/fruit.mjs` + `lib/fruit-sprites.mjs` + `tests/fruit.test.mjs`;
(2) `lib/game.mjs` + game tests + the attract assertion;
(3) sound (`gen_sounds.py`, the WAV, `sound-map.mjs`, `Sfx.qml`, tests);
(4) rendering (`Sprites.js`, `Hud.js`, `Main.qml`), README, manual checks.

Everything under `lib/` runs under QV4 as well as Node: `Object.assign`,
`slice`, `indexOf`, `Object.freeze`, no object spread, no optional chaining,
no `padStart`. No `Math.random`, no `Date`.

### 1. `lib/fruit.mjs`

Exports (exact names):

```js
export const FRUITS = Object.freeze([            // in level order
  { kind: "cherry",     score: 100,  from: 1 },
  { kind: "strawberry", score: 300,  from: 2 },
  { kind: "orange",     score: 500,  from: 3 },
  { kind: "apple",      score: 700,  from: 5 },
  { kind: "melon",      score: 1000, from: 7 },
  { kind: "galaxian",   score: 2000, from: 9 },
  { kind: "bell",       score: 3000, from: 11 },
  { kind: "key",        score: 5000, from: 13 },
]);                                               // freeze each row too
export const FRUIT_KINDS = FRUITS.map(f => f.kind)  (frozen)
export const FRUIT_ROW_LENGTH = 7;
export const FRUIT_SPAWN_COUNTS = Object.freeze([70, 170]);   // pellets eaten this level
export const FRUIT_TICKS = 540;         // 9 s on screen
export const FRUIT_SCORE_TICKS = 120;   // 2 s of point popup

export function fruitForLevel(level)   // the last FRUITS row whose `from` <= level; junk or < 1 → cherry
export function fruitRow(level)        // kinds for levels max(1, level - 6) .. level, oldest first, newest LAST
export function fruitTile(maze)        // { x: maze.house.door[0].x, y: maze.house.y + maze.house.height }  → (13, 17)
export function fruitSpot(maze)        // maze px centre to draw at: { x: (maze.house.x + maze.house.width / 2) * TILE_PX, y: fruitTile(maze).y * TILE_PX + TILE_PX / 2 } → (112, 140)
```

`fruitForLevel` returns the frozen row object (`{ kind, score, from }`);
callers read `.kind` and `.score`. Import `TILE_PX` from `./player.mjs`
(the one source of the tile size). `fruitRow(1)` is `["cherry"]`;
`fruitRow(8)` is `["strawberry","orange","orange","apple","apple","melon","melon"]`;
`fruitRow(level).length === Math.min(level, 7)`; the last entry is always
`fruitForLevel(level).kind`. `fruitRow` sanitises like `fruitForLevel`
(junk → level 1).

Why one eat tile but a seam-centred sprite: the door is two tiles wide so
"the tile directly below the door" is either (13,17) or (14,17). The eat
tile is the left one, `door[0]`, derived from the maze, never hard-coded.
The sprite is drawn centred on the house's centre line (x 112), straddling
both tiles, which is where the original's fruit sits. Row 17 has no junction
between x 9 and x 18 (test pins it), so any Pac-Man crossing the drawn fruit
passes tile 13 within a tile's travel; a single-tile check is enough and
matches the spec's wording. Header comment says so.

### 2. `lib/fruit-sprites.mjs`

```js
export const FRUIT_SPRITES = Object.freeze({
  cherry: Object.freeze({
    rows: Object.freeze([
      "..........n.",
      ".........n..",
      ...            // 12 strings of 12 characters
    ]),
    roles: Object.freeze({ r: "red", n: "brown", g: "green" }),
  }),
  strawberry: ..., orange: ..., apple: ..., melon: ..., galaxian: ..., bell: ..., key: ...,
});
```

Format rules (the header comment states them; the test enforces them):

- `rows` is an array of equal-length strings, height and width 1..14, the
  default 12×12; one character per native pixel; `.` is transparent; every
  other character must be a key of `roles`.
- `roles` maps a single letter to a theme role name from `THEME_KEYS` other
  than `mode`. Every declared letter is used at least once (no stale
  declarations). No colour literal anywhere in the file.
- Bitmaps are drawn with 1×1 rects in native units, so the artwork is what
  the arcade upscale shows, crisp; there is no anti-aliasing to plan for.

The silhouettes (the builder pixels them; 12×12 unless noted, arcade
readability over detail — keep shapes bold, 2-px stems, no single-pixel
noise apart from seeds and highlights):

| Kind | Letters → roles | Shape |
|---|---|---|
| cherry | `r` red, `n` brown, `g` green | Two 5-px round cherries side by side in the bottom two-thirds (touching or 1 px apart); brown stems from each cherry's top converging to a point at the top right; a small green leaf (3–4 px) at the fork. |
| strawberry | `r` red, `f` foreground, `g` green | A red heart-cut body: 8 px wide at the top narrowing to a 2-px tip at the bottom; foreground seeds as a sparse checker (5–7 pixels); a green calyx of three short leaves across the top row or two. |
| orange | `o` orange, `n` brown, `g` green | A 10-px round orange body; a 2-px brown stem at the top centre with a green leaf (3–4 px) to one side. |
| apple | `r` red, `n` brown, `g` green | A 10-px red body with a dimple at the top (the top row is two humps) and a slightly flattened bottom; a brown stem in the dimple; a green leaf beside it. Optional `f` foreground highlight pixel top-left. |
| melon | `g` green, `l` bright_green, `n` brown | A 10-wide × 9-tall green oval with three vertical bright_green stripes (2 px apart); a brown stem 2 px on the top. `bright_green` falls back to `green` on themes without it, which merely loses the stripes. |
| galaxian | `y` yellow, `b` blue, `r` red | The Galaxian flagship seen from above (may be 14 wide): a yellow arrow body pointing up with swept wings; blue on the wing tips and a blue nose/cockpit column; red on the two lower wing corners. |
| bell | `y` yellow, `f` foreground | A bell: a 4-px top narrowing from a 2-px crown, widening to a 10-px flared rim; the rim row is a solid line; a foreground clapper (2×2) hanging below the rim centre. |
| key | `c` cyan, `f` foreground | An old key standing upright: a bow at the top (a 5×5 ring with a 1-px hole), a 2-px shaft down the middle, two teeth at the bottom right; one or two foreground highlight pixels on the bow are optional. |

### 3. `lib/game.mjs`

State (in `createState`, after `lastEaten`): `fruit: null`, `fruitScore: null`.

```
fruit      = null | { kind, ticksLeft }              // the fruit on the board
fruitScore = null | { kind, score, ticksLeft }       // the point popup after an eat
```

Two fields, not one with a phase flag: the eat check looks only at `fruit`,
the renderer draws `fruit` as a bitmap and `fruitScore` as text, and a
clearing bug cannot leave a bitmap on screen during the popup. Both are
replaced, never mutated.

Helpers and hooks, in tick order (`advance`):

- `export function pelletsEaten(state)` =
  `state.maze.pellets.length + state.maze.powerPellets.length - state.pelletsLeft`.
- **Spawn**, inside `eat()` right after `next.pelletsLeft = ...` (before the
  house counters, before the `level-clear` check):
  `const eaten = pelletsEaten(next); if (FRUIT_SPAWN_COUNTS.indexOf(eaten) !== -1) { const f = fruitForLevel(next.level); next.fruit = { kind: f.kind, ticksLeft: FRUIT_TICKS }; events.push({ type: "fruit", kind: f.kind }); }`.
  Each eat decrements the count by exactly one and the board is not reset by
  death, so the count passes 70 and 170 exactly once per level; there is no
  extra "already spawned" flag to keep in sync. A spawn while a fruit is
  still showing (impossible at real speeds; a test can force it) simply
  replaces it; `fruitScore` is left alone. The last pellet (count 260) never
  matches, so a spawn and a level clear cannot coincide.
- **Eat**, a new `eatFruit(next, events)` called in `advance` right after the
  `pauseTicks`/`stepPlayer` block and before `moveGhosts` (so it runs on
  pause ticks too; harmless, the player has not moved):
  `if (next.fruit === null) return; const t = tileOf(next.player, next.board); const ft = fruitTile(next.maze); if (!sameTile(t, ft)) return; const points = fruitForLevel(next.level).score; next.score += points; next.fruitScore = { kind: next.fruit.kind, score: points, ticksLeft: FRUIT_SCORE_TICKS }; next.fruit = null; events.push({ type: "fruit-eaten", kind, score: points });`
  Points come from the level table, not stored on the fruit, because the
  fruit's kind is the level's kind anyway. The existing extra-life check at
  the end of `advance` sees the new score, so fruit points can award the
  extra life like any other points. No freeze.
- **Clear on death**: in `collide`, in the branch that sets `phase =
  "dying"`, add `next.fruit = null; next.fruitScore = null;` (cleared at the
  `death` event, so the death animation plays over a board without fruit,
  as the arcade does). Also null both in `resetPositions` (belt and braces;
  it runs for both the respawn and `advanceLevel`).
- **Clear on level clear**: in `eat()`'s `pelletsLeft === 0` branch add the
  same two lines, so nothing is drawn under READY! or during the flash.
- **Timers**, a new `tickFruit(next, state)` called after `releaseFromHouse`
  and before the extra-life check (so it does not run during the ghost-eaten
  freeze, the ready pause, dying, level-clear or game-over — same as every
  other timer): a fruit that already existed at the start of the tick
  (`next.fruit !== null && next.fruit === state.fruit`) gets
  `ticksLeft - 1`, and is set to `null` at 0 (no event; the arcade has none);
  identically for `fruitScore`. The identity check means the spawn tick and
  the eat tick do not count down, so a fruit exists on exactly `FRUIT_TICKS`
  consecutive states and a popup on exactly `FRUIT_SCORE_TICKS`. Pass
  `state` (the pre-tick state) into `tickFruit` for the comparison, as
  `advance` already has it in scope.
- Update the `step` doc comment's event list with `fruit` and `fruit-eaten`
  and the header's field list. Import `fruitForLevel, fruitTile,
  FRUIT_SPAWN_COUNTS, FRUIT_TICKS, FRUIT_SCORE_TICKS` from `./fruit.mjs`.

Nothing here touches `state.rng`, ghost decisions or movement, so every
existing determinism test and the attract script are unaffected.

### 4. Sound

`tools/gen_sounds.py`: a `fruit()` piece, 0.30 s, an original "ta-da-ding" in
the arcade idiom: three square notes at 50 % duty — E5 (`midi(76)`) for
80 ms, B5 (`midi(83)`) for 80 ms, then E6 (`midi(88)`) for 140 ms with
`adsr(..., decay=0.06, sustain=0.5, release=0.04)`; the first two with
`adsr(n, release=0.01)`. Concatenate; it is a one-shot (normalised to
−3 dBFS, 2 ms fades by `render`). Add `"fruit": fruit` to `PIECES` **at the
end** (the dict order is the write order; the test list is `SOUNDS`).
Regenerate with `python3 tools/gen_sounds.py` — only `fruit.wav` may change;
the byte-for-byte test proves the other 14 did not.

`lib/sound-map.mjs`: append `"fruit"` to `SOUNDS` (15 names) and
`"fruit-eaten": "fruit"` to `EVENT_SOUNDS`. Nothing else: the same silent
screens, the demo stays silent, mute is applied in `Sfx.play` as for every
one-shot. The `fruit` (spawn) event has no sound.

`app/Sfx.qml`: `"fruit": fxFruit` in `effects` and
`property SoundEffect fxFruit: SoundEffect { source: Qt.resolvedUrl("assets/sfx/fruit.wav"); onStatusChanged: root.checkStatus() }`.
The load log then reads `Sfx: 15 of 15 effects loaded`.

### 5. Rendering

`app/render/Sprites.js` gains `.import "../lib/fruit.mjs" as Fruit` and
`.import "../lib/fruit-sprites.mjs" as FruitSprites`, and:

- `drawBitmap(ctx, bitmap, x, y, colours)`: `x, y` is the top-left in the
  current ctx units; for each row/column whose character is not `.`, set
  `ctx.fillStyle = colours[bitmap.roles[ch]]` and `ctx.fillRect(x + col, y +
  row, 1, 1)`. Group by letter (loop over `Object.keys(bitmap.roles)`, then
  over the pixels) to set `fillStyle` once per colour; use `beginPath` +
  `rect` per pixel and one `fill` per colour. Integer `x, y` only: callers
  round. `colours` is a plain role→CSS-colour object (`palette.theme`, see
  Main.qml); a missing role draws nothing for that letter rather than
  throwing (`if (colour === undefined) continue`), so a typo shows up as a
  missing colour, not a crash — the bitmap test catches it anyway.
- `bitmapSize(bitmap)` → `{ width: rows[0].length, height: rows.length }`.
- `drawFruit(ctx, state, palette)`: return if `!state.fruit`; the bitmap is
  `FruitSprites.FRUIT_SPRITES[state.fruit.kind]`; the spot is
  `Fruit.fruitSpot(state.maze)`; translate by `Scale.BOARD_ORIGIN` (clip to
  the board like `drawPacman` does) and call `drawBitmap` at
  `(Math.round(spot.x - width / 2), Math.round(spot.y - height / 2))` with
  `palette.theme`. For 12×12 at (112, 140) that is top-left (106, 134).

`app/render/Hud.js`:

- Delete `LEVEL_RIGHT`/`LEVEL_Y` and the `"LEVEL " + state.level` line. Add
  `.import "../lib/fruit.mjs" as Fruit` and `"../lib/fruit-sprites.mjs" as
  FruitSprites`, constants `FRUIT_RIGHT = 216`, `FRUIT_STEP = 16`,
  `FRUIT_Y = 280` (the centre line of the bottom two HUD rows, the same y as
  the lives), and in `drawHud` after the lives: `const row =
  Fruit.fruitRow(state.level)`; slot `i` counted from the right, `i = 0` the
  newest (the last entry of `row`), centred at `x = FRUIT_RIGHT - FRUIT_STEP
  / 2 - i * FRUIT_STEP` (208, 192, …, 112 for seven), each bitmap drawn with
  `Sprites.drawBitmap` at `(Math.round(cx - w / 2), Math.round(FRUIT_Y - h / 2))`
  in `palette.theme`. A 14-px sprite spans 273..287, inside the 272..288 HUD
  band; the leftmost slot (x 105..119) is clear of the lives (max four
  wedges ending at x 81). Update the doc comment (`palette` now also needs
  `theme`).
- `drawFruitScore(ctx, state, palette, family)`: mirror of `drawEatenScore`
  reading `state.fruitScore`, text `String(score)` centred at
  `Scale.BOARD_ORIGIN + Fruit.fruitSpot(state.maze)` with `textBaseline
  "middle"`, colour `palette.fruitScore`.
- `drawDebug`: `info.level` printed as `L<n>` after the phase token
  (`fps tx,ty want m phase L1 fright`), so the level stays visible in debug
  mode now that the HUD no longer prints it. Update the comment.

`app/Main.qml`:

- `palette()` gains `theme: Theme.palette` (the resolved role→hex object,
  rebuilt on every theme reload, so a switch recolours the bitmaps on the
  next paint like everything else) and `fruitScore: String(Theme.cyan)`.
- Overlay `onPaint`, after `Board.drawPellets` and before the ghosts:
  `Sprites.drawFruit(ctx, state, palette)` (under the sprites, as in the
  arcade). After `Hud.drawEatenScore`: `Hud.drawFruitScore(ctx, state,
  palette, Theme.fontFamily)`. Nothing is drawn on the title/initials path.
- `debugInfo()` gains `level: state.level`.
- The header comment's drawing-order sentence mentions the fruit; the debug
  event logging already prints every event, so `fruit` and `fruit-eaten`
  appear in the log without a code change.

### 6. Attract

No script change, no checksum change, no regeneration (see Facts). Add one
assertion to the replay test in `tests/attract.test.mjs`: collecting events
during the replay, at least one `fruit` event occurs (message: "the demo is
the unattended way to see a fruit; update the manual-verification recipe in
specs/…/plan.md if this ever changes"). Do not assert that none is eaten —
a future regeneration may legitimately change that and `expectedScore`
with it.

### 7. README

Under Keys/Sound or as a short "Fruit" section: a fruit appears under the
ghost house after the 70th and the 170th pellet of a level and stays nine
seconds; the table cherry 100 (level 1), strawberry 300 (2), orange 500
(3–4), apple 700 (5–6), melon 1000 (7–8), galaxian 2000 (9–10), bell 3000
(11–12), key 5000 (13+); the bottom-right HUD shows the last seven levels'
fruit. Add "the fruit" to the sound list sentence.

## Test strategy

Gate: `node --test tests/*.test.mjs` (the only configured gate). Write each
test before the code it covers and watch it fail.

`tests/fruit.test.mjs` (new):

- constants: `FRUIT_SPAWN_COUNTS` is `[70, 170]`, `FRUIT_TICKS` 540,
  `FRUIT_SCORE_TICKS` 120, `FRUIT_ROW_LENGTH` 7, `FRUIT_KINDS` the eight
  kinds in order; `FRUITS` rows are frozen.
- `fruitForLevel` for levels 1..20 gives scores
  `[100,300,500,500,700,700,1000,1000,2000,2000,3000,3000,5000,…]` and the
  matching kinds; 21, 99, 255 → key; 0, −1, 2.5 (→ 2), `"3"`, `undefined`
  → sane (junk → cherry, 2.5 → strawberry).
- `fruitRow` for levels 1..20: length `min(level, 7)`, last entry equals
  `fruitForLevel(level).kind`, entry `i` equals
  `fruitForLevel(level - (len - 1 - i)).kind`; the literal rows for 1, 3, 7,
  8, 13, 20; a fresh array each call (callers may not mutate the table).
- `fruitTile(maze)` is `{ x: 13, y: 17 }`, `tileAt` there is `TILE.EMPTY` and
  walkable; `(14,17)` is empty too; `(13,16)`, `(14,16)`, `(13,18)`, `(14,18)`
  are walls; the tile is not on a tunnel row; it equals
  `{ x: maze.house.door[0].x, y: maze.house.y + maze.house.height }` (derived,
  not the Namco constant). `fruitSpot(maze)` is `{ x: 112, y: 140 }`.
- bitmaps: `FRUIT_SPRITES` has exactly the keys in `FRUIT_KINDS`; for each:
  `rows` is a non-empty array of strings of one common length, width and
  height 1..14; every character is `.` or a key of `roles`; every `roles`
  value is in `THEME_KEYS` and is not `"mode"`; every declared letter is used;
  at least one opaque pixel; the objects are frozen. Also a source-text
  check: the file contains no `#` followed by three or six hex digits (no
  colour literal), read with `readFileSync`.

`tests/game.test.mjs` (extend; use the existing `fresh`, `eatN`, `eatNext`,
`withPlayer`, `withGhost`, `ghostAt`, `run`, `lastPellet` helpers; eat with
`{ ghosts: false }` so nothing dies by accident):

- `createState` has `fruit: null` and `fruitScore: null`; extend the
  createState shape test.
- spawn at exactly 70: `eatN(fresh({ ghosts: false }), 69)` has `fruit ===
  null` and no `fruit` event on the way (collect events by stepping, or check
  the state after each eat); the 70th eat's step returns `{ type: "fruit",
  kind: "cherry" }` and `state.fruit` deep-equals `{ kind: "cherry", ticksLeft:
  540 }`; `pelletsEaten` is 70. On level 3 (`fresh({ level: 3, ghosts: false })`)
  the kind is `orange`.
- never twice: after the spawn, park the player (`withPlayer(s, { x:
  centre(5), y: centre(17), dir: "up", stopped: true })`, an empty tile
  against a wall), `run(s, 540)`: `ticksLeft` goes 540 → 1 over 539 ticks
  (check `run(spawned, 539).state.fruit.ticksLeft === 1`) and the 540th tick
  clears it with no event; then `eatNext` (pellet 71) spawns nothing.
- 170: continue `eatN` to 169 → no second spawn; the 170th → `fruit` event
  again (fresh `ticksLeft` 540); 171 → nothing; the run to 260 never emits a
  third.
- death clears and does not re-spawn: spawn at 70, then put Blinky on the
  player's tile (`ghostAt("blinky", t.x, t.y, "left", "normal")` with `t =
  tileOf(player)`) and step once → `death` event, `fruit === null`,
  `fruitScore === null` on that very state; run `DYING_TICKS + READY_TICKS` →
  still null, `pelletsEaten` unchanged (70), and then `eatN` to 170 still
  spawns (the count is per level, not per life). Also: a level restarted by
  death with the count sitting exactly on 70 does not spawn on the first
  tick of play (covered by the same test — no event between the death and
  the 71st pellet).
- eating: `fresh({ level: 3, ghosts: false })` with `fruit: { kind: "orange",
  ticksLeft: 100 }` set via `Object.assign`, the player at `x: centre(14) -
  3.5, y: centre(17), dir: "left"` (one tick from tile 13): after one step
  the events are `[{ type: "fruit-eaten", kind: "orange", score: 500 }]`,
  `score` +500, `fruit === null`, `fruitScore` deep-equals `{ kind: "orange",
  score: 500, ticksLeft: 120 }`; the player is **not** frozen (`freezeTicks`
  0, moved next tick). Then park the player (dir `up` on tile 13 stops it
  against the house wall) and run 119 → `ticksLeft` 1; one more → null.
  Repeat the eat for level 1 (100) and level 13 (5000) by table lookup.
- crossing tile 14 alone does not eat: player at `centre(15) - 3.5` heading
  left, fruit set: after one tick (tile 14) no event; a few more ticks
  (tile 13) → eaten. This pins the single-tile rule.
- the popup is text only: during the popup, standing on the tile with
  `fruit === null` emits nothing.
- level clear clears both: `lastPellet()` with `fruit` and `fruitScore` set;
  after the `level-clear` event both are null, and still null after
  `LEVEL_CLEAR_TICKS` (level 2) — no fruit under READY!.
- timers pause with the game: `fruit.ticksLeft` unchanged across a
  `freezeTicks: 10` window, across the ready phase, and across `dying`
  (trivially — it is null there; assert the death test above).
- extra life from fruit: `score: EXTRA_LIFE_SCORE - 100`, cherry eaten →
  `extra-life` event in the same tick.
- purity/determinism: the existing deep-freeze and seed-7 tests cover the
  new code paths automatically once fruit spawns in them; add a spawn to the
  frozen test's assertion list only if the 1500-tick run does not reach 70
  pellets (it may not; not required).
- the `step` no-op on game-over: unchanged; the existing JSON-equality test
  still passes because both fields are null.

`tests/sound-map.test.mjs`: `SOUNDS` is the fifteen names (append `"fruit"`
to the literal); `fruit-eaten` maps to `fruit` in event order alongside the
others; the `fruit` (spawn) event is in the "no sound of their own" list;
the "every name mapSounds can emit is in SOUNDS" test adds `"fruit-eaten"`;
the demo-silent test gains a `fruit-eaten` event in its input.

`tests/gen-sounds.test.mjs`: `SECONDS.fruit = 0.3`; everything else is
driven by `SOUNDS` and passes once the WAV is committed.

`tests/attract.test.mjs`: the one assertion from §6.

Manual verification (builder, with evidence in the PR). Rules from the
project memory apply: scratch `HOME` with `.local/state/omarchy` symlinked
to the real one (theme) so the shared `~/.local/state/pacman/` is untouched;
the worktree guard rejects `HOME=` on a compound line, so each run is a
script under the scratchpad; launch only from the worktree path; kill only
the pid you started; record the active theme with every grab; a single
direction tap can be dropped on a zero-tick frame, so double-tap.

1. **Load.** `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="3000,Escape" bin/pacman`: the
   log has `Sfx: 15 of 15 effects loaded` (or `NO AUDIO` path unchanged) and
   no QML warning from the new imports.
2. **Fruit on screen, unattended (the demo).** The demo starts 10 s after
   launch; its cherry shows from game tick 702 (about 21.7 s after launch)
   until the demo's first death at tick 1162 (about 29.4 s).
   `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="24000,F12,3000,F12,1000,Escape,600,Escape" bin/pacman`
   grabs at 24 s and 27 s (F12 does not end the demo; the first Escape
   does, the second quits from the title). Expect in the log `Debug: event
   {"type":"fruit","kind":"cherry"} tick 702 …`, and in the grabs a cherry
   under the house (centred x 112, y 164 on the stage) and a cherry
   bottom-right in the HUD with no `LEVEL 1` text. Copy one grab to the spec
   directory as `frame-fruit.png` and name the theme. Later in the same demo
   (`tick 2256`) a second `fruit` event is logged; the demo never logs
   `fruit-eaten` (it does not cross the tile) — that is expected.
3. **Eating.** There is no debug hook to teleport or to reach 70 pellets in
   a real game deterministically (the key script is wall-clock timed, so a
   long scripted route is brittle); the eat path is proven by the unit
   tests, and by Keith's playtest at ship (the spec's manual check: eat 70
   pellets on level 1, take the cherry, hear the sound, see `100` in cyan
   for two seconds and the HUD cherry; on level 3 an orange to the right of
   the strawberry). The builder may attempt a scripted route but must not
   spend more than a couple of runs on it. In debug mode a real eat logs
   `Debug: event {"type":"fruit-eaten",…}` followed by `Debug: sfx play
   fruit`, and with `m` first, `… (muted)`.
4. **Theme.** With a fruit on screen (the demo window at ~25 s), run
   `omarchy-theme-set <other>` and grab again: the cherry recolours (a
   theme where `red` differs visibly is best). Restore the theme.
5. **Sizes.** Confirm from the grab that the HUD fruit sits inside the
   bottom band and does not touch the lives; confirm the debug line shows
   `L1`.

## Risks and unknowns

- **Theme roles that may be missing from a real `colors.toml`** (`brown`,
  `bright_green`, sometimes `orange`): `resolveTheme` fills every key from
  `FALLBACKS` then `DEFAULTS`, so `palette.theme` always has every role; a
  cherry stem may come out orange or yellow on such themes. Acceptable and
  per the spec's edge case; say so in the README sentence if the builder
  notices it on the active theme.
- **Visual distinctness under a theme**: `red`/`orange` or `green`/`cyan`
  can be close in some palettes; the silhouettes carry the difference, which
  is why the shapes above are deliberately distinct (round pair, heart,
  disc, dimpled disc, oval with stripes, arrow, bell, key).
- **QV4**: no spread, no optional chaining, no `includes` in `lib/`;
  `Object.freeze` on nested objects is fine (game.mjs already does it).
  `.pragma library` JS files can `.import` `.mjs` modules that import other
  modules (Hud.js → Sprites.js → scale.mjs today); a failure would show as a
  QML load error in check 1.
- **Determinism**: the fruit code reads no RNG and no clock, so the ghost
  paths and the attract script are untouched; the seed-7 and attract replay
  tests prove it. The state gains two fields, so any external
  `deepEqual(createState(...), literal)` would need the fields — none exists.
- **Attract checksum/score**: verified unchanged by simulation; if the
  builder's implementation somehow changes the demo score, the cause is a
  bug in the eat rule (the demo never reaches the tile), not a reason to
  regenerate.
- **Draw order and READY!**: READY!/GAME OVER are drawn at the fruit's row;
  both fruit fields are null in `ready`, `level-clear` and after death, so
  they never overlap. The popup text is drawn after the HUD like the ghost
  score.
- **HUD band**: 14 px sprites fit the 16-px band with 1 px spare each side
  at `FRUIT_Y = 280`; a 12-px sprite has 2 px. The lives use `y = 280` as
  well, so the row reads as one line.
- **Sound state and asset list in sync**: `SOUNDS` drives `Sfx.qml`'s
  expectations only by convention (the QML list is static); the gen-sounds
  test checks the files, the sound-map test the names, and check 1 the
  `15 of 15` load line — all three must agree.
- **Python/numpy**: present here (2.5.2); on a machine without it the
  regeneration test skips and the committed WAV must already be right, so
  commit the WAV in the same commit as the generator change.
- **`brown` on the melon/orange stems under fallback**: falls to `orange`,
  so an orange's stem may match its body on a theme without `brown` — the
  leaf still marks the top. Cosmetic.
- **Per-tick allocation**: `fruitTile`/`fruitSpot` build a small object per
  call; negligible at 60 Hz, and it keeps the value derived from the maze
  rather than cached module state.

## ADR

None new. ADR-0002 already anticipates "hand-pixelled sprite data can be
added later"; eight small data objects and a 20-line `drawBitmap` are
cheap to reverse and stay inside that decision. At ship, add one amendment
line to `docs/adr/0002-big-pixels-via-low-res-layer.md` in the style of the
existing ones: "*Amended <date> (spec 0004 fruit-bonus):* the first bitmap
sprites arrived — letter-per-pixel strings with a letter→theme-role map,
drawn as 1×1 native rects by `Sprites.drawBitmap`; the format is the
convention for any further pixel art (inbox: Pac-Man/ghost bitmaps)." If
that later spec wants a different format (e.g. multi-frame animation), that
is the moment for a proper ADR.
