# Review — Publish 1.0.0 as a standalone public repo

Fresh-context review of branch `worktree-agent-a3a0121ccba1adfec`
(commits d34801a, ff0ba5e, fbc9df3, f83e07d) against `master`, run entirely
inside the worktree on 2026-09-06.

## Verdict: FAIL — bounce back to build

One blocking defect: the menu action `bin/install` now prints does not run.
`omarchy-shell` executes a menu `action` with `bash -lc "<action>"`
(`/usr/share/omarchy/shell/Commons/Util.qml:54` via
`plugins/menu/Menu.qml:141`), and bash does not tilde-expand inside double
quotes, so `uwsm-app -- "~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman"`
hands `uwsm-app` a literal `~/...` path that does not exist. Every checkout
under `$HOME` — including the README's canonical clone location — prints a
broken snippet, and `tests/install.test.mjs` asserts the broken form. The
rest of the spec is met and verified below; fix this one thing and the
branch is ready for the ship-step sign-off.

## Findings

### Blocking

1. **`bin/install:39-41` + `bin/install:175,178` — quoted `~` never expands.**
   Evidence, using a stub `uwsm-app` that reports whether the path it is
   given is executable, run exactly the way the shell runs an action:

   ```
   $ bash -lc 'uwsm-app -- "~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman"'
   FAIL: no such executable: ~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman   (exit 127)
   $ bash -lc 'uwsm-app -- ~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman'      # master's form
   OK: would exec /home/keith/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman
   ```

   The worktree's own printed action (`uwsm-app -- "~/Dropbox (Maestral)/…/bin/pacman"`)
   fails the same way. The as-built note verified the snippet is valid JSON
   (it is) but never ran the decoded command through a shell.

   **Fix:** keep the double quotes (they are what makes a path with spaces
   work) but emit something bash expands inside them. Simplest:
   `DISPLAY_LAUNCH="\$HOME${LAUNCH#"$HOME"}"` so the action reads
   `uwsm-app -- "$HOME/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman"`
   (JSON: `"uwsm-app -- \"$HOME/.config/…/bin/pacman\""`). `$HOME` expands
   inside double quotes, survives spaces, and stays portable across machines
   that share the menu file — the reason the old code used `~` at all.
   (Alternative: print the absolute path quoted, dropping the collapse
   entirely; less portable but also correct.) Then update
   `tests/install.test.mjs:181-196` ("collapses a $HOME-rooted checkout") and
   the first snippet test to assert the action *resolves* — e.g. run
   `bash -c 'printf %s "$2"' _ -- <action minus uwsm-app>` or a stub
   `uwsm-app` on PATH and compare the received argv to `LAUNCH` — rather
   than string-matching a form nobody has executed. Re-check the README
   snippet at `README.md:40` matches whichever form is chosen.

### Should-fix

2. **`README.md:243-246` ("Development") is Keith-specific outside the
   Maintainer subsection.** "This repo is the development checkout; the
   submodule under `~/.config/omarchy/plugins/` tracks the same remote and
   is updated with `git pull`, or straight from this checkout before a
   push" only makes sense for the owner. Either drop the first sentence or
   move it into "Maintainer" and leave "Development" as the generic
   run/test/regenerate commands.

### Nits

3. `bin/install:78-85` — the requirements check also runs under
   `--uninstall` (as-built admits this). Harmless; a one-line `(( UNINSTALL )) ||`
   guard would make the uninstall output quieter.
4. `docs/agentile/specs/0001-publish-standalone/as-built.md` — after the
   fix, correct the "Menu action quoting" paragraph, which currently
   records the broken design as verified.
5. `README.md:129` mentions the lab path (`~/Dropbox (Maestral)/lab/omarchy_pacman`)
   — fine inside Maintainer, just noting it is personal detail that will be
   public.

## What was verified (all inside the worktree)

**1. Build-time acceptance criteria**

- *No symlinks; app reaches lib/ and assets/ as real paths inside the
  Quickshell root; bin/pacman still launches with theme, font and sounds;
  tests untouched and green.* — `find . -name .git -prune -o -type l -print`
  prints nothing; `git ls-files -s | awk '$1=="120000"'` prints nothing;
  the diff deletes `app/lib` and `app/assets` (mode 120000). New `shell.qml`
  is `import "app" as App` / `App.Main {}`; `bin/pacman:16` is
  `exec qs -p "$ROOT" "$@"`. Every `lib/`/`assets/` reference in `app/`
  gained `../` (two in `app/render/*.js`); a grep for leftover
  `"lib/`, `"assets/`, `.import "../lib/`, `resolvedUrl("assets` finds
  nothing. Launch evidence in item 4 below. Tests: item 2.
- *manifest.json version 1.0.0, kinds []* — `manifest.json` diff:
  `"version": "0.1.0"` → `"1.0.0"`, `"kinds": []` unchanged;
  README "Validation" section still explains the empty kinds.
