# Plan — Remove smooth mode — arcade big pixels with scanlines is the only look

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Files to touch

- `lib/settings.mjs` — delete `MODES`; `SETTINGS_DEFAULTS` becomes
  `{ muted: false }`; `parseSettings` reads only `muted` (a stored `mode` or
  `scanlines` key is ignored); `serialiseSettings` writes only `muted`.
  Update the doc comments (they name `mode` as the example key).
- `tests/settings.test.mjs` — drop the `MODES` import and assertion; every
  expected object becomes `{ muted }`; the "unknown mode" test becomes
  "ignores a stored mode key" (`{"mode":"smooth"}` and `{"mode":"crt"}` both
  give `{ muted: false }`); serialise tests assert only `muted` is emitted
  even when `mode` is passed in; round-trip iterates `muted` only.
- `app/Settings.qml` — remove the `mode` property, its `load()`/`save()`
  wiring, `setMode()` and `toggleMode()`. Header comment: settings.json now
  holds mute only.
- `app/PixelStage.qml` — **no change**. It keeps `mode` (default `"arcade"`)
  and the smooth fit path for the planned reusable component.
- `app/Main.qml`:
  - delete the `Qt.Key_G` branch in `handleKey` (it must simply be unhandled:
    it sits above the attract check today, and after deletion `g` reaches the
    attract block where `isGameKey` is false, so it still does not end the
    demo; on other screens it falls to the `return false` paths — verify
    `isGameKey` does not list `Qt.Key_G`);
  - remove `mode: Settings.mode` from the `PixelStage` instantiation;
  - `antialiasing: !stage.arcade` on both canvases → `antialiasing: false`
    (or delete the line; `false` is the Canvas default);
  - `Hud.drawHud(...)` opts: drop `arcade: stage.arcade`;
  - debug frame log: drop `", mode " + stage.mode`; fps log: drop
    `" mode " + stage.mode`. Keep every `state.mode`/`window.state.mode`
    (ghost scatter/chase) untouched — grep `mode` with care;
  - header comments: remove "g toggles arcade/smooth" and take `g` out of
    "any key leaves the demo (g, m and F12 do not)"; the `blinkOn` comment
    drops "(arcade only)";
  - the "A theme change recolours both layers…; a mode change re-rasterises"
    comment loses its second clause;
  - the debug key-script map may keep `"g": Qt.Key_G` (harmless) or drop it;
    prefer dropping it so a script that presses `g` fails loudly.
- `app/render/Hud.js` — `showOneUp = !opts || opts.blinkOn`; update the JSDoc
  (`{ blinkOn, muted, audio }`, 1UP always blinks).
- `app/render/Screens.js` — title hint `"G SMOOTH"` → `"M MUTE"`. Leave the
  `HOLD Q TO QUIT` line and the initials-screen hints alone.
- `app/render/Sprites.js` line 5 comment ("serves the arcade and smooth stage
  modes") → "drawn once in native units for the arcade stage".
- `README.md` — keys table: drop the `g` row; attract sentence: "(`m` and F12
  do not)"; the "graphics settings and mute live in" sentence → "mute and the
  high-score table live in"; replace the Modes section with a short "Look"
  paragraph: one rendering, native 224×288, integer big-pixel upscale with
  scanlines, see ADR-0002.
- `docs/agentile/brief.md` — outcome 3: delete "A toggle shows the same
  drawing smooth at full resolution."; Rendering constraint: "arcade mode =
  low-res layer with nearest-neighbour integer upscale (the only mode in the
  game; PixelStage keeps a smooth fit for reuse) — see ADR-0002"; shipped-v1
  paragraph: delete "`g` toggles pixel/smooth graphics;".
- `CLAUDE.md` line 18 — "turns that into big pixels (arcade, default) or
  full-res smooth output" → "turns that into integer big pixels with
  scanlines (PixelStage keeps a smooth fit path for reuse, unused by the game)".
  Not listed in the spec's affected areas but it is the standing context and
  would otherwise be wrong for every future session.
- `docs/adr/0002-big-pixels-via-low-res-layer.md` — dated amendment after the
  spec 0001 one: "*Amended 2026-09-05 (spec 0003 remove-smooth-mode):* smooth
  mode and the `g` toggle were removed from the game; `PixelStage` keeps its
  `mode` property and smooth fit so the component stays reusable."

## Approach

Pure deletion, the same shape as spec 0001. `PixelStage.mode` defaults to
`"arcade"`, so removing the binding from `Main.qml` gives arcade-with-scanlines
unconditionally with no other rendering change. Nothing under `lib/scale.mjs`
or its tests changes.

Order of work (TDD, one commit each):

1. `tests/settings.test.mjs` first (watch it fail), then `lib/settings.mjs`.
2. `app/Settings.qml`, `app/Main.qml`, `app/render/Hud.js`,
   `app/render/Screens.js`, `app/render/Sprites.js` comment.
   After this step: `grep -n "Settings.mode\|toggleMode\|setMode\|stage.mode\|stage.arcade\|Key_G" app/` must be empty, and
   `grep -n "\bmode\b" app/Main.qml` must show only ghost-mode uses
   (`state.mode`, `modeClock`) and comments about them.
3. README, brief, CLAUDE.md, ADR amendment.
4. SPEC.md: tick the boxes, add "## As built" (note that spec 0005's
   shipped acceptance text and ADR-0002's original decision described the
   toggle and are superseded; do not edit `specs/done/`).

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` green (the only configured gate).
- Static greps above.
- Manual (scratch `HOME` under the scratchpad with `.local/state/omarchy`
  symlinked in so the theme loads; never the user's real state dir): write
  `settings.json` as `{"mode":"smooth","muted":false}`, run
  `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="2000,F12,1000,m,1000,m,1000,q" timeout 15 <worktree>/bin/pacman`
  via a scratchpad script. Expect: the frame shows big pixels with scanlines
  and the title hint `M MUTE` / `HOLD Q TO QUIT`; the debug log has no `mode`
  in the frame line; after the run `settings.json` holds only `muted`. Kill
  only the pid you started; never `pkill qs`. Note the active theme.

## Risks and unknowns

- `g` and attract: after the deletion `g` must not end the demo. `isGameKey`
  is directions + start keys (+ a stray `Key_S`), so it will not; add nothing.
- Ghost `mode` in `lib/game.mjs`/`modes.mjs` and the `mode` field in
  `debugInfo()` are game state, not the stage: leave them.
- The user may have their own `qs` running from the lab checkout with the old
  code; a `g` press there still toggles until they restart. Not our concern.
- A stored `"mode": "smooth"` is silently ignored and dropped on the next save
  (spec edge case); no migration message needed.

## ADR

None new; a dated amendment to ADR-0002 (see Files to touch).
