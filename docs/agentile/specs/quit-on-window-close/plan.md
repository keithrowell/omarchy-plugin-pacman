# Plan — Quit and save when the game window is closed

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

Spec: `quit-on-window-close` (bug, background). ADR-0001 holds: Pacman stays a
standalone `qs -p <repo root>` process (ADR-0003 is rejected; nothing here moves
toward a panel). One small diff, one batch.

## Recorded assumption: initials for a close-without-entry

A qualifying score saved because the window was closed (not through the
initials screen) is written with initials **`---`** (`EMPTY_INITIALS` in
`lib/highscores.mjs`). That value already exists, is accepted by
`saneInitials`, is what migrated pre-table rows use, and is what the title's
HIGH SCORES page shows for an empty slot, so no new format or renderer change.
Closing *on* the initials screen saves the letters currently showing (same as
`q`/Escape there today). Keith turned off human gates; this is decided, not asked.
Easy to change later: it is one constant in the new pure function.

Rules for what a close saves (the pure decision, see Approach 1):

| Screen at close | Saves |
|---|---|
| `initials` | the entry, `Flow.initialsOf(entry)`, entry's score/level (once: `entrySaved` guard) |
| `ready`, `playing`, `dying`, `level-clear`, `paused` (real game, `attract` false) | `{ initials: "---", score: state.score, level: state.level }` when score > 0; `Settings.insertHighScore` drops it if it does not qualify |
| `title`, `gameover`, any attract/demo screen | nothing (on `gameover` a qualifying score has already moved to `initials` in `setFlow`; on `title` `state` still holds the last game and must not be re-saved) |

