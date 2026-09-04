# Plan — Ship it as an Omarchy plugin: menu entry, desktop file, dotfiles submodule, README

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

This spec reaches outside the repo (GitHub, the `~` dotfiles repo, the menu).
The conventions are Keith's `omarchy-machine-setup` skill; the facts below
were checked on this machine during planning.

## Facts checked during planning

- The project checkout has **no git remote** yet. `gh` is logged in as
  keithrowell (ssh protocol); the other plugins live in private repos named
  `keithrowell/omarchy-plugin-<short>`.
- `~` is the dotfiles repo (`git@github.com:keithrowell/dotfiles.git`). Its
  working tree is **dirty with unrelated changes**, including
  `.config/.gitignore` (theme allow rules and a systemd unit). Only the Pacman
  hunk may be staged from that file.
- `~/.gitmodules` lists seven `com.keithrowell.*` submodules; `.config/.gitignore`
  lines 97–107 hold the plugin allow rules (`omarchy/plugins/*` then `!…`).
- `~/.local/share/applications/` is git-ignored in `~` (`.local/.gitignore`), so
  the desktop file is per-machine and written by the installer, as Sous's is.
- `~/.config/omarchy/extensions/omarchy-menu.jsonc` is clean in git; the Sous
  entry is the model (`icon`, `label`, `description`, `aliases`, `action:
  "uwsm-app -- ~/.config/omarchy/plugins/com.keithrowell.sous/bin/sous-gtk"`).
- `omarchy-plugin-validate` rejects `kinds: []` manifests with "manifest missing
  required field 'entryPoints'" — for Sous too. Document, do not "fix".
- `uwsm-app` is at `/usr/bin/uwsm-app`. No PIL; numpy is present; `zlib` is
  stdlib, so a PNG can be written without PIL.
- Keith is running his own instance of the game from this checkout. Never
  kill `qs` broadly; kill only pids you started.

## Files to touch

| File | Why |
|---|---|
| `bin/install` | Idempotent bash installer (see below). |
| `tools/gen-icon.py` | Writes `assets/icon.png`, 256×256 pixel-art Pac-Man (a 16×16 design scaled 16×) in a neutral yellow on transparent. This is a static asset, not app chrome, so the yellow literal lives in the tool, not the app — say so in a comment. Pure Python: `zlib` + `struct`, no PIL. |
| `assets/icon.png` | Generated, committed. |
| `tools/make-preview.py` | Crops an F12 grab to its content box (numpy) and writes `preview.png`. |
| `preview.png` | Arcade-mode gameplay grab in the current theme, committed. |
| `README.md` | What it is, keys, install, theme behaviour, validation note, dev notes. |
| `tests/install.test.mjs` | Runs `bin/install` against a scratch `HOME` twice; asserts idempotence and content. |
| `.gitignore` | Unchanged unless something new needs ignoring. |
| Outside the repo | `~/.config/omarchy/extensions/omarchy-menu.jsonc`, `~/.gitmodules`, `~/.config/.gitignore`, the gitlink at `~/.config/omarchy/plugins/com.keithrowell.pacman`, `~/.local/share/applications/Pacman.desktop`. |

## Approach

### `bin/install`

```
bin/install [--dry-run] [--uninstall]
```

1. `ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"` — works from
   this checkout and from the submodule path. `PLUGIN_DIR` for the menu
   snippet is `~/.config/omarchy/plugins/com.keithrowell.pacman` (the canonical
   install location), regardless of where the installer runs.
