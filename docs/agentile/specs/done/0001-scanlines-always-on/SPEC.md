---
title: Scanlines always on — remove the toggle
slug: scanlines-always-on
status: shipped
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
shipped_at: 2026-09-05T11:41:35Z
---

# Scanlines always on — remove the toggle

## Problem / why now

The scanline overlay is the look; nobody turns it off. The toggle costs a key
(`s`, which collides with WASD down so it only works on some screens), a
persisted setting, a title hint and README rows. Remove the option so
arcade mode has one look.

## Acceptance criteria

- [x] Arcade mode always draws the scanline overlay exactly as today (1 px
      per native row, `Theme.darker_background` at 15 % alpha). Smooth mode
      still draws none.
- [x] `s` is plain WASD down on every screen; no screen treats it as a toggle.
      `Settings.toggleScanlines` and `Settings.scanlines` are gone.
- [x] `lib/settings.mjs`: defaults are `{ mode, muted }`; `parseSettings`
      ignores a stored `scanlines` key; `serialiseSettings` never writes one.
      Tests updated.
- [x] `app/PixelStage.qml` keeps its `scanlines` property (for the planned
      reusable component) with the default flipped to `true`; `Main.qml` no
      longer binds it.
- [x] Title hint reads `G SMOOTH`; the README keys table drops the `s` row and
      the state-file note no longer mentions scanlines.
- [x] Debug frame line no longer prints the scanlines flag.

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

## As built

Built as planned: pure deletion, no new behaviour. `lib/settings.mjs` and its
tests changed first (TDD), then `app/Settings.qml`, `app/PixelStage.qml`
(default flipped to `true`), `app/Main.qml` (three `Qt.Key_S` branches gone,
the `PixelStage` binding removed, the debug frame log no longer prints the
flag), `app/render/Screens.js`'s title hint, the README keys table and Modes
paragraph, and a one-line ADR-0002 amendment.

Spec 0005's acceptance text (shipped, `specs/done/0005-*`) described the
scanlines toggle as delivered behaviour; that text is now superseded by this
spec and was left unedited, per the shipped-spec convention.

`node --test tests/*.test.mjs` is green (243 tests). `grep -rn -i scanline app
lib tests README.md docs/adr` shows: `app/PixelStage.qml` (the component's
own property, comments and overlay drawing — unchanged, default now `true`),
`app/Main.qml:429` (`scanlineColor`, the colour prop the component still
takes), the README Modes sentence, the ADR-0002 amendment lines, and — beyond
what the plan's interim check anticipated — `lib/settings.mjs`'s doc comment
and `tests/settings.test.mjs`'s test names/bodies, which deliberately
document and prove that a stored `scanlines` key is ignored on read and
dropped on write (the plan's step 1 explicitly asked for that test). No
runtime code outside `PixelStage.qml` reads or writes a `scanlines` key or
property.
