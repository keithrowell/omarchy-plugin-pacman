---
title: Remove smooth mode — arcade big pixels with scanlines is the only look
slug: remove-smooth-mode
status: in_progress
depends_on: [scanlines-always-on]
type: feature
route: background
business_value: low
technical_certainty: high
created: 2026-09-05
outcome: the game always renders in arcade big pixels with scanlines, g does nothing, and settings.json holds only muted
claimed_by: 206e3dac-9cc9-4058-870a-7309ecbd27b6
label: 
claimed_at: 2026-09-05T12:38:22Z
---

# Remove smooth mode — arcade big pixels with scanlines is the only look

## Problem / why now

The smooth full-resolution mode was a v1 toggle nobody uses; the arcade look
is the game. Keeping it means a second render path, a key, a persisted
setting, a hint and doc rows to maintain and test. With the scanline toggle
gone (spec scanlines-always-on) this removes the last graphics option so the
game has one look.

## Acceptance criteria

- [x] The game always renders through PixelStage in arcade mode with
      scanlines. `g` does nothing on any screen; no screen or attract-mode
      exception mentions it.
- [x] `lib/settings.mjs`: `MODES` and `mode` are gone. Defaults are
      `{ muted }`; `parseSettings` ignores a stored `mode` key; `serialiseSettings`
      writes only `muted`. `Settings.qml` loses `mode`, `setMode`, `toggleMode`.
- [x] `app/PixelStage.qml` keeps its `mode` property and smooth fit path
      (default `arcade`) for the planned reusable component; `Main.qml` no
      longer binds it. `lib/scale.mjs` and its tests are untouched.
- [x] `Main.qml`: the `antialiasing: !stage.arcade` bindings, the `arcade`
      flag passed to renderers and the 1UP "arcade only" blink guard become
      unconditional arcade behaviour (or are removed when they are always true).
- [x] Title hint row reads `M MUTE`.
- [x] README: drop the `g` row, the "graphics settings" note and the smooth
      paragraph under the rendering section; describe the single look.
- [x] `docs/agentile/brief.md` outcome 3 drops the smooth-toggle sentence and
      the "shipped v1" list drops `g`. ADR-0002 gets a dated amendment
      recording that smooth mode was removed from the game while PixelStage
      keeps the capability.
- [x] Debug frame line no longer prints the stage mode.

## Scope boundary

**In scope:** the key, the setting, the game-side bindings, hint, README,
brief, ADR amendment, tests.

**Out of scope:** PixelStage's smooth fit code and `lib/scale.mjs` (kept for
reuse), the CRT shader (inbox), extracting PixelStage (inbox), any change to
the arcade rendering itself.

## Edge cases and failure paths

- An existing `settings.json` with `"mode": "smooth"` is read without complaint
  and rewritten as `{ muted }` on the next save; the game renders arcade regardless.
- Debug key scripts or the F12 grab must not depend on `stage.mode`; grep for
  `mode` in `Main.qml` carefully because the game state also has a ghost
  `mode` (scatter/chase) that must stay.
- The `g` key must not fall through to `act("any-key")` and end the attract
  demo; it is simply unhandled.

## Affected areas

`app/Main.qml`, `app/Settings.qml`, `lib/settings.mjs`, `app/render/Screens.js`,
`tests/settings.test.mjs`, `README.md`, `docs/agentile/brief.md`,
`docs/adr/0002-big-pixels-via-low-res-layer.md`.

## Open questions

None.

## Verification

- `node --test tests/*.test.mjs` green.
- Manual: launch with `"mode": "smooth"` in `settings.json`; the game shows
  big pixels with scanlines, `g` changes nothing, and after `m` the file holds
  only `muted`.

## As built

Built exactly to plan; no deviations from scope.

- `lib/settings.mjs` and `app/Settings.qml`: `MODES`/`mode` gone, defaults
  and the persisted file are `{ muted }` only; a stored `mode` key is
  silently ignored and dropped on the next save.
- `app/Main.qml`: the `Qt.Key_G` handler, the `mode: Settings.mode` binding
  on `PixelStage`, the debug key-script's `"g"` entry, and every `mode`/`arcade`
  mention that was about the stage (not the ghost `state.mode`) are gone.
  `antialiasing` on both canvases is a flat `false`; the 1UP blink guard and
  `Hud.drawHud`'s `arcade` option are unconditional (1UP always blinks with
  `blinkOn`); the debug frame and fps log lines no longer print the stage mode.
- `app/render/Hud.js`, `app/render/Screens.js`, `app/render/Sprites.js`,
  `app/render/Board.js`: comments and the title hint (`M MUTE`) updated to
  match; `showOneUp` simplified to `!opts || opts.blinkOn`.
- `app/PixelStage.qml` and `lib/scale.mjs` (with its tests) are byte-for-byte
  untouched, per the scope boundary — they keep `mode` and the smooth fit
  path for a future reusable component.
- README, `docs/agentile/brief.md` and `CLAUDE.md` updated to describe the
  single arcade-with-scanlines look; the "Modes" README section is now
  "Look". This supersedes spec 0005's shipped acceptance text (which
  described the `g` toggle) and ADR-0002's original "Decision" section
  (both left as-is where they live, since history is not rewritten); the
  current state is recorded in ADR-0002's dated amendment below.
- `docs/adr/0002-big-pixels-via-low-res-layer.md`: added a
  *2026-09-05 (spec 0003 remove-smooth-mode)* amendment recording that
  smooth mode and the `g` toggle were removed from the game while
  `PixelStage` keeps its `mode` property and smooth fit for reuse.
- Manual verification: scratch `HOME` with `.local/state/omarchy` symlinked
  in and `settings.json` seeded with `{"mode":"smooth","muted":false}`,
  launched via `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="2000,F12,1000,m,1000,m,1000,q"
  timeout 15 bin/pacman` (Gruvbox Dark theme active). The F12 grab
  (`frame-title.png`, alongside this file) shows the title roll-call screen
  in big pixels with scanlines and the hint rows `M MUTE` / `HOLD Q TO QUIT`;
  the debug frame log line reads `(screen title, block 5 device px, dpr 1.6)`
  with no `mode` field; after the run `settings.json` held only
  `{"muted": false}`.
