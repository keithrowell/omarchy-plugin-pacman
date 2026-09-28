# Plan — Run Pacman as an omarchy-shell panel

Spec: `panel-port` (snapshot in `SPEC.md` beside this file). Route: foreground,
so this plan waits for Keith's "approved" before any code. ADR draft:
[ADR-0003](../../../adr/0003-run-as-omarchy-shell-panel.md) (proposed).

Host facts this plan relies on, checked in the *running* shell
(`quickshell -n -p /usr/share/omarchy/shell`; `~/.local/share/omarchy/shell`
is an older copy and differs):

- `shell.qml:581-652`: one async `Loader` per enabled panel plugin, `active`
  when `keepLoaded || openPanelIds[id]`; injects `shell`, `manifest`, ...
  only if the root declares them.
- `shell.qml:440-514`: `summon` refuses a non-enabled plugin; `hide(id)` calls
  the item's `close()` **first**, then clears `openPanelIds`; `toggle` asks
  `isPluginOpen`, which reads the root's `opened` when it exists.
  So `close()` must be idempotent (guard on `opened`), exactly as Quattroids does.
- `shell.qml:1027`: IPC `shell call <id> <method> <arg>` invokes
  `item[method](arg)` on a loaded panel and prints the return value. This is
  the unattended driver inside the real shell (see Task 6).
- `services/PluginRegistry.qml:636`: `inotifywait -m -r` on
  `~/.config/omarchy/plugins`; any write under a plugin dir reloads every
  plugin (`reloadPlugins` -> `unloadPanels` -> `Qt.clearComponentCache`).
  The game must never write inside its own plugin dir (state stays in
  `~/.local/state/pacman`), and a fast-forward of Keith's copy drops a live round.
- `omarchy plugin validate <folder>` and `omarchy plugin enable <id>` exist.
- The marketplace's `validateManifest` is exported from
  `scripts/build-catalog.mjs`; `validateManifestFiles` is not (it adds: no
  `120000` tree entries, every entry point is a blob).
- `lib/*.mjs` uses only named `import { … } from "./x.mjs"` and `export
  function/const` (no default, no re-exports), and `app/render/*.js` import
  `.mjs` with `.import`. That keeps the fallback in Task 1 mechanical.

## Files to touch