- *bin/install works from any clone location; desktop file, link and menu
  action use ROOT; --dry-run from /tmp/… shows that path in every line.* —
  Fresh clone of HEAD (f83e07d) to a scratch `/tmp/…/clone/omarchy-plugin-pacman`,
  `bin/install --dry-run` there printed that path in the launcher line and
  in the menu action, and `find` found no symlinks in the clone. A real
  install into a scratch HOME/XDG_DATA_HOME from the worktree wrote
  `Exec="/home/keith/Dropbox (Maestral)/lab/omarchy_pacman/.claude/worktrees/agent-a3a0121ccba1adfec/bin/pacman"`,
  `Icon=…/assets/icon.png`, and linked `omarchy-pacman -> …/bin/pacman`;
  nothing was written outside the scratch directory. *But* see Blocking 1:
  the printed menu action is not runnable for any `$HOME`-rooted checkout,
  so this criterion is only partly met.
- *README "Install on Omarchy" for the public.* — `README.md:10-98` has the
  clone URL (`https://github.com/keithrowell/omarchy-plugin-pacman.git`,
  matching the `origin` remote's repo name), `bin/install`, the menu
  snippet, Requirements (Omarchy/Hyprland, quickshell, qt6-multimedia —
  exactly what `bin/install` checks), Update (`git pull` + `bin/install`),
  Uninstall (`--uninstall`, menu entry by hand, `rm -rf`), and "Why not
  `omarchy plugin add`" naming the six shell kinds and linking
  `docs/adr/0001-standalone-quickshell-process.md`. Dotfiles flow sits under
  `### Maintainer` (`README.md:100-159`). See Should-fix 2 for one stray
  owner-specific sentence in "Development".
- *CHANGELOG.md 1.0.0 entry.* — `CHANGELOG.md:3-32` lists specs
  0001–0007 (v1), scanlines-always-on, high-score-table, remove-smooth-mode,
  fruit-bonus and this spec; every slug named exists under
  `docs/agentile/specs/done/`.
- *Inbox stub removed.* — `grep symlink docs/agentile/inbox.md` is empty;
  the diff removes the "must preserve the app/lib and app/assets symlinks"
  line.
- Ship-step criterion (tag, push, visibility, submodule fast-forward)
  correctly left unticked and undone.

**2. Gate** — `node --test tests/*.test.mjs` in the worktree:

```
ℹ tests 296
ℹ suites 0
ℹ pass 296
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

(`lint` and `build` are blank in `.agentile/gates.json` — not configured.)

**3. Symlinks** — `find . -name .git -prune -o -type l -print` → empty
(worktree and fresh clone).

**4. Launch** — `PACMAN_DEBUG=1 timeout 8 bin/pacman` from the worktree,
no pre-existing `qs` process on the machine before or after; `timeout`
killed only the instance it started (exit 124, `pgrep -af "qs -p .*agent-a3a0121ccba1adfec"` empty afterwards):

```
INFO: Launching config: "/home/keith/Dropbox (Maestral)/lab/omarchy_pacman/.claude/worktrees/agent-a3a0121ccba1adfec/shell.qml"
INFO: Configuration Loaded
INFO qml: Theme: loaded dark palette (accent #7daea3, font Press Start 2P) from /home/keith/.local/state/omarchy/current/theme/colors.toml
INFO qml: Sfx: 15 of 15 effects loaded, audio available
INFO qml: Debug: fps 61 zoom 3.125 block 5 dpr 1.6 … screen title …
```

Theme loaded, font resolved (`Press Start 2P`, not the `monospace`
fallback), audio available, title screen rendering at 60 fps. Nothing under
`~/.local/state/pacman/` was touched (no F12 pressed).

**5. `bin/install --dry-run` from the worktree** — the launcher line and the
menu action both carry the space-containing worktree path; the `"pacman": {…}`
block parses with `JSON.parse` and decodes to
`uwsm-app -- "~/Dropbox (Maestral)/lab/omarchy_pacman/.claude/worktrees/agent-a3a0121ccba1adfec/bin/pacman"`
— syntactically right, semantically broken (Blocking 1). The desktop Exec
line (checked via the scratch-HOME install above) is correctly
double-quoted.

**6. Security skim (`bin/install`, `bin/pacman`)** — `set -euo pipefail` in
both; every path expansion double-quoted, including the `case` patterns
(`"$HOME"/*`, `"$ROOT"/*`) and `${LAUNCH#"$HOME"}`; no `eval`, no
`$(...)` on user-controlled input beyond `readlink -f "$0"`; writes limited
to `$XDG_DATA_HOME/applications` (or `~/.local/share/applications`),
`~/.local/bin/omarchy-pacman`, and a `mktemp` file removed on EXIT — all
documented in the header comment. The pacman-on-PATH guard is intact and
unchanged at `bin/install:54-70`, and the new requirements check
(`bin/install:78-85`) runs *after* it, so `pacman -Qq` can never hit a
shadowing copy in the checkout. Menu entry is printed, never written.
`bin/pacman` only `exec`s `qs -p "$ROOT" "$@"`.

**7. README for a non-owner** — see acceptance-criteria bullet and
Should-fix 2. Clone URL, requirements, update and uninstall read
correctly; the ADR link is a relative repo path, which renders on GitHub.

**8. Colours and game logic** — no `#rrggbb` literal added anywhere in
`app/`, `lib/`, `bin/` or `shell.qml`; the only change under `lib/` is a
two-line comment in `lib/maze.mjs:4-5`. Scope stayed inside the spec
(layout, launcher, installer, docs, version, changelog).

## What the builder must change before re-review

- `bin/install`: make the printed action expand when run by `bash -lc`
  (see Blocking 1 for the `$HOME` form).
- `tests/install.test.mjs`: assert the action resolves to `LAUNCH` when
  executed, not that it matches the `"~…"` string.
- `README.md:40` snippet and `as-built.md` "Menu action quoting": align
  with the fixed form.
- Optionally Should-fix 2 (Development section wording).

## Re-review (commit ac2a670) — 2026-09-06

### Verdict: PASS

The blocking defect is fixed and proven by execution, the should-fix and
the nit are addressed, and nothing else moved. Ready for the ship-step
human sign-off (tag `v1.0.0`, push, visibility, submodule fast-forward).

### Evidence

**1. Menu action now runs.** `bin/install:44-46` collapses a `$HOME`-rooted
`LAUNCH` to a literal `$HOME/...` (`DISPLAY_LAUNCH="\$HOME${LAUNCH#"$HOME"}"`);
anything outside `$HOME` keeps its absolute path. Reproduced at the
canonical clone location under a fake HOME: cloned `ac2a670` to
`<fakehome>/.config/omarchy/plugins/com.keithrowell.pacman`, ran
`HOME=<fakehome> bin/install --dry-run` there, decoded the printed
`action` with `JSON.parse`, and ran it the way omarchy-shell does with a
stub `uwsm-app` that checks `[ -x "$1" ]`:

```
decoded action: uwsm-app -- "$HOME/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman"
HOME=<fakehome> bash -lc "$ACTION"
OK: would exec <fakehome>/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman
exit=0
```

Same for this worktree's own action (path containing a space, real HOME):
`uwsm-app -- "$HOME/Dropbox (Maestral)/lab/omarchy_pacman/.claude/worktrees/agent-a3a0121ccba1adfec/bin/pacman"`
→ `OK: would exec /home/keith/Dropbox (Maestral)/.../bin/pacman`, exit 0.
The outside-`$HOME` case (fresh clone under `/tmp`) was already shown in
the first review to print the absolute quoted path, and that branch of
`bin/install` is unchanged.

**2. Tests execute the action.** `tests/install.test.mjs` gains
`stubUwsmAppDir()` / `runMenuAction(action, home)` which spawn
`bash -lc "<action>"` with `HOME` set and the stub on PATH, and three
cases now assert `status === 0` and stdout `OK:<LAUNCH>`:
- "the printed menu snippet … running this checkout's own bin/pacman" —
  scratch HOME, checkout outside `$HOME` (absolute quoted path);
- "without uwsm-app … still resolves" — bare quoted path, `[ -x … ]`
  under `bash -lc`;
- "the menu action expands $HOME (not a quoted ~) for a $HOME-rooted
  checkout, and it resolves" — `HOME=dirname(ROOT)`, asserts the literal
  `"$HOME<tail>"` form *and* that it resolves.

**3. Gate** — `node --test tests/*.test.mjs`:

```
ℹ tests 296
ℹ pass 296
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

**4. Docs and nit.** `README.md:40` snippet is now
`"uwsm-app -- \"$HOME/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman\""`
with a short note (`README.md:44-47`) on why `$HOME` rather than `~`;
as-built's "Menu action quoting" records the wrong first attempt and the
fix; the owner-specific "This repo is the development checkout…" sentence
is gone from "Development". `bin/install:85` wraps the requirements check
in `(( ! UNINSTALL ))`: `--dry-run --uninstall` on a PATH lacking `qs`
prints no `requirements:` line, while `--dry-run` on the same PATH prints
`requirements: missing quickshell — install with: sudo pacman -S quickshell`.

**5. No regressions.** `find . -name .git -prune -o -type l -print` empty;
no `#rrggbb` literal added in `app/`, `lib/`, `bin/`, `shell.qml` across
`master...HEAD`; the only `lib/` change is still the two-line comment in
`lib/maze.mjs`. The fix commit touches only `bin/install`, `README.md`,
`tests/install.test.mjs` and `as-built.md`.

### Remaining (non-blocking)

- Nit 5 from the first review stands as informational: `README.md`
  "Maintainer" names the lab path; acceptable inside that subsection.
- Post-merge check from the plan (run `bin/install` at the real
  `~/.config/omarchy/plugins/com.keithrowell.pacman` after fast-forward) is
  a ship-step item, not done here. Note that the installed
  `omarchy-menu.jsonc` entry uses the unquoted `~` form, which still works;
  it need not be re-pasted.
