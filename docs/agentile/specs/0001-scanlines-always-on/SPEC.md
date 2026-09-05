---
title: Scanlines always on — remove the toggle
slug: scanlines-always-on
status: in_progress
depends_on: []
type: feature
route: background
business_value: low
technical_certainty: high
created: 2026-09-05
outcome: arcade mode always draws scanlines, the s key is only WASD down, and settings.json no longer carries a scanlines key
claimed_by: 206e3dac-9cc9-4058-870a-7309ecbd27b6
label: 
claimed_at: 2026-09-05T11:29:33Z
---

# Scanlines always on — remove the toggle

## Problem / why now

The scanline overlay is the look; nobody turns it off. The toggle costs a key
(`s`, which collides with WASD down so it only works on some screens), a
persisted setting, a title hint and README rows. Remove the option so
arcade mode has one look.

## Acceptance criteria

- [ ] Arcade mode always draws the scanline overlay exactly as today (1 px
      per native row, `Theme.darker_background` at 15 % alpha). Smooth mode
      still draws none.
- [ ] `s` is plain WASD down on every screen; no screen treats it as a toggle.
      `Settings.toggleScanlines` and `Settings.scanlines` are gone.
- [ ] `lib/settings.mjs`: defaults are `{ mode, muted }`; `parseSettings`
      ignores a stored `scanlines` key; `serialiseSettings` never writes one.
      Tests updated.
- [ ] `app/PixelStage.qml` keeps its `scanlines` property (for the planned
      reusable component) with the default flipped to `true`; `Main.qml` no
      longer binds it.
- [ ] Title hint reads `G SMOOTH`; the README keys table drops the `s` row and
      the state-file note no longer mentions scanlines.
- [ ] Debug frame line no longer prints the scanlines flag.

## Scope boundary

**In scope:** the toggle, the setting, the hint, the docs, the tests.

**Out of scope:** smooth mode and the `g` key (kept as shipped, ADR-0002),
scanline appearance, the CRT shader (inbox), extracting PixelStage (inbox).

## Edge cases and failure paths

- An existing `settings.json` with `"scanlines": false` is read without
  complaint and rewritten without the key on the next save; the game shows
  scanlines regardless.
- Spec 0005's acceptance text described the toggle; note the supersession in
  this spec's ship notes, do not edit the shipped spec.

## Affected areas

`app/Main.qml`, `app/Settings.qml`, `app/PixelStage.qml`, `lib/settings.mjs`,
`app/render/Screens.js`, `tests/settings.test.mjs`, `README.md`,
`docs/adr/0002-big-pixels-via-low-res-layer.md` ("Optional scanlines" → always on, one-line amendment).

## Open questions

None.

## Verification

- `node --test tests/*.test.mjs` green.
- Manual: launch, arcade mode shows scanlines on the title and in play; `s` on
  the title does nothing visible and `s` in play moves down; `g` still swaps
  to smooth with no scanlines; `cat ~/.local/state/pacman/settings.json` after
  a mute toggle shows only `mode` and `muted`.