| Path | Change |
|---|---|
| `manifest.json` | `"kinds": ["panel"]`, `"entryPoints": {"panel": "Panel.qml"}`, `"keepLoaded": true`, description no longer says "in its own window". Version bump (recommend `2.0.0`: the launch model changes and the plugin must now be enabled). |
| `Panel.qml` (new, repo root) | Plugin root: `Item` with `opened`, `shell`, `manifest`, `open(payloadJson)`, `close()`, the IPC debug methods (Task 6); a `PanelWindow` on the focused monitor; a `Loader` for the game content that becomes active on first open. |
| `app/Main.qml` | From `ShellRoot { FloatingWindow {…} }` to a plain content `Item` (keep the file name; less churn). Gains `running` (drives `FrameAnimation.running`), `devicePixelRatio`/`screen` inputs, `signal closeRequested()`, `suspend()` (pause + silence), `focusGame()`, `runKeys(list)`, `grabFrame()`, `status()`. Loses the window, `Qt.quit()`, the window title. |
| `app/Sfx.qml` | Facade with the same API (`play`, `setLoop`, `stopLoops`, `available`, `currentLoop`), **no `import QtMultimedia`**. Creates the bank with `Qt.createComponent(Qt.resolvedUrl("SfxBank.qml"))`; on `Component.Error` logs once and stays silent. |
| `app/SfxBank.qml` (new) | The 15 `SoundEffect`s and the status counting moved out of `Sfx.qml` (the only file importing `QtMultimedia`). Not listed in `app/qmldir` (loaded by URL). |
| `app/PixelStage.qml` | No logic change expected; `mode` is now driven by the panel (smooth only when native 1x does not fit, see Task 2). Comment update. |
| `app/Theme.qml`, `app/Settings.qml` | Comment updates only, unless the Task 1 reload check forces de-singletoning (named fallback in Task 1). Out of scope: retry backoff, file-read hardening. |
| `app/qmldir` | Unchanged unless singletons are converted (Task 1 fallback). |
| `shell.qml` (repo root) | Becomes the **development host**: `ShellRoot` + `Panel` with a stub `shell` whose `hide()` quits this process; opens the panel on start; feeds `PACMAN_DEBUG_KEYS` to `runKeys`; asks the panel not to grab the keyboard when a key script runs. Never loaded by omarchy-shell. |
| `lib/scale.mjs` | New pure `fitsArcade(width, height, dpr)` (native 224x288 fits at k = 1) so the panel can fall back to smooth scale-down on a tiny monitor instead of cropping. |
| `bin/pacman` | `exec omarchy-shell shell toggle com.keithrowell.pacman '{}'`; errors clearly when `omarchy-shell` is missing; never starts `qs`. |
| `bin/install` | Requirements: `omarchy-shell` required, `qt6-multimedia` reported as optional ("sound only"). Desktop file unchanged in shape (`Exec="<checkout>/bin/pacman"`, which now toggles), so uninstall ownership logic holds. Printed menu action becomes `omarchy-shell shell toggle com.keithrowell.pacman '{}'` (no `uwsm-app`: it is an IPC call, not an app launch; matches Keith's other plugin entries in `omarchy-menu.jsonc`). Reports whether the plugin is enabled (`omarchy plugin list --json`, when available) and prints `omarchy plugin enable com.keithrowell.pacman` when not. |
| `tests/scale.test.mjs` | Cases for `fitsArcade`. |
| `tests/manifest.test.mjs` (new) | Manifest shape (kinds, entryPoints, keepLoaded, lowercase id, no `barWidget`), entry point is a regular tracked file, `git ls-files -s` has no `120000` entry. |
| `tests/panel-guard.test.mjs` (new) | Static guards: no `Qt.quit` under `app/`, `Panel.qml`; `QtMultimedia` imported only by `app/SfxBank.qml`; `lib/` has no Qt imports. |
| `tests/install.test.mjs` | Menu-action tests rewritten for the toggle command (a fake `omarchy-shell` on PATH records its argv); requirement-line tests updated; `bin/pacman` test: runs the fake `omarchy-shell` with `shell toggle com.keithrowell.pacman {}` and never `qs`. |
| `docs/adr/0003-run-as-omarchy-shell-panel.md` | Drafted now (proposed); set `accepted` at ship. |
| `docs/adr/0001-standalone-quickshell-process.md` | Status line: "superseded in part by ADR-0003" (the process decision); body untouched. |
| `docs/adr/0002-big-pixels-via-low-res-layer.md` | One-line amendment: the smooth fit is used again, only when the monitor cannot show native 1x. |
| `README.md` | Install/launch: enable, toggle command, menu entry, keybind example; "Why not `omarchy plugin add`" and "Validation" sections rewritten; Development section: dev host (`qs -p .`) and `shell call` hooks. Removing section stays for `marketplace-readiness`. |
| `CLAUDE.md` | Layout: `Panel.qml`, dev-host `shell.qml`, `SfxBank.qml`, `bin/pacman`; how to verify in the real shell. |
| `docs/agentile/brief.md` | Constraints "Stack" and "Runs standalone" now contradict ADR-0003; update them (Keith to confirm the wording at the checkpoint). |
| `CHANGELOG.md` | Entry for the version bump. |
| `docs/agentile/specs/panel-port/spike-notes.md` (new) | Task 1 findings. |

## Approach

Build on a short-lived branch (worktree). One commit per task below; tasks 1-3
leave the standalone game working, so they can land as a first batch if the
diff gets large. Tasks 4-6 are the switch and must land together.

### Task 1 — Spike: do `lib/*.mjs` imports work from a plugin folder inside omarchy-shell? (timebox 45 min)

Nothing in the shell or any example plugin imports `.mjs`, so prove it
before building on it. Tell Keith before starting: creating and removing a
plugin dir makes his shell reload every plugin (bar widgets blink, open panels close).

1. Make a throwaway plugin `~/.config/omarchy/plugins/com.keithrowell.pacman-probe/`
   (a real directory, copies not symlinks — the inotify watcher does not
   follow symlinks and the real install is a directory): `manifest.json`
   (`kinds: ["panel"]`, `entryPoints.panel: "Panel.qml"`, `keepLoaded: true`),
   a copy of `lib/`, `app/qmldir` with one singleton `ProbeTheme.qml` that
   imports `"../lib/theme.mjs"`, one `app/probe.js` that `.import`s
   `"../lib/scale.mjs"` (the `app/render/*.js` pattern), and a windowless
   `Panel.qml` root (`Item { property bool opened: false; function open(p){}; function close(){} ; function probe(arg) {…} }`)
   importing `"lib/maze.mjs"`, `"lib/maze-data.mjs"`, `"lib/game.mjs"` (which
   pulls transitive `.mjs` imports) and `"app"`. `probe()` returns JSON: the
   parsed maze's pellet count, a `Game.step` result's tick, the `ProbeTheme`
   accent, the `probe.js` scale result, and whether
   `Qt.createComponent` of a file importing `QtMultimedia` is `Ready` or `Error`
   (answers "is QtMultimedia loadable in the shell process").
2. `omarchy plugin enable com.keithrowell.pacman-probe`, then
   `omarchy-shell shell call com.keithrowell.pacman-probe probe ""`.
   Pass = real numbers back. The shell's own log (`journalctl --user` for
   the shell unit, or its stderr) shows any import error otherwise.
