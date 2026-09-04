---
title: "Ship it as an Omarchy plugin: menu entry, desktop file, dotfiles submodule, README"
slug: install-as-plugin
status: in_progress
depends_on: [game-flow-and-hud]
type: feature
route: background
business_value: medium
technical_certainty: high
created: 2026-09-04
outcome: the game launches from the Omarchy menu and the app launcher on this machine, and a fresh machine gets it from the dotfiles bootstrap
claimed_by: a7420d79-880d-4334-8062-82d6934a6047
label: 
claimed_at: 2026-09-04T05:08:59Z
---

# Ship it as an Omarchy plugin: menu entry, desktop file, dotfiles submodule, README

## Problem / why now

A game you can only start from a terminal in a lab directory is not shipped.
Keith's setup tracks his own plugins as submodules under
`~/.config/omarchy/plugins/com.keithrowell.<id>` (see the omarchy-machine-setup
skill), with an entry in `~/.config/omarchy/extensions/omarchy-menu.jsonc` and a
desktop file, the way Sous is installed.

## Acceptance criteria

- [ ] `bin/install` (idempotent bash): writes `~/.local/share/applications/Pacman.desktop` (`Exec=<plugin>/bin/pacman`, `Icon` a bundled `assets/icon.png` 256 px pixel-art Pac-Man in a neutral yellow, `StartupWMClass=quickshell` omitted since the class is shared), and prints — but does not apply — the JSON snippet for `omarchy-menu.jsonc` (`icon`, `label: Pacman`, `aliases: [pacman, game, arcade]`, `action: uwsm-app -- ~/.config/omarchy/plugins/com.keithrowell.pacman/bin/pacman`).
- [ ] The menu entry is added to `~/.config/omarchy/extensions/omarchy-menu.jsonc` in the dotfiles repo, following the Sous entry; `omarchy-menu` lists Pacman and launches it.
- [ ] Repo published as `keithrowell/omarchy-plugin-pacman` (private) and added as a submodule at `~/.config/omarchy/plugins/com.keithrowell.pacman`, with the `.config/.gitignore` allow rule, per the machine-setup skill. This project directory stays the development checkout; the submodule tracks the same remote.
- [ ] `README.md`: what it is, keys (arrows/hjkl/WASD, Enter, p, g, s, m, q), install steps, theme behaviour (sound generation and the `m` key are documented when the sound spec ships), a `preview.png` screenshot in the current theme.
- [ ] `manifest.json` validated with `omarchy-plugin-validate` (or documented why `kinds: []` fails validation and is accepted, as Sous is).
- [ ] `bin/pacman` resolves its own directory (`readlink -f`) so it works from the submodule path and from this checkout.
- [ ] Nothing named `pacman` is ever placed on `PATH` — that shadows the Arch package manager. Any PATH launcher or symlink is called `omarchy-pacman`; the in-repo `bin/pacman` is only ever invoked by full path (desktop file, menu action).

## Scope boundary

**In scope:** installer, desktop file, icon, menu entry, dotfiles submodule wiring, README, preview.

**Out of scope:** public catalogue submission, AUR packaging, Hyprland window rules, updates on other machines (that is a `git pull` per the skill).

## Edge cases and failure paths

- Running `bin/install` twice must not duplicate the desktop file or print misleading "added" messages.
- `uwsm-app` absent → the menu action falls back to the bare launcher path; document it.
- Dotfiles changes touch `~` git repo: commit only the three related files (`.gitmodules`, gitlink, `.config/.gitignore`) plus the menu jsonc; do not sweep in unrelated dotfile changes.

## Affected areas

`bin/install`, `assets/icon.png`, `README.md`, `preview.png`, `manifest.json`; outside the repo: `~/.config/omarchy/extensions/omarchy-menu.jsonc`, `~/.gitmodules`, `~/.config/.gitignore`, `~/.local/share/applications/Pacman.desktop`.

## Open questions

- Whether to keep this lab checkout or make the submodule the only checkout is Keith's call at ship time; the installer supports both.

## Verification

- Manual: `omarchy-menu` → Pacman opens the game; the launcher entry appears in the app grid; `git submodule status` in `~` lists the plugin.
