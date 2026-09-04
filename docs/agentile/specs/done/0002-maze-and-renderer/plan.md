# Plan — Maze data model, board renderer and PixelStage (arcade/smooth toggle)

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Files to touch

| File | Why |
|---|---|
| `lib/maze-data.mjs` | `export const LEVEL_1` — the ASCII map, 31 rows × 28 columns, original layout in the classic proportions. Legend below. |
| `lib/maze.mjs` | `parseMaze(text)`, tile-kind constants, `neighbours`/`isWalkable` helpers, and `wallMask(tiles, x, y)` (the auto-tiling lookup, pure so it is testable). |
| `lib/scale.mjs` | `fitArcade(w, h, dpr, nativeW, nativeH)` and `fitSmooth(...)` → `{ scale, x, y, width, height }` in logical units. Pure, tested. |
| `lib/settings.mjs` | `parseSettings(text)` → `{ mode }` (defaults on garbage), `serialiseSettings(obj)` → JSON text, `SETTINGS_DEFAULTS`. Pure, tested. |
| `tests/maze.test.mjs`, `tests/scale.test.mjs`, `tests/settings.test.mjs` | The gate. |
| `app/PixelStage.qml` | The stage `Item` per ADR-0002; no game knowledge. |
| `app/render/Board.js` | Canvas drawing of the maze in native units. Plain `.js` (`.pragma library`), imports nothing from Qt. |
| `app/Settings.qml` + `app/qmldir` | Singleton wrapping `~/.local/state/pacman/settings.json` with `FileView`; add `singleton Settings 1.0 Settings.qml` to `qmldir`. |
| `app/Main.qml` | Replace the placeholder column with `PixelStage` + `Canvas`; `FrameAnimation` loop; keys `g` and `F12`; debug fps log. Keep Escape/`q`. |
| `.gitignore` | already has `.claude/`; nothing else. |

Do not touch `lib/theme.mjs`, `app/Theme.qml`, or anything under `docs/`.

## Approach

### Map legend and data (`lib/maze-data.mjs`)

One template string, exactly 31 lines of exactly 28 characters:

| Char | Kind | Notes |
|---|---|---|
| `#` | `wall` | |
| `.` | `pellet` | |
| `o` | `power` | exactly four, one near each corner |
| ` ` | `empty` | walkable, no pellet (house surroundings, tunnel approaches) |
| `-` | `door` | ghost-house door; walkable for ghosts only later, blocks BFS for the player now |
| `T` | `tunnel` | walkable, wraps to the opposite edge; only in columns 0 and 27 |
| `P` | `empty` + `spawn` | player start, exactly one, on the row below the house in the classic position |
| `H` | `house` | ghost-house interior, exactly the interior cells; walkable for nothing yet |

