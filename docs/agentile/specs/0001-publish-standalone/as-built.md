# As-built — Publish 1.0.0 as a standalone public repo

## shell.qml design: the plan's step 1 worked, no fallback needed

The plan's primary design worked first try:

```qml
import "app" as App
App.Main {}
```

Quickshell (0.3.1) accepted a `ShellRoot` (`app/Main.qml`) instantiated
through a directory import from another file as the config root without
complaint. `qs -p <repo root>` finds this `shell.qml`, loads it, and every
unqualified reference inside `Main.qml` to `Theme`, `Settings`, `Sfx` and
`PixelStage` still resolves correctly — those are resolved relative to
`Main.qml`'s own directory (`app/`) and its `qmldir`, not to whichever file
instantiated it, so moving the instantiation up to the repo root changed
nothing about how the singletons are found. The fallback in the plan
(moving `Main.qml`'s body into `shell.qml` with `import "app"` for the
singletons) was not needed.

Every `lib/` and `assets/` reference in `app/` gained one `../` (two in
`app/render/*.js`, which live one directory deeper); grepping for `"lib/`,
`"assets/` and `.import "../lib/` after the change turned up nothing left
over. `app/lib` and `app/assets` were `git rm`'d.

## Deviations from the plan

- **Requirements-check placement**: the plan said "near the qs check", but
  `bin/install` has no `qs` check of its own (only `bin/pacman` does) — the
  nearest existing thing is the "pacman on PATH shadows the package
  manager" guard. The requirements check was placed right after that guard
  (using the `say()`/`would()` helpers, which were moved up a few lines so
  the check could use `say`). It runs even under `--uninstall`; that was
  simpler than gating it and is harmless (an uninstall does not care what
  is installed).
- **Menu action quoting**: the plan didn't spell out how a `ROOT` containing
  spaces (this lab checkout's `Dropbox (Maestral)` path, or any real user's
  home) should be embedded in the printed JSON snippet's `action` string.
  The action's path is now always double-quoted (`uwsm-app -- "$LAUNCH"`),
  with the quotes themselves escaped (`\"`) inside the JSON string so the
  printed snippet stays valid JSON while decoding to a real, shell-quoted
  path. Verified end-to-end: piped the printed snippet through `JSON.parse`
  and confirmed the decoded `action` is `uwsm-app -- "<path>"`.
- **`~`-collapsing**: `DISPLAY_LAUNCH` collapses a `$HOME`-rooted `LAUNCH` to
  `~/...` for readability (matching the old fixed suggestion's style when a
  checkout happens to live under `$HOME`, e.g. the canonical plugin path);
  a checkout elsewhere shows its full absolute path. This is a shell
  string match (`case "$LAUNCH" in "$HOME"/*)`), not a regex substitution,
  to avoid `$HOME` characters that are regex-special.
- **`PLUGIN_DIR` variable removed** rather than kept as a fallback/default:
  since `DISPLAY_LAUNCH` naturally collapses to the same string when a
  checkout genuinely lives at `~/.config/omarchy/plugins/com.keithrowell.pacman`,
  no separate branch was needed to special-case that path. The plugin path
  now appears only as the suggested clone location in README and as a
  comment in `bin/install`.
- **Real-plugin-path re-check deferred**: the plan's test strategy also
  calls for running `bin/install --dry-run` at the actual installed
  `~/.config/omarchy/plugins/com.keithrowell.pacman` checkout "after
  merge" to confirm the menu action still reads that path. That checkout
  tracks a much older commit and is a live install Keith may be using; it
  was not touched from this worktree. This is a post-merge check, matching
  the plan's own wording, not a build-time gate.

## Verification run

All commands below were run from this worktree
(`/home/keith/Dropbox (Maestral)/lab/omarchy_pacman/.claude/worktrees/agent-a3a0121ccba1adfec`),
never against the real `~/.config/omarchy/plugins/com.keithrowell.pacman`
checkout or Keith's own `qs` instance.

**Tests** (`node --test tests/*.test.mjs`):

```
ℹ tests 296
ℹ suites 0
ℹ pass 296
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**No symlinks** (`find . -name .git -prune -o -type l -print`): empty output.

**Launch, F12 grab, debug log** (`PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="3000,F12,500,q" qs -p <worktree>`,
run in the background, killed via the worktree's own `qs` pid):

```
INFO: Launching config: ".../shell.qml"
INFO: Configuration Loaded
INFO qml: Theme: loaded dark palette (accent #7daea3, font Press Start 2P) from /home/keith/.local/state/omarchy/current/theme/colors.toml
INFO qml: Sfx: 15 of 15 effects loaded, audio available
INFO qml: Debug: key F12 on title at tick 0
INFO qml: Debug: frame saved to /home/keith/.local/state/pacman/frame.png (screen title, block 2 device px, dpr 1.6)
```

Theme parsed (palette line names the live theme's accent colour), font
loaded (the palette line reports "Press Start 2P", `Theme.fontFamily`'s
value once `fontReady` is true — the fallback is `"monospace"`), and
`Sfx: 15 of 15 effects loaded, audio available` confirms `Sfx.available`.
The F12 grab wrote a 610×742 PNG. No stray `qs` process was left after the
outer `timeout` fired (`pgrep -af "qs -p"` found nothing but the grep
itself).

**`bin/install --dry-run` from the worktree** (`HOME` pointed at a scratch
dir):

```
desktop file: would write <scratch>/.local/share/applications/Pacman.desktop
launcher: would link <scratch>/.local/bin/omarchy-pacman -> <worktree>/bin/pacman
...
"action": "uwsm-app -- \"<worktree>/bin/pacman\""
```

The worktree path (which contains a space, `Dropbox (Maestral)`) appears
correctly, quoted, in every line.

**Fresh-clone dry-run** (acceptance criterion's literal scenario): cloned
the worktree's committed `HEAD` to a scratch `/tmp/.../omarchy-plugin-pacman`
and ran `bin/install --dry-run` from there:

```
desktop file: would write <scratch-home>/.local/share/applications/Pacman.desktop
launcher: would link <scratch-home>/.local/bin/omarchy-pacman -> /tmp/.../omarchy-plugin-pacman/bin/pacman
"action": "uwsm-app -- \"/tmp/.../omarchy-plugin-pacman/bin/pacman\""
---symlinks in clone---
(empty)
```

**Requirements check**, stubbed `pacman -Qq` and `qs` on `PATH` (see
`tests/install.test.mjs`): reports `quickshell` and/or `qt6-multimedia`
missing without failing the run when absent, and says nothing when both
report present. On this machine (both actually installed) the unstubbed
default-`PATH` runs above print nothing, as expected.

## Follow-ups for the ship step (not done here)

- Tag `v1.0.0` on the merge commit, push the tag.
- `gh repo edit keithrowell/omarchy-plugin-pacman --visibility public`.
- Fast-forward the installed submodule at
  `~/.config/omarchy/plugins/com.keithrowell.pacman` and re-run
  `bin/install` there; confirm it reports `unchanged` or a clean rewrite
  and that the printed menu action still reads
  `~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman` (per the
  plan's test strategy).
- Record the tag and the public URL in the ship notes.