3. Reload check (decides the singleton question below): touch a file in the
   probe dir twice (each triggers a plugin reload) and call `probe` again,
   having `ProbeTheme` count its own `Component.onCompleted` into a global
   (e.g. `Qt.application` dynamic property) — does a reload create a second
   singleton instance with its own `FileView` watch, or reuse one?
4. Clean up: `omarchy plugin disable com.keithrowell.pacman-probe`, remove the dir.
   Record results in `spike-notes.md`.

**If `.mjs` imports fail — named fallback: a generated `.pragma library` bundle.**
Add `tools/bundle-lib.mjs` (Node, no dependencies) that writes one committed
file `app/gen/lib.js`: `.pragma library`, each module wrapped as
`var Maze = (function () { … return { parseMaze, … }; })();` in dependency
order, with every `import { a, b } from "./x.mjs"` rewritten to
`var a = X.a, b = X.b;` and `export ` stripped (the export names collected for
the return object). QML then does `import "gen/lib.js" as Lib` and uses
`Lib.Maze.parseMaze`, a mechanical rename in `app/`. `lib/*.mjs` stay the
source of truth and `node --test` keeps importing them; a new test
regenerates the bundle into a temp file and fails if it differs from the
committed one, so the two cannot drift. Stop and tell Keith before taking
this path: it adds a generated artefact to review.

**If the reload check shows duplicated singletons:** convert `Theme`,
`Settings` and `Sfx` from qmldir singletons to instances created by
`Panel.qml` and passed to `Main` as properties (`theme`, `settings`, `sfx`),
so a plugin reload destroys them with the panel. Mechanical but touches every
`Theme.`/`Settings.`/`Sfx.` reference; keep it a separate commit. If
singletons are reused, keep them (smallest diff).

Timebox overrun: stop and report to Keith with what was learned.

### Task 2 — Pure seams first (red, then green)

- `lib/scale.mjs`: `fitsArcade(width, height, dpr)` returns
  `floor(min(w*dpr/224, h*dpr/288)) >= 1` using `saneDpr`. The panel sets
  `PixelStage.mode = fitsArcade(...) ? "arcade" : "smooth"`; the smooth path
  (kept in PixelStage for reuse, ADR-0002) scales the game down on a monitor
  that cannot show 1x. Tests in `tests/scale.test.mjs`.
- `tests/manifest.test.mjs` and `tests/panel-guard.test.mjs` as listed above.
  They fail until Tasks 3-4 land; commit them with the task that turns them green.

### Task 3 — Sound behind a failing-safe load

Split `app/Sfx.qml`: move the `SoundEffect` properties, the `effects` map and
the ready/error counting into `app/SfxBank.qml` (root `QtObject`,
`import QtMultimedia`; exposes `effects`, `readyCount`, `errorCount`, `count`,
a `settled()` signal). `Sfx.qml` keeps its public API and mute handling; in
`Component.onCompleted` it does `Qt.createComponent(bankUrl)` and
`createObject(root)`; `Component.Error` (the `QtMultimedia` import failing)
sets `available: false` and logs one warning, exactly the "runs silent" path
that already exists for load failures. `bankUrl` is `SfxBank.qml`, or, only
when `PACMAN_DEBUG=1` and `PACMAN_SFX_BANK` is set, that path — so the
verification can point it at a scratch file that imports a non-existent
module and exercise the real compile-error path without uninstalling
qt6-multimedia. Also add `stopAll()` (stop every effect) for close.
Verify with the current standalone (`qs -p` a worktree, scratch HOME): sounds
play; with the bad bank, the HUD shows no-audio and the game runs.

