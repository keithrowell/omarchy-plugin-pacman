# Review — spec 0003 remove-smooth-mode

Reviewed `git diff ffbca68..HEAD` (4 commits) on 2026-09-05 by the fresh-context
reviewer. Verdict: **pass**.

## Evidence

- Gate `test`: `node --test tests/*.test.mjs` → tests 272, pass 272, fail 0.
- `grep -rn "Settings.mode\|toggleMode\|setMode\|stage.mode\|stage.arcade\|Key_G" app/` → empty.
- `grep -rn -i smooth app lib README.md docs/agentile/brief.md CLAUDE.md` → only
  `app/PixelStage.qml`, `lib/scale.mjs`, and the two "kept for reuse" doc lines.
- `app/PixelStage.qml`, `lib/scale.mjs`, `tests/scale.test.mjs`: zero diff.
- `lib/game.mjs`, `lib/modes.mjs`: zero diff; `debugInfo().mode` and the fps
  log's `window.state.mode` (ghost scatter/chase) untouched.
- `handleKey` trace: `g` matches neither F12 nor M; in attract `isGameKey` is
  false → `return false`; on title/paused/gameover/initials/default it reaches
  the `return false` branch. Unhandled everywhere, never ends the demo.
- Live run (scratch HOME, `.local/state/omarchy` + `.config/omarchy` symlinked,
  theme gruvbox-dark, settings seeded `{"mode":"smooth","muted":false}`,
  `PACMAN_DEBUG_KEYS="2000,F12,1000,g,1000,m,800,m,1000,Escape"`): exit 0,
  frame line `(screen title, block 5 device px, dpr 1.6)` with no mode field,
  `g` logged `(unknown, ignored)`, settings.json afterwards `{"muted": false}`,
  no qs left behind. The F12 grab is byte-identical to `frame-title.png`;
  content box 1120x1440 = 224x288 at k=5, and 288/288 block-bottom rows are
  darker than the row above (scanlines present).
- No colour literal, no new path or process, nothing under `specs/done/` or
  `.claude/` in the diff. Commit subjects all `Spec 0003:` with the
  Co-Authored-By trailer.

## Findings

- **Non-blocking:** `app/render/Board.js:190` — the `drawBackdrop` JSDoc still
  says the backdrop repaints when "the palette, size, mode or `flash`" changes.
  The matching comment in `Main.qml` was updated to drop "mode"; this one was
  missed. Comment only.