`q` stays as it is: a mid-game `q` still records nothing (README "High
scores"). Only a window close by the compositor saves a mid-round score. That
difference is deliberate (Keith's choice for this spec) and goes in the README.

## Files to touch

- `lib/flow.mjs` — add a pure export `closeRow(flow, score, level)` returning
  the row to save on a window close, or `null`, per the table above. Uses the
  existing `initialsOf` and `GAME_SCREENS`; imports `EMPTY_INITIALS` from
  `./highscores.mjs` (check flow.mjs does not already have a circular import;
  highscores.mjs imports nothing, so it is safe). No table logic here: the
  qualify check stays in `Settings.insertHighScore` / `HighScoresLib.insert`.
- `tests/flow.test.mjs` — cases for `closeRow` (see Test strategy); reuse the
  file's `at(screen, opts)` helper.
- `app/Sfx.qml` — add `stopAll()`: sets `wantedLoop`/`currentLoop` to "" and
  calls `stop()` on every effect in `names` (the same loop `onMutedChanged`
  already uses). Safe when muted or `!available` (stop on an unloaded/errored
  SoundEffect is a no-op).
- `app/Settings.qml` — add `flush()`: calls `highScoreFile.waitForJob()` and
  `settingsFile.waitForJob()` (Quickshell 0.3.1 `FileView.waitForJob(): bool`,
  confirmed in `/usr/lib/qt6/qml/Quickshell/Io/quickshell-io.qmltypes`), so a
  pending async `setText` finishes before the process exits. Normal saves stay
  async; nothing else in Settings changes.
- `app/Main.qml` —
  - a `property bool quitting: false` guard;
  - a single `shutdown(reason)` that: returns if `quitting`; sets it;
    `Sfx.stopAll()`; stops the `FrameAnimation` (`loop.running = false`) so no
    further `playSounds`/`setLoop` can restart a loop; saves (see below);
    `Settings.flush()`; logs `"Main: quitting (" + reason + ")"`; `Qt.quit()`;
  - `quit()` (the `q`/Escape/hold path, line ~245) becomes: on `initials`,
    `saveEntry(flow.entry)` as now, then `shutdown("key")`. Its save behaviour
    is unchanged; it now also stops sound first and waits for the write (the
    same async race exists on `q` from the initials screen today);
  - a new `closeSave()` used only by the close path: on `initials` call
    `saveEntry(flow.entry)`; otherwise `const row = Flow.closeRow(flow,
    state.score, state.level)` and, if non-null, `Settings.insertHighScore(row)`
    plus a `console.info` line naming the row;
  - `windowClosed()` = `closeSave(); shutdown("window closed")`;
  - hook the compositor close two ways (either may be the one that fires; the
    `quitting` guard makes the second a no-op):
    `Connections { target: Quickshell; function onLastWindowClosed() { window.windowClosed() } }`
    (the `lastWindowClosed` signal is on the Quickshell singleton in 0.3.1,
    `quickshell-core.qmltypes` line ~1033) and, on the FloatingWindow,
    `onVisibleChanged: if (!visible && !quitting) windowClosed()`;
  - a safety `Timer { id: exitWatchdog; interval: 1500; onTriggered: Qt.quit() }`
    started by `shutdown` before the save, so a stuck write can never keep the
    process alive past the spec's 2 s (belt and braces: `waitForJob` is
    synchronous, so in practice `Qt.quit()` is reached first);
  - update the header comment's key/lifecycle paragraph (lines 29–36) to say
    a window close saves and quits.
- `tools/close-check.sh` (new, executable) — the scripted close check; see Test
  strategy. `tools/` rather than `tests/` because `tests/` is the
  `node --test tests/*.test.mjs` glob and this needs Hyprland and a display.
- `docs/agentile/specs/quit-on-window-close/close-check.md` (new) — the
  recorded before/after output of `tools/close-check.sh`, required by the spec.
- `README.md` — "High scores" (line ~183–192) and the keys table (line ~174):
  closing the window (SUPER+W or any compositor close) saves a qualifying
  score as `---` and quits; `q` mid-game still records nothing.

## Approach

1. **Pure decision first (TDD).** Write the `closeRow` tests in
   `tests/flow.test.mjs`, see them fail, then implement `closeRow` in
   `lib/flow.mjs`. Signature: `closeRow(flow, score, level) -> { initials,
   score, level } | null`. Return `null` when `flow.attract`, when the screen is
   `title` or `gameover`, or when `score` is not a positive number. On
   `initials` return `{ initials: initialsOf(flow.entry), score:
   flow.entry.score, level: flow.entry.level }` (Main still routes initials
   through `saveEntry` for the `entrySaved` guard, but the function is total
   and tested for it). On `paused` or any `GAME_SCREENS` screen return
   `{ initials: EMPTY_INITIALS, score, level }`.
2. **One exit path.** Every way out (`q`, Escape on title, the title q-hold,
   initials q/Escape, window close) goes through `shutdown()`: stop sound, stop
   the frame loop, save, flush, quit. Re-entrancy is expected — `Qt.quit()` or
   the window hiding can itself raise `lastWindowClosed`/`visibleChanged` — so
   the `quitting` flag is set before anything else.
3. **Save before quit, never hang.** `Settings.insertHighScore` issues an
   async `FileView.setText`; `Settings.flush()` blocks on `waitForJob()` so the
   atomic write lands before `Qt.quit()`. The 1.5 s watchdog bounds the worst
   case. If `waitForJob()` turns out not to cover writes (see Risks), switch
   `highScoreFile` to `blockWrites: true` instead (makes every write
   synchronous; the file is a few hundred bytes).
4. **Verify the signal before building on it.** Step zero of the build: add
   the two handlers with only a `console.info` each, run `tools/close-check.sh`
   against the unfixed tree and note which fired (and that the "before" run
   fails: the pid survives). Keep both handlers regardless.

Task list for the builder (7 tasks):
1. `tools/close-check.sh`; run it on the unfixed tree, save the failing output.
2. `closeRow` tests (red), then `closeRow` in `lib/flow.mjs` (green).
3. `Sfx.stopAll()`.
4. `Settings.flush()`.
5. `Main.qml`: `quitting`, `shutdown`, `closeSave`, `windowClosed`, the two
   close hooks, the watchdog; `quit()` routed through `shutdown`.
6. Run the gate and `tools/close-check.sh` (both modes), the `q` regression
   runs, and record everything in `close-check.md`.
7. README + Main.qml header comment.

## Test strategy

- **Gate:** `node --test tests/*.test.mjs` (the only non-empty gate in
  `.agentile/gates.json`). New `closeRow` cases in `tests/flow.test.mjs`:
  - `initials` returns the entry's letters, score and level;
  - `playing`, `ready`, `dying`, `level-clear` and `paused` with score 1230,
    level 2 return `{ initials: "---", score: 1230, level: 2 }`;
  - score 0 on `playing` returns `null`;
  - `title` and `gameover` return `null` even with a positive score;
  - attract (`at("playing", { attract: true })` via `flowAction(f,
    "attract")` as the file already does) returns `null`;
  - the returned row round-trips through `HighScoresLib.insert([], row)` to a
    one-row table with initials `---` (proves `saneInitials` accepts it).
- **Scripted close check, `tools/close-check.sh`** (run by hand; needs a
  running Hyprland session). It must only ever touch the pid it started —
  never `pkill qs`/`killall qs` (Keith runs his own instance and omarchy-shell
  is also Quickshell):
  - `set -euo pipefail`; make a scratch dir with `mktemp -d` (under the
    session scratchpad or `$TMPDIR`); `mkdir -p $SCRATCH/.local/state/pacman`;
    optionally symlink the real `~/.local/state/omarchy` into the scratch HOME
    so Theme resolves colours (not required for the check).
  - Launch with `HOME=$SCRATCH` in the environment (plus
    `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS=...` in `--score` mode) and
    `bin/pacman &`; `PID=$!`. `bin/pacman` `exec`s `qs`, so `$!` is the qs pid
    and the Hyprland client pid. A `trap` on EXIT kills `$PID` (and only
    `$PID`) if it is still alive, so a failing run never leaks a process.
  - Wait up to 10 s for the window: poll `hyprctl clients -j | jq -e
    --argjson p "$PID" 'any(.[]; .pid == $p)'`.
  - Default mode: close immediately on the title. `--score` mode:
    `PACMAN_DEBUG_KEYS="Return,4000,Left,Left,3000"` then wait ~6 s so the
    round is live and a few pellets are eaten (the memory note: double-tap
    directions), then close mid-round with the siren looping.
  - `hyprctl dispatch closewindow pid:$PID`; record the time; poll
    `kill -0 $PID` every 100 ms; PASS if gone within 2 s, else FAIL (and the
    trap kills it).
  - `--score` mode additionally asserts
    `$SCRATCH/.local/state/pacman/highscore.json` exists and
    `jq -e '.highScores[0].initials == "---" and .highScores[0].score > 0'`.
  - Print PASS/FAIL per assertion, exit non-zero on any FAIL; print the qs log
    path (`$SCRATCH` stdout capture) for diagnosis; remove `$SCRATCH` on pass.
  - The guard for subagent worktrees refuses compound Bash lines with `HOME=`
    assignments; the script sets `HOME` itself (`HOME="$SCRATCH" exec ...` in
    a subshell), so callers just run `tools/close-check.sh [--score]`.
- **Regression (AC "q, game-over and level-clear behave exactly as before"):**
  with a scratch HOME and `PACMAN_DEBUG_KEYS`, (a) `Return,3000,q` exits and
  writes no `highscore.json` row; (b) Escape on the title exits; (c) the
  existing game-over → initials → save path is untouched in code (only `quit()`
  gained `shutdown`), and the `flow`/`game` suites cover level-clear. Record
  (a) and (b) in `close-check.md`.
- **Listen test** (Keith, not blocking the merge under background route):
  close mid-siren with SUPER+W; silence at once, no `qs -p .../omarchy_pacman`
  left in `pgrep -af 'qs -p'`.
- **Muted:** run `--score` once with a scratch `settings.json` of
  `{"muted": true}`; it must still exit within 2 s.

## Risks and unknowns

- **Which signal fires on a compositor close.** Qt handles `xdg_toplevel.close`
  by closing (hiding) the QWindow; Quickshell 0.3.1 re-emits
  `QGuiApplication::lastWindowClosed` on the `Quickshell` singleton, and
  evidently does not quit on it (the bug). Unverified which of
  `lastWindowClosed` / `visibleChanged` reaches QML for a `FloatingWindow`, or
  whether Quickshell destroys the window object first. Mitigation: both hooks,
  the `quitting` guard, and build step zero logs which fired. If neither fires,
  fall back to `Connections { target: window; function onClosing(close) }`
  (QQuickWindow's `closing`, if FloatingWindow exposes its backing window) and
  record it in the plan.
- **`waitForJob()` semantics.** The qmltypes show `waitForJob(): bool` but not
  whether it covers a write started by `setText` or only loads. The `--score`
  close check is the proof. Fallback: `blockWrites: true` on `highScoreFile`
  (and `settingsFile`). Either way the watchdog guarantees exit.
- **Window already gone when saving.** By the time the close handler runs the
  window may be hidden; the save path uses only `flow`, `state`, `Settings`
  and `Flow` — no rendering — so this is fine. Do not touch `stage`/canvases in
  `shutdown`.
- **Re-entrancy.** `Qt.quit()` may trigger `lastWindowClosed` again; the
  guard is set first thing in `shutdown` and checked in both hooks.
- **Scratch HOME side effects.** Theme reads `$HOME/.local/state/omarchy/...`;
  with a bare scratch HOME it logs a missing-theme warning and uses its
  fallback. Harmless for this check. Never point the check at the real HOME
  (shared `highscore.json`).
- **Timing in `--score` mode.** A debug tap can land on a zero-tick frame; if
  the score is still 0 at close the save assertion fails for the wrong reason.
  Use double-taps and a long enough wait; the script prints the logged score.
- **Behaviour split with `q`.** Close saves a mid-round score as `---`; `q`
  does not. This contradicts the README rationale ("a `---` row for every
  abandoned game would clutter the table") for the close path only. Keith
  chose it; document it rather than resolve it here.

## ADR

None. The change is a lifecycle fix inside the ADR-0001 architecture (a
standalone `qs -p` process that now exits with its window); nothing
far-reaching or hard to reverse.

## Amendment 2026-09-28 (Keith) — no compositor window closes

A probe during the first build ran `hyprctl eval 'return hl.dispatch(hl.dsp.window.close())'`, which closed Keith's focused window (a long-running Claude session). The close check is therefore rewritten:

- **Never** use `hyprctl dispatch closewindow`, `killactive`, `hl.dsp.window.close(...)` or any other compositor close/kill, in scripts, probes or ad-hoc commands. Delete any such line from `tools/close-check.sh` and scratch scripts.
- The window close is exercised **inside the process**: a debug key (e.g. `PACMAN_DEBUG_KEYS` token `closewin`) makes the game close its own `FloatingWindow` (`visible = false` / `close()`), which must drive the same hook a compositor close drives (`Quickshell.onLastWindowClosed` / `onVisibleChanged`).
- `tools/close-check.sh` launches `bin/pacman` with a scratch HOME and that debug key script, then asserts the pid it started (`$!`) exits within 2 s; its only cleanup is `kill` of that exact pid.
- The spec's `hyprctl dispatch closewindow` criterion is superseded by this; record the before/after output in close-check.md as before.