Why not a `Loader` like Quattroids: `Sfx` is a `QtObject` singleton and a
`Loader` is an `Item`; `Qt.createComponent` gives the same fail-soft
behaviour without a visual parent.

### Task 4 — The panel (the switch)

`Panel.qml` (repo root):

- Root `Item` with `property bool opened: false`, `property var shell: null`,
  `property var manifest: null`, `readonly property string selfId:
  manifest && manifest.id ? manifest.id : "com.keithrowell.pacman"`,
  `property bool grabKeyboard: true` (the dev host clears it for key scripts).
- `onShellChanged` self-restore, as Quattroids does: if the host already
  lists us in `shell.openPanelIds`, `open("{}")`.
- `open(payloadJson)`: ignores the payload. Picks the target screen once,
  **before** showing: `Quickshell.screens.find(s => s.name ===
  Hyprland.focusedMonitor?.name) ?? Quickshell.screens[0]`; sets
  `opened = true`; activates the content loader on first open; then
  `Qt.callLater(() => game.focusGame())`. A re-open lands paused (the pause
  happened on close) and resumes on P/Enter/Space as today.
- `close()`: `if (!opened) return;` then `game.suspend()` (pause the flow if
  a game is running, drop held keys, `Sfx.stopLoops()` + `Sfx.stopAll()` —
  **the frame loop stops with the window, so `playSounds` would never run to
  silence a siren; close must do it**), `opened = false`, then
  `shell.hide(selfId)` if `shell` is set (the host's second `close()` call is
  a no-op thanks to the guard).
- `PanelWindow` (layer shell): `visible: opened`, `screen: targetScreen`,
  anchored to all edges, `color: "transparent"`,
  `WlrLayershell.namespace: "omarchy-pacman"`, `layer: WlrLayer.Overlay`,
  `keyboardFocus: opened && grabKeyboard ? Exclusive : None`,
  `exclusionMode: ExclusionMode.Ignore`. A full-window `MouseArea` closes on a
  click outside the cabinet (pauses; nothing lost). The cabinet: a
  `Rectangle` in `Theme.background` with a thin `Theme.accent` border, sized
  and placed from the stage's `sceneRect` so it hugs the integer-scaled game;
  its own `MouseArea` swallows clicks. The stage gets the window minus a fixed
  logical margin (a size, not a colour).
- `Loader { id: gameLoader; active: everOpened; sourceComponent/source: "app/Main.qml" }`
  — with `keepLoaded: true` the panel root loads at shell start; deferring the
  game (and with it the singletons, sound bank and theme watch) to the first
  open keeps login cost at an empty `Item`. After that it stays loaded, which
  is what gives resume.