Design constraints for the layout (tests enforce them): 28×31; walls mirror
left/right exactly (`row[x] === row[27 - x]` for wall/non-wall, so row strings
should be palindromic in wall-ness); rows 0 and 30 solid wall; the house is a
7×4 outer block centred in columns 10–17 around rows 12–16 with a 2-wide `--`
door in its top wall; one tunnel row (row 14, the house's middle) with `T` at
both ends and `.`-free approach cells; 4 `o`; pellet count 200–260 counting `.`
only; every `.` and `o` reachable from `P` by BFS over `pellet|power|empty|tunnel`
tiles (tunnel wrap counts as an edge). Draw an *original* maze: same rhythm as
the Namco board (corridors one tile wide, wall blocks 2+ tiles thick visually
because they are surrounded by corridor, no dead ends) but not a copy of it. A
handy way to satisfy symmetry is to author the left 14 columns and mirror them
programmatically; if you do that, still commit the full 28-column text so the
map is readable as data.

### Parser (`lib/maze.mjs`)

`parseMaze(text)`:

- Split on `\n`, drop a leading/trailing blank line from the template string.
  Throw `Error("maze: expected 31 rows, got N")` and `Error("maze: row R has C columns")`
  on shape errors; `Error("maze: unknown tile 'X' at row R col C")` on a stray char.
- Return `{ width: 28, height: 31, tiles, pellets, powerPellets, house, spawn, tunnels }`
  where `tiles` is a flat array of kind strings (`tiles[y * width + x]`),
  `pellets`/`powerPellets` are arrays of `{x, y}`, `house` is
  `{ x, y, width, height, door: [{x, y}, …], cells: [{x,y}…] }`, `spawn` is `{x, y}`,
  `tunnels` is `[{ y, left: {x:0,y}, right: {x:27,y} }]`.
- `tileAt(maze, x, y)` with x wrapped modulo width, y outside → `wall`.
- `isWalkable(kind)` → pellet | power | empty | tunnel (not door, not house).
- `wallMask(maze, x, y)` → 8-bit mask of which of the 8 neighbours are walls
  (N, NE, E, SE, S, SW, W, NW, bit 0 = N clockwise). Off-map counts as wall so the
  outer border draws as a closed outline. This is the auto-tiling primitive; keep it
  in `lib/` so the test suite can pin it down.

### Auto-tiled walls (`app/render/Board.js`)

Draw walls as the **outline between wall and non-wall tiles**, not as per-tile
glyphs. For each wall tile, for each of its four sides that faces a non-wall
tile, stroke a segment inset `d` px from that edge inside the wall tile; where
two such segments meet at a tile corner, join them with a quarter arc; where a
wall tile has a walkable diagonal but wall on both adjacent sides (an inner
corner), draw the small quarter arc of the inner corner. Do this for two insets
(`d = 2.5` and `d = 4.5`; keep 0.5 offsets so 1-px strokes land on pixel centres
in arcade mode) to get the classic double line. `wallMask` gives everything
needed. Wall stroke `Theme.blue`, `lineWidth 1`, `lineCap`/`lineJoin` round.
Draw the house outline with the same routine (house-interior cells count as
non-wall so the outline forms) and the door as a 1-px horizontal line in
`Theme.magenta` across the door cells at the same inset.

If this balloons past a day, the spec's fallback is explicit corner glyphs in
the map text; record that in this file if taken.

Pellets: 2×2 `fillRect` at the tile centre (`x*8+3, y*8+3`) in `Theme.foreground`.
Power pellets: `arc` radius 4 at the tile centre, drawn only when
`Math.floor(timeMs / 200) % 2 === 0`.

`Board.js` API: `drawBoard(ctx, maze, palette, timeMs)`; `palette` is a plain
object `{ wall, door, pellet, background }` that `Main.qml` fills from `Theme`
each paint, so the renderer never touches the singleton and recolours on the
next frame after a theme change. Cache nothing that depends on colour.

### PixelStage (`app/PixelStage.qml`)

```
Item {
  property int nativeWidth: 224
  property int nativeHeight: 248
  property string mode: "arcade"          // "arcade" | "smooth"
  property real devicePixelRatio: 1        // set from Screen by the caller
  default property alias content: scene.data
  readonly property real scale: …          // from lib/scale.mjs
  Item { id: scene; width: nativeWidth; height: nativeHeight
         transformOrigin: Item.TopLeft; scale: root.scale; x/y: centred
         layer.enabled: mode === "arcade"
         layer.textureSize: Qt.size(nativeWidth, nativeHeight)
         layer.smooth: false }
}
```

Scale maths lives in `lib/scale.mjs` (imported via the `app/lib` symlink like
`Theme.qml` does): `fitArcade(w, h, dpr, nw, nh)` returns
`k = max(1, floor(min(w*dpr/nw, h*dpr/nh)))` device pixels per native pixel and
a logical scale `k / dpr`, with `x, y` centring the `nw*k/dpr × nh*k/dpr` box.
This is the "scale in device pixels" rule from the spec: on this machine the
compositor scale is **1.6**, so a naive logical integer scale would give 4.8
device pixels per block. `fitSmooth` returns `min(w/nw, h/nh)` and centring.
`Main.qml` passes `Screen.devicePixelRatio` (import `QtQuick.Window`; use
`window.screen` if `Screen` is not attached under Quickshell). If `dpr` is 1.6
and the texture is 224×248 with `layer.smooth: false`, verify with the F12 grab
that blocks are exactly `k` device pixels. If Qt turns out to rasterise the
layer at `textureSize × dpr` rather than at `textureSize`, the fix belongs in
`PixelStage` alone (adjust `layer.textureSize` or the scale so one native pixel
is still an integer number of device pixels); measure, fix, and record what worked.
The stage fills its parent, paints nothing itself (the window's background is
`Theme.background`, which is the letterbox colour). Window smaller than native →
`k = 1` and the scene is clipped by `clip: true` on the stage.

### Settings (`lib/settings.mjs`, `app/Settings.qml`)

`parseSettings(text)` → `{ mode: "arcade" | "smooth" }`; anything unparsable or
an unknown mode yields the default `arcade`. `serialiseSettings({ mode })` →
pretty JSON + newline. `Settings.qml`: singleton `QtObject` with
`property string mode`, a `FileView` on `HOME + "/.local/state/pacman/settings.json"`
(`atomicWrites: true`, `printErrors: false`, `onLoaded: mode = parse(text()).mode`,
`onLoadFailed: mode = default`), `function setMode(m)` that sets the property and
calls `setText(serialise(...))`. Create the directory first with
`Quickshell.execDetached(["mkdir", "-p", dir])` in `Component.onCompleted`
(the Reel plugin does exactly this). No `watchChanges`.

### Main loop and keys (`app/Main.qml`)

- `FrameAnimation { running: true; onTriggered: canvas.requestPaint() }` with an
  `elapsed`-based `timeMs` for the pellet blink. Count frames; when
  `Quickshell.env("PACMAN_DEBUG") === "1"`, `console.info` the fps once per second.
- `Canvas { anchors.fill: parent; renderStrategy: Canvas.Cooperative; onPaint: Board.drawBoard(ctx, maze, paletteFromTheme(), timeMs) }`
  inside `PixelStage`. Parse the maze once in `Component.onCompleted` via
  `import "lib/maze.mjs" as Maze` and `import "lib/maze-data.mjs" as MazeData`.
  Also `requestPaint()` on `Theme.paletteChanged` so an idle frame still recolours.
- Keys: `g` → `Settings.setMode(mode === "arcade" ? "smooth" : "arcade")`;
  `F12` (only when `PACMAN_DEBUG=1`) → `stage.grabToImage(r => r.saveToFile(HOME + "/.local/state/pacman/frame.png"))`
  (the spike proved grabs must target an `Item`, and come out in device pixels).
- Keep the `PACMAN` placeholder text out; the maze is the screen now. The HUD
  arrives in spec 0003.

## Test strategy

- Gate: `node --test tests/*.test.mjs` (`.agentile/gates.json`). New suites:
  - `maze.test.mjs`: 28×31; every row is 28 wide; wall symmetry per row; `.` count
    in 200–260; exactly 4 `o`; door cells exist in the house's top wall and the
    house has interior cells; one spawn; tunnel row has `T` at x=0 and x=27; BFS
    from spawn reaches every pellet and power pellet (and does not cross door
    or house cells); stray char throws with row and column; wrong row count
    throws; `wallMask` for a fully enclosed tile is 0xFF, for a corner tile the
    expected bits, off-map counts as wall; `tileAt` wraps x.
  - `scale.test.mjs`: `fitArcade(672, 864, 1)` → k 3, offsets 0/60; `fitArcade(672, 864, 1.6)` → k 4 (1075/224=4.8 → 4), logical scale 2.5; a 100×100 window → k 1; `fitSmooth(448, 496, 1)` → scale 2.
  - `settings.test.mjs`: defaults on empty, on invalid JSON, on unknown mode; round-trip; serialise ends with newline.
- Manual, by the builder, reported with evidence: `qs log -p app/Main.qml` clean;
  `g` toggles; `PACMAN_DEBUG=1` + `F12` writes `frame.png` and the fps line reads
  ~60; theme switch recolours the maze (one `omarchy-theme-set` there and back);
  `settings.json` has the last mode after a toggle. Copy the arcade `frame.png`
  into this spec directory as `frame-arcade.png` and a smooth one as
  `frame-smooth.png` so the reviewer and Keith can eyeball the look.

## Risks and unknowns

- **Auto-tiling is the fiddly part** (spec says so). The outline-between-tiles
  approach above needs only `wallMask`; test `wallMask` thoroughly in Node so the
  QML side is pure drawing. If the arcs look wrong, straight mitred corners are an
  acceptable first cut; note it here.
- **DPR 1.6 and the layer.** Whether a `layer.textureSize` of 224×248 rasterises
  at exactly that size or at `×dpr` under Wayland fractional scaling must be
  measured from the F12 grab (count the device pixels of one pellet). The scale
  maths assumes the texture is native-sized. If it is not, adjust `textureSize`
  (not the game code) and record the finding.
- **Canvas performance at 60 fps.** Full redraw each frame of ~1000 path segments
  is fine on this machine (the spike held 60 fps); if the debug fps drops, cache
  the wall outline as a `Path2D`-free precomputed segment list (colour-independent
  geometry) built once per maze, and only stroke it per frame.
- **`FrameAnimation` availability**: Qt 6.11 here, so it exists.
- **`Screen.devicePixelRatio` under Quickshell**: if unavailable, use
  `window.screen.devicePixelRatio`; last resort `Quickshell.screens[0]`.
- **Symlinks**: `app/lib` and `app/assets` are how QML reaches `lib/`; use
  `import "lib/x.mjs"` from `app/` and `import "../lib/x.mjs"` from `app/render/`
  is NOT valid (outside root) — `Board.js` takes the parsed maze as an argument
  and imports nothing.

## ADR

None — ADR-0002 already fixes the rendering decision this spec implements.

## As built (recorded at ship)

- DPR comes from `Quickshell.Hyprland` monitor scale (1.6 here) with
  `Screen.devicePixelRatio` as fallback; `Screen` reported 2 and would have
  produced 6.4-device-pixel blocks.
- Qt's `Canvas` rasterises at item size × DPR, so a 224×248 logical scene was
  drawn at ~358×397 and downsampled into the layer with linear filtering. The
  reviewer caught the blur by counting off-palette pixels in the F12 grab. Fix in
  `PixelStage` only: in arcade mode the scene is laid out at `native / dpr`
  logical pixels and `scene.scale` is the integer `k`, so the canvas raster is
  exactly 224×248 device pixels. The grab now contains only palette colours.
- Smooth mode lays out at full size and the drawing code applies
  `ctx.scale(stage.resolution)`; `Item.scale` on a Canvas would just upscale
  a small raster.
- `wallMask` wraps x rather than treating off-map as wall, so tunnel mouths
  stay open. The house is drawn by its own double-rounded-rect routine because
  it is the only one-tile-thick wall.
- Two canvases: a backdrop (walls, door) repainted on theme/mode/size change,
  and a per-frame pellet overlay. Needed to hold 60 fps in smooth mode
  (software-rasterised Canvas).
- `PixelStage`'s scale property is called `zoom` because `scale` is an `Item`
  property.
