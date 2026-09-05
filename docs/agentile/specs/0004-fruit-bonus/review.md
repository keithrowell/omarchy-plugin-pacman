# Review — spec 0004 fruit-bonus (2026-09-05, fresh-context reviewer)

Verdict: **PASS**. Diff `27dbc75..a052c16` (4 commits) reviewed in the worktree.

## Evidence

- Gate `node --test tests/*.test.mjs`: 292 pass, 0 fail.
- `python3 tools/gen_sounds.py` regenerated all 15 WAVs; `git status` clean afterwards (byte-identical).
- No colour literal in `lib/` or `app/` (grep `#[0-9a-fA-F]{3,6}\b|rgb(` outside `lib/theme.mjs`); no object spread, `Math.random`, `Date`, `?.` or `.includes(` in `lib/` or `app/render` (the one `[...tunnelRows]` in `lib/maze.mjs` is pre-existing and untouched).
- Live demo under a scratch HOME (`PACMAN_DEBUG_KEYS="24000,F12,3000,F12,1000,Escape,600,Escape"`, theme gruvbox-dark): exit 0, `Sfx: 15 of 15 effects loaded`, `{"type":"fruit","kind":"cherry"} tick 702`, no QML warnings, no qs left running, `~/.local/state/pacman/` untouched.
- Grab measurement (native units, both the builder's `frame-fruit.png` and my own): board cherry body x 107..116 (12-wide bitmap centred on x 112), leaf x 115..116 above; HUD cherry x 203..212 (slot centre 208), y inside 272..288; lives wedges end at x 48 — clear of the leftmost seven-slot position (x 105).
- `lib/game.mjs` traced: spawn keyed off `pelletsEaten(next)` after the single-decrement, so exactly once per count per level and immune to death; `eatFruit` compares `tileOf(player)` with `fruitTile(maze)` = (13,17); `tickFruit` identity check skips the spawn/eat tick so the fruit lives exactly 540 states and the popup 120; death (`collide`), `resetPositions` and the `pelletsLeft === 0` branch clear both fields; extra-life check runs after `eatFruit`.

## Findings

- **Non-blocking:** `app/render/Hud.js:164` — in the attract demo the debug line is `60 18,24 - c playing/demo L1 0` = 30 glyphs = 240 px at x 8 on a 224 px stage, so `L1` is clipped (visible in `frame-fruit.png` as a bare `L`). In real play (`playing`, 25 glyphs, 200 px) the level is visible, so the criterion holds, but printing `L<n>` before the phase token would keep it visible in the demo too. Pre-existing overflow, as the builder noted.
- **Non-blocking:** the plan's live theme-switch check was skipped (deliberately, shared desktop state). The bitmap colours are looked up from `palette.theme` per paint, the same object every other colour uses, so no new reload path exists; recommend Keith eyeballs one theme switch with a fruit showing during his ship playtest.
- Eating the fruit end-to-end (sound + popup) is proven by unit tests only; needs the ship playtest per the spec's own wording.