2. Desktop file `$XDG_DATA_HOME/applications/Pacman.desktop` (default
   `~/.local/share/applications`):
   ```
   [Desktop Entry]
   Version=1.0
   Name=Pacman
   Comment=Pac-Man in big arcade pixels, coloured from the Omarchy theme
   Exec=<ROOT>/bin/pacman
   Icon=<ROOT>/assets/icon.png
   Terminal=false
   Type=Application
   Categories=Game;ArcadeGame;
   Keywords=pacman;game;arcade;
   StartupNotify=false
   ```
   No `StartupWMClass` (Quickshell's class is shared). Write to a temp file,
   compare with the existing file, and print `desktop file: written` or
   `desktop file: unchanged`; then `update-desktop-database` if present
   (quietly).
3. Optional PATH launcher: if `~/.local/bin` exists, create or refresh the
   symlink `~/.local/bin/omarchy-pacman → <ROOT>/bin/pacman` (`ln -sfn`) and
   print `launcher: ~/.local/bin/omarchy-pacman`. **Never** create anything
   named `pacman` on PATH; add a guard that refuses to proceed if
   `$(command -v pacman)` would resolve to something under `ROOT`.
4. Print the menu snippet (do not apply it) with a one-line instruction:
   ```
   "pacman": {
     "icon": "󰊴",
     "label": "Pacman",
     "description": "Pac-Man in big arcade pixels, coloured from the Omarchy theme",
     "aliases": ["pacman", "game", "arcade"],
     "action": "uwsm-app -- ~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman"
   }
   ```
   If `uwsm-app` is missing, print the `action` as the bare launcher path and
   say why.
5. `--uninstall` removes the desktop file and the symlink; `--dry-run` prints
   what would happen. Exit 0 on success, non-zero with a message otherwise.
   `set -euo pipefail`, quote every path (the dev checkout has a space).

### Icon and preview

`tools/gen-icon.py`: a 16×16 pixel grid (Pac-Man facing right, mouth open,
a 1-px darker outline) scaled to 256×256 with nearest-neighbour, RGBA PNG via
`zlib` (filter type 0 per row, `IHDR`/`IDAT`/`IEND` with CRCs). Deterministic
so re-running yields the same bytes.

`tools/make-preview.py <grab.png> preview.png`: decode the PNG with the same
approach the earlier measurement scripts used (zlib + numpy), crop to the
non-transparent content box, write it back. Take the grab with
`PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="Return,4000,F12"` in arcade mode so the
maze, ghosts and HUD are visible, under whatever theme is active.

### README.md

Sections: title + one-paragraph pitch; **Keys** (arrows / hjkl / WASD move,
Enter or Space start, `p` or Escape pause and resume, Escape on the title
quits, hold `q` on the title to quit / `q` at once in play, `g` pixel or
smooth, `s` scanlines on the title, pause and game-over screens, F12 frame
grab with `PACMAN_DEBUG=1`; `m` mute arrives with the sound spec — note it as
"coming"); **Install** (the submodule route from the machine-setup skill in
five commands, `bin/install`, the menu snippet, and the warning never to put
`pacman` on PATH); **Theme** (reads `colors.toml`, recolours live, every colour
from the theme); **Modes** (arcade vs smooth, ADR-0002 in one paragraph);
**Validation** (`omarchy-plugin-validate` rejects `kinds: []` for lack of
`entryPoints`; the shell ignores the plugin by design, as Sous); **Development**
(`bin/pacman` from the checkout, `node --test tests/*.test.mjs`, the Agentile
docs); **Licence** (MIT; Press Start 2P under OFL). Embed `preview.png` near
the top.

### Publishing and dotfiles wiring (outside the repo)

Do these in order, from the right directory, and stop with a clear report if
any step fails — do not improvise around a failure.

1. In this checkout: make sure the branch is merged and clean first (the loop
   runner merges the spec branch before this step; the builder therefore only
   prepares the commands and runs them **after** it has been told the merge
   is done — see "Sequencing" below).
2. `gh repo create keithrowell/omarchy-plugin-pacman --private --source=. --remote=origin --push`
   from the checkout root. Default branch is whatever the checkout has
   (`master`).
3. `cd ~ && git submodule add git@github.com:keithrowell/omarchy-plugin-pacman.git .config/omarchy/plugins/com.keithrowell.pacman`.
4. `.config/.gitignore`: append `!omarchy/plugins/com.keithrowell.pacman`
   after the `com.keithrowell.reel` line. Stage **only that hunk**: write a
   minimal patch to a temp file and `git apply --cached` it (or
   `git add -p` is not available non-interactively; the patch route is
   reliable). Verify with `git diff --cached .config/.gitignore` that only
   the one line is staged.
5. Add the `"pacman"` entry to `~/.config/omarchy/extensions/omarchy-menu.jsonc`
   after the `"todoquick"` entry, matching the Sous entry's fields; keep the
   file valid JSONC (trailing commas matter).
6. `git -C ~ add .gitmodules .config/omarchy/plugins/com.keithrowell.pacman .config/omarchy/extensions/omarchy-menu.jsonc` (plus the cached gitignore hunk) and commit
   `Add Pacman plugin as submodule; menu entry`. `git -C ~ status --short`
   before and after must show the same unrelated files still unstaged.
7. `git -C ~ push` (the skill's roll-out step; the repo is Keith's private
   dotfiles).
8. From the submodule directory run `bin/install`; confirm
   `~/.local/share/applications/Pacman.desktop` points at the submodule path.
9. `omarchy menu refresh` (if the command accepts it) and check the entry:
   `omarchy menu summon pacman` should launch the game — start it, confirm a
   new `qs -p …/com.keithrowell.pacman/app/Main.qml` process appears, then
   kill **that pid only**.

### Sequencing with the loop

The publish step (2) pushes the checkout's `master`. The loop runner merges
the spec branch into master and only then may the builder publish. So the
build is two-phase:

- **Phase A (on the spec branch):** installer, icon, preview, README, tests,
  gate green, report.
- **Phase B (after the runner merges and says so):** steps 2–9 above, plus a
  final report of the remote URL, the submodule commit, the dotfiles commit
  hash, and the menu check.

The runner will send the builder a message when Phase B may start.

## Test strategy

Gate: `node --test tests/*.test.mjs`.

- `tests/install.test.mjs`: with `HOME` and `XDG_DATA_HOME` pointed at a
  scratch directory (and `PATH` limited to `/usr/bin:/bin`), run
  `bin/install` twice: first run prints `written`, second prints `unchanged`;
  the desktop file exists once with `Exec=` equal to the checkout's
  `bin/pacman` and `Icon=` to `assets/icon.png`; the printed snippet parses
  as JSON when wrapped in braces and has `label: "Pacman"` and the three
  aliases; a scratch `~/.local/bin` gets `omarchy-pacman` and nothing named
  `pacman`; `--uninstall` removes both and is itself idempotent; `--dry-run`
  creates nothing.
- `tests/icon.test.mjs` (small): `assets/icon.png` is a valid PNG of
  256×256 (parse the IHDR) and `tools/gen-icon.py` regenerates it byte-for-byte.
- Existing suites keep passing.

Manual evidence (Phase B report): `gh repo view keithrowell/omarchy-plugin-pacman --json visibility,url`;
`git -C ~ submodule status | grep pacman`; `git -C ~ show --stat HEAD`;
the desktop file content; the `omarchy menu summon pacman` launch line.

## Risks and unknowns

- **Outward-facing actions**: a private GitHub repo is created and the
  dotfiles repo is committed and pushed. Both are exactly what the spec asks
  for and follow the machine-setup skill; nothing public is created.
- **Dirty dotfiles tree**: the patch-staging route for `.config/.gitignore`
  is the only safe way; verify the staged diff before committing.
- **The lab checkout stays the dev checkout** (spec's open question; default
  is keep both). After this ships, day-to-day work continues here and the
  submodule is updated with `git pull` there; say so in the README.
- **Dropbox** syncs this checkout, including `.git`; the submodule clone in
  `~/.config` is outside Dropbox. The `app/lib` and `app/assets` symlinks are
  committed as symlinks; verify they survive the fresh clone (`ls -l` in the
  submodule) before running the game from it.
- **Menu icon glyph**: `󰊴` (nf-md-gamepad_variant) is a guess; any Nerd Font
  glyph is fine, the reviewer only checks the entry works.
- **Validator**: documented failure, accepted.

## ADR

None.
