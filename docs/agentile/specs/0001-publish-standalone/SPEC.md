---
title: Publish 1.0.0 as a standalone public repo — no symlinks, tagged, clone-and-install docs
slug: publish-standalone
status: in_progress
depends_on: []
type: feature
route: background
business_value: high
technical_certainty: high
created: 2026-09-06
outcome: a stranger can git clone the public repo at tag v1.0.0, run bin/install, and start the game from the app launcher
claimed_by: bef53891-113c-43bb-bee9-684939550527
label: 
claimed_at: 2026-09-05T22:33:32Z
---

# Publish 1.0.0 as a standalone public repo — no symlinks, tagged, clone-and-install docs

## Problem / why now

v1 and the first v2 items (high-score table, fruit, one arcade look) are
shipped and installed, so the game is ready for other Omarchy users (brief:
"later, other Omarchy users"). The Omarchy plugin marketplace only lists
shell-hosted plugins (kinds bar, bar-widget, menu, overlay, panel, service)
and `omarchy plugin add` runs the same validator, so a standalone app cannot
go through either. Decision (2026-09-06): stay standalone per ADR-0001 and
publish as a plain public git repo installed by clone + `bin/install`. That
needs the repo to pass on its own terms: no symlinks (they break on a plain
clone with `core.symlinks=false` and are the one thing the Omarchy validator
would also refuse), a real version, a tag, and install docs written for
someone who is not Keith.

## Acceptance criteria

- [ ] No symlinks in the repo. `app/lib` and `app/assets` are gone; the app
      reaches `lib/` and `assets/` as real paths inside the Quickshell root
      (for example a root `shell.qml` that loads `app/Main.qml` with
      `bin/pacman` running `qs -p <repo root>`, or `app/` importing `../lib`
      with the root moved up). `find . -type l` outside `.git` prints nothing.
      `bin/pacman` still launches the game with theme, font and sounds working;
      `node --test tests/*.test.mjs` untouched and green.
- [ ] `manifest.json` version is `1.0.0`; `kinds` stays `[]` and the file
      keeps documenting (in README) that the shell ignores it by design.
- [ ] `bin/install` works from any clone location, not only the plugin path:
      the desktop file, the `omarchy-pacman` link and the printed menu action
      use the real checkout path (`ROOT`), with the plugin path only as the
      default suggestion. `--dry-run` from `/tmp/somewhere/omarchy-plugin-pacman`
      shows that path in every line.
- [ ] README "Install" is rewritten for the public: a top section
      "Install on Omarchy" with `git clone https://github.com/keithrowell/omarchy-plugin-pacman.git ~/.config/omarchy/plugins/com.keithrowell.pacman`,
      `bin/install`, the menu snippet, requirements (`quickshell`, `qt6-multimedia`
      and whatever `bin/install` checks), update (`git pull` + `bin/install`) and
      uninstall. A short "Why not `omarchy plugin add`" note explains the
      standalone choice (ADR-0001) and links the ADR. Keith's dotfiles-submodule
      flow moves to a "Maintainer" subsection or to CLAUDE.md.
- [ ] `CHANGELOG.md` with a `1.0.0` entry summarising the shipped specs
      (0001–0007 v1, then scanlines-only, high-score table, smooth removed, fruit).
- [ ] The ship step (human sign-off) does, in order: tag `v1.0.0` on the merge
      commit, push the tag, `gh repo edit keithrowell/omarchy-plugin-pacman --visibility public`,
      then fast-forward the installed submodule and re-run `bin/install`.
      Record the tag and the public URL in the ship notes.
- [ ] Inbox stub "install-as-plugin must preserve the app/lib and app/assets
      symlinks" is removed as superseded.

## Scope boundary

**In scope:** symlink removal and the launcher change it needs, version,
installer path handling, public README, changelog, tag, repo visibility.

**Out of scope:** any shell kind (bar widget, panel) or marketplace
submission, an AUR package, a screenshot gallery beyond the existing
`preview.png`, CI, code changes to the game.

## Edge cases and failure paths

- Quickshell blackholes files outside the shell root: whatever structure
  replaces the symlinks must keep `lib/` and `assets/` inside the root that
  `qs -p` is given. Verify with a launch plus one theme-colour, one font glyph
  and one sound audible (or the F12 debug grab under `PACMAN_DEBUG=1`).
- The desktop file and menu action must not break for the existing install
  at `~/.config/omarchy/plugins/com.keithrowell.pacman`; run `bin/install`
  there after the change and expect `unchanged` or a clean rewrite.
- Going public exposes the full history, including `docs/agentile/` session
  ids and reviewer notes. Ship sign-off confirms Keith is happy with that;
  no history rewrite.
- `core.symlinks=false` clones (Windows-style) are not a target, but the
  symlink removal makes them work anyway.
- The tag is created only after the review passes; a tag on a broken commit
  is not moved, a `v1.0.1` follows.

## Affected areas

`bin/pacman`, `bin/install`, `app/*.qml` import paths, a new root `shell.qml`
(if that design is chosen), `manifest.json`, `README.md`, `CHANGELOG.md`
(new), `CLAUDE.md` (layout note on the launcher root), `tests/install.test.mjs`,
`docs/agentile/inbox.md`.

## Open questions

None.

## Verification

- `node --test tests/*.test.mjs` green; `find . -name .git -prune -o -type l -print` empty.
- Fresh clone to a scratch directory, `bin/install --dry-run` shows scratch
  paths, `bin/pacman` runs with theme, font and sound.
- After ship: `git ls-remote --tags origin` lists `v1.0.0`; `gh repo view`
  shows PUBLIC; `omarchy-pacman` from a terminal opens the game.