- `Component.onDestruction` (plugin reload, disable, shell restart): if the
  flow is on `initials`, save the current letters (the "never lose a
  qualifying score" promise from Main's `quit()`).

`app/Main.qml` (content):

- Root `Item`, `anchors.fill` from the panel; `property bool running` bound
  by the panel to `opened`; `FrameAnimation.running: running` (explicit, not
  relying on the hidden window stalling). On `running` turning true, reset
  `acc` to 0 so the first frame after resume does not consume a stale slice.
- `devicePixelRatio`: keep the Hyprland monitor-scale lookup, keyed on the
  panel window's `screen` (passed in) instead of `window.screen`.
- Keys, rewritten only where the spec changes them:
  - Escape: **everywhere** closes (`closeRequested()`); the panel's close
    pauses a running game. On `paused` it now closes instead of resuming
    (P/Enter/Space still resume). On `initials` it closes without saving —
    the entry and its tick-driven timeout freeze while hidden and are there
    on reopen (destruction saves, above).
  - q: every former `quit()` becomes `closeRequested()` (title hold, paused,
    game over, in game). No `Qt.quit()` anywhere — it would kill omarchy-shell.
    `tests/panel-guard.test.mjs` enforces it.
  - Everything else (arrows/hjkl/WASD, Enter, P, M, initials entry) unchanged.
- `loseFocus()` stays wired to `Window.active` (now the panel window's), still
  suppressed while a key script runs.
- Remove the window title property (a layer surface has none); the debug
  line drops `title`.
- The debug env (`PACMAN_DEBUG`, `PACMAN_DEBUG_KEYS`) keeps working where it
  exists — the dev host's process. In omarchy-shell it is simply unset.

`manifest.json` as in the table. `shell.qml` (root) becomes the dev host:

```qml
ShellRoot {
    Panel { id: panel; shell: stub; grabKeyboard: <no PACMAN_DEBUG_KEYS> }
    QtObject { id: stub; function hide(id) { Qt.quit() } }  // dev process only
    Component.onCompleted: { panel.open("{}"); /* runKeys from env */ }
}
```

(`Qt.quit()` here is allowed: this file is never loaded by omarchy-shell. The
guard test scopes its rule to `app/` and `Panel.qml`.)

### Task 5 — Launchers

`bin/pacman`: check `command -v omarchy-shell` (message: this game runs
inside Omarchy's shell); `exec omarchy-shell shell toggle com.keithrowell.pacman '{}'`.
Header comment points to ADR-0003. `bin/install`: requirements and menu
action as in the table; after writing, print the enable hint:
"Enable it once: omarchy plugin enable com.keithrowell.pacman" (and whether
it already is, when `omarchy plugin list --json` is available — never
enable it automatically). The `omarchy-pacman` launcher link and the
never-name-anything-`pacman` guard stay. Keith's current menu entry
(`uwsm-app -- …/bin/pacman`) keeps working because `bin/pacman` now toggles;
the printed entry is the cleaner form.

### Task 6 — Unattended driving inside the real shell

Hyprland blocks virtual keyboards, and the shell's environment has no
`PACMAN_DEBUG_KEYS`, so add IPC-callable methods on the `Panel.qml` root
(the host's `shell call` reaches any root function):

- `keys(csv)` — same syntax as `PACMAN_DEBUG_KEYS` (names and millisecond
  pauses), fed to `Main.runKeys` (the existing `keyScript` Timer, refactored
  to accept a list at run time; the env path in the dev host calls the same
  function). Ignored while closed. Returns `"ok"` or `"closed"`.
- `grab(arg)` — the F12 equivalent: `grabFrame()` to the fixed path
  `~/.local/state/pacman/frame.png` (argument ignored: no caller-chosen
  paths). Returns the path.
- `status(arg)` — one JSON line: `opened`, `screen`, `attract`, `score`,
  `tick`, `phase`, `sfxAvailable`, `currentLoop`, `mode` (arcade/smooth),
  `blockSize`, `frameLoopRunning`. This is what lets a script assert
  "hidden => loop stopped and no loop sound" and "reopen => same tick, paused".

Example session (with Keith's go-ahead, since an open panel takes his
keyboard): `omarchy-shell shell toggle com.keithrowell.pacman '{}'`,
`omarchy-shell shell call com.keithrowell.pacman keys "Return,3000"`,
`… call … status ""`, `… call … keys "Escape"`, `… status ""` (opened false,
frame loop stopped, tick unchanged a second later), toggle again,
`… status ""` (paused, same tick).

### Task 7 — Docs and ADR

ADR-0003 to `accepted` (with the Task 1 outcome filled in), ADR-0001 status
line, ADR-0002 one-liner, README, CLAUDE.md, brief constraints, CHANGELOG,
version bump.

### Task 8 — Validate and install (after merge, with Keith)

1. `omarchy plugin validate "<checkout>"`.
2. Marketplace rules against the pushed commit: clone
   omacom/omarchy-plugin-marketplace into the scratchpad, `npm ci`, and run a
   scratch driver (not committed) that imports `validateManifest` from
   `scripts/build-catalog.mjs` with `{ community: true }` on our
   `manifest.json`, and re-applies `validateManifestFiles`'s two extra rules
   (no mode `120000`, every entry point a blob) to
   `git ls-tree -r <pushed sha>`. Record the output in the spec dir.
3. Keith's copy: **first ask Keith to close his running standalone game**
   (`qs -p ~/.config/omarchy/plugins/com.keithrowell.pacman`; its PID is his
   to stop, never `pkill qs`) — otherwise its Quickshell hot reload would
   pick up the new root `shell.qml` and open a dev-host panel in that old
   process. Then fast-forward the dotfiles submodule per README "Maintainer",
   `omarchy plugin enable com.keithrowell.pacman`, re-run `bin/install`,
   and Keith updates his `omarchy-menu.jsonc` entry and opens it from the menu.

## Test strategy

Gate: `node --test tests/*.test.mjs` (the only configured gate in
`.agentile/gates.json`). It proves:

- `lib/` rules unchanged (existing suites) and `fitsArcade` (new cases).
- Manifest AC and the static half of the marketplace rules
  (`tests/manifest.test.mjs`).
- No `Qt.quit` in panel code, `QtMultimedia` isolated to `SfxBank.qml`, no Qt
  in `lib/` (`tests/panel-guard.test.mjs`).
- Launchers: `bin/pacman` calls the toggle and never `qs`; install output,
  menu action, requirements, uninstall ownership (`tests/install.test.mjs`,
  run against a scratch HOME with fake `omarchy-shell` / `pacman` on PATH).
- If the Task 1 fallback is taken: the bundle-freshness test.

Not provable by the gate, verified by hand and recorded in `review.md`:

- Dev host, scratch HOME with a copied `colors.toml`:
  `PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="Return,4000,F12,800,Escape" qs -p <worktree>`
  — play starts, frame grabbed, Escape exits the dev process. Stop only that
  process by its own PID.
- Silent path: same with `PACMAN_SFX_BANK=<scratch file importing a missing module>`
  — one warning, game runs, HUD shows no audio.
- Real shell via Task 6 hooks: toggle opens centred on the focused monitor at
  the largest integer scale with scanlines; Escape closes; `status` shows the
  frame loop stopped, no loop sound, tick frozen while hidden; reopen is the
  same round, paused; toggling while open closes.
- Theme switch while open (`omarchy-theme-set <other>` then back) recolours
  live; `grab` title and play frames, file them with the theme name.
- Mute persists across close/reopen and across a shell restart
  (`~/.local/state/pacman/settings.json`); high-score table unchanged.
- Keith plays a round with real keys (the one thing no script can do here).

## Risks and unknowns

1. **`.mjs` in the shell's engine** — the headline unknown; Task 1 answers it
   first with a named fallback.
2. **Killing the desktop shell.** `Qt.quit()` in panel code, a runaway timer
   or a blocking read hurts the bar, notifications and lock screen. Mitigated
   by the guard test, the explicit `FrameAnimation.running`, stopping sounds
   in `close()`, and keeping all file I/O on `FileView` (async). Theme's
   250 ms retry timer when `colors.toml` is missing still runs forever in the
   shell — known, deferred to `marketplace-readiness` (retry backoff).
3. **Siren left looping after close.** Only `playSounds` (per frame) silences
   loops today; with the frame loop stopped it never runs. `close()` must stop
   them — called out in Task 4 and asserted via `status`.
4. **Singleton lifetime across plugin reloads** (`Qt.clearComponentCache`):
   possible duplicated `FileView` watchers / sound banks per reload inside the
   shell. Task 1 step 3 measures it; fallback named there.
5. **Plugin reloads drop the round.** Any write under
   `~/.config/omarchy/plugins/` (any plugin, git operations in the submodule)
   reloads all panels. Accepted; the initials entry is saved on destruction.
6. **QtMultimedia inside omarchy-shell.** Loading the FFmpeg/PipeWire backend
   into the shell process adds threads and memory for the session. Deferred
   until first open (content `Loader`); Task 1 also reports whether it loads
   at all in that process.
7. **Keyboard grab during verification.** An open layer surface with
   exclusive focus takes Keith's keyboard. The dev host drops the grab for key
   scripts; real-shell runs need Keith's go-ahead and should be short.
8. **Focused monitor and scale.** `Hyprland.focusedMonitor` to
   `Quickshell.screens` by name; a missing match falls back to the first
   screen. Fractional scale (1.6) must still give square blocks: the existing
   Hyprland-scale lookup carries over, check block size via `status` on each
   monitor.
9. **Click-outside-to-close** is a design choice copied from Quattroids, not
   in the spec; it only pauses, but Keith may prefer the backdrop inert.
   Confirm at the checkpoint.
10. **Keith's running standalone copy** would hot-reload into the dev host on
    fast-forward (Task 8 step 3).
11. `validateManifestFiles` is not exported; the local marketplace check
    re-implements its two file rules in a scratch driver. If the marketplace
    ships a runnable submission validator (`scripts/validate-submission.mjs`)
    that works without repo secrets, prefer it.

Spec split: not needed, but if review wants smaller diffs, land Tasks 1-3 as
batch A (standalone still works) and Tasks 4-7 as batch B.

## ADR

[ADR-0003: Run the game as an omarchy-shell panel plugin](../../../adr/0003-run-as-omarchy-shell-panel.md)
— status `proposed`; supersedes ADR-0001's standalone-process decision (the
rest of ADR-0001 stands). Accept it at ship with the Task 1 outcome recorded.
