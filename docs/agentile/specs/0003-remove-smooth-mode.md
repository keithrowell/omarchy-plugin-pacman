---
title: Remove smooth mode — arcade big pixels with scanlines is the only look
slug: remove-smooth-mode
status: ready
depends_on: [scanlines-always-on]
type: feature
route: background
business_value: low
technical_certainty: high
created: 2026-09-05
outcome: the game always renders in arcade big pixels with scanlines, g does nothing, and settings.json holds only muted
claimed_by:
label:
claimed_at:
---

# Remove smooth mode — arcade big pixels with scanlines is the only look

## Problem / why now

The smooth full-resolution mode was a v1 toggle nobody uses; the arcade look
is the game. Keeping it means a second render path, a key, a persisted
setting, a hint and doc rows to maintain and test. With the scanline toggle
gone (spec scanlines-always-on) this removes the last graphics option so the
game has one look.

## Acceptance criteria

- [ ] The game always renders through PixelStage in arcade mode with
      scanlines. `g` does nothing on any screen; no screen or attract-mode
      exception mentions it.
- [ ] `lib/settings.mjs`: `MODES` and `mode` are gone. Defaults are
      `{ muted }`; `parseSettings` ignores a stored `mode` key; `serialiseSettings`
      writes only `muted`. `Settings.qml` loses `mode`, `setMode`, `toggleMode`.
- [ ] `app/PixelStage.qml` keeps its `mode` property and smooth fit path
      (default `arcade`) for the planned reusable component; `Main.qml` no
      longer binds it. `lib/scale.mjs` and its tests are untouched.
- [ ] `Main.qml`: the `antialiasing: !stage.arcade` bindings, the `arcade`
      flag passed to renderers and the 1UP "arcade only" blink guard become
      unconditional arcade behaviour (or are removed when they are always true).
- [ ] Title hint row reads `M MUTE`.
- [ ] README: drop the `g` row, the "graphics settings" note and the smooth
      paragraph under the rendering section; describe the single look.
- [ ] `docs/agentile/brief.md` outcome 3 drops the smooth-toggle sentence and
      the "shipped v1" list drops `g`. ADR-0002 gets a dated amendment
      recording that smooth mode was removed from the game while PixelStage
      keeps the capability.
- [ ] Debug frame line no longer prints the stage mode.

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
