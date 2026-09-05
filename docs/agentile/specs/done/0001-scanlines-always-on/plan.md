# Plan — Scanlines always on — remove the toggle

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Files to touch

- `lib/settings.mjs` — `SETTINGS_DEFAULTS` becomes `{ mode, muted }`;
  `parseSettings` stops reading `scanlines`; `serialiseSettings` stops
  writing it. Update the doc comment that names `scanlines` as an example key.
- `tests/settings.test.mjs` — every expected object drops `scanlines`; the
  "reads scanlines" test becomes "ignores a stored scanlines key"; the
  round-trip loop iterates `mode × muted` only; the frozen-defaults test
  asserts on `muted` instead.
- `app/Settings.qml` — remove the `scanlines` property, its line in `load()`,
  its key in `save()`, and `toggleScanlines()`. Header comment unchanged.
- `app/PixelStage.qml` — `property bool scanlines: true` (default flipped);
  comment on line 17 stays ("Optional scanlines" is still true of the
  component). Nothing else changes.
- `app/Main.qml` — delete the three `Qt.Key_S` branches (title, paused,
  gameover); remove `scanlines: Settings.scanlines` from the `PixelStage`
  instantiation (keep `scanlineColor`); drop `", scanlines " + stage.scanlines`
  from the debug frame log; update the header comment so `s` is no longer
  listed as a toggle.
- `app/render/Screens.js` — title hint `"S SCANLINES  G SMOOTH"` → `"G SMOOTH"`.
- `README.md` — drop the `s` row from the keys table; the sentence
  "scanlines are optional" in Modes becomes "with scanlines"; the "graphics
  settings and mute live in" note needs no change (it does not name
  scanlines) — verify with grep.
- `docs/adr/0002-big-pixels-via-low-res-layer.md` — one-line amendment
  under the existing 2026-09-04 amendment: "*Amended 2026-09-05 (spec 0001
  scanlines-always-on):* scanlines are always drawn in arcade mode; the
  toggle and its setting were removed."

## Approach

Pure deletion. There is no new behaviour: the overlay code in `PixelStage`
already draws the scanlines when `arcade && scanlines`, so flipping the
component default to `true` and removing the binding from `Main.qml` gives
"always on in arcade, never in smooth" with no other change. Do not touch the
overlay drawing, `scanlineAlpha`, or `scanlineColor`.

Order of work:

1. `lib/settings.mjs` + `tests/settings.test.mjs` together (TDD: change the
   tests first, watch them fail, then the module). Add one explicit test that
   `parseSettings('{"mode":"smooth","scanlines":false}')` returns
   `{ mode: "smooth", muted: false }` and that `serialiseSettings` on an object
   carrying `scanlines` emits only `mode` and `muted`.
2. `app/Settings.qml`, `app/PixelStage.qml`, `app/Main.qml`, `Screens.js`.
   After this step `grep -rn -i scanline app lib tests` must show hits only in
   `app/PixelStage.qml` (the component's own property and overlay).
3. README and ADR amendment.
4. Ship notes in `SPEC.md` (a short "As built" section) recording that spec
   0005's acceptance text described the toggle and is superseded here. Do not
   edit `specs/done/0005-*`.

Key handling after the change: on the title, `s` falls through to
`directionName(key)` (it is WASD down) and so hits the `name !== null` branch
and fires `any-key` — exactly what the other direction keys do there. On
paused and gameover it falls to `return false`. In play it was always down.
That satisfies "`s` is plain WASD down on every screen".

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` must be green (this is the only
  configured gate; lint/format/build are empty).
- Static check: `grep -rn -i "scanline" app lib tests README.md` shows only
  `app/PixelStage.qml` and the README Modes sentence.
- Manual (builder, then reviewer): launch `bin/pacman` from the worktree,
  confirm scanlines on the title and in play in arcade mode, `g` swaps to
  smooth with none, `s` on the title does nothing visible, `s` in play moves
  down. Toggle `m` twice and `cat ~/.local/state/pacman/settings.json` shows
  only `mode` and `muted`. Restore anything toggled (the state dir is shared
  with Keith's own running instance). An F12 grab with `PACMAN_DEBUG=1` is
  the cheapest proof of the overlay; note the active theme in the log.

## Risks and unknowns

- Keith may have a `qs` instance running from the lab checkout; launch only
  from the worktree path and kill only the pid you started.
- The settings file is shared: an existing `"scanlines": false` on disk is
  ignored on read and dropped on the next save, which the spec wants. Do not
  delete or hand-edit the file.
- QML property removal: any binding left pointing at `Settings.scanlines`
  would only surface as a runtime warning, not a test failure. The grep in
  the test strategy is the guard.
- Numbering: this spec is `0001` and `specs/done/0001-app-shell` also exists.
  Different slugs, so `ag-claim` dependency resolution is unaffected; just do
  not confuse the two when writing ship notes.

## ADR

None new. A one-line amendment to ADR-0002 (see Files to touch).
