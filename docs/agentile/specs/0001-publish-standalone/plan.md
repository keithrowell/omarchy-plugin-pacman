# Plan — Publish 1.0.0 as a standalone public repo

Written by the plan stage. Review and amend this file directly — the build
stage follows what it says.

## Files to touch

- `shell.qml` (new, repo root) — the Quickshell config root. Instantiates
  `app/Main.qml` so the shell root becomes the repo root and `lib/` and
  `assets/` are inside it. No symlinks needed.
- `bin/pacman` — `exec qs -p "$ROOT" "$@"` (the directory, not `app/Main.qml`).
- `app/lib`, `app/assets` — delete the symlinks (`git rm`).
- `app/Main.qml`, `app/Theme.qml`, `app/Settings.qml`, `app/PixelStage.qml`,
  `app/Sfx.qml` — `import "lib/x.mjs"` → `import "../lib/x.mjs"`;
  `Qt.resolvedUrl("assets/…")` → `Qt.resolvedUrl("../assets/…")`. Update the
  comment in `Theme.qml` (lines 59–61) and `lib/maze.mjs` line 4.
- `app/render/*.js` — `.import "../lib/…"` → `.import "../../lib/…"`.
- `bin/install` — the printed menu action uses `$ROOT` (real checkout path,
  `~`-abbreviated when under `$HOME`) instead of the fixed `PLUGIN_DIR`.
  Keep the pacman-on-PATH guard. Add a requirements check for `quickshell`
  and `qt6-multimedia` (`pacman -Qq <pkg>` or `command -v qs`), printing a
  `sudo pacman -S …` line for missing ones, non-fatal with `--dry-run`.
- `manifest.json` — `"version": "1.0.0"`.
- `README.md` — new public "Install on Omarchy" section (clone, install,
  menu snippet, requirements, update, uninstall, "Why not `omarchy plugin add`"
  with a link to `docs/adr/0001-standalone-quickshell-process.md`); Keith's
  dotfiles-submodule flow moves to a "Maintainer" subsection. Keys table and
  rendering section stay as they are.
- `CHANGELOG.md` (new) — `## 1.0.0 — 2026-09-06` listing the shipped specs.
- `CLAUDE.md` — layout bullet: `shell.qml` is the Quickshell root, `bin/pacman`
  runs `qs -p <repo>`; drop any mention of symlinks.
- `tests/install.test.mjs` — new cases: menu snippet action contains the
  checkout path when the checkout is not at the plugin path; the requirements
  check lists a missing package (stub `pacman -Qq` via PATH in a scratch HOME).
- `docs/agentile/inbox.md` — remove the "must preserve the app/lib and
  app/assets symlinks" stub.
- `docs/adr/0001-standalone-quickshell-process.md` — one-line dated
  amendment: the launcher runs `qs -p <repo root>` with a root `shell.qml`,
  so no symlinks; marketplace not applicable.

## Approach

1. **Root `shell.qml`.** Quickshell runs a directory with `qs -p <dir>` when
   it holds `shell.qml`. Write:

   ```qml
   import "app" as App
   App.Main {}
   ```

   `Main.qml` is a `ShellRoot`, so the config's root object is still a
   ShellRoot. `app/qmldir` keeps the `Theme`/`Settings`/`Sfx` singletons and
   `PixelStage`; they resolve as before because `app/` is the importing
   directory for those files. Verify the `import "app" as App` form loads
   the qmldir singletons for `Main.qml`'s unqualified `Theme`/`Settings`/`Sfx`
   references (they are resolved relative to `Main.qml`'s own directory, which
   is unchanged). If Quickshell rejects a ShellRoot instantiated from another
   file, fall back to moving `Main.qml`'s body into `shell.qml` with
   `import "app"` for the singletons — keep whichever works and say which.
2. **Relative paths.** Every `lib/` and `assets/` reference in `app/` gains
   one `../` (two in `app/render/`). Grep for `"lib/`, `"assets/`,
   `../lib/` after the change to be sure nothing is left.
3. **Delete the symlinks** with `git rm app/lib app/assets`. Confirm with
   `find . -name .git -prune -o -type l -print` (empty).
4. **Launcher**: `bin/pacman` does `exec qs -p "$ROOT" "$@"`. Keep the
   `qs`-missing message. Launch it, press F12 with `PACMAN_DEBUG=1`, and
   confirm in the log that the font loaded (`Theme.fontReady`), the theme
   parsed, and `Sfx.available` is true (sounds resolved). Kill only your own
   pid; Keith may have his own `qs` running.
5. **Installer**: replace the fixed `PLUGIN_DIR` in the menu action with a
   display form of `$ROOT` (`${ROOT/#$HOME/\~}`) so a clone anywhere prints
   a working action. The desktop file already uses `$ROOT`. Add the
   requirements check near the `qs` check. Keep all existing tests green.
6. **Version, changelog, README, CLAUDE.md, ADR note, inbox stub** as listed.
7. **Do not** tag, push, or change repo visibility in the build — those are
   ship-step actions and need Keith's sign-off (outward-facing).

## Test strategy

- Gate: `node --test tests/*.test.mjs` (from `.agentile/gates.json`) — all
  existing suites plus the two new installer cases.
- Manual, recorded in `as-built.md`: launch from the worktree via
  `bin/pacman` with `PACMAN_DEBUG=1`, F12 grab, log lines for font/theme/sound;
  `bin/install --dry-run` from the worktree path shows that path in the
  desktop Exec and the menu action; `find` for symlinks is empty.
- Also run `bin/install --dry-run` from the real plugin checkout path after
  merge to confirm the menu action still reads
  `~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman`.

## Risks and unknowns

- Quickshell may not accept a `ShellRoot` subclass as the root object when
  instantiated through a directory import; the fallback in step 1 covers it.
- Hot reload: with the repo root as the config root, Quickshell may watch
  more files; harmless, but note it if reloads get noisy.
- Existing installs: `bin/install` at the plugin path must report
  `unchanged` or rewrite cleanly; the desktop file Exec path does not change.
- Going public exposes full history (agentile notes, session ids). Accepted
  by Keith at shaping; confirmed again at ship.

## ADR

None new. One-line amendment to ADR-0001 (launcher form). Decision to stay
standalone rather than port to a shell `panel` recorded in the spec's
problem statement.
